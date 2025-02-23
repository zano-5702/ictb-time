'use strict';

const utils = require('@iobroker/adapter-core'); // Adapter utilities
const fetch = require('node-fetch'); // Stelle sicher, dass node-fetch als Dependency vorhanden ist

class WorkTimeAdapter extends utils.Adapter {
    constructor(options) {
        super({
            ...options,
            name: 'worktime'
        });
        
        // Jetzt sind this.log und this.config verfügbar
        if (!this.config) {
            this.config = {};
        }
        if (!this.config.employees || Object.keys(this.config.employees).length === 0) {
            this.log.info('Keine Mitarbeiter in config.employees gefunden. Setze Standardwerte.');
            this.config.employees = {
                "traccar.0.devices.1": { firstName: "Max", lastName: "Mustermann" },
                "traccar.0.devices.2": { firstName: "Erika", lastName: "Musterfrau" }
            };
        }
        
        // Setze Standard-Konfiguration, falls nicht vorhanden (optional)
        this.config.appsScriptUrl = this.config.appsScriptUrl || 'YOUR_APPS_SCRIPT_URL';
        this.config.sheetName = this.config.sheetName || "Time Tracker";
        this.config.plannedWorkDayHours = Number(this.config.plannedWorkDayHours) || 8;
        this.config.firstBreakThresholdHours = Number(this.config.firstBreakThresholdHours) || 6;
        this.config.firstBreakMinutes = Number(this.config.firstBreakMinutes) || 30;
        this.config.secondBreakThresholdHours = Number(this.config.secondBreakThresholdHours) || 9;
        this.config.secondBreakMinutes = Number(this.config.secondBreakMinutes) || 15;

        // Event-Handler binden
        this.on('ready', this.onReady.bind(this));
        this.on('stateChange', this.onStateChange.bind(this));

        // Interne Speicherung aktiver Arbeitssitzungen pro Device
        // Struktur: { "traccar.0.devices.1": { customer: "Kundenname", startTime: <timestamp>, workDescription: "" } }
        this.activeSessions = {};
    }

    async onReady() {
        this.log.info('onReady gestartet.');

        // Abonniere alle Geofence-Zustände der traccar-Devices
        this.subscribeForeignStates('traccar.0.devices.*.geofences_string');
        this.log.info('Abonniere Zustände: traccar.0.devices.*.geofences_string');

        // Beispielhafter Kundenstamm (dies könnte auch über die Adapter-Konfiguration gepflegt werden)
        this.customers = {
            "HW2-9-Wohlen": {
                name: "HW2-9-Wohlen",
                address: "Beispielstraße 123, Wohlen",
                hourlyRate: 60,
                assignment: "Service"
            },
            "Office-Mitte": {
                name: "Office-Mitte",
                address: "Musterstraße 2, Musterstadt",
                hourlyRate: 75,
                assignment: "Consulting"
            }
            // Weitere Kunden können hier hinzugefügt werden
        };
        this.log.info('Kundenstamm geladen:', JSON.stringify(this.customers));

        // Mitarbeiterliste aus den Konfigurationen
        this.employees = this.config.employees;
        this.log.info('Mitarbeiter geladen:', JSON.stringify(this.employees));

        // Lade eventuell gespeicherte Startzeit (z.B. aus einem vorherigen Start)
        const storedStart = await this.getStateAsync('startTime');
        if (storedStart && storedStart.val) {
            this.startTime = new Date(storedStart.val);
            const plannedStopTime = this.calculatePlannedStopTime(this.startTime);
            this.log.info(`Gespeicherte Startzeit gefunden: ${this.startTime.toISOString()}, geplanter Endzeitpunkt: ${plannedStopTime.toISOString()}`);
            this.startCountdown(plannedStopTime);
        } else {
            this.log.info('Keine gespeicherte Startzeit gefunden.');
        }

        this.log.info('WorkTime Adapter gestartet.');
    }

    /**
     * Handler für Zustandsänderungen (z. B. geofences_string).
     * @param {string} id - z.B. "traccar.0.devices.1.geofences_string"
     * @param {object} state - Enthält den neuen Wert, Zeitstempel etc.
     */
    async onStateChange(id, state) {
        this.log.debug(`onStateChange aufgerufen für ${id} mit state: ${JSON.stringify(state)}`);
        if (!state || state.val === undefined) {
            this.log.debug('State oder state.val ist undefined – ignoriere.');
            return;
        }
        
        // Extrahiere die Geräte-ID, z.B. "traccar.0.devices.1"
        const match = id.match(/(traccar\.0\.devices\.\d+)\.geofences_string/);
        if (!match) {
            this.log.warn(`Kein Geräte-Match für id ${id}`);
            return;
        }
        const deviceKey = match[1];
        this.log.debug(`Geräte-ID extrahiert: ${deviceKey}`);

        const employee = this.employees[deviceKey];
        if (!employee) {
            this.log.warn(`Kein Mitarbeiter für ${deviceKey} definiert.`);
            return;
        }
        this.log.debug(`Mitarbeiter gefunden: ${employee.firstName} ${employee.lastName}`);

        const newValue = state.val.toString().trim();
        const timestamp = state.ts || Date.now();
        this.log.info(`Neuer geofences_string Wert für ${deviceKey}: "${newValue}" um ${new Date(timestamp).toLocaleString()}`);

        // Wenn ein gültiger Kundenname vorliegt (nicht "0", "null" oder leer)
        if (newValue && newValue !== '0' && newValue.toLowerCase() !== 'null') {
            if (!this.activeSessions[deviceKey]) {
                this.activeSessions[deviceKey] = {
                    customer: newValue,
                    startTime: timestamp,
                    workDescription: ""
                };
                this.log.info(`${employee.firstName} ${employee.lastName} betritt ${newValue} um ${new Date(timestamp).toLocaleString()}`);
            } else {
                if (this.activeSessions[deviceKey].customer !== newValue) {
                    this.log.info(`${employee.firstName} ${employee.lastName} wechselt von ${this.activeSessions[deviceKey].customer} zu ${newValue} um ${new Date(timestamp).toLocaleString()}`);
                    await this.closeSession(deviceKey, timestamp);
                    this.activeSessions[deviceKey] = {
                        customer: newValue,
                        startTime: timestamp,
                        workDescription: ""
                    };
                } else {
                    this.log.debug(`${employee.firstName} ${employee.lastName} bleibt bei ${newValue}. Keine Änderung.`);
                }
            }
        } else {
            // Wert "0", leer oder null → Mitarbeiter verlässt den Kundenbereich
            this.log.info(`${employee.firstName} ${employee.lastName} verlässt den Kundenbereich (${this.activeSessions[deviceKey] ? this.activeSessions[deviceKey].customer : 'unbekannt'})`);
            if (this.activeSessions[deviceKey]) {
                await this.closeSession(deviceKey, timestamp);
            }
        }
    }

    /**
     * Schließt eine aktive Sitzung und erstellt einen Logeintrag.
     * @param {string} deviceKey - z.B. "traccar.0.devices.1"
     * @param {number} endTime - Zeitstempel des Verlassens
     */
    async closeSession(deviceKey, endTime) {
        const session = this.activeSessions[deviceKey];
        if (!session) {
            this.log.warn(`Keine aktive Sitzung für ${deviceKey} gefunden.`);
            return;
        }
        const employee = this.employees[deviceKey];
        const startTime = session.startTime;
        const durationMs = endTime - startTime;
        const durationHours = durationMs / (1000 * 60 * 60);
        const customerKey = session.customer;
        const customer = this.customers[customerKey] || { name: customerKey, hourlyRate: 0 };

        const logEntry = {
            employee: `${employee.firstName} ${employee.lastName}`,
            customer: customer.name,
            address: customer.address || '',
            hourlyRate: customer.hourlyRate,
            startTime: new Date(startTime).toISOString(),
            endTime: new Date(endTime).toISOString(),
            durationHours: durationHours,
            workDescription: session.workDescription
        };

        const logStateId = `workLog.${Date.now()}`;
        await this.setObjectNotExistsAsync(logStateId, {
            type: 'state',
            common: {
                name: 'Work Log Entry',
                type: 'string',
                role: 'value.text',
                read: true,
                write: false
            },
            native: {}
        });
        await this.setStateAsync(logStateId, { val: JSON.stringify(logEntry), ack: true });
        this.log.info(`Arbeitseinsatz protokolliert: ${JSON.stringify(logEntry)}`);

        // Aktive Sitzung entfernen
        delete this.activeSessions[deviceKey];

        // Aggregationen aktualisieren (Platzhalterfunktion)
        await this.updateAggregates(employee, logEntry);
    }

    /**
     * Platzhalterfunktion zur Aktualisierung aggregierter Arbeitszeiten.
     */
    async updateAggregates(employee, logEntry) {
        this.log.info(`Aktualisiere Aggregatwerte für ${employee.firstName} ${employee.lastName} mit ${logEntry.durationHours.toFixed(2)} Stunden.`);
        // Hier: Aggregationslogik implementieren (z.B. Tages-, Wochen-, Monats-, Jahreswerte berechnen)
    }

    /**
     * Berechnet die geplante Endzeit basierend auf der Startzeit und Pausenregeln.
     */
    calculatePlannedStopTime(startTime) {
        const msPerHour = 60 * 60 * 1000;
        let plannedStop;
        if (this.config.plannedWorkDayHours > this.config.secondBreakThresholdHours) {
            plannedStop = new Date(startTime.getTime() +
                (this.config.plannedWorkDayHours * msPerHour) +
                (this.config.firstBreakMinutes * 60 * 1000) +
                (this.config.secondBreakMinutes * 60 * 1000));
        } else if (this.config.plannedWorkDayHours > this.config.firstBreakThresholdHours) {
            plannedStop = new Date(startTime.getTime() +
                (this.config.plannedWorkDayHours * msPerHour) +
                (this.config.firstBreakMinutes * 60 * 1000));
        } else {
            plannedStop = new Date(startTime.getTime() + (this.config.plannedWorkDayHours * msPerHour));
        }
        this.log.debug(`Geplante Endzeit berechnet: ${plannedStop.toISOString()}`);
        return plannedStop;
    }

    /**
     * Berechnet die gearbeitete Zeit in Millisekunden zwischen Start und Stop.
     */
    getWorkedTime(startTime, stopTime) {
        return stopTime - startTime;
    }

    /**
     * Sendet einen HTTP POST-Request an dein Google Apps Script.
     */
    async writeTimeToSheet(type, date, time) {
        const data = {
            date: date,
            startTime: type === 'startTime' ? time : '',
            stopTime: type === 'stopTime' ? time : '',
            config: {
                plannedWorkDayHours: this.config.plannedWorkDayHours,
                firstBreakThresholdHours: this.config.firstBreakThresholdHours,
                firstBreakMinutes: this.config.firstBreakMinutes,
                secondBreakThresholdHours: this.config.secondBreakThresholdHours,
                secondBreakMinutes: this.config.secondBreakMinutes,
                sheetName: this.config.sheetName
            }
        };

        try {
            const response = await fetch(this.config.appsScriptUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            this.log.info(`${type} erfolgreich an Google Sheets gesendet: ${response.status}`);
        } catch (error) {
            this.log.error(`Fehler beim Senden von ${type} an Google Sheets: ${error}`);
        }
    }

    /**
     * Formatiert ein Datum als DD.MM.YYYY.
     */
    formatDate(date) {
        return [
            this.padNumber(date.getDate()),
            this.padNumber(date.getMonth() + 1),
            date.getFullYear()
        ].join('.');
    }

    /**
     * Formatiert ein Datum als Uhrzeit im deutschen Format.
     */
    formatGermanTime(date, withSeconds = false) {
        const hours = this.padNumber(date.getHours());
        const minutes = this.padNumber(date.getMinutes());
        const seconds = this.padNumber(date.getSeconds());
        return withSeconds ? `${hours}:${minutes}:${seconds}` : `${hours}:${minutes} Uhr`;
    }

    /**
     * Formatiert eine Dauer (in Millisekunden) als HH:MM:SS.
     */
    formatTimeDifference(duration) {
        const [hours, minutes, seconds] = this.splitTime(duration);
        return `${this.padNumber(hours)}:${this.padNumber(minutes)}:${this.padNumber(seconds)}`;
    }

    /**
     * Teilt eine Dauer in Stunden, Minuten und Sekunden auf.
     */
    splitTime(duration) {
        const hours = Math.floor(duration / (1000 * 60 * 60));
        const minutes = Math.floor((duration % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((duration % (1000 * 60)) / 1000);
        return [hours, minutes, seconds];
    }

    /**
     * Führt eine Zahl als String mit führender Null aus.
     */
    padNumber(value) {
        return value.toString().padStart(2, '0');
    }
}

if (module.parent) {
    module.exports = (options) => new WorkTimeAdapter(options);
} else {
    new WorkTimeAdapter();
}

'use strict';

const utils = require('@iobroker/adapter-core'); // Adapter utilities
const fetch = require('node-fetch'); // HTTP-Requests

class WorkTimeAdapter extends utils.Adapter {
    constructor(options) {
        super({
            ...options,
            name: 'ictb-time'
        });
        this.on('ready', this.onReady.bind(this));
        this.on('stateChange', this.onStateChange.bind(this));

        // Interne Speicherung aktiver Sitzungen, z. B. für die Arbeitszeiterfassung
        // Struktur: { "deviceId": { customer: "...", startTime: <timestamp>, workDescription: "" } }
        this.activeSessions = {};
    }

    async onReady() {
        // Abonniere die Zustände der geofences (aus traccar) – diese kommen vom Fremdsystem
        this.subscribeForeignStates('traccar.0.devices.*.geofences_string');

        // Lade oder setze Kundenstamm und Mitarbeiterliste – diese können auch über die Admin-Konfiguration gepflegt werden
        this.customers = {
            "Home-Herrengasse": {
                name: "Home-Herrengasse",
                address: "Herrengasse 1, Musterstadt",
                hourlyRate: 50,
                assignment: "Installation"
            },
            "Office-Mitte": {
                name: "Office-Mitte",
                address: "Musterstraße 2, Musterstadt",
                hourlyRate: 75,
                assignment: "Consulting"
            }
        };

        this.employees = {
            "traccar.0.devices.1": { firstName: "Max", lastName: "Mustermann" },
            "traccar.0.devices.2": { firstName: "Erika", lastName: "Musterfrau" }
        };

        this.log.info('WorkTime Adapter gestartet.');
    }

    /**
     * Wird bei Zustandsänderungen (z. B. geofences_string) aufgerufen.
     * @param {string} id - z.B. traccar.0.devices.1.geofences_string
     * @param {object} state - Enthält den neuen Wert, Zeitstempel etc.
     */
    async onStateChange(id, state) {
        if (!state || state.val === undefined) return;

        // Extrahiere die Geräte-ID, z. B. "traccar.0.devices.1"
        const match = id.match(/(traccar\.0\.devices\.\d+)\.geofences_string/);
        if (!match) return;
        const deviceKey = match[1];

        const employee = this.employees[deviceKey];
        if (!employee) {
            this.log.warn(`Kein Mitarbeiter für ${deviceKey} definiert.`);
            return;
        }

        const newValue = state.val.toString().trim();
        const timestamp = state.ts || Date.now();

        // Wenn ein gültiger Kundenname vorliegt (nicht "0", "null" oder leer)
        if (newValue && newValue !== '0' && newValue.toLowerCase() !== 'null') {
            // Eintritt in einen Kundenbereich
            if (!this.activeSessions[deviceKey]) {
                this.activeSessions[deviceKey] = {
                    customer: newValue,
                    startTime: timestamp,
                    workDescription: "" // Kann später per Admin-UI ergänzt werden
                };
                this.log.info(`${employee.firstName} ${employee.lastName} betritt ${newValue} um ${new Date(timestamp).toLocaleString()}`);
            } else {
                // Falls sich der Kundenwert ändert (Wechsel des Kunden)
                if (this.activeSessions[deviceKey].customer !== newValue) {
                    await this.closeSession(deviceKey, timestamp);
                    this.activeSessions[deviceKey] = {
                        customer: newValue,
                        startTime: timestamp,
                        workDescription: ""
                    };
                    this.log.info(`${employee.firstName} ${employee.lastName} wechselt zu ${newValue} um ${new Date(timestamp).toLocaleString()}`);
                }
            }
        } else {
            // Wert ist "0", leer oder null → Mitarbeiter verlässt den Kundenbereich
            if (this.activeSessions[deviceKey]) {
                await this.closeSession(deviceKey, timestamp);
            }
        }
    }

    /**
     * Schließt eine aktive Sitzung und protokolliert den Arbeitseinsatz.
     * @param {string} deviceKey - z.B. "traccar.0.devices.1"
     * @param {number} endTime - Zeitstempel des Verlassens
     */
    async closeSession(deviceKey, endTime) {
        const session = this.activeSessions[deviceKey];
        if (!session) return;
        const employee = this.employees[deviceKey];
        const startTime = session.startTime;
        const durationMs = endTime - startTime;
        const durationHours = durationMs / (1000 * 60 * 60);
        const customerKey = session.customer;
        const customer = this.customers[customerKey] || { name: customerKey, hourlyRate: 0 };

        // Erstelle einen Logeintrag
        const logEntry = {
            employee: `${employee.firstName} ${employee.lastName}`,
            customer: customer.name,
            address: customer.address || '',
            hourlyRate: customer.hourlyRate,
            startTime: new Date(startTime).toISOString(),
            endTime: new Date(endTime).toISOString(),
            durationHours: durationHours,
            workDescription: session.workDescription // Ergänzbar über Admin-UI
        };

        // Speichere den Logeintrag als State (Beispiel: workLog.<timestamp>)
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

        // Entferne die aktive Sitzung
        delete this.activeSessions[deviceKey];

        // Hier können Aggregationen (Tages-, Wochen-, Monatsstunden etc.) aktualisiert werden.
        await this.updateAggregates(employee, logEntry);
    }

    async updateAggregates(employee, logEntry) {
        // Platzhalter: Hier Aggregationslogik implementieren
        this.log.info(`Aggregatwerte für ${employee.firstName} ${employee.lastName} mit ${logEntry.durationHours.toFixed(2)} Stunden aktualisiert.`);
    }

    /**
     * Sendet einen HTTP POST-Request an ein Google Apps Script (falls benötigt)
     */
    async writeTimeToSheet(type, date, time) {
        // Beispiel-Datenstruktur
        const data = {
            date: date,
            startTime: type === 'startTime' ? time : '',
            stopTime: type === 'stopTime' ? time : '',
            config: {
                plannedWorkDayHours: 8,
                firstBreakThresholdHours: 6,
                firstBreakMinutes: 30,
                secondBreakThresholdHours: 9,
                secondBreakMinutes: 15,
                sheetName: "Time Tracker"
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
}

if (module.parent) {
    module.exports = (options) => new WorkTimeAdapter(options);
} else {
    new WorkTimeAdapter();
}

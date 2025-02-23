'use strict';

const utils = require('@iobroker/adapter-core');
const fetch = require('node-fetch');

class WorkTimeAdapter extends utils.Adapter {
    constructor(options) {
        super({
            ...options,
            name: 'ictb-time'
        });
        this.on('ready', this.onReady.bind(this));
        this.on('stateChange', this.onStateChange.bind(this));
        this.on('message', this.onMessage.bind(this));  // Neu: onMessage-Handler

        this.activeSessions = {};
    }

    async onReady() {
        // Kunden und Mitarbeiter aus der nativen Konfiguration laden, falls nicht vorhanden, initialisieren.
        this.config.customers = this.config.customers || {};
        this.config.employees = this.config.employees || {};

        // Beispiel: Falls noch keine Kunden hinterlegt sind, setze Standardwerte
        if (Object.keys(this.config.customers).length === 0) {
            this.config.customers = {
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
        }
        if (Object.keys(this.config.employees).length === 0) {
            this.config.employees = {
                "traccar.0.devices.1": { firstName: "Max", lastName: "Mustermann" },
                "traccar.0.devices.2": { firstName: "Erika", lastName: "Musterfrau" }
            };
        }

        // Erstelle oder aktualisiere Objekte für Kunden und Mitarbeiter
        await this.updateCustomerAndEmployeeObjects();

        // Abonniere die Zustände der Geofences
        this.subscribeForeignStates('traccar.0.devices.*.geofences_string');

        this.log.info('WorkTime Adapter gestartet. Aktuelle Konfiguration: ' + JSON.stringify({
            customers: this.config.customers,
            employees: this.config.employees
        }));
    }

    async onMessage(obj) {
        if (obj && obj.command === 'saveConfig') {
            // Speichere die übergebenen Kunden und Mitarbeiter in der nativen Konfiguration
            this.config.customers = obj.data.customers;
            this.config.employees = obj.data.employees;
            this.log.info('Konfiguration aktualisiert: ' + JSON.stringify(obj.data));
            // Lege die zugehörigen Objekte im ioBroker-Objekttree an
            await this.updateCustomerAndEmployeeObjects();
            this.sendTo(obj.from, obj.command, { result: 'ok' }, obj.callback);
        } else if (obj && obj.command === 'getConfig') {
            // Sende die aktuelle Konfiguration zurück
            this.sendTo(obj.from, obj.command, {
                customers: this.config.customers,
                employees: this.config.employees
            }, obj.callback);
        }
    }

    /**
     * Legt für jeden Kunden und jeden Mitarbeiter ein Objekt im ioBroker-Objekttree an.
     * Kunden werden unter "o.kunden.<kundenID>" abgelegt,
     * Mitarbeiter unter "o.mitarbeiter.<deviceID>".
     */
    async updateCustomerAndEmployeeObjects() {
        // Kunden-Objekte anlegen/aktualisieren
        for (const custKey in this.config.customers) {
            const customer = this.config.customers[custKey];
            // Erstelle ein Objekt unter <adapter namespace>.o.kunden.<custKey>
            await this.setObjectNotExistsAsync(`o.kunden.${custKey}`, {
                type: 'channel',
                common: {
                    name: customer.name,
                    desc: `Adresse: ${customer.address}, Stundensatz: ${customer.hourlyRate} EUR, Auftrag: ${customer.assignment}`
                },
                native: customer
            });
        }
        // Mitarbeiter-Objekte anlegen/aktualisieren
        for (const empKey in this.config.employees) {
            const employee = this.config.employees[empKey];
            await this.setObjectNotExistsAsync(`o.mitarbeiter.${empKey}`, {
                type: 'channel',
                common: {
                    name: `${employee.firstName} ${employee.lastName}`
                },
                native: employee
            });
        }
        this.log.info('Objekte für Kunden und Mitarbeiter aktualisiert.');
    }

    async onStateChange(id, state) {
        if (!state || state.val === undefined) return;

        const match = id.match(/(traccar\.0\.devices\.\d+)\.geofences_string/);
        if (!match) return;
        const deviceKey = match[1];
        const employee = this.config.employees[deviceKey];
        if (!employee) {
            this.log.warn(`Kein Mitarbeiter für ${deviceKey} definiert.`);
            return;
        }
        const newValue = state.val.toString().trim();
        const timestamp = state.ts || Date.now();

        if (newValue && newValue !== '0' && newValue.toLowerCase() !== 'null') {
            if (!this.activeSessions[deviceKey]) {
                this.activeSessions[deviceKey] = {
                    customer: newValue,
                    startTime: timestamp,
                    workDescription: ""
                };
                this.log.info(`${employee.firstName} ${employee.lastName} betritt ${newValue} um ${new Date(timestamp).toLocaleString()}`);
            } else if (this.activeSessions[deviceKey].customer !== newValue) {
                await this.closeSession(deviceKey, timestamp);
                this.activeSessions[deviceKey] = {
                    customer: newValue,
                    startTime: timestamp,
                    workDescription: ""
                };
                this.log.info(`${employee.firstName} ${employee.lastName} wechselt zu ${newValue} um ${new Date(timestamp).toLocaleString()}`);
            }
        } else {
            if (this.activeSessions[deviceKey]) {
                await this.closeSession(deviceKey, timestamp);
            }
        }
    }

    async closeSession(deviceKey, endTime) {
        const session = this.activeSessions[deviceKey];
        if (!session) return;
        const employee = this.config.employees[deviceKey];
        const startTime = session.startTime;
        const durationMs = endTime - startTime;
        const durationHours = durationMs / (1000 * 60 * 60);
        const customerKey = session.customer;
        const customer = this.config.customers[customerKey] || { name: customerKey, hourlyRate: 0 };

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

        delete this.activeSessions[deviceKey];
        await this.updateAggregates(employee, logEntry);
    }

    async updateAggregates(employee, logEntry) {
        // Platzhalter für Aggregationslogik
        this.log.info(`Aggregatwerte für ${employee.firstName} ${employee.lastName} mit ${logEntry.durationHours.toFixed(2)} Stunden aktualisiert.`);
    }

    async writeTimeToSheet(type, date, time) {
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

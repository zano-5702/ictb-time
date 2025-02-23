'use strict';

const utils = require('@iobroker/adapter-core');
const fetch = require('node-fetch');
const adapterName = require('./package.json').name.split('.').pop();

class WorkTimeAdapter extends utils.Adapter {
    constructor(options) {
        super({ ...options, name: 'ictb-time' });
        this.activeSessions = {}; // Für Arbeitszeitsitzungen (z.B. Geofence-Eintritte)
        this.on('ready', this.onReady.bind(this));
        this.on('stateChange', this.onStateChange.bind(this));
        this.on('message', this.onMessage.bind(this));
        this.on('unload', this.onUnload.bind(this));
    }

    async onReady() {
        // Kunden und Mitarbeiter aus der nativen Konfiguration laden, falls nicht vorhanden, initialisieren
        this.config.customers = this.config.customers || {};
        this.config.employees = this.config.employees || {};

        // Falls noch keine Konfiguration vorhanden ist, Standardwerte setzen
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

        // Aktualisiere Objekte im ioBroker-Objekttree
        await this.updateCustomerObjects();
        await this.updateEmployeeObjects();

        // Lege zusätzlich die TimeTracking-States in 0_userdata.0.TimeTracking an
        await createTimeTrackingStates(this);

        // Abonniere die Zustände der Geofences (z.B. von traccar)
        this.subscribeForeignStates('traccar.0.devices.*.geofences_string');

        this.log.info('WorkTime Adapter gestartet. Aktuelle Konfiguration: ' +
            JSON.stringify({ customers: this.config.customers, employees: this.config.employees }));
    }

    async onMessage(obj) {
        if (obj && obj.command === 'saveConfig') {
            // Speichere die übergebene Konfiguration in der nativen Konfiguration
            this.config.customers = obj.data.customers;
            this.config.employees = obj.data.employees;
            this.log.info('Konfiguration aktualisiert: ' + JSON.stringify(obj.data));
            // Aktualisiere die Objekte im Objekttree
            await this.updateCustomerObjects();
            await this.updateEmployeeObjects();
            this.sendTo(obj.from, obj.command, { result: 'ok' }, obj.callback);
        } else if (obj && obj.command === 'getConfig') {
            // Sende die aktuelle Konfiguration zurück
            this.sendTo(obj.from, obj.command, {
                customers: this.config.customers,
                employees: this.config.employees
            }, obj.callback);
        }
    }

    async updateCustomerObjects() {
        const view = await this.getObjectViewAsync('system', 'channel', {
            startkey: `${this.namespace}.kunden.`,
            endkey: `${this.namespace}.kunden.\u9999`
        });
        let existingIds = [];
        if (view && view.rows) {
            existingIds = view.rows.map(row => row.id);
        }
        for (const custKey in this.config.customers) {
            const customer = this.config.customers[custKey];
            const objId = `${this.namespace}.kunden.${custKey}`;
            await this.setObjectAsync(objId, {
                type: 'channel',
                common: {
                    name: customer.name,
                    desc: `Adresse: ${customer.address}, Stundensatz: ${customer.hourlyRate} EUR, Auftrag: ${customer.assignment}`
                },
                native: customer
            });
            existingIds = existingIds.filter(id => id !== objId);
        }
        for (const id of existingIds) {
            await this.delObjectAsync(id);
        }
        this.log.info('Kundenobjekte aktualisiert.');
    }

    async updateEmployeeObjects() {
        const view = await this.getObjectViewAsync('system', 'channel', {
            startkey: `${this.namespace}.mitarbeiter.`,
            endkey: `${this.namespace}.mitarbeiter.\u9999`
        });
        let existingIds = [];
        if (view && view.rows) {
            existingIds = view.rows.map(row => row.id);
        }
        for (const empKey in this.config.employees) {
            const employee = this.config.employees[empKey];
            const objId = `${this.namespace}.mitarbeiter.${empKey}`;
            await this.setObjectAsync(objId, {
                type: 'channel',
                common: {
                    name: `${employee.firstName} ${employee.lastName}`
                },
                native: employee
            });
            existingIds = existingIds.filter(id => id !== objId);
        }
        for (const id of existingIds) {
            await this.delObjectAsync(id);
        }
        this.log.info('Mitarbeiterobjekte aktualisiert.');
    }

    async onStateChange(id, state) {
        if (!state || state.val === undefined) return;
        // Reagiere auf Änderungen am Geofence-Status (z.B. traccar.0.devices.1.geofences_string)
        const match = id.match(/(traccar\.0\.devices\.\d+)\.geofences_string/);
        if (!match) return;
        // Hier verwenden wir direkt processGeofenceChange mit "this" als Parameter, damit wir die Adapter-API nutzen können
        processGeofenceChange(this, { state: state, oldState: {} }).catch(err => this.log.error(err));
    }

    async onUnload(callback) {
        try {
            callback();
        } catch (e) {
            callback();
        }
    }
}

// --------------------------
// Funktionen außerhalb der Klasse
// --------------------------

// Hilfsfunktion: createStateIfNotExists, nutzt createStateAsync, um bestehende States nicht zu überschreiben
async function createStateIfNotExists(adapterInstance, id, initialValue, commonObj) {
    await adapterInstance.createStateAsync(id, initialValue, false, commonObj);
}

// Funktion zum Anlegen der TimeTracking-States in 0_userdata.0.TimeTracking
async function createTimeTrackingStates(adapterInstance) {
    // Array mit Kundendaten – statisch, kann auch aus der Konfiguration geladen werden
    const customers = [
        {
            name: "HW2-9-Wohlen",
            address: "Wohlenstrasse 9, 1234 Town",
            hourlyRate: 85
        },
        {
            name: "Home-Herrengasse",
            address: "Herrengasse 1, 5678 City",
            hourlyRate: 95
        },
        {
            name: "Büro-Friedmatt3",
            address: "Friedmatt 3, 5678 City",
            hourlyRate: 95
        }
    ];

    for (let customer of customers) {
        const geofenceName = customer.name;
        const address = customer.address || "";
        const hourlyRate = customer.hourlyRate || 0;
        const basePath = `0_userdata.0.TimeTracking.${geofenceName}`;

        await createStateIfNotExists(adapterInstance, `${basePath}.time_day`, 0, {
            name: "Time (Day)",
            type: "number",
            role: "value",
            read: true,
            write: true,
            def: 0
        });
        await createStateIfNotExists(adapterInstance, `${basePath}.time_week`, 0, {
            name: "Time (Week)",
            type: "number",
            role: "value",
            read: true,
            write: true,
            def: 0
        });
        await createStateIfNotExists(adapterInstance, `${basePath}.time_month`, 0, {
            name: "Time (Month)",
            type: "number",
            role: "value",
            read: true,
            write: true,
            def: 0
        });
        await createStateIfNotExists(adapterInstance, `${basePath}.time_year`, 0, {
            name: "Time (Year)",
            type: "number",
            role: "value",
            read: true,
            write: true,
            def: 0
        });
        await createStateIfNotExists(adapterInstance, `${basePath}.lastEnter`, "", {
            name: "Last Enter Timestamp",
            type: "string",
            role: "date",
            read: true,
            write: true,
            def: ""
        });
        await createStateIfNotExists(adapterInstance, `${basePath}.work_log`, "[]", {
            name: "Work Log (JSON)",
            type: "string",
            role: "json",
            read: true,
            write: true,
            def: "[]"
        });
        await createStateIfNotExists(adapterInstance, `${basePath}.work_report`, "", {
            name: "Work Report",
            type: "string",
            role: "text",
            read: true,
            write: true,
            def: ""
        });
        await createStateIfNotExists(adapterInstance, `${basePath}.hourly_rate`, hourlyRate, {
            name: "Hourly Rate",
            type: "number",
            role: "value",
            read: true,
            write: true,
            def: hourlyRate
        });
        await createStateIfNotExists(adapterInstance, `${basePath}.customerAddress`, address, {
            name: "Customer Address",
            type: "string",
            role: "text",
            read: true,
            write: true,
            def: address
        });

        adapterInstance.log.info(`TimeTracking-States für "${geofenceName}" angelegt oder aktualisiert.`);
    }

    // Optionale States für manuelle Büroarbeit
    await createStateIfNotExists(adapterInstance, `0_userdata.0.TimeTracking.Manual.working`, false, {
        name: "Manual Work Active",
        type: "boolean",
        role: "switch",
        read: true,
        write: true,
        def: false
    });
    await createStateIfNotExists(adapterInstance, `0_userdata.0.TimeTracking.Manual.selectedID`, "", {
        name: "Selected ID for Manual Work",
        type: "string",
        role: "text",
        read: true,
        write: true,
        def: ""
    });
    await createStateIfNotExists(adapterInstance, `0_userdata.0.TimeTracking.Manual.lastEnter`, "", {
        name: "Manual Work Start Time",
        type: "string",
        role: "date",
        read: true,
        write: true,
        def: ""
    });
    await createStateIfNotExists(adapterInstance, `0_userdata.0.TimeTracking.Manual.work_report`, "", {
        name: "Manual Work Report",
        type: "string",
        role: "text",
        read: true,
        write: true,
        def: ""
    });

    adapter.log.info("Alle TimeTracking-States für Kunden und manuelle Büroarbeit wurden angelegt/aktualisiert.");
}

// Hilfsfunktion zum Warten
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Fügt zu einem State (über Pfad) Stunden hinzu
async function addTimeToCounter(path, hoursToAdd) {
    let state = await adapter.getStateAsync(path);
    let currentVal = state && state.val ? parseFloat(state.val) : 0;
    currentVal += hoursToAdd;
    await adapter.setStateAsync(path, { val: currentVal.toFixed(2), ack: true });
}

// Addiert Zeit (in Stunden) zu den Zählern eines bestimmten Geofences
async function addTimeToCounters(geofenceID, timeMs) {
    const hours = timeMs / 3600000;
    const basePath = `0_userdata.0.TimeTracking.${geofenceID}`;
    await addTimeToCounter(`${basePath}.time_day`, hours);
    await addTimeToCounter(`${basePath}.time_week`, hours);
    await addTimeToCounter(`${basePath}.time_month`, hours);
    await addTimeToCounter(`${basePath}.time_year`, hours);
}

// Erstellt einen Log-Eintrag für einen Geofence
async function createLogEntry(geofenceID, timeSpentHours) {
    const basePath = `0_userdata.0.TimeTracking.${geofenceID}`;
    const now = new Date();
    let log = [];
    const logState = await adapter.getStateAsync(`${basePath}.work_log`);
    if (logState && logState.val) {
        try {
            log = JSON.parse(logState.val);
        } catch (e) {
            adapter.log.warn("Fehler beim Parsen des Logs, benutze leeres Array");
            log = [];
        }
    }
    log.push({
        timestamp: now.toLocaleString(),
        timeSpent: timeSpentHours.toFixed(2),
        workDescription: "(kein Arbeitsbericht)"
    });
    await adapter.setStateAsync(`${basePath}.work_log`, { val: JSON.stringify(log), ack: true });
    adapter.log.info(`Log-Eintrag für ${geofenceID}: ${timeSpentHours.toFixed(2)} Stunden`);
}

// Verarbeitet Änderungen am Geofence-State (z.B. traccar.0.devices.1.geofences_string)
// Diese Funktion erwartet als ersten Parameter die Adapter-Instanz, damit wir über "this" (bzw. adapter) arbeiten können.
async function processGeofenceChange(adapterInstance, obj) {
    const newID = (obj.state.val || "").trim();
    const oldID = (obj.oldState && obj.oldState.val ? obj.oldState.val : "").trim();

    adapterInstance.log.info(`Geofence Änderung erkannt: alt="${oldID}" - neu="${newID}"`);

    // Wartezeit, damit sich der State stabilisiert (hier ca. 5 Minuten 10 Sekunden)
    await sleep(310000);

    const currentState = await adapterInstance.getStateAsync("traccar.0.devices.1.geofences_string");
    const stableID = (currentState && currentState.val ? currentState.val : "").trim();

    if (stableID !== newID) {
        adapterInstance.log.info(`Geofence stabilisiert sich nicht: ursprünglicher Wert "${newID}" vs. aktueller Wert "${stableID}". Abbruch.`);
        return;
    }

    if (lastGeofenceID && lastGeofenceID !== newID) {
        adapterInstance.log.info(`Verlasse Geofence ${lastGeofenceID}`);
        const lastEnterState = await adapterInstance.getStateAsync(`0_userdata.0.TimeTracking.${lastGeofenceID}.lastEnter`);
        if (lastEnterState && lastEnterState.val) {
            const lastEnter = new Date(lastEnterState.val);
            const now = new Date();
            const timeMs = now.getTime() - lastEnter.getTime();
            const hours = timeMs / 3600000;
            await addTimeToCounters(lastGeofenceID, timeMs);
            await createLogEntry(lastGeofenceID, hours);
        }
        await adapterInstance.setStateAsync(`0_userdata.0.TimeTracking.${lastGeofenceID}.lastEnter`, { val: "", ack: true });
    }

    if (newID) {
        adapterInstance.log.info(`Betrete Geofence ${newID}`);
        await adapterInstance.setStateAsync(`0_userdata.0.TimeTracking.${newID}.lastEnter`, { val: new Date().toISOString(), ack: true });
    }

    lastGeofenceID = newID;
}

// Adapter starten
function startAdapter(options) {
    options = options || {};
    Object.assign(options, { name: adapterName });
    adapter = new utils.Adapter(options);

    adapter.on('ready', async () => {
        // Lade native Konfiguration (Kunden und Mitarbeiter)
        adapter.config.customers = adapter.config.customers || {};
        adapter.config.employees = adapter.config.employees || {};

        // Falls keine Konfiguration vorhanden, Standardwerte setzen
        if (Object.keys(adapter.config.customers).length === 0) {
            adapter.config.customers = {
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
        if (Object.keys(adapter.config.employees).length === 0) {
            adapter.config.employees = {
                "traccar.0.devices.1": { firstName: "Max", lastName: "Mustermann" },
                "traccar.0.devices.2": { firstName: "Erika", lastName: "Musterfrau" }
            };
        }

        // Aktualisiere Objekte im ioBroker-Objekttree
        await adapter.updateCustomerObjects();
        await adapter.updateEmployeeObjects();

        // Lege die TimeTracking-States in 0_userdata.0.TimeTracking an
        await createTimeTrackingStates(adapter);

        // Abonniere den Geofence-Status (z.B. für Device 1)
        adapter.subscribeForeignStates("traccar.0.devices.1.geofences_string");

        adapter.log.info("WorkTime Adapter gestartet.");
    });

    adapter.on('stateChange', async (id, state) => {
        if (id === "traccar.0.devices.1.geofences_string" && state) {
            processGeofenceChange(adapter, { state: state, oldState: {} }).catch(err => adapter.log.error(err));
        }
    });

    adapter.on('message', async (obj) => {
        if (obj && obj.command === 'saveConfig') {
            adapter.config.customers = obj.data.customers;
            adapter.config.employees = obj.data.employees;
            adapter.log.info("Konfiguration aktualisiert: " + JSON.stringify(obj.data));
            await adapter.updateCustomerObjects();
            await adapter.updateEmployeeObjects();
            adapter.sendTo(obj.from, obj.command, { result: 'ok' }, obj.callback);
        } else if (obj && obj.command === 'getConfig') {
            adapter.sendTo(obj.from, obj.command, {
                customers: adapter.config.customers,
                employees: adapter.config.employees
            }, obj.callback);
        }
    });

    adapter.on('unload', (callback) => {
        try {
            callback();
        } catch (e) {
            callback();
        }
    });
}

startAdapter();

if (module.parent) {
    module.exports = (options) => new WorkTimeAdapter(options);
}

'use strict';

const utils = require('@iobroker/adapter-core');
const fetch = require('node-fetch');
const adapterName = require('./package.json').name.split('.').pop();
let adapter;  // Globale Variable

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
        // Lade Kunden und Mitarbeiter aus der nativen Konfiguration oder setze Standardwerte
        this.config.customers = this.config.customers || {};
        this.config.employees = this.config.employees || {};

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

        // Abonniere Geofence-Änderungen (z.B. für Device 1)
        this.subscribeForeignStates('traccar.0.devices.*.geofences_string');

        this.log.info('WorkTime Adapter gestartet. Aktuelle Konfiguration: ' +
            JSON.stringify({ customers: this.config.customers, employees: this.config.employees }));
    }

    async onMessage(obj) {
        if (obj && obj.command === 'saveConfig') {
            this.config.customers = obj.data.customers;
            this.config.employees = obj.data.employees;
            this.log.info('Konfiguration aktualisiert: ' + JSON.stringify(obj.data));
            await this.updateCustomerObjects();
            await this.updateEmployeeObjects();
            this.sendTo(obj.from, obj.command, { result: 'ok' }, obj.callback);
        } else if (obj && obj.command === 'getConfig') {
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
        let existingIds = view && view.rows ? view.rows.map(row => row.id) : [];
        for (const custKey in this.config.customers) {
            const customer = this.config.customers[custKey];
            const customerName = customer.name || custKey || "Unbenannt";
            const objId = `${this.namespace}.kunden.${custKey}`;
            await this.setObjectAsync(objId, {
                type: 'channel',
                common: {
                    name: customerName,
                    desc: `Adresse: ${customer.address || ""}, Stundensatz: ${customer.hourlyRate || 0} EUR, Auftrag: ${customer.assignment || ""}`
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
        let existingIds = view && view.rows ? view.rows.map(row => row.id) : [];
        for (const empKey in this.config.employees) {
            const employee = this.config.employees[empKey];
            const firstName = employee.firstName || "Unbekannt";
            const lastName = employee.lastName || "";
            const objId = `${this.namespace}.mitarbeiter.${empKey}`;
            await this.setObjectAsync(objId, {
                type: 'channel',
                common: {
                    name: `${firstName} ${lastName}`.trim()
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
        const match = id.match(/(traccar\.0\.devices\.\d+)\.geofences_string/);
        if (!match) return;
        // Rufe Geofence-Verarbeitung auf und übergebe "this" als Adapter-Instanz
        processGeofenceChange(this, { state: state, oldState: {} }).catch(err => this.log.error(err));
    }

    onUnload(callback) {
        try {
            callback();
        } catch (e) {
            callback();
        }
    }
}

// ------------------------------
// Funktionen außerhalb der Klasse
// ------------------------------

// Neuer Ansatz: Nutze setObjectNotExistsAsync statt createStateAsync, da createStateAsync veraltet ist.
async function createStateIfNotExists(adapterInstance, id, initialValue, commonObj) {
    // Stelle sicher, dass commonObj.name existiert
    if (!commonObj.name) {
        commonObj.name = "Unbenannt";
    }
    let obj = await adapterInstance.getObjectAsync(id);
    if (!obj) {
        await adapterInstance.setObjectNotExistsAsync(id, {
            type: 'state',
            common: commonObj,
            native: {}
        });
        await adapterInstance.setStateAsync(id, { val: initialValue, ack: true });
    }
}

async function createTimeTrackingStates(adapterInstance) {
    // Array mit Kundendaten – statisch, kann auch dynamisch aus der Konfiguration geladen werden.
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

    adapterInstance.log.info("Alle TimeTracking-States für Kunden und manuelle Büroarbeit wurden angelegt/aktualisiert.");
}

// Hilfsfunktion: Sleep
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

// Globaler Speicher für den zuletzt bekannten Geofence
let lastGeofenceID = "";

// Verarbeitet Änderungen am Geofence-State (z.B. traccar.0.devices.1.geofences_string)
async function processGeofenceChange(adapterInstance, obj) {
    const newID = (obj.state.val || "").trim();
    const oldID = (obj.oldState && obj.oldState.val ? obj.oldState.val : "").trim();

    adapterInstance.log.info(`Geofence Änderung erkannt: alt="${oldID}" - neu="${newID}"`);

    // Wartezeit: ca. 5 Minuten 10 Sekunden
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
    adapter = new WorkTimeAdapter(options);
}

startAdapter();

if (module.parent) {
    module.exports = (options) => new WorkTimeAdapter(options);
}

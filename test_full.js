'use strict';

// Dummy-Adapter, der die Grundfunktionen von ioBroker simuliert
class DummyAdapter {
    constructor(namespace) {
        this.namespace = namespace || 'ictb-time.0';
        // Simulierter Objekttree als einfaches Objekt
        this.objects = {};
    }

    async setObjectAsync(id, obj) {
        console.log(`setObjectAsync: ${id}`, obj);
        this.objects[id] = obj;
    }

    async getObjectViewAsync(_design, _type, query) {
        console.log(`getObjectViewAsync aufgerufen mit query:`, query);
        let rows = [];
        for (const id in this.objects) {
            // Simuliere eine einfache lexikographische Prüfung der id
            if (id >= query.startkey && id <= query.endkey) {
                rows.push({ id: id, obj: this.objects[id] });
            }
        }
        return { rows };
    }

    async delObjectAsync(id) {
        console.log(`delObjectAsync: ${id}`);
        delete this.objects[id];
    }

    async getStateAsync(id) {
        // Für diesen Test brauchen wir diese Funktion nicht im Detail
        return this.objects[id] ? { val: this.objects[id].native } : null;
    }

    async setStateAsync(id, state) {
        console.log(`setStateAsync: ${id} auf ${JSON.stringify(state)}`);
        this.objects[id] = { state: state };
    }
}

// Adapter-Klasse mit den Funktionen zum Erstellen/Aktualisieren der Kunden- und Mitarbeiterobjekte
class WorkTimeAdapterForTest extends DummyAdapter {
    constructor() {
        super('ictb-time.0');
        // Simulierte native Konfiguration mit Beispiel-Kunden und -Mitarbeitern
        this.config = {
            customers: {
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
            },
            employees: {
                "traccar.0.devices.1": { firstName: "Max", lastName: "Mustermann" },
                "traccar.0.devices.2": { firstName: "Erika", lastName: "Musterfrau" }
            }
        };
    }

    async updateCustomerObjects() {
        // Abrufen der bereits existierenden Kundenobjekte
        const view = await this.getObjectViewAsync('system', 'channel', {
            startkey: `${this.namespace}.kunden.`,
            endkey: `${this.namespace}.kunden.\u9999`
        });
        let existingIds = [];
        if (view && view.rows) {
            existingIds = view.rows.map(row => row.id);
        }
        // Für jeden Kunden aus der Konfiguration: Erstellen/Aktualisieren
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
        // Lösche alle Kundenobjekte, die nicht mehr in der Konfiguration stehen
        for (const id of existingIds) {
            await this.delObjectAsync(id);
        }
        console.log('Kundenobjekte aktualisiert.');
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
        console.log('Mitarbeiterobjekte aktualisiert.');
    }

    // Simulierter onMessage-Handler, der "saveConfig" und "getConfig" verarbeitet
    async onMessage(message) {
        if (message.command === 'saveConfig') {
            this.config.customers = message.data.customers;
            this.config.employees = message.data.employees;
            console.log('onMessage: Konfiguration gespeichert:', JSON.stringify(message.data));
            await this.updateCustomerObjects();
            await this.updateEmployeeObjects();
            return { result: 'ok' };
        } else if (message.command === 'getConfig') {
            return {
                customers: this.config.customers,
                employees: this.config.employees
            };
        }
    }
}

// Test-Skript, das alle Funktionen überprüft
async function runFullTest() {
    const adapter = new WorkTimeAdapterForTest();

    console.log("=== Initiale Konfiguration ===");
    console.log(JSON.stringify(adapter.config, null, 2));

    console.log("\n=== Initiales Update der Objekte ===");
    await adapter.updateCustomerObjects();
    await adapter.updateEmployeeObjects();
    console.log("Objekte nach initialem Update:");
    console.log(JSON.stringify(adapter.objects, null, 2));

    // Simuliere das Speichern einer neuen Konfiguration via onMessage:
    const newConfig = {
        customers: {
            "New-Customer": {
                name: "New-Customer",
                address: "Neue Straße 10, Neustadt",
                hourlyRate: 60,
                assignment: "Support"
            }
        },
        employees: {
            "traccar.0.devices.3": { firstName: "Anna", lastName: "Neukunde" }
        }
    };

    console.log("\n=== Simuliere saveConfig über onMessage ===");
    const response = await adapter.onMessage({ command: 'saveConfig', data: newConfig });
    console.log("onMessage response:", response);

    console.log("\n=== Konfiguration nach Save ===");
    console.log(JSON.stringify(adapter.config, null, 2));

    console.log("\n=== Objekte nach Save ===");
    console.log(JSON.stringify(adapter.objects, null, 2));

    // Simuliere das Abrufen der Konfiguration:
    console.log("\n=== Simuliere getConfig über onMessage ===");
    const getConfigResponse = await adapter.onMessage({ command: 'getConfig' });
    console.log("getConfig response:", JSON.stringify(getConfigResponse, null, 2));
}

runFullTest().catch(err => console.error(err));

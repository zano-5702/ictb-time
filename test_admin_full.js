'use strict';

// Dummy-Adapter zur Simulation der ioBroker‑Methoden und der onMessage‑Kommunikation
class DummyAdapter {
    constructor(namespace) {
        this.namespace = namespace || 'ictb-time.0';
        this.objects = {}; // Simulierter Objekttree
    }

    async setObjectAsync(id, obj) {
        console.log(`setObjectAsync: ${id}`, obj);
        this.objects[id] = obj;
    }

    async getObjectViewAsync(_design, _type, query) {
        console.log(`getObjectViewAsync aufgerufen mit query:`, query);
        let rows = [];
        for (const id in this.objects) {
            if (id >= query.startkey && id <= query.endkey) {
                rows.push({ id, obj: this.objects[id] });
            }
        }
        return { rows };
    }

    async delObjectAsync(id) {
        console.log(`delObjectAsync: ${id}`);
        delete this.objects[id];
    }

    async setStateAsync(id, state) {
        console.log(`setStateAsync: ${id} = ${state.val}`);
        // Speichere den Zustand (hier einfach in "objects")
        this.objects[id] = { state: state };
    }

    async getStateAsync(id) {
        return this.objects[id] && this.objects[id].state ? this.objects[id].state : null;
    }
}

// Adapter-Klasse, die auch den onMessage‑Handler (saveConfig, getConfig) implementiert
class WorkTimeAdapterForAdminTest extends DummyAdapter {
    constructor() {
        super('ictb-time.0');
        // Initiale native Konfiguration (Beispielwerte)
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

    // Erzeugt oder aktualisiert Kundenobjekte unter ictb-time.0.kunden.<kundenID>
    async updateCustomerObjects() {
        const view = await this.getObjectViewAsync('system', 'channel', {
            startkey: `${this.namespace}.kunden.`,
            endkey: `${this.namespace}.kunden.\u9999`
        });
        let existingIds = view && view.rows ? view.rows.map(row => row.id) : [];
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

    // Erzeugt oder aktualisiert Mitarbeiterobjekte unter ictb-time.0.mitarbeiter.<deviceID>
    async updateEmployeeObjects() {
        const view = await this.getObjectViewAsync('system', 'channel', {
            startkey: `${this.namespace}.mitarbeiter.`,
            endkey: `${this.namespace}.mitarbeiter.\u9999`
        });
        let existingIds = view && view.rows ? view.rows.map(row => row.id) : [];
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

    // onMessage-Handler: Verarbeitet "saveConfig" und "getConfig"
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

// Testskript, das den kompletten Workflow simuliert
async function runAdminFullTest() {
    const adapter = new WorkTimeAdapterForAdminTest();

    console.log("=== Initiale Konfiguration ===");
    console.log(JSON.stringify(adapter.config, null, 2));

    console.log("\n=== Initiales Update der Objekte ===");
    await adapter.updateCustomerObjects();
    await adapter.updateEmployeeObjects();
    console.log("Objekte nach initialem Update:");
    console.log(JSON.stringify(adapter.objects, null, 2));

    // Simuliere, dass in der Admin-Oberfläche ein neuer Kunde und ein neuer Mitarbeiter angelegt werden
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

    console.log("\n=== Simuliere saveConfig über onMessage (neue Konfiguration) ===");
    const saveResponse = await adapter.onMessage({ command: 'saveConfig', data: newConfig });
    console.log("onMessage saveConfig response:", JSON.stringify(saveResponse, null, 2));

    console.log("\n=== Konfiguration nach Save ===");
    console.log(JSON.stringify(adapter.config, null, 2));

    console.log("\n=== Objekte nach Save (sollten nur den neuen Kunden und Mitarbeiter enthalten) ===");
    console.log(JSON.stringify(adapter.objects, null, 2));

    console.log("\n=== Simuliere Abruf der Konfiguration über onMessage (getConfig) ===");
    const getConfigResponse = await adapter.onMessage({ command: 'getConfig' });
    console.log("onMessage getConfig response:", JSON.stringify(getConfigResponse, null, 2));
}

runAdminFullTest().catch(err => console.error(err));

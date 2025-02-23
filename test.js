'use strict';

// Dummy-Implementierung der ioBroker-Adapter-API-Methoden
class DummyAdapter {
    constructor(namespace) {
        this.namespace = namespace || 'ictb-time.0';
        // Simuliere einen internen "Objekttree" als einfaches Objekt
        this.objects = {};
    }

    async setObjectAsync(id, obj) {
        console.log(`setObjectAsync aufgerufen für id: ${id}`, obj);
        this.objects[id] = obj;
        return Promise.resolve();
    }

    async getObjectViewAsync(_design, _type, query) {
        // Simuliere, dass wir alle Objekte zurückgeben, deren id mit query.startkey beginnt.
        console.log(`getObjectViewAsync aufgerufen mit query:`, query);
        const rows = [];
        const startkey = query.startkey;
        const endkey = query.endkey;
        for (const id in this.objects) {
            if (id >= startkey && id <= endkey) {
                rows.push({ id: id, obj: this.objects[id] });
            }
        }
        return { rows };
    }

    async delObjectAsync(id) {
        console.log(`delObjectAsync aufgerufen für id: ${id}`);
        delete this.objects[id];
        return Promise.resolve();
    }
}

// Jetzt definieren wir unseren Adapter (nur den Teil, den wir testen wollen)
class WorkTimeAdapterForTest extends DummyAdapter {
    constructor() {
        super('ictb-time.0');
        // Simuliere native Konfiguration
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

    // Implementiere updateCustomerObjects() basierend auf unserem vorherigen Beispiel
    async updateCustomerObjects() {
        // Abrufen der bereits existierenden Kunden-Objekte
        const view = await this.getObjectViewAsync('system', 'channel', {
            startkey: `${this.namespace}.kunden.`,
            endkey: `${this.namespace}.kunden.\u9999`
        });
        let existingIds = [];
        if (view && view.rows) {
            existingIds = view.rows.map(row => row.id);
        }
        // Für jeden Kunden aus der Konfiguration: Erstellen oder Aktualisieren
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

    // Analog für Mitarbeiter
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
}

// Testen
async function runTests() {
    const adapter = new WorkTimeAdapterForTest();
    
    console.log("Starte Test: updateCustomerObjects");
    await adapter.updateCustomerObjects();
    console.log("Aktuelle Objekte nach Kundenupdate:", adapter.objects);

    console.log("\nStarte Test: updateEmployeeObjects");
    await adapter.updateEmployeeObjects();
    console.log("Aktuelle Objekte nach Mitarbeiterupdate:", adapter.objects);
}

runTests().catch(err => console.error(err));

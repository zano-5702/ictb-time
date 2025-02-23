'use strict';

// Dummy-Adapter zur Simulation der ioBroker-Methoden
class DummyAdapter {
    constructor(namespace) {
        this.namespace = namespace || 'ictb-time.0';
        this.objects = {}; // Simulierter Objekttree
    }

    async setObjectNotExistsAsync(id, obj) {
        if (!this.objects[id]) {
            console.log(`setObjectNotExistsAsync: ${id}`, obj);
            this.objects[id] = obj;
        }
    }

    async setStateAsync(id, state) {
        console.log(`setStateAsync: ${id} = ${state.val}`);
        // Wir speichern den Zustand einfach in einem Objekt
        this.objects[id] = { state: state };
    }

    async getStateAsync(id) {
        return this.objects[id] && this.objects[id].state ? this.objects[id].state : null;
    }

    async getObjectViewAsync(_design, _type, query) {
        console.log(`getObjectViewAsync mit query:`, query);
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
}

// Adapter-Klasse zur Simulation der Aggregationsfunktionen
class AggregationTestAdapter extends DummyAdapter {
    constructor() {
        super('ictb-time.0');
    }

    // Aggregiert den Stundenwert unter einem bestimmten Schlüssel
    async aggregateForKey(key, hours) {
        let currentState = await this.getStateAsync(key);
        let total = currentState && currentState.val ? parseFloat(currentState.val) : 0;
        total += hours;
        await this.setObjectNotExistsAsync(key, {
            type: 'state',
            common: {
                name: key,
                type: 'number',
                role: 'value.time',
                unit: 'h'
            },
            native: {}
        });
        await this.setStateAsync(key, { val: total, ack: true });
        console.log(`Aggregated ${hours}h for ${key}, total: ${total}h`);
    }

    // Aktualisiert aggregierte Arbeitszeiten für einen Mitarbeiter anhand eines Logeintrags
    async updateAggregates(employee, logEntry) {
        const endDate = new Date(logEntry.endTime);
        const dayKey = endDate.toISOString().split('T')[0]; // Format: YYYY-MM-DD
        const year = endDate.getFullYear();
        const month = endDate.getMonth() + 1;
        const week = this.getISOWeek(endDate);
        const yearKey = year.toString();
        const monthKey = `${year}-${('0' + month).slice(-2)}`;
        const weekKey = `${year}-W${week}`;

        // Aggregation in verschiedenen Perioden
        await this.aggregateForKey(`aggregates.${employee.firstName}_${employee.lastName}.day.${dayKey}`, logEntry.durationHours);
        await this.aggregateForKey(`aggregates.${employee.firstName}_${employee.lastName}.week.${weekKey}`, logEntry.durationHours);
        await this.aggregateForKey(`aggregates.${employee.firstName}_${employee.lastName}.month.${monthKey}`, logEntry.durationHours);
        await this.aggregateForKey(`aggregates.${employee.firstName}_${employee.lastName}.year.${yearKey}`, logEntry.durationHours);
    }

    // Berechnet die ISO-Woche für ein Datum
    getISOWeek(date) {
        const tempDate = new Date(date.getTime());
        tempDate.setHours(0, 0, 0, 0);
        tempDate.setDate(tempDate.getDate() + 3 - ((tempDate.getDay() + 6) % 7));
        const firstThursday = new Date(tempDate.getFullYear(), 0, 4);
        firstThursday.setDate(firstThursday.getDate() + 3 - ((firstThursday.getDay() + 6) % 7));
        const weekNumber = 1 + Math.round(((tempDate.getTime() - firstThursday.getTime()) / 86400000 - 3 + ((firstThursday.getDay() + 6) % 7)) / 7);
        return weekNumber;
    }
}

// Testskript zur Aggregation
async function runAggregationTest() {
    const adapter = new AggregationTestAdapter();
    const employee = { firstName: "Max", lastName: "Mustermann" };

    // Simuliere einen Logeintrag: Arbeitszeit von 08:00 bis 12:00 (4 Stunden)
    const logEntry = {
        employee: "Max Mustermann",
        customer: "New-Customer",
        address: "Neue Straße 10, Neustadt",
        hourlyRate: 60,
        startTime: "2025-02-23T08:00:00.000Z",
        endTime: "2025-02-23T12:00:00.000Z",
        durationHours: 4,
        workDescription: "Test-Arbeit"
    };

    console.log("Starte Aggregationstest für einen 4-Stunden-Logeintrag...");
    await adapter.updateAggregates(employee, logEntry);

    console.log("\nAktuelle Aggregat-Objekte:");
    console.log(JSON.stringify(adapter.objects, null, 2));
}

runAggregationTest().catch(err => console.error(err));

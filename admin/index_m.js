"use strict";

// Lokale Speicherung – in einem echten Adapter würden diese Daten über die Adapterkonfiguration
// (adapter.config) oder per persistenter Speicherung in ioBroker abgelegt.
let customers = {};  // Beispiel: { "Home-Herrengasse": { name:"Home-Herrengasse", address:"Herrengasse 1", hourlyRate:50, assignment:"Installation" } }
let employees = {};  // Beispiel: { "traccar.0.devices.1": { firstName:"Max", lastName:"Mustermann" } }

// Fügt einen neuen Kunden hinzu und aktualisiert die Anzeige
function addCustomer(customer) {
    customers[customer.name] = customer;
    updateCustomerList();
    // Hier kannst du die Daten an den Adapter senden, falls benötigt.
}

// Aktualisiert die Kundenliste in der UI
function updateCustomerList() {
    const list = document.getElementById("customerList");
    list.innerHTML = "";
    for (let key in customers) {
        const li = document.createElement("li");
        li.textContent = `${customers[key].name} – ${customers[key].address} – ${customers[key].hourlyRate} EUR – ${customers[key].assignment}`;
        list.appendChild(li);
    }
}

// Fügt einen neuen Mitarbeiter hinzu und aktualisiert die Anzeige
function addEmployee(employee) {
    employees[employee.deviceId] = employee;
    updateEmployeeList();
    // Auch hier kannst du die Daten per Adapter-API speichern.
}

// Aktualisiert die Mitarbeiterliste in der UI
function updateEmployeeList() {
    const list = document.getElementById("employeeList");
    list.innerHTML = "";
    for (let key in employees) {
        const li = document.createElement("li");
        li.textContent = `${employees[key].deviceId} – ${employees[key].firstName} ${employees[key].lastName}`;
        list.appendChild(li);
    }
}

// Event-Listener für das Kundenformular
document.getElementById("customerForm").addEventListener("submit", function(e) {
    e.preventDefault();
    const customer = {
        name: document.getElementById("customerName").value,
        address: document.getElementById("customerAddress").value,
        hourlyRate: parseFloat(document.getElementById("hourlyRate").value),
        assignment: document.getElementById("assignment").value
    };
    addCustomer(customer);
    this.reset();
});

// Event-Listener für das Mitarbeiterformular
document.getElementById("employeeForm").addEventListener("submit", function(e) {
    e.preventDefault();
    const employee = {
        deviceId: document.getElementById("deviceId").value,
        firstName: document.getElementById("firstName").value,
        lastName: document.getElementById("lastName").value
    };
    addEmployee(employee);
    this.reset();
});

// Beispielhafter Code, um Arbeitslogeinträge anzuzeigen
function updateWorkLog(logEntries) {
    const logDiv = document.getElementById("workLog");
    logDiv.innerHTML = "";
    logEntries.forEach(entry => {
        const div = document.createElement("div");
        div.style.borderBottom = "1px solid #ccc";
        div.style.marginBottom = "5px";
        div.innerHTML = `<strong>${entry.employee}</strong> bei <em>${entry.customer}</em><br>
                         Start: ${entry.startTime}<br>
                         Ende: ${entry.endTime}<br>
                         Dauer: ${entry.durationHours.toFixed(2)} Stunden<br>
                         Beschreibung: ${entry.workDescription || "-"}`;
        logDiv.appendChild(div);
    });
}

// Hier kannst du über den ioBroker-Adapter die bestehenden Konfigurationen und Logs laden
// und die Funktionen updateCustomerList(), updateEmployeeList() und updateWorkLog() aufrufen.

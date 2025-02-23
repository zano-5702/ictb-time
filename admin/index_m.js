"use strict";

// Lokale Speicherung – diese Daten sollten später über die Adapterkonfiguration
// in ioBroker persistiert werden (z.B. via adapter.config)
let customers = {};  // z.B. { "Home-Herrengasse": { name:"Home-Herrengasse", address:"Herrengasse 1, Musterstadt", hourlyRate:50, assignment:"Installation" } }
let employees = {};  // z.B. { "traccar.0.devices.1": { firstName:"Max", lastName:"Mustermann" } }

// Fügt einen neuen Kunden hinzu und aktualisiert die Anzeige
function addCustomer(customer) {
    customers[customer.name] = customer;
    updateCustomerList();
    // Hier kann ein Aufruf an den Adapter erfolgen, um die Konfiguration zu speichern (z.B. via socket.emit("setConfig", ...))
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
    // Auch hier kann ein Konfigurationsspeicher-Aufruf erfolgen
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

// Beispielhafter Code, um Arbeitslogeinträge (Logs) anzuzeigen
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

// Hier könnte man über den ioBroker-Adapter (z.B. socket.io) die bestehenden Konfigurationen und Logs laden
// und die Funktionen updateCustomerList(), updateEmployeeList() und updateWorkLog() aufrufen.

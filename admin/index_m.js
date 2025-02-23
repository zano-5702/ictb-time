"use strict";

// Lokale Speicherung – diese Daten werden vom Backend geladen
let customers = {};
let employees = {};

// Stelle über Socket.IO eine Verbindung zum Backend her
// (Im ioBroker Admin-UI ist eine Socket-Verbindung in der Regel bereits vorhanden)
const socket = io.connect(window.location.origin);

// Funktion, um die aktuelle Konfiguration vom Adapter abzurufen
function loadConfig() {
    socket.emit('getConfig', null, function (response) {
        if (response && response.result) {
            customers = response.result.customers || {};
            employees = response.result.employees || {};
            updateCustomerList();
            updateEmployeeList();
        }
    });
}

// Funktion zum Speichern der aktuellen Konfiguration an das Backend
function saveConfig() {
    socket.emit('saveConfig', { customers: customers, employees: employees }, function (response) {
        console.log("Konfiguration gespeichert:", response);
    });
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
    // Kunde hinzufügen oder überschreiben
    customers[customer.name] = customer;
    updateCustomerList();
    saveConfig();
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
    // Mitarbeiter hinzufügen oder überschreiben
    employees[employee.deviceId] = employee;
    updateEmployeeList();
    saveConfig();
    this.reset();
});

// Event-Listener für den "Konfiguration speichern" Button (optional, da bei Formularänderungen automatisch gespeichert wird)
document.getElementById("saveConfigBtn").addEventListener("click", function() {
    saveConfig();
});

// Beim Laden der Seite Konfiguration abrufen
loadConfig();

"use strict";

// Globale Variablen zur Speicherung der Konfiguration
var customers = {};
var employees = {};

// Diese Funktion wird automatisch vom ioBroker-Admin-Framework aufgerufen,
// wenn die Adapter-Einstellungen geladen werden.
function load(settings, onChange) {
    console.log("load(): Einstellungen werden geladen:", settings);
    // Falls in den gespeicherten Einstellungen Kunden/Mitarbeiter vorhanden sind, übernehmen wir sie.
    customers = settings.customers || {};
    employees = settings.employees || {};

    updateCustomerList();
    updateEmployeeList();

    // onChange() signalisiert, dass sich etwas geändert hat.
    onChange();
}

// Diese Funktion wird vom Admin-Framework aufgerufen, wenn der Benutzer auf "Speichern" klickt.
function save(callback) {
    var newSettings = {
        customers: customers,
        employees: employees
    };
    console.log("save(): Neue Einstellungen werden gespeichert:", newSettings);
    // Rückgabe der neuen Einstellungen über den Callback.
    callback(newSettings);
}

// Aktualisiert die Anzeige der Kunden in der Liste.
function updateCustomerList() {
    var $list = $("#customerList");
    $list.empty();
    for (var key in customers) {
        if (customers.hasOwnProperty(key)) {
            var customer = customers[key];
            $list.append($("<li>").text(
                customer.name + " - " +
                customer.address + " - " +
                customer.hourlyRate + " EUR - " +
                customer.assignment
            ));
        }
    }
}

// Aktualisiert die Anzeige der Mitarbeiter in der Liste.
function updateEmployeeList() {
    var $list = $("#employeeList");
    $list.empty();
    for (var key in employees) {
        if (employees.hasOwnProperty(key)) {
            var emp = employees[key];
            $list.append($("<li>").text(
                key + " : " + emp.firstName + " " + emp.lastName
            ));
        }
    }
}

// Event-Handler für das Kundenformular.
$("#customerForm").on("submit", function(e) {
    e.preventDefault();
    var customer = {
        name: $("#customerName").val().trim(),
        address: $("#customerAddress").val().trim(),
        hourlyRate: parseFloat($("#hourlyRate").val()),
        assignment: $("#assignment").val().trim()
    };
    // Kunde hinzufügen oder überschreiben.
    customers[customer.name] = customer;
    updateCustomerList();
    // Signalisiere, dass sich etwas geändert hat – der Admin-Framework ruft danach save() auf.
    console.log("Neuer Kunde hinzugefügt:", customer);
    this.reset();
});

// Event-Handler für das Mitarbeiterformular.
$("#employeeForm").on("submit", function(e) {
    e.preventDefault();
    var employee = {
        deviceId: $("#deviceId").val().trim(),
        firstName: $("#firstName").val().trim(),
        lastName: $("#lastName").val().trim()
    };
    // Mitarbeiter hinzufügen oder überschreiben. Die DeviceID wird als Schlüssel verwendet.
    employees[employee.deviceId] = employee;
    updateEmployeeList();
    console.log("Neuer Mitarbeiter hinzugefügt:", employee);
    this.reset();
});

// Standardmäßig wird die Initialisierungsfunktion von adapter-settings.js aufgerufen.
// In document.ready rufen wir initSettings() auf, damit die Standardbuttons angezeigt werden.
$(document).ready(function() {
    if (typeof initSettings === 'function') {
        initSettings(); // Initialisiert die Standardbuttons: "Speichern", "Speichern und Schließen", "Schließen"
    } else {
        console.error("initSettings() ist nicht definiert. Bitte prüfe den Pfad zu adapter-settings.js!");
    }
});

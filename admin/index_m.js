"use strict";

// Globale Variablen zur Speicherung der Konfiguration
// Diese werden beim Laden initial befüllt und durch Formularaktionen (z. B. "Kunde hinzufügen") aktualisiert.
var customers = {};
var employees = {};

// Diese Funktion wird automatisch vom adapter-settings.js aufgerufen,
// wenn die Adapter‑Einstellungen geladen werden.
function load(settings, onChange) {
    console.log("load(): Lade Einstellungen:", settings);
    
    // Falls noch keine Kunden/Mitarbeiter in den Einstellungen vorhanden sind, initialisieren
    customers = settings.customers || {};
    employees = settings.employees || {};

    // Aktualisiere die UI-Elemente, z. B. eine Liste oder Tabelle für Kunden
    updateCustomerList();
    updateEmployeeList();

    // onChange() benachrichtigt das Framework, dass sich der Zustand (z.B. "dirty" Flag) geändert hat.
    onChange();
}

// Diese Funktion wird aufgerufen, wenn der Benutzer auf "Speichern" klickt.
function save(callback) {
    // Hier werden die aktuellen Kunden- und Mitarbeiterdaten (aus den globalen Variablen)
    // in ein Objekt gepackt, das als neue Konfiguration gespeichert wird.
    var newSettings = {
        customers: customers,
        employees: employees
    };
    console.log("save(): Speichere Einstellungen:", newSettings);
    // Der Callback wird mit den neuen Einstellungen aufgerufen.
    callback(newSettings);
}

// Hilfsfunktion: Baut die Kundenliste in der UI auf (z. B. als <ul>)
function updateCustomerList() {
    var $list = $("#customerList");
    $list.empty();
    // Für jeden Kunden aus den globalen Variablen
    for (var key in customers) {
        if (customers.hasOwnProperty(key)) {
            var customer = customers[key];
            var $li = $("<li>").text(
                customer.name + " | " + customer.address + " | " +
                customer.hourlyRate + " EUR | " + customer.assignment
            );
            $list.append($li);
        }
    }
}

// Hilfsfunktion: Baut die Mitarbeiterliste in der UI auf
function updateEmployeeList() {
    var $list = $("#employeeList");
    $list.empty();
    for (var key in employees) {
        if (employees.hasOwnProperty(key)) {
            var employee = employees[key];
            var $li = $("<li>").text(
                key + " : " + employee.firstName + " " + employee.lastName
            );
            $list.append($li);
        }
    }
}

// Beispielhafte Event-Handler für das Kundenformular
$("#customerForm").on("submit", function(e) {
    e.preventDefault();
    // Lese die Eingabefelder aus
    var customer = {
        name: $("#customerName").val().trim(),
        address: $("#customerAddress").val().trim(),
        hourlyRate: parseFloat($("#hourlyRate").val()),
        assignment: $("#assignment").val().trim()
    };
    // Füge den Kunden in die globale Variable ein (Überschreiben bei gleichem Namen)
    customers[customer.name] = customer;
    updateCustomerList();
    // Signalisiere, dass sich etwas geändert hat, und speichere die Konfiguration
    // (adapter-settings.js ruft anschließend save() auf)
    // Hier rufen wir save() nicht direkt auf, sondern onChange() wird vom Framework getriggert.
    console.log("Neuer Kunde hinzugefügt:", customer);
    this.reset();
});

// Beispielhafte Event-Handler für das Mitarbeiterformular
$("#employeeForm").on("submit", function(e) {
    e.preventDefault();
    var employee = {
        deviceId: $("#deviceId").val().trim(),
        firstName: $("#firstName").val().trim(),
        lastName: $("#lastName").val().trim()
    };
    // Füge den Mitarbeiter ein, wobei die DeviceID als Schlüssel verwendet wird
    employees[employee.deviceId] = employee;
    updateEmployeeList();
    console.log("Neuer Mitarbeiter hinzugefügt:", employee);
    this.reset();
});

// Wenn der "Speichern"-Button (falls separat vorhanden) geklickt wird
$("#saveConfigBtn").on("click", function() {
    // Dies löst save() aus, wenn der Benutzer auf "Speichern" klickt.
    save(function(newSettings) {
        console.log("save() Callback:", newSettings);
    });
});

// Das adapter-settings.js Skript ruft automatisch load() beim Start der Admin-Seite auf,
// sodass load() beim Laden die Konfiguration in die UI übernimmt.

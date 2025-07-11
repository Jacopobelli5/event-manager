-- Enable foreign key constraints
PRAGMA foreign_keys=ON;

BEGIN TRANSACTION;

-- Table to store site-wide settings (name and description)
CREATE TABLE IF NOT EXISTS site_settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    name TEXT NOT NULL,
    description TEXT NOT NULL
);

-- Table to store events
CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    event_date DATETIME NOT NULL,
    ticket_id INTEGER,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    published_at DATETIME,
    status TEXT NOT NULL CHECK (status IN ('draft', 'published')),
    FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE SET NULL
);

-- Table to store tickets
CREATE TABLE IF NOT EXISTS tickets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    price REAL NOT NULL,
    quantity INTEGER NOT NULL
);

-- Table to store bookings
CREATE TABLE IF NOT EXISTS bookings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id INTEGER NOT NULL,
    attendee_name TEXT NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
);

-- Table to store the number of tickets booked per booking
CREATE TABLE IF NOT EXISTS booking_tickets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    booking_id INTEGER NOT NULL,
    ticket_id INTEGER NOT NULL,
    quantity INTEGER NOT NULL,
    FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
    FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE
);

COMMIT;

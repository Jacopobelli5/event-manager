const express = require('express');
const router = express.Router();

/**
 * GET /organiser
 * Organiser Home Page
 * Purpose: Display organiser dashboard with site info, event lists, and actions.
 * Inputs: None
 * Outputs: Renders organiser-home.ejs with site and event data
 */
router.get('/', (req, res) => {
    
    const getSiteSettings = new Promise((resolve, reject) => {
        global.db.get("SELECT * FROM site_settings WHERE id = 1", (err, row) => {
            if (err) reject(err);
            // If no settings yet, provide default values
            resolve(row || { name: 'Event Manager', description: 'Your events, organised.' });
        });
    });

    const getPublishedEvents = new Promise((resolve, reject) => {
        global.db.all("SELECT * FROM events WHERE status = 'published' ORDER BY event_date DESC", (err, rows) => {
            if (err) reject(err);
            resolve(rows);
        });
    });

    const getDraftEvents = new Promise((resolve, reject) => {
        global.db.all("SELECT * FROM events WHERE status = 'draft' ORDER BY created_at DESC", (err, rows) => {
            if (err) reject(err);
            resolve(rows);
        });
    });

    Promise.all([getSiteSettings, getPublishedEvents, getDraftEvents])
        .then(([siteSettings, publishedEvents, draftEvents]) => {
            res.render('organiser-home', {
                site: siteSettings,
                publishedEvents: publishedEvents,
                draftEvents: draftEvents
            });
        })
        .catch(err => {
            console.error(err);
            res.status(500).send("Error retrieving data from database.");
        });
});

/**
 * GET /organiser/settings
 * Site Settings Page
 * Purpose: Display a form to edit the site name and description.
 * Inputs: None
 * Outputs: Renders site-settings.ejs with current site settings.
 */
router.get('/settings', (req, res) => {
    global.db.get("SELECT * FROM site_settings WHERE id = 1", (err, row) => {
        if (err) {
            console.error(err);
            return res.status(500).send("Error fetching site settings.");
        }
        res.render('site-settings', {
            site: row || { name: 'Event Manager', description: 'Your events, organised.' }
        });
    });
});

/**
 * POST /organiser/settings
 * Update Site Settings
 * Purpose: Update the site name and description in the database.
 * Inputs: name (string), description (string) from form body
 * Outputs: Redirects to /organiser
 */
router.post('/settings', (req, res) => {
    const { name, description } = req.body;

    // Basic validation
    if (!name || !description) {
        return res.status(400).send("Name and description are required.");
    }

    const sql = `
        INSERT INTO site_settings (id, name, description) VALUES (1, ?, ?)
        ON CONFLICT(id) DO UPDATE SET name = excluded.name, description = excluded.description;
    `;

    global.db.run(sql, [name, description], (err) => {
        if (err) {
            console.error(err);
            return res.status(500).send("Error updating site settings.");
        }
        res.redirect('/organiser');
    });
});

/**
 * POST /organiser/events/new
 * Create New Draft Event
 * Purpose: Create a new draft event and redirect to its edit page.
 * Inputs: None
 * Outputs: Redirects to /organiser/events/:id/edit
 */
router.post('/events/new', (req, res) => {
    const sql = `
        INSERT INTO events (title, description, event_date, status)
        VALUES ('New Event Title', 'Event Description', DATETIME('now'), 'draft')
    `;
    global.db.run(sql, function(err) {
        if (err) {
            console.error(err);
            return res.status(500).send("Error creating new event.");
        }
        // 'this.lastID' gives the ID of the row that was just inserted
        res.redirect(`/organiser/events/${this.lastID}/edit`);
    });
});

/**
 * GET /organiser/events/:id/edit
 * Organiser Edit Event Page
 * Purpose: Display a form to edit an event's details.
 * Inputs: Event ID from URL parameter
 * Outputs: Renders organiser-edit-event.ejs with event and ticket data.
 */
router.get('/events/:id/edit', (req, res) => {
    const eventId = req.params.id;

    const getEvent = new Promise((resolve, reject) => {
        global.db.get("SELECT * FROM events WHERE id = ?", [eventId], (err, row) => {
            if (err) reject(err);
            resolve(row);
        });
    });

    const getTicketTypes = new Promise((resolve, reject) => {
        global.db.all("SELECT * FROM ticket_types WHERE event_id = ?", [eventId], (err, rows) => {
            if (err) reject(err);
            resolve(rows);
        });
    });

    Promise.all([getEvent, getTicketTypes])
        .then(([event, ticketTypes]) => {
            if (!event) {
                return res.status(404).send("Event not found.");
            }
            res.render('organiser-edit-event', { event, ticketTypes });
        })
        .catch(err => {
            console.error(err);
            res.status(500).send("Error retrieving event data.");
        });
});

/**
 * POST /organiser/events/:id
 * Update Event Details
 * Purpose: Update an event's title, description, and date in the database.
 * Inputs: Event ID from URL, form data (title, description, event_date)
 * Outputs: Redirects to /organiser
 */
router.post('/events/:id', (req, res) => {
    const eventId = req.params.id;
    const { title, description, event_date } = req.body;

    const sql = `
        UPDATE events
        SET title = ?, description = ?, event_date = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
    `;

    global.db.run(sql, [title, description, event_date, eventId], (err) => {
        if (err) {
            console.error(err);
            return res.status(500).send("Error updating event.");
        }
        res.redirect('/organiser');
    });
});

/**
 * POST /organiser/events/:id/publish
 * Publish a Draft Event
 * Purpose: Change an event's status from 'draft' to 'published'.
 * Inputs: Event ID from URL
 * Outputs: Redirects to /organiser
 */
router.post('/events/:id/publish', (req, res) => {
    const eventId = req.params.id;
    const sql = `
        UPDATE events
        SET status = 'published', published_at = CURRENT_TIMESTAMP
        WHERE id = ?
    `;
    global.db.run(sql, [eventId], (err) => {
        if (err) {
            console.error(err);
            return res.status(500).send("Error publishing event.");
        }
        res.redirect('/organiser');
    });
});

/**
 * POST /organiser/events/:id/delete
 * Delete an Event
 * Purpose: Remove an event from the database.
 * Inputs: Event ID from URL
 * Outputs: Redirects to /organiser
 */
router.post('/events/:id/delete', (req, res) => {
    const eventId = req.params.id;
    const sql = "DELETE FROM events WHERE id = ?";
    global.db.run(sql, [eventId], (err) => {
        if (err) {
            console.error(err);
            return res.status(500).send("Error deleting event.");
        }
        res.redirect('/organiser');
    });
});

/**
 * POST /organiser/events/:id/tickets/add
 * Add a new ticket type to an event
 * Inputs: event id (URL), type_name, ticket_count, ticket_price (form)
 * Outputs: Redirects to the event edit page
 */
router.post('/events/:id/tickets/add', (req, res) => {
    const eventId = req.params.id;
    const { type_name, ticket_count, ticket_price } = req.body;
    if (!type_name || !ticket_count || !ticket_price) {
        return res.status(400).send("All fields are required.");
    }
    const sql = `INSERT INTO ticket_types (event_id, type_name, ticket_count, ticket_price) VALUES (?, ?, ?, ?)`;
    global.db.run(sql, [eventId, type_name, ticket_count, ticket_price], (err) => {
        if (err) {
            console.error(err);
            return res.status(500).send("Error adding ticket type.");
        }
        res.redirect(`/organiser/events/${eventId}/edit`);
    });
});

/**
 * POST /organiser/events/:id/tickets/:ticketId/edit
 * Edit an existing ticket type
 * Inputs: event id, ticket id (URL), type_name, ticket_count, ticket_price (form)
 * Outputs: Redirects to the event edit page
 */
router.post('/events/:id/tickets/:ticketId/edit', (req, res) => {
    const eventId = req.params.id;
    const ticketId = req.params.ticketId;
    const { type_name, ticket_count, ticket_price } = req.body;
    if (!type_name || !ticket_count || !ticket_price) {
        return res.status(400).send("All fields are required.");
    }
    const sql = `UPDATE ticket_types SET type_name = ?, ticket_count = ?, ticket_price = ? WHERE id = ? AND event_id = ?`;
    global.db.run(sql, [type_name, ticket_count, ticket_price, ticketId, eventId], (err) => {
        if (err) {
            console.error(err);
            return res.status(500).send("Error editing ticket type.");
        }
        res.redirect(`/organiser/events/${eventId}/edit`);
    });
});

/**
 * POST /organiser/events/:id/tickets/:ticketId/delete
 * Delete a ticket type from an event
 * Inputs: event id, ticket id (URL)
 * Outputs: Redirects to the event edit page
 */
router.post('/events/:id/tickets/:ticketId/delete', (req, res) => {
    const eventId = req.params.id;
    const ticketId = req.params.ticketId;
    const sql = `DELETE FROM ticket_types WHERE id = ? AND event_id = ?`;
    global.db.run(sql, [ticketId, eventId], (err) => {
        if (err) {
            console.error(err);
            return res.status(500).send("Error deleting ticket type.");
        }
        res.redirect(`/organiser/events/${eventId}/edit`);
    });
});

module.exports = router; 
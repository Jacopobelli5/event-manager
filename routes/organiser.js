// No help needed until next help comment below
const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const expressValidator = require('express-validator');

/**
GET /organiser
Shows the main dashboard for organisers with all their events
*/
router.get('/', (req, res) => {
    // Help needed here - Complex nested queries and data aggregation
    global.db.get("SELECT * FROM site_settings WHERE id = 1", (err, result) => {
        if (err) {
            console.error(err);
            return res.status(500).send("Error fetching site settings.");
        }
        // Provide default site settings if none exist in database
        if (!result) {
            result = { name: 'Event Manager', description: 'Your events, organised.' };
        }
        global.db.all("SELECT * FROM events WHERE status = 'published' ORDER BY event_date DESC", (err, publishedResults) => {
            if (err) {
                console.error(err);
                return res.status(500).send("Error fetching published events.");
            }
            global.db.all("SELECT * FROM events WHERE status = 'draft' ORDER BY created_at DESC", (err, draftResults) => {
                if (err) {
                    console.error(err);
                    return res.status(500).send("Error fetching draft events.");
                }
                // Fetch all tickets for all events
                var allEventIds = publishedResults.map(e => e.id).concat(draftResults.map(e => e.id));
                if (allEventIds.length === 0) {
                    return res.render('organiser-home', {
                        site: result,
                        publishedEvents: publishedResults,
                        draftEvents: draftResults
                    });
                }
                
                // Get all ticket IDs from events
                var allTicketIds = [];
                publishedResults.forEach(event => {
                    if (event.ticket_id) allTicketIds.push(event.ticket_id);
                });
                draftResults.forEach(event => {
                    if (event.ticket_id) allTicketIds.push(event.ticket_id);
                });
                
                // Handle case where no events have tickets - set all tickets to null
                if (allTicketIds.length === 0) {
                    function attachTickets(events) {
                        events.forEach(event => {
                            event.ticket = null;
                        });
                    }
                    attachTickets(publishedResults);
                    attachTickets(draftResults);
                    return res.render('organiser-home', {
                        site: result,
                        publishedEvents: publishedResults,
                        draftEvents: draftResults
                    });
                }
                
                var ticketPlaceholders = allTicketIds.map(() => '?').join(',');
                global.db.all("SELECT * FROM tickets WHERE id IN (" + ticketPlaceholders + ")", allTicketIds, (err, ticketResults) => {
                    if (err) {
                        console.error(err);
                        return res.status(500).send("Error fetching tickets.");
                    }
                    
                    // Fetch booked quantities for all tickets
                    global.db.all("SELECT ticket_id, SUM(quantity) as booked FROM booking_tickets WHERE ticket_id IN (" + ticketPlaceholders + ") GROUP BY ticket_id", allTicketIds, (err, bookedResults) => {
                        if (err) {
                            console.error(err);
                            return res.status(500).send("Error fetching booked ticket counts.");
                        }
                        // Create a map for quick lookup of booked quantities by ticket ID
                        var bookedMap = {};
                        bookedResults.forEach(row => {
                            bookedMap[row.ticket_id] = row.booked || 0;
                        });
                        
                        // Attach tickets and remaining to each event
                        function attachTickets(events) {
                            events.forEach(event => {
                                if (event.ticket_id) {
                                    event.ticket = ticketResults.find(t => t.id === event.ticket_id);
                                    if (event.ticket) {
                                        // Calculate remaining tickets by subtracting booked from total
                                        var booked = parseInt(bookedMap[event.ticket_id] || 0, 10);
                                        event.ticket.remaining = event.ticket.quantity - booked;
                                    }
                                } else {
                                    event.ticket = null;
                                }
                            });
                        }
                        attachTickets(publishedResults);
                        attachTickets(draftResults);
                        res.render('organiser-home', {
                            site: result,
                            publishedEvents: publishedResults,
                            draftEvents: draftResults
                        });
                    });
                });
            });
        });
    });
    // help ended
});

/**
GET /organiser/settings
Shows the site settings page where organisers can change the site name and description
*/
router.get('/settings', (req, res) => {
    global.db.get("SELECT * FROM site_settings WHERE id = 1", (err, result) => {
        if (err) {
            console.error(err);
            return res.status(500).send("Error fetching site settings.");
        }
        // Provide default site settings if none exist in database
        if (!result) {
            result = { name: 'Event Manager', description: 'Your events, organised.' };
        }
        res.render('site-settings', { site: result });
    });
});

/**
POST /organiser/settings
Saves the updated site name and description to the database
*/
router.post('/settings', [
    body('name').trim().notEmpty().withMessage('Name is required.'),
    body('description').trim().notEmpty().withMessage('Description is required.')
], function(req, res) {
    // Check for validation errors and return them as HTML if any exist
    var errors = validationResult(req);
    if (!errors.isEmpty()) {
        // Return error messages as a simple string (or you can render the form with errors)
        return res.status(400).send(errors.array().map(function(e) { return e.msg; }).join('<br>'));
    }
    var name = req.body.name;
    var description = req.body.description;
    // Use UPSERT to insert or update site settings (SQLite syntax)
    var sql = "INSERT INTO site_settings (id, name, description) VALUES (1, ?, ?) ON CONFLICT(id) DO UPDATE SET name = excluded.name, description = excluded.description;";
    global.db.run(sql, [name, description], function(err) {
        if (err) {
            console.error(err);
            return res.status(500).send("Error updating site settings.");
        }
        res.redirect('/organiser');
    });
});

/**
POST /organiser/events/new
Creates a new draft event and takes you to edit it
*/
router.post('/events/new', (req, res) => {
    var sql = "INSERT INTO events (title, description, event_date, status) VALUES ('New Event Title', 'Event Description', DATETIME('now'), 'draft')";
    global.db.run(sql, function(err) {
        if (err) {
            console.error(err);
            return res.status(500).send("Error creating new event.");
        }
        res.redirect('/organiser/events/' + this.lastID + '/edit');
    });
});

/**
GET /organiser/events/:id/edit
Shows the edit page for a specific event
*/
router.get('/events/:id/edit', (req, res) => {
    var eventId = req.params.id;
    global.db.get("SELECT * FROM events WHERE id = ?", [eventId], (err, result) => {
        if (err) {
            console.error(err);
            return res.status(500).send("Error fetching event.");
        }
        if (!result) {
            return res.status(404).send("Event not found.");
        }
        
        // If event has a ticket_id, fetch the ticket
        if (result.ticket_id) {
            global.db.get("SELECT * FROM tickets WHERE id = ?", [result.ticket_id], (err, ticketResult) => {
                if (err) {
                    console.error(err);
                    return res.status(500).send("Error fetching ticket.");
                }
                res.render('organiser-edit-event', { event: result, ticket: ticketResult });
            });
        } else {
            // No ticket yet, pass null
            res.render('organiser-edit-event', { event: result, ticket: null });
        }
    });
});

/**
GET /organiser/events/:id/bookings
Shows all the bookings for a specific event
*/
router.get('/events/:id/bookings', function(req, res) {
    // help needed here - Complex JOIN queries and data aggregation
    var eventId = req.params.id;

    // Get the event
    global.db.get("SELECT * FROM events WHERE id = ?", [eventId], function(err, eventResult) {
        if (err) {
            console.error(err);
            return res.status(500).send("Error fetching event.");
        }
        if (!eventResult) {
            return res.status(404).send("Event not found.");
        }

        // Get all bookings for the event with ticket information
        global.db.all("SELECT b.*, bt.quantity, t.price as ticket_price FROM bookings b JOIN booking_tickets bt ON b.id = bt.booking_id JOIN tickets t ON bt.ticket_id = t.id WHERE b.event_id = ? ORDER BY b.created_at DESC", [eventId], function(err, bookingResults) {
            if (err) {
                console.error(err);
                return res.status(500).send("Error fetching bookings.");
            }

            // Get the ticket for the event
            global.db.get("SELECT * FROM tickets WHERE id = ?", [eventResult.ticket_id], function(err, ticketResult) {
                if (err) {
                    console.error(err);
                    return res.status(500).send("Error fetching ticket.");
                }

                // Calculate total tickets sold
                var totalTickets = 0;
                for (var i = 0; i < bookingResults.length; i++) {
                    totalTickets += bookingResults[i].quantity;
                }

                // Render the page
                res.render('organiser-bookings', {
                    event: eventResult,
                    bookings: bookingResults,
                    ticket: ticketResult,
                    totalTickets: totalTickets
                });
            });
        });
    });
    // help ended
});

/**
POST /organiser/event/:id/save-complete
Saves both the event details and ticket information together
*/
router.post('/event/:id/save-complete', [
    expressValidator.body('title').trim().notEmpty().withMessage('Title is required.'),
    expressValidator.body('description').trim().notEmpty().withMessage('Description is required.'),
    expressValidator.body('event_date').trim().notEmpty().withMessage('Event date is required.'),
    expressValidator.body('ticket_name').trim().notEmpty().withMessage('Ticket name is required.'),
    expressValidator.body('ticket_price').isFloat({ min: 0 }).withMessage('Ticket price must be 0 or more.'),
    expressValidator.body('ticket_quantity').isInt({ min: 1 }).withMessage('Ticket quantity must be at least 1.')
], function(req, res) {
    var errors = expressValidator.validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).send(errors.array().map(function(e) { return e.msg; }).join('<br>'));
    }
    
    var eventId = req.params.id;
    var title = req.body.title;
    var description = req.body.description;
    var event_date = req.body.event_date;
    // Convert checkbox value to boolean (1 for checked, 0 for unchecked)
    var published = req.body.published ? 1 : 0;
    var ticket_name = req.body.ticket_name;
    var ticket_price = req.body.ticket_price;
    var ticket_quantity = req.body.ticket_quantity;
    
    // Start transaction
    global.db.run('BEGIN TRANSACTION');
    
    // First check if event already has a ticket
    global.db.get("SELECT ticket_id FROM events WHERE id = ?", [eventId], function(err, event) {
        if (err) {
            global.db.run('ROLLBACK');
            console.error(err);
            return res.status(500).send("Error checking event ticket.");
        }
        
        // Ensure event exists before proceeding with updates
        if (!event) {
            global.db.run('ROLLBACK');
            return res.status(404).send("Event not found.");
        }
        
        var ticketId;
        
        // Handle existing ticket - update it
        if (event.ticket_id) {
            // Update existing ticket
            var updateTicketSql = "UPDATE tickets SET name = ?, price = ?, quantity = ? WHERE id = ?";
            global.db.run(updateTicketSql, [ticket_name, ticket_price, ticket_quantity, event.ticket_id], function(err) {
                if (err) {
                    global.db.run('ROLLBACK');
                    console.error(err);
                    return res.status(500).send("Error updating ticket.");
                }
                // Use existing ticket ID for event update
                ticketId = event.ticket_id;
                
                // Update event
                var eventSql = "UPDATE events SET title = ?, description = ?, event_date = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?";
                global.db.run(eventSql, [title, description, event_date, published ? 'published' : 'draft', eventId], function(err) {
                    if (err) {
                        global.db.run('ROLLBACK');
                        console.error(err);
                        return res.status(500).send("Error updating event.");
                    }
                    
                    global.db.run('COMMIT');
                    res.redirect('/organiser');
                });
            });
        } else {
            // Create new ticket
            var insertTicketSql = "INSERT INTO tickets (name, price, quantity) VALUES (?, ?, ?)";
            global.db.run(insertTicketSql, [ticket_name, ticket_price, ticket_quantity], function(err) {
                if (err) {
                    global.db.run('ROLLBACK');
                    console.error(err);
                    return res.status(500).send("Error creating ticket.");
                }
                
                // Get the new ticket ID for linking to event
                ticketId = this.lastID;
                
                // Update event with ticket_id
                var eventSql = "UPDATE events SET title = ?, description = ?, event_date = ?, status = ?, ticket_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?";
                global.db.run(eventSql, [title, description, event_date, published ? 'published' : 'draft', ticketId, eventId], function(err) {
                    if (err) {
                        global.db.run('ROLLBACK');
                        console.error(err);
                        return res.status(500).send("Error updating event.");
                    }
                    
                    global.db.run('COMMIT');
                    res.redirect('/organiser');
                });
            });
        }
    });
});

/**
POST /organiser/event/:id/save
Updates just the event details (title, description, date)
*/
router.post('/event/:id/save', [
    expressValidator.body('title').trim().notEmpty().withMessage('Title is required.'),
    expressValidator.body('description').trim().notEmpty().withMessage('Description is required.'),
    expressValidator.body('event_date').trim().notEmpty().withMessage('Event date is required.')
], function(req, res) {
    var errors = expressValidator.validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).send(errors.array().map(function(e) { return e.msg; }).join('<br>'));
    }
    var eventId = req.params.id;
    var title = req.body.title;
    var description = req.body.description;
    var event_date = req.body.event_date;
    // Convert checkbox value to boolean (1 for checked, 0 for unchecked)
    var published = req.body.published ? 1 : 0;
    
    var sql = "UPDATE events SET title = ?, description = ?, event_date = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?";
    global.db.run(sql, [title, description, event_date, published ? 'published' : 'draft', eventId], function(err) {
        if (err) {
            console.error(err);
            return res.status(500).send("Error updating event.");
        }
        res.redirect('/organiser');
    });
});

/**
POST /organiser/event/:id/ticket
Creates or updates the ticket for an event
*/
router.post('/event/:id/ticket', [
    expressValidator.body('ticket_name').trim().notEmpty().withMessage('Ticket name is required.'),
    expressValidator.body('ticket_price').isFloat({ min: 0 }).withMessage('Ticket price must be 0 or more.'),
    expressValidator.body('ticket_quantity').isInt({ min: 1 }).withMessage('Ticket quantity must be at least 1.')
], function(req, res) {
    var errors = expressValidator.validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).send(errors.array().map(function(e) { return e.msg; }).join('<br>'));
    }
    
    var eventId = req.params.id;
    var ticket_name = req.body.ticket_name;
    var ticket_price = req.body.ticket_price;
    var ticket_quantity = req.body.ticket_quantity;
    
    // First check if event already has a ticket
    global.db.get("SELECT ticket_id FROM events WHERE id = ?", [eventId], function(err, event) {
        if (err) {
            console.error(err);
            return res.status(500).send("Error checking event ticket.");
        }
        
        // Handle existing ticket - update it
        if (event.ticket_id) {
            // Update existing ticket
            var updateSql = "UPDATE tickets SET name = ?, price = ?, quantity = ? WHERE id = ?";
            global.db.run(updateSql, [ticket_name, ticket_price, ticket_quantity, event.ticket_id], function(err) {
                if (err) {
                    console.error(err);
                    return res.status(500).send("Error updating ticket.");
                }
                res.redirect('/organiser');
            });
        } else {
            // Create new ticket
            var insertSql = "INSERT INTO tickets (name, price, quantity) VALUES (?, ?, ?)";
            global.db.run(insertSql, [ticket_name, ticket_price, ticket_quantity], function(err) {
                if (err) {
                    console.error(err);
                    return res.status(500).send("Error creating ticket.");
                }
                
                // Get the new ticket ID for linking to event
                var ticketId = this.lastID;
                
                // Update event with ticket_id
                var updateEventSql = "UPDATE events SET ticket_id = ? WHERE id = ?";
                global.db.run(updateEventSql, [ticketId, eventId], function(err) {
                    if (err) {
                        console.error(err);
                        return res.status(500).send("Error updating event with ticket.");
                    }
                    res.redirect('/organiser');
                });
            });
        }
    });
});

/**
POST /organiser/events/:id
Updates the basic event information
*/
router.post('/events/:id', [
    expressValidator.body('title').trim().notEmpty().withMessage('Title is required.'),
    expressValidator.body('description').trim().notEmpty().withMessage('Description is required.'),
    expressValidator.body('event_date').trim().notEmpty().withMessage('Event date is required.')
], function(req, res) {
    var errors = expressValidator.validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).send(errors.array().map(function(e) { return e.msg; }).join('<br>'));
    }
    var eventId = req.params.id;
    var title = req.body.title;
    var description = req.body.description;
    var event_date = req.body.event_date;
    var sql = "UPDATE events SET title = ?, description = ?, event_date = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?";
    global.db.run(sql, [title, description, event_date, eventId], function(err) {
        if (err) {
            console.error(err);
            return res.status(500).send("Error updating event.");
        }
        res.redirect('/organiser');
    });
});

/**
POST /organiser/events/:id/publish
Makes a draft event visible to attendees
*/
router.post('/events/:id/publish', (req, res) => {
    var eventId = req.params.id;
    var sql = "UPDATE events SET status = 'published', published_at = CURRENT_TIMESTAMP WHERE id = ?";
    global.db.run(sql, [eventId], (err) => {
        if (err) {
            console.error(err);
            return res.status(500).send("Error publishing event.");
        }
        res.redirect('/organiser');
    });
});

/**
POST /organiser/events/:id/delete
Removes an event from the system
*/
router.post('/events/:id/delete', (req, res) => {
    var eventId = req.params.id;
    var sql = "DELETE FROM events WHERE id = ?";
    global.db.run(sql, [eventId], (err) => {
        if (err) {
            console.error(err);
            return res.status(500).send("Error deleting event.");
        }
        res.redirect('/organiser');
    });
});

/**
POST /organiser/events/:id/tickets/:ticketId/edit
Updates an existing ticket's details
*/
router.post('/events/:id/tickets/:ticketId/edit', [
    expressValidator.body('type_name').trim().notEmpty().withMessage('Type name is required.'),
    expressValidator.body('ticket_count').isInt({ min: 1 }).withMessage('Ticket count must be at least 1.'),
    expressValidator.body('ticket_price').isFloat({ min: 0 }).withMessage('Ticket price must be 0 or more.')
], function(req, res) {
    var errors = expressValidator.validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).send(errors.array().map(function(e) { return e.msg; }).join('<br>'));
    }
    var eventId = req.params.id;
    var ticketId = req.params.ticketId;
    var type_name = req.body.type_name;
    var ticket_count = req.body.ticket_count;
    var ticket_price = req.body.ticket_price;
    var sql = "UPDATE ticket_types SET type_name = ?, ticket_count = ?, ticket_price = ? WHERE id = ? AND event_id = ?";
    global.db.run(sql, [type_name, ticket_count, ticket_price, ticketId, eventId], function(err) {
        if (err) {
            console.error(err);
            return res.status(500).send("Error editing ticket type.");
        }
        res.redirect('/organiser/events/' + eventId + '/edit');
    });
});

/**
POST /organiser/events/:id/tickets/:ticketId/delete
Removes a ticket from an event
*/
router.post('/events/:id/tickets/:ticketId/delete', (req, res) => {
    var eventId = req.params.id;
    var ticketId = req.params.ticketId;
    var sql = "DELETE FROM ticket_types WHERE id = ? AND event_id = ?";
    global.db.run(sql, [ticketId, eventId], (err) => {
        if (err) {
            console.error(err);
            return res.status(500).send("Error deleting ticket type.");
        }
        res.redirect('/organiser/events/' + eventId + '/edit');
    });
});

module.exports = router; 
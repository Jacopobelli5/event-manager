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
    // Get site settings
    let sqlquery = "SELECT * FROM site_settings WHERE id = 1";
    global.db.get(sqlquery, (err, result) => {
        if (err) {
            console.error(err);
            return res.status(500).send("Error fetching site settings.");
        }
        // Provide default site settings if none exist in database
        if (!result) {
            result = { name: 'Event Manager', description: 'Your events, organised.' };
        }
        
        // Get all published events
        let publishedQuery = "SELECT * FROM events WHERE status = 'published' ORDER BY event_date DESC";
        global.db.all(publishedQuery, (err, publishedResults) => {
            if (err) {
                console.error(err);
                return res.status(500).send("Error fetching published events.");
            }
            
            // Get all draft events
            let draftQuery = "SELECT * FROM events WHERE status = 'draft' ORDER BY created_at DESC";
            global.db.all(draftQuery, (err, draftResults) => {
                if (err) {
                    console.error(err);
                    return res.status(500).send("Error fetching draft events.");
                }
                
                // Check if we have any events
                if (publishedResults.length === 0 && draftResults.length === 0) {
                    // No events exist - render empty dashboard
                    return res.render('organiser-home', {
                        site: result,
                        publishedEvents: publishedResults,
                        draftEvents: draftResults
                    });
                }
                
                // Get all ticket IDs from events
                let allTicketIds = [];
                for (let i = 0; i < publishedResults.length; i++) {
                    if (publishedResults[i].ticket_id) {
                        allTicketIds.push(publishedResults[i].ticket_id);
                    }
                }
                for (let i = 0; i < draftResults.length; i++) {
                    if (draftResults[i].ticket_id) {
                        allTicketIds.push(draftResults[i].ticket_id);
                    }
                }
                
                // If no tickets, just render without ticket data
                if (allTicketIds.length === 0) {
                    // Set all tickets to null
                    for (let i = 0; i < publishedResults.length; i++) {
                        publishedResults[i].ticket = null;
                    }
                    for (let i = 0; i < draftResults.length; i++) {
                        draftResults[i].ticket = null;
                    }
                    return res.render('organiser-home', {
                        site: result,
                        publishedEvents: publishedResults,
                        draftEvents: draftResults
                    });
                }
                
                // Get all ticket details
                let ticketPlaceholders = '';
                for (let i = 0; i < allTicketIds.length; i++) {
                    if (i > 0) ticketPlaceholders += ',';
                    ticketPlaceholders += '?';
                }
                
                let ticketQuery = "SELECT * FROM tickets WHERE id IN (" + ticketPlaceholders + ")";
                global.db.all(ticketQuery, allTicketIds, (err, ticketResults) => {
                    if (err) {
                        console.error(err);
                        return res.status(500).send("Error fetching tickets.");
                    }
                    
                    // Get booking counts for each ticket
                    let bookedQuery = "SELECT ticket_id, SUM(quantity) as booked FROM booking_tickets WHERE ticket_id IN (" + ticketPlaceholders + ") GROUP BY ticket_id";
                    global.db.all(bookedQuery, allTicketIds, (err, bookedResults) => {
                        if (err) {
                            console.error(err);
                            return res.status(500).send("Error fetching booked ticket counts.");
                        }
                        
                        // Create a simple map for booked quantities
                        let bookedMap = {};
                        for (let i = 0; i < bookedResults.length; i++) {
                            bookedMap[bookedResults[i].ticket_id] = bookedResults[i].booked || 0;
                        }
                        
                        // Attach tickets to published events
                        for (let i = 0; i < publishedResults.length; i++) {
                            if (publishedResults[i].ticket_id) {
                                // Find the ticket for this event
                                for (let j = 0; j < ticketResults.length; j++) {
                                    if (ticketResults[j].id === publishedResults[i].ticket_id) {
                                        publishedResults[i].ticket = ticketResults[j];
                                        // Calculate remaining tickets
                                        let booked = parseInt(bookedMap[publishedResults[i].ticket_id] || 0, 10);
                                        publishedResults[i].ticket.remaining = publishedResults[i].ticket.quantity - booked;
                                        break;
                                    }
                                }
                            } else {
                                publishedResults[i].ticket = null;
                            }
                        }
                        
                        // Attach tickets to draft events
                        for (let i = 0; i < draftResults.length; i++) {
                            if (draftResults[i].ticket_id) {
                                // Find the ticket for this event
                                for (let j = 0; j < ticketResults.length; j++) {
                                    if (ticketResults[j].id === draftResults[i].ticket_id) {
                                        draftResults[i].ticket = ticketResults[j];
                                        // Calculate remaining tickets
                                        let booked = parseInt(bookedMap[draftResults[i].ticket_id] || 0, 10);
                                        draftResults[i].ticket.remaining = draftResults[i].ticket.quantity - booked;
                                        break;
                                    }
                                }
                            } else {
                                draftResults[i].ticket = null;
                            }
                        }
                        
                        // Render the dashboard
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
});

/**
GET /organiser/settings
Shows the site settings page where organisers can change the site name and description
*/
router.get('/settings', (req, res) => {
    let sqlquery = "SELECT * FROM site_settings WHERE id = 1";
    global.db.get(sqlquery, (err, result) => {
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
    let sqlquery = "INSERT INTO events (title, description, event_date, status) VALUES ('New Event Title', 'Event Description', DATETIME('now'), 'draft')";
    global.db.run(sqlquery, function(err) {
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
    let sqlquery = "SELECT * FROM events WHERE id = ?";
    global.db.get(sqlquery, [eventId], (err, result) => {
        if (err) {
            console.error(err);
            return res.status(500).send("Error fetching event.");
        }
        if (!result) {
            return res.status(404).send("Event not found.");
        }
        
        // If event has a ticket_id, fetch the ticket
        if (result.ticket_id) {
            let ticketQuery = "SELECT * FROM tickets WHERE id = ?";
            global.db.get(ticketQuery, [result.ticket_id], (err, ticketResult) => {
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
    // Get the event
    var eventId = req.params.id;
    let eventQuery = "SELECT * FROM events WHERE id = ?";
    global.db.get(eventQuery, [eventId], function(err, eventResult) {
        if (err) {
            console.error(err);
            return res.status(500).send("Error fetching event.");
        }
        if (!eventResult) {
            return res.status(404).send("Event not found.");
        }

        // Get all bookings for the event with ticket information
        let bookingQuery = "SELECT b.*, bt.quantity, t.price as ticket_price FROM bookings b JOIN booking_tickets bt ON b.id = bt.booking_id JOIN tickets t ON bt.ticket_id = t.id WHERE b.event_id = ? ORDER BY b.created_at DESC";
        global.db.all(bookingQuery, [eventId], function(err, bookingResults) {
            if (err) {
                console.error(err);
                return res.status(500).send("Error fetching bookings.");
            }

            // Get the ticket for the event
            let ticketQuery = "SELECT * FROM tickets WHERE id = ?";
            global.db.get(ticketQuery, [eventResult.ticket_id], function(err, ticketResult) {
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
    var published = req.body.published ? 1 : 0;
    var ticket_name = req.body.ticket_name;
    var ticket_price = req.body.ticket_price;
    var ticket_quantity = req.body.ticket_quantity;
    
    // Start transaction
    global.db.run('BEGIN TRANSACTION');
    
    // First check if event already has a ticket
    let checkQuery = "SELECT ticket_id FROM events WHERE id = ?";
    global.db.get(checkQuery, [eventId], function(err, event) {
        if (err) {
            global.db.run('ROLLBACK');
            console.error(err);
            return res.status(500).send("Error checking event ticket.");
        }
        
        if (!event) {
            global.db.run('ROLLBACK');
            return res.status(404).send("Event not found.");
        }
        
        var ticketId;
        
        if (event.ticket_id) {
            // Update existing ticket
            let updateTicketQuery = "UPDATE tickets SET name = ?, price = ?, quantity = ? WHERE id = ?";
            global.db.run(updateTicketQuery, [ticket_name, ticket_price, ticket_quantity, event.ticket_id], function(err) {
                if (err) {
                    global.db.run('ROLLBACK');
                    console.error(err);
                    return res.status(500).send("Error updating ticket.");
                }
                ticketId = event.ticket_id;
                
                // Update event
                let eventQuery = "UPDATE events SET title = ?, description = ?, event_date = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?";
                global.db.run(eventQuery, [title, description, event_date, published ? 'published' : 'draft', eventId], function(err) {
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
            let insertTicketQuery = "INSERT INTO tickets (name, price, quantity) VALUES (?, ?, ?)";
            global.db.run(insertTicketQuery, [ticket_name, ticket_price, ticket_quantity], function(err) {
                if (err) {
                    global.db.run('ROLLBACK');
                    console.error(err);
                    return res.status(500).send("Error creating ticket.");
                }
                
                ticketId = this.lastID;
                
                // Update event with ticket_id
                let eventQuery = "UPDATE events SET title = ?, description = ?, event_date = ?, status = ?, ticket_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?";
                global.db.run(eventQuery, [title, description, event_date, published ? 'published' : 'draft', ticketId, eventId], function(err) {
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
    var published = req.body.published ? 1 : 0;
    
    let sqlquery = "UPDATE events SET title = ?, description = ?, event_date = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?";
    global.db.run(sqlquery, [title, description, event_date, published ? 'published' : 'draft', eventId], function(err) {
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
    let checkQuery = "SELECT ticket_id FROM events WHERE id = ?";
    global.db.get(checkQuery, [eventId], function(err, event) {
        if (err) {
            console.error(err);
            return res.status(500).send("Error checking event ticket.");
        }
        
        if (event.ticket_id) {
            // Update existing ticket
            let updateQuery = "UPDATE tickets SET name = ?, price = ?, quantity = ? WHERE id = ?";
            global.db.run(updateQuery, [ticket_name, ticket_price, ticket_quantity, event.ticket_id], function(err) {
                if (err) {
                    console.error(err);
                    return res.status(500).send("Error updating ticket.");
                }
                res.redirect('/organiser');
            });
        } else {
            // Create new ticket
            let insertQuery = "INSERT INTO tickets (name, price, quantity) VALUES (?, ?, ?)";
            global.db.run(insertQuery, [ticket_name, ticket_price, ticket_quantity], function(err) {
                if (err) {
                    console.error(err);
                    return res.status(500).send("Error creating ticket.");
                }
                
                var ticketId = this.lastID;
                
                // Update event with ticket_id
                let updateEventQuery = "UPDATE events SET ticket_id = ? WHERE id = ?";
                global.db.run(updateEventQuery, [ticketId, eventId], function(err) {
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
    let sqlquery = "UPDATE events SET title = ?, description = ?, event_date = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?";
    global.db.run(sqlquery, [title, description, event_date, eventId], function(err) {
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
    let sqlquery = "UPDATE events SET status = 'published', published_at = CURRENT_TIMESTAMP WHERE id = ?";
    global.db.run(sqlquery, [eventId], (err) => {
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
    let sqlquery = "DELETE FROM events WHERE id = ?";
    global.db.run(sqlquery, [eventId], (err) => {
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
    let sqlquery = "UPDATE ticket_types SET type_name = ?, ticket_count = ?, ticket_price = ? WHERE id = ? AND event_id = ?";
    global.db.run(sqlquery, [type_name, ticket_count, ticket_price, ticketId, eventId], function(err) {
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
    let sqlquery = "DELETE FROM ticket_types WHERE id = ? AND event_id = ?";
    global.db.run(sqlquery, [ticketId, eventId], (err) => {
        if (err) {
            console.error(err);
            return res.status(500).send("Error deleting ticket type.");
        }
        res.redirect('/organiser/events/' + eventId + '/edit');
    });
});

module.exports = router; 
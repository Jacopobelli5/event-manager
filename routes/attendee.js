// No help needed until next help comment below

const express = require('express');
const router = express.Router();
const expressValidator = require('express-validator');

/**
 * GET /attendee
 * Shows the main page for attendees with all published events
 */
router.get('/', function(req, res) {
    global.db.get("SELECT * FROM site_settings WHERE id = 1", function(err, result) {
        if (err) {
            console.error(err);
            return res.status(500).send("Error fetching site settings.");
        }
        // Provide default site settings if none exist in database
        if (!result) {
            result = { name: 'Event Manager', description: 'Welcome!' };
        }
        global.db.all("SELECT * FROM events WHERE status = 'published' ORDER BY event_date ASC", function(err, results) {
            if (err) {
                console.error(err);
                return res.status(500).send("Error fetching events.");
            }
            res.render('attendee-home', {
                site: result,
                events: results
            });
        });
    });
});

/**
 * GET /attendee/event/:id
 * Shows a specific event page with booking form
 */
router.get('/event/:id', function(req, res) {
    // help needed here - Nested queries and ticket availability calculation
    var eventId = req.params.id;
    global.db.get("SELECT * FROM events WHERE id = ? AND status = 'published'", [eventId], function(err, result) {
        if (err) {
            console.error(err);
            return res.status(500).send("Error fetching event.");
        }
        if (!result) {
            return res.status(404).send("Event not found or not published.");
        }
        // Handle events without tickets, render page without ticket info
        if (!result.ticket_id) {
            return res.render('attendee-event-page', { event: result, ticket: null, request: req });
        }
        
        global.db.get("SELECT * FROM tickets WHERE id = ?", [result.ticket_id], function(err, ticket) {
            if (err) {
                console.error(err);
                return res.status(500).send("Error fetching ticket.");
            }
            // Handle case where ticket doesn't exist in database
            if (!ticket) {
                return res.render('attendee-event-page', { event: result, ticket: null, request: req });
            }
            
            // Calculate remaining tickets by subtracting booked from total
                global.db.get("SELECT SUM(quantity) as booked FROM booking_tickets WHERE ticket_id = ?", [ticket.id], function(err, bookedResult) {
                    if (err) {
                        console.error(err);
                        return res.status(500).send("Error fetching booked tickets.");
                    }
                    // Convert booked count to number, default to 0 if null
                    var booked = parseInt(bookedResult.booked || 0, 10);
                    ticket.remaining = ticket.quantity - booked;
                    
                    res.render('attendee-event-page', { event: result, ticket: ticket, request: req });
                });
        });
    });
    // help ended
});

/**
 * POST /attendee/book/:id
 * Processes a booking for an event
 */
router.post('/book/:id', [
    expressValidator.body('name').trim().notEmpty().withMessage('Your name is required.'),
    expressValidator.body('email').isEmail().withMessage('Valid email is required.'),
    expressValidator.body('quantity').isInt({ min: 1 }).withMessage('Quantity must be at least 1.')
], function(req, res) {
    // Check for validation errors and return them as HTML if any exist
    var errors = expressValidator.validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).send(errors.array().map(function(e) { return e.msg; }).join('<br>'));
    }
    
    var eventId = req.params.id;
    var attendeeName = req.body.name;
    var attendeeEmail = req.body.email;
    // Convert quantity string to integer for calculations
    var quantity = parseInt(req.body.quantity, 10);
    
    // Multi step booking process to get event, then ticket, then check availability
    global.db.get("SELECT * FROM events WHERE id = ? AND status = 'published'", [eventId], function(err, event) {
        if (err) {
            console.error(err);
            return res.status(500).send("Error fetching event.");
        }
        if (!event) {
            return res.status(404).send("Event not found or not published.");
        }
        // Ensure event has tickets configured before proceeding
        if (!event.ticket_id) {
            return res.status(400).send("No tickets available for this event.");
        }
        
        // Fetch ticket details for availability check
        global.db.get("SELECT * FROM tickets WHERE id = ?", [event.ticket_id], function(err, ticket) {
            if (err) {
                console.error(err);
                return res.status(500).send("Error fetching ticket.");
            }
            if (!ticket) {
                return res.status(400).send("Ticket not found.");
            }
            
            // Check how many tickets are already booked
            global.db.get("SELECT SUM(quantity) as booked FROM booking_tickets WHERE ticket_id = ?", [ticket.id], function(err, bookedResult) {
                if (err) {
                    console.error(err);
                    return res.status(500).send("Error checking ticket availability.");
                }
                
                // Calculate available tickets and validate request quantity and prevent overbooking by checking availability
                var booked = parseInt(bookedResult.booked || 0, 10);
                var available = ticket.quantity - booked;
                
                if (quantity > available) {
                    return res.status(400).send("Not enough tickets available. Only " + available + " left.");
                }
                
                // Create the booking
                global.db.run("INSERT INTO bookings (event_id, attendee_name) VALUES (?, ?)", [eventId, attendeeName], function(err) {
                    if (err) {
                        console.error(err);
                        return res.status(500).send("Error creating booking.");
                    }
                    
                    // Get the new booking ID for linking ticket details
                    var bookingId = this.lastID;
                    
                    // Create the booking_tickets record
                    global.db.run("INSERT INTO booking_tickets (booking_id, ticket_id, quantity) VALUES (?, ?, ?)", [bookingId, ticket.id, quantity], function(err) {
                        if (err) {
                            console.error(err);
                            return res.status(500).send("Error saving ticket booking.");
                        }
                        
                        res.redirect('/attendee');
                    });
                });
            });
        });
    });
});

module.exports = router; 
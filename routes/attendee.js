console.log('Attendee routes loaded'); // DEBUG LOG

const express = require('express');
const router = express.Router();

/**
 * GET /attendee
 * Attendee Home Page
 * Purpose: Display site info and a list of published events for attendees.
 * Inputs: None
 * Outputs: Renders attendee-home.ejs with site and event data.
 */
router.get('/', (req, res) => {
    const getSiteSettings = new Promise((resolve, reject) => {
        global.db.get("SELECT * FROM site_settings WHERE id = 1", (err, row) => {
            if (err) reject(err);
            resolve(row || { name: 'Event Manager', description: 'Welcome!' });
        });
    });

    const getPublishedEvents = new Promise((resolve, reject) => {
        global.db.all("SELECT * FROM events WHERE status = 'published' ORDER BY event_date ASC", (err, rows) => {
            if (err) reject(err);
            resolve(rows);
        });
    });

    Promise.all([getSiteSettings, getPublishedEvents])
        .then(([siteSettings, publishedEvents]) => {
            res.render('attendee-home', {
                site: siteSettings,
                events: publishedEvents
            });
        })
        .catch(err => {
            console.error(err);
            res.status(500).send("Error retrieving data from database.");
        });
});

/**
 * GET /attendee/event/:id
 * Attendee Event Page
 * Purpose: Display details for a single event and a booking form.
 * Inputs: Event ID from URL parameter.
 * Outputs: Renders attendee-event-page.ejs with event and ticket data.
 */
router.get('/event/:id', (req, res) => {
    const eventId = req.params.id;

    const getEvent = new Promise((resolve, reject) => {
        global.db.get("SELECT * FROM events WHERE id = ? AND status = 'published'", [eventId], (err, row) => {
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

    const getBookedCounts = new Promise((resolve, reject) => {
        global.db.all(
            `SELECT ticket_type_id, SUM(quantity) as booked
             FROM booking_tickets
             WHERE ticket_type_id IN (SELECT id FROM ticket_types WHERE event_id = ?)
             GROUP BY ticket_type_id`,
            [eventId],
            (err, rows) => {
                if (err) reject(err);
                // Map: { ticket_type_id: booked }
                const bookedMap = {};
                rows.forEach(row => { bookedMap[row.ticket_type_id] = row.booked || 0; });
                resolve(bookedMap);
            }
        );
    });

    Promise.all([getEvent, getTicketTypes, getBookedCounts])
        .then(([event, ticketTypes, bookedMap]) => {
            if (!event) {
                return res.status(404).send("Event not found or not published.");
            }
            console.log('bookedMap:', bookedMap); // DEBUG LOG
            ticketTypes.forEach(ticket => {
                const booked = parseInt(bookedMap[String(ticket.id)] || 0, 10);
                ticket.remaining = ticket.ticket_count - booked;
                console.log(`Ticket type ${ticket.id} (${ticket.type_name}): total=${ticket.ticket_count}, booked=${booked}, remaining=${ticket.remaining}`); // DEBUG LOG
            });
            res.render('attendee-event-page', { event, ticketTypes });
        })
        .catch(err => {
            console.error(err);
            res.status(500).send("Error retrieving event data.");
        });
});

/**
 * POST /attendee/book/:id
 * Handle Event Booking
 * Purpose: Create a booking record for an event.
 * Inputs: Event ID from URL, form data (attendee_name, tickets)
 * Outputs: Redirects to a success page or back to attendee home.
 */
router.post('/book/:id', (req, res) => {
    console.log('Booking route hit'); // DEBUG LOG
    console.log('Request body:', req.body); // DEBUG LOG
    const eventId = req.params.id;
    const { attendee_name, tickets } = req.body;
    console.log('Booking tickets:', tickets); // DEBUG LOG

    // Helper to normalize ticket data
    function normalizeTicketData(tickets, reqBody, eventId, callback) {
        if (Array.isArray(tickets)) {
            // Try to reconstruct from req.body keys
            const ticketData = {};
            Object.keys(reqBody).forEach(key => {
                const match = key.match(/^tickets\[(\d+)\]$/);
                if (match) {
                    ticketData[match[1]] = reqBody[key];
                }
            });
            if (Object.keys(ticketData).length > 0) {
                return callback(ticketData);
            } else {
                // Only one ticket type, need to fetch its ID
                global.db.all('SELECT id FROM ticket_types WHERE event_id = ?', [eventId], (err, rows) => {
                    if (err) {
                        console.error('Error fetching ticket types for normalization:', err);
                        return callback({});
                    }
                    if (rows.length === 1) {
                        ticketData[rows[0].id] = tickets[0];
                        return callback(ticketData);
                    } else {
                        return callback({});
                    }
                });
            }
        } else {
            return callback(tickets);
        }
    }

    normalizeTicketData(tickets, req.body, eventId, (ticketData) => {
        console.log('Normalized ticketData:', ticketData); // DEBUG LOG
        const ticketTypeIds = Object.keys(ticketData).filter(id => parseInt(ticketData[id], 10) > 0);
        if (ticketTypeIds.length === 0) {
            return res.status(400).send("You must select at least one ticket.");
        }

        // Fetch ticket info and already booked quantities for all requested ticket types
        const placeholders = ticketTypeIds.map(() => '?').join(',');
        const ticketTypesSql = `SELECT id, type_name, ticket_count FROM ticket_types WHERE id IN (${placeholders})`;
        const bookedSql = `SELECT ticket_type_id, SUM(quantity) as booked FROM booking_tickets WHERE ticket_type_id IN (${placeholders}) GROUP BY ticket_type_id`;

        global.db.all(ticketTypesSql, ticketTypeIds, (err, ticketTypeRows) => {
            if (err) {
                console.error(err);
                return res.status(500).send("Error checking ticket types.");
            }
            global.db.all(bookedSql, ticketTypeIds, (err, bookedRows) => {
                if (err) {
                    console.error(err);
                    return res.status(500).send("Error checking booked tickets.");
                }
                // Map booked quantities by ticket_type_id
                const bookedMap = {};
                bookedRows.forEach(row => { bookedMap[row.ticket_type_id] = row.booked || 0; });

                // Check each ticket type
                for (const ticketType of ticketTypeRows) {
                    const requested = parseInt(ticketData[ticketType.id], 10);
                    const alreadyBooked = parseInt(bookedMap[ticketType.id] || 0, 10);
                    const available = ticketType.ticket_count - alreadyBooked;
                    if (requested > available) {
                        return res.status(400).send(`Not enough tickets available for ${ticketType.type_name}. Only ${available} left.`);
                    }
                }

                // If all checks pass, proceed with booking as before
                global.db.serialize(() => {
                    global.db.run('BEGIN TRANSACTION');

                    const createBooking = new Promise((resolve, reject) => {
                        const bookingSql = "INSERT INTO bookings (event_id, attendee_name) VALUES (?, ?)";
                        global.db.run(bookingSql, [eventId, attendee_name], function(err) {
                            if (err) reject(err);
                            resolve(this.lastID); // Pass the new booking ID
                        });
                    });

                    createBooking.then(bookingId => {
                        const bookingTicketsSql = "INSERT INTO booking_tickets (booking_id, ticket_type_id, quantity) VALUES (?, ?, ?)";
                        const ticketPromises = [];

                        for (const ticketTypeId in ticketData) {
                            const quantity = parseInt(ticketData[ticketTypeId], 10);
                            if (parseInt(ticketTypeId, 10) > 0 && quantity > 0) {
                                console.log(`Inserting booking_tickets: bookingId=${bookingId}, ticketTypeId=${ticketTypeId}, quantity=${quantity}`); // DEBUG LOG
                                const promise = new Promise((resolve, reject) => {
                                    global.db.run(bookingTicketsSql, [bookingId, ticketTypeId, quantity], (err) => {
                                        if (err) reject(err);
                                        resolve();
                                    });
                                });
                                ticketPromises.push(promise);
                            }
                        }

                        return Promise.all(ticketPromises);
                    })
                    .then(() => {
                        global.db.run('COMMIT');
                        res.redirect('/attendee');
                    })
                    .catch(err => {
                        global.db.run('ROLLBACK');
                        console.error('Booking error:', err); // DEBUG LOG
                        res.status(500).send("Error processing your booking.");
                    });
                });
            });
        });
    });
});

module.exports = router; 
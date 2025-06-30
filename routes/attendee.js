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

module.exports = router; 
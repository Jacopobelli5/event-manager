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

module.exports = router; 
// Set up express, bodyparser and EJS
const express = require('express');
const app = express();
const port = process.env.PORT || 3000; // updated: use environment port
var bodyParser = require("body-parser");
const helmet = require('helmet');
const compression = require('compression');
const path = require('path'); // added: path module for resolving directories

app.use(bodyParser.urlencoded({ extended: true }));
app.set('view engine', 'ejs'); // set the app to use ejs for rendering
app.use(express.static(path.join(__dirname, '..', 'public'))); // updated: load static files from parent public folder
app.use(helmet());
app.use(compression());

// Set up SQLite
// Items in the global namespace are accessible throught out the node application
const sqlite3 = require('sqlite3').verbose();
global.db = new sqlite3.Database(path.join(__dirname, '..', 'database.db'), function(err) { // updated: adjust DB path
    if(err){
        console.error(err);
        process.exit(1); // bail out we can't connect to the DB
    } else {
        console.log("Database connected");
        global.db.run("PRAGMA foreign_keys=ON"); // tell SQLite to pay attention to foreign key constraints
    }
});

// Handle requests to the home page 
app.get('/', (req, res) => {
    res.render('home');
});

// Add all the route handlers in organiserRoutes to the app under the path /organiser
const organiserRoutes = require(path.join(__dirname, '..', 'routes', 'organiser')); // updated: adjust route path
app.use('/organiser', organiserRoutes);

// Add all the route handlers in attendeeRoutes to the app under the path /attendee
const attendeeRoutes = require(path.join(__dirname, '..', 'routes', 'attendee')); // updated: adjust route path
app.use('/attendee', attendeeRoutes);


// Make the web application listen for HTTP requests
app.listen(port, () => {
    console.log(`app listening on port ${port}`)
})

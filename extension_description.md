# Extension Description: Organiser Booking Management System

## Which Extension You Implemented
I implemented a **comprehensive booking management system** that allows organisers to view all bookings made for their events. This extension transforms the basic event manager into a full-featured booking platform by adding real-time booking tracking, dynamic ticket availability calculations, and a professional booking statistics dashboard.

## What You Did to Implement It

### 1. Database Schema Design
Created a normalized database structure with proper relationships:
- `bookings` table: Stores attendee information and links to events
- `booking_tickets` table: Junction table linking bookings to specific tickets with quantities
- Enhanced `events` table: Added ticket_id foreign key relationship

**Key Design Decisions:**
- Normalized structure allows multiple ticket types per booking
- Foreign key constraints ensure referential integrity
- Timestamp tracking for audit trails
- Scalable design for future enhancements

### 2. Advanced Booking Management Route
Implemented sophisticated database querying with a three-step process:
1. Fetch and validate event details
2. Retrieve ticket information
3. Execute complex JOIN query for all booking data

**Technical Highlights:**
- Multi-table JOIN queries for efficient data retrieval
- Real-time statistics calculation using JavaScript reduce()
- Comprehensive error handling at each step
- Parameterized queries to prevent SQL injection

### 3. Professional Booking Display Interface
Created a user-friendly interface with:
- Card-based layout for key metrics (total bookings, tickets sold, remaining)
- Responsive table for detailed booking information
- Bootstrap integration for consistent styling
- Color-coded metrics for visual distinction

### 4. Seamless Integration
Added "View Bookings" buttons to event cards in the organiser dashboard, maintaining consistent UI patterns and workflow continuity.

## Aspects to Pay Attention To

### 1. **Advanced Database Query Design**
The implementation uses sophisticated SQL JOIN operations:

```sql
SELECT b.id, b.attendee_name, b.created_at, bt.quantity, t.name as ticket_name, t.price
FROM bookings b
JOIN booking_tickets bt ON b.id = bt.booking_id
JOIN tickets t ON bt.ticket_id = t.id
WHERE b.event_id = ?
ORDER BY b.created_at DESC
```

**Why this matters:** Single query replaces multiple database calls, improving performance and ensuring data consistency.

### 2. **Real-Time Data Calculation**
Statistics are calculated dynamically rather than stored:

```javascript
var totalBooked = bookings.reduce(function(sum, booking) {
    return sum + booking.quantity;
}, 0);
var remaining = ticket ? ticket.quantity - totalBooked : 0;
```

**Why this matters:** Ensures data accuracy - statistics update automatically when bookings change.

### 3. **Comprehensive Error Handling**
Robust error handling at multiple levels prevents crashes and provides meaningful feedback.

### 4. **Scalable Data Model**
The schema supports future enhancements without structural changes, including multiple ticket types and extensible fields.

## Relevant Code Implementation

### Database Schema (db_schema.sql)
```sql
CREATE TABLE bookings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id INTEGER NOT NULL,
    attendee_name TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (event_id) REFERENCES events(id)
);

CREATE TABLE booking_tickets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    booking_id INTEGER NOT NULL,
    ticket_id INTEGER NOT NULL,
    quantity INTEGER NOT NULL,
    FOREIGN KEY (booking_id) REFERENCES bookings(id),
    FOREIGN KEY (ticket_id) REFERENCES tickets(id)
);
```

### Booking Management Route (routes/organiser.js, lines 213-264)
```javascript
router.get('/events/:id/bookings', function(req, res) {
    var eventId = req.params.id;
    
    // Step 1: Validate event exists
    global.db.get("SELECT * FROM events WHERE id = ?", [eventId], function(err, event) {
        if (err) return res.status(500).send("Error fetching event.");
        if (!event) return res.status(404).send("Event not found.");
        
        // Step 2: Get ticket information
        global.db.get("SELECT * FROM tickets WHERE id = ?", [event.ticket_id], function(err, ticket) {
            if (err) return res.status(500).send("Error fetching ticket.");
            
            // Step 3: Execute complex JOIN query
            var sql = `
                SELECT b.id, b.attendee_name, b.created_at, bt.quantity, t.name as ticket_name, t.price
                FROM bookings b
                JOIN booking_tickets bt ON b.id = bt.booking_id
                JOIN tickets t ON bt.ticket_id = t.id
                WHERE b.event_id = ?
                ORDER BY b.created_at DESC
            `;
            
            global.db.all(sql, [eventId], function(err, bookings) {
                if (err) return res.status(500).send("Error fetching bookings.");
                
                // Calculate real-time statistics
                var totalBooked = bookings.reduce(function(sum, booking) {
                    return sum + booking.quantity;
                }, 0);
                var remaining = ticket ? ticket.quantity - totalBooked : 0;
                
                res.render('organiser-bookings', {
                    event: event, ticket: ticket, bookings: bookings,
                    totalBooked: totalBooked, remaining: remaining
                });
            });
        });
    });
});
```

### Booking Display Template (views/organiser-bookings.ejs)
```html
<!-- Statistics Cards -->
<div class="row mb-4">
    <div class="col-md-4">
        <div class="card text-center">
            <div class="card-body">
                <h5 class="card-title text-primary">Total Bookings</h5>
                <h2 class="display-4"><%= bookings.length %></h2>
            </div>
        </div>
    </div>
    <div class="col-md-4">
        <div class="card text-center">
            <div class="card-body">
                <h5 class="card-title text-success">Tickets Sold</h5>
                <h2 class="display-4"><%= totalBooked %></h2>
            </div>
        </div>
    </div>
    <div class="col-md-4">
        <div class="card text-center">
            <div class="card-body">
                <h5 class="card-title text-warning">Tickets Remaining</h5>
                <h2 class="display-4"><%= remaining %></h2>
            </div>
        </div>
    </div>
</div>

<!-- Booking Details Table -->
<div class="card">
    <div class="card-header">
        <h3 class="card-title mb-0">Booking Details</h3>
    </div>
    <div class="card-body">
        <div class="table-responsive">
            <table class="table table-striped">
                <thead>
                    <tr>
                        <th>Attendee Name</th>
                        <th>Ticket Type</th>
                        <th>Quantity</th>
                        <th>Total Price</th>
                        <th>Date Booked</th>
                    </tr>
                </thead>
                <tbody>
                    <% bookings.forEach(function(booking) { %>
                        <tr>
                            <td><%= booking.attendee_name %></td>
                            <td><%= booking.ticket_name %></td>
                            <td><%= booking.quantity %></td>
                            <td>$<%= (booking.price * booking.quantity).toFixed(2) %></td>
                            <td><%= new Date(booking.created_at).toLocaleString() %></td>
                        </tr>
                    <% }); %>
                </tbody>
            </table>
        </div>
    </div>
</div>
```

### Navigation Integration (views/organiser-home.ejs, lines 60-65)
```html
<div class="card-footer bg-transparent border-0">
    <div class="d-grid gap-2">
        <a href="/attendee/event/<%= event.id %>" target="_blank" class="btn btn-secondary btn-sm">Sharing Link</a>
        <a href="/organiser/events/<%= event.id %>/bookings" class="btn btn-secondary btn-sm">View Bookings</a>
        <form action="/organiser/events/<%= event.id %>/delete" method="POST">
            <button type="submit" class="btn btn-danger btn-sm" onclick="return confirm('Are you sure?');">Delete</button>
        </form>
    </div>
</div>
```

## Summary
This booking management system provides organisers with complete visibility into their event bookings, enabling real-time tracking of attendance and capacity management. The implementation demonstrates advanced database design, efficient query optimization, and user-centered interface design while maintaining the simplicity of the original application. 
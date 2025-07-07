# Event Manager

_Lightweight web app for creating, managing, and booking events._

**This project was created as a hands-on way to learn and explore building web apps with Express and server-side rendering.**

---

## Features

### Organiser
- Dashboard: see all your events
- Create events (title, date, description)
- Add/manage tickets (set price, quantity)
- Edit events and tickets
- View bookings (see who booked and ticket quantities)
- Update site settings (site name, description)

### Attendee
- Browse all published events
- View event details (date, description, tickets)
- Book tickets (choose quantity, enter name & email)
- Booking confirmation

---

## Getting Started

### Prerequisites

- Node.js v14+
- npm v6+

### Installation

1. **Clone the repository:**
    ```sh
    git clone <repo-url>
    cd event-manager
    ```

2. **Install dependencies:**
    ```sh
    npm install
    ```

3. **Initialize the database:**
    ```sh
    npm run build-db
    ```

4. **Start the server:**
    ```sh
    npm start
    ```

The app runs at [http://localhost:3000](http://localhost:3000) by default.

---

##Dependencies

- express
- body-parser
- helmet
- compression
- express-validator
- bootstrap

---

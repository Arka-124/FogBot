# FogBot — Production-Ready Login Portal

A secure, production-ready, clone-and-run login portal built for the **FogBot Autonomous Pilot Rover** command center (Smart India Hackathon 2026 / NMDC Bailadila Mine project).

---

## Features & Core Architecture

- **Strict Access Control**: Dedicated login gateway with fields for **Operator User ID** and **Password** (No registration page).
- **Google reCAPTCHA v2**: Client-side interactive widget ("I'm not a robot" checkbox) with **mandatory server-side validation** before querying database credentials.
- **Lightweight & High-Performance**: Vanilla HTML5, CSS3, and modern JavaScript frontend with zero front-end build steps or bundle overhead.
- **Secure Backend**: Express.js REST API using parameterized queries via `mysql2/promise` to prevent SQL injection, and `bcryptjs` support for secure password hashing.
- **Containerized MySQL**: Ready-to-run `docker-compose.yml` and `init.sql` schema for instant database provisioning on any machine.
- **Integrated System Overview**: Seamless access to the FogBot 3D Digital Twin landing page via `/landing`.

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | Vanilla HTML5 (`index.html`), CSS3 (`style.css`), JavaScript (`script.js`) |
| **Backend** | Node.js, Express.js (`server.js`) |
| **Database** | MySQL 8.0 (`mysql2/promise` connection pool) |
| **Verification** | Google reCAPTCHA v2 API |
| **Containerization** | Docker, Docker Compose |

---

## Quickstart (Clone & Run)

### 1. Prerequisites
- **Node.js** (v18+ or v20+ recommended) & **npm**
- **Docker** & **Docker Compose** (or a local MySQL server)

### 2. Clone the Repository
```bash
git clone https://github.com/Arka-124/FogBot.git
cd FogBot
```

### 3. Configure Environment Variables
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
Ensure `.env` matches your database configuration:
```env
PORT=3000
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=[YOUR_MYSQL_ROOT_PASSWORD]
DB_NAME=login_portal
DB_PORT=3306

RECAPTCHA_SITE_KEY=6LekebUtAAAAAEiqVaTTW15PdF-Z2ZH47YNGUalw
RECAPTCHA_SECRET_KEY=[YOUR_RECAPTCHA_SECRET_KEY]
```

### 4. Start the Database (Docker)
Launch the containerized MySQL database with automatic schema initialization:
```bash
docker compose up -d
```
> The database will start on port `3306` and automatically execute `init.sql`.

### 5. Install Dependencies & Start the Server
```bash
npm install
npm start
```

### 6. Access the Application
- **Login Portal**: Open [http://localhost:3000](http://localhost:3000)
- **FogBot 3D Digital Twin Overview**: Open [http://localhost:3000/landing](http://localhost:3000/landing)

---

## Default Demo Credentials

| Parameter | Value |
|---|---|
| **User ID** | `admin` |
| **Password** | `password123` |

---

## Database Schema (`init.sql`)

```sql
CREATE DATABASE IF NOT EXISTS login_portal;
USE login_portal;

CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id VARCHAR(50) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO users (user_id, password_hash)
VALUES ('admin', 'password123')
ON DUPLICATE KEY UPDATE user_id = user_id;
```

---

## API Endpoints

### `POST /api/login`
Authenticates user credentials after verifying Google reCAPTCHA v2.

**Request Headers**:
```http
Content-Type: application/json
```

**Request Body**:
```json
{
  "userId": "admin",
  "password": "password123",
  "recaptchaToken": "03AFcWeA..."
}
```

**Validation Flow**:
1. Checks for presence of `userId`, `password`, and `recaptchaToken`.
2. Sends `recaptchaToken` to `https://www.google.com/recaptcha/api/siteverify` using `RECAPTCHA_SECRET_KEY`.
3. If reCAPTCHA fails, immediately returns HTTP `400 Bad Request` without querying database.
4. If reCAPTCHA succeeds, queries `users` table for `userId`.
5. Compares password against `password_hash` using `bcrypt` comparison (with plaintext fallback for seed compatibility).
6. Returns HTTP `200 OK` on match or HTTP `401 Unauthorized` on mismatch.

**Success Response (200 OK)**:
```json
{
  "success": true,
  "message": "Authentication successful! Welcome, admin.",
  "user": {
    "id": 1,
    "userId": "admin",
    "createdAt": "2026-09-11T08:06:07.000Z"
  }
}
```

**Failure Response (400 or 401)**:
```json
{
  "success": false,
  "message": "Invalid User ID or Password."
}
```

### `GET /api/config`
Returns public configuration including the `RECAPTCHA_SITE_KEY`.

### `GET /api/health`
Health check endpoint returning system status and uptime.

---

## Security Highlights

1. **Backend reCAPTCHA Verification**: reCAPTCHA verification is performed strictly on the Node.js server before any database operations occur, neutralizing brute-force and credential-stuffing bots.
2. **Parameterized SQL Queries**: All database queries use MySQL prepared statements (`pool.query('SELECT ... WHERE user_id = ?', [userId])`) to prevent SQL Injection.
3. **Password Security**: Password verification supports bcrypt-hashed strings.
4. **Environment Isolation**: Sensitive credentials (`.env`) and `node_modules/` are strictly excluded in `.gitignore`.
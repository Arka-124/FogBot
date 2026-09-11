require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static frontend files (index.html, style.css, script.js, assets)
app.use(express.static(path.join(__dirname)));

// Track database connection status
let isDbConnected = false;

// In-memory fallback user store (active when external database is unreachable on cloud hosts)
const fallbackUsers = [
  {
    id: 1,
    user_id: 'admin',
    password_hash: 'password123',
    created_at: new Date().toISOString()
  }
];

// MySQL Database Connection Configuration (Supports local .env, Docker, and Cloud platforms like Railway/Render/TiDB/Aiven)
const poolConfig = process.env.DATABASE_URL || process.env.MYSQL_URL
  ? {
      uri: process.env.DATABASE_URL || process.env.MYSQL_URL,
      ssl: process.env.DB_SSL === 'false' ? undefined : { rejectUnauthorized: false }
    }
  : {
      host: process.env.DB_HOST || process.env.MYSQLHOST || 'localhost',
      user: process.env.DB_USER || process.env.MYSQLUSER || 'root',
      password: process.env.DB_PASSWORD || process.env.MYSQLPASSWORD || '',
      database: process.env.DB_NAME || process.env.MYSQLDATABASE || 'login_portal',
      port: Number(process.env.DB_PORT || process.env.MYSQLPORT) || 3306,
      ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0
    };

const pool = mysql.createPool(poolConfig);

// Initialize and verify database on startup (auto-provisions schema on fresh cloud deployments)
(async () => {
  try {
    const connection = await pool.getConnection();
    isDbConnected = true;
    const dbName = process.env.DB_NAME || process.env.MYSQLDATABASE || 'login_portal';
    console.log(`[Database] Connected to MySQL database "${dbName}" successfully.`);
    
    // Auto-create users table if it does not exist (e.g. on newly provisioned cloud databases)
    await connection.query(`
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id VARCHAR(50) NOT NULL UNIQUE,
        password_hash VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Ensure default demo admin account exists
    await connection.query(`
      INSERT INTO users (user_id, password_hash)
      VALUES ('admin', 'password123')
      ON DUPLICATE KEY UPDATE user_id = user_id
    `);

    console.log('[Database] Schema verified: users table and demo credentials ready.');
    connection.release();
  } catch (err) {
    isDbConnected = false;
    console.warn(`[Database Warning] Could not connect to MySQL: ${err.message || err.code || err}`);
    console.warn('[Database Notice] Running in demo mode with in-memory store (Operator: "admin" / "password123").');
    console.warn('[Database Notice] To connect persistent cloud MySQL, set DATABASE_URL or DB_HOST in your Render dashboard.');
  }
})();

/**
 * GET /api/config
 * Exposes reCAPTCHA site key to frontend securely
 */
app.get('/api/config', (req, res) => {
  res.json({
    siteKey: process.env.RECAPTCHA_SITE_KEY || '6LekebUtAAAAAEiqVaTTW15PdF-Z2ZH47YNGUalw'
  });
});

/**
 * GET /api/health
 * System health check
 */
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime(), timestamp: new Date().toISOString() });
});

/**
 * Page Routes
 * - GET / -> index.html (Served automatically via static middleware: FogBot 3D Digital Twin)
 * - GET /login -> login.html (Operator Login Portal)
 * - GET /landing -> redirects to /
 */
app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'login.html'));
});

app.get('/landing', (req, res) => {
  res.redirect('/');
});

/**
 * POST /api/login
 * Handles user authentication with mandatory backend reCAPTCHA v2 verification
 */
app.post('/api/login', async (req, res) => {
  try {
    const { userId, password, recaptchaToken } = req.body;

    // 1. Basic validation
    if (!userId || !password) {
      return res.status(400).json({
        success: false,
        message: 'User ID and Password are required.'
      });
    }

    if (!recaptchaToken) {
      return res.status(400).json({
        success: false,
        message: 'Please complete the reCAPTCHA verification.'
      });
    }

    // 2. Strict Backend Google reCAPTCHA v2 Validation
    const secretKey = process.env.RECAPTCHA_SECRET_KEY;
    if (!secretKey) {
      console.error('[Security Configuration Error] RECAPTCHA_SECRET_KEY is missing from environment variables (.env).');
      return res.status(500).json({
        success: false,
        message: 'Authentication server configuration error: reCAPTCHA secret key is not set.'
      });
    }

    const verifyUrl = 'https://www.google.com/recaptcha/api/siteverify';
    const postData = new URLSearchParams({
      secret: secretKey,
      response: recaptchaToken,
      remoteip: req.ip || req.connection.remoteAddress || ''
    });

    const recaptchaResponse = await fetch(verifyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: postData.toString()
    });

    const recaptchaResult = await recaptchaResponse.json();

    if (!recaptchaResult.success) {
      console.warn(`[Security] reCAPTCHA validation failed for user "${userId}":`, recaptchaResult['error-codes']);
      return res.status(400).json({
        success: false,
        message: 'reCAPTCHA verification failed. Please check the box again.',
        errorCodes: recaptchaResult['error-codes']
      });
    }

    // 3. Query Database for user credentials (only executed AFTER reCAPTCHA succeeds)
    let user = null;

    if (isDbConnected) {
      try {
        const [rows] = await pool.query(
          'SELECT id, user_id, password_hash, created_at FROM users WHERE user_id = ? LIMIT 1',
          [userId.trim()]
        );
        if (rows && rows.length > 0) {
          user = rows[0];
        }
      } catch (dbErr) {
        console.warn(`[Database Warning] Query failed: ${dbErr.message}. Checking in-memory fallback.`);
      }
    }

    // Graceful fallback if database is not connected or in cloud demo mode
    if (!user) {
      const fallbackUser = fallbackUsers.find(
        (u) => u.user_id.toLowerCase() === userId.trim().toLowerCase()
      );
      if (fallbackUser) {
        user = fallbackUser;
      }
    }

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid User ID or Password.'
      });
    }
    let passwordMatches = false;

    // Support bcrypt hashes as well as demo/plaintext passwords
    if (user.password_hash && user.password_hash.startsWith('$2')) {
      passwordMatches = await bcrypt.compare(password, user.password_hash);
    } else {
      passwordMatches = (password === user.password_hash);
    }

    if (!passwordMatches) {
      return res.status(401).json({
        success: false,
        message: 'Invalid User ID or Password.'
      });
    }

    // 4. Successful Authentication
    return res.status(200).json({
      success: true,
      message: `Authentication successful! Welcome, ${user.user_id}.`,
      user: {
        id: user.id,
        userId: user.user_id,
        createdAt: user.created_at
      }
    });

  } catch (error) {
    console.error('[Server Error /api/login]:', error);
    return res.status(500).json({
      success: false,
      message: 'An internal server error occurred. Please try again later.'
    });
  }
});

// Start Server
app.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(` FogBot Login Portal Server Running on Port ${PORT}`);
  console.log(` Overview Page: http://localhost:${PORT}/ (index.html)`);
  console.log(` Login Portal:  http://localhost:${PORT}/login (login.html)`);
  console.log(`====================================================`);
});

module.exports = app;

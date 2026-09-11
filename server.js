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

// MySQL Database Connection Pool
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'login_portal',
  port: Number(process.env.DB_PORT) || 3306,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// Test database connection on startup
(async () => {
  try {
    const connection = await pool.getConnection();
    console.log(`[Database] Connected to MySQL database "${process.env.DB_NAME || 'login_portal'}" successfully.`);
    connection.release();
  } catch (err) {
    console.warn(`[Database Warning] Could not connect to MySQL: ${err.message}`);
    console.warn('[Database Warning] Verify MySQL is running or run `docker compose up -d` to start the database.');
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
 * Route to view the FogBot system overview / landing page
 */
app.get('/landing', (req, res) => {
  res.sendFile(path.join(__dirname, 'landing.html'));
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
    const [rows] = await pool.query(
      'SELECT id, user_id, password_hash, created_at FROM users WHERE user_id = ? LIMIT 1',
      [userId.trim()]
    );

    if (!rows || rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Invalid User ID or Password.'
      });
    }

    const user = rows[0];
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
  console.log(` URL: http://localhost:${PORT}`);
  console.log(` Overview Page: http://localhost:${PORT}/landing`);
  console.log(`====================================================`);
});

module.exports = app;

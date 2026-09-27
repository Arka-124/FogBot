require('dotenv').config();
const http = require('http');
const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { WebSocketServer, WebSocket } = require('ws');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'fogbot_nmdc_sih2026_super_secret_jwt_key_98231';

// Create HTTP Server & attach Express + WebSocket Server
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static frontend files (index.html, style.css, script.js, assets)
app.use(express.static(path.join(__dirname)));

// Direct favicon handler
app.get('/favicon.ico', (req, res) => {
  res.sendFile(path.join(__dirname, 'assets', 'rover.png'));
});

// Track database connection status
let isDbConnected = false;

// Multi-role in-memory fallback store (supports zero-config cloud deployments e.g. Render free tier)
const fallbackUsers = [
  {
    id: 1,
    user_id: 'admin',
    password_hash: 'password123',
    role: 'admin',
    full_name: 'Chief Systems Engineer',
    created_at: new Date().toISOString()
  },
  {
    id: 2,
    user_id: 'operator',
    password_hash: 'operator123',
    role: 'operator',
    full_name: 'Pit Control Dispatcher',
    created_at: new Date().toISOString()
  },
  {
    id: 3,
    user_id: 'driver',
    password_hash: 'driver123',
    role: 'field_worker',
    full_name: 'CAT 777D Haul Truck Driver',
    created_at: new Date().toISOString()
  },
  {
    id: 4,
    user_id: 'judge',
    password_hash: 'guest123',
    role: 'guest',
    full_name: 'Visiting SIH 2026 Judge / Auditor',
    created_at: new Date().toISOString()
  }
];

// MySQL Database Connection Configuration
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

// Initialize and verify database on startup with role support
(async () => {
  try {
    const connection = await pool.getConnection();
    isDbConnected = true;
    const dbName = process.env.DB_NAME || process.env.MYSQLDATABASE || 'login_portal';
    console.log(`[Database] Connected to MySQL database "${dbName}" successfully.`);
    
    // Auto-create users table with role and full_name
    await connection.query(`
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id VARCHAR(50) NOT NULL UNIQUE,
        password_hash VARCHAR(255) NOT NULL,
        role VARCHAR(20) NOT NULL DEFAULT 'operator',
        full_name VARCHAR(100) NOT NULL DEFAULT '',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Ensure columns exist if table was previously created with older schema
    try {
      const [columns] = await connection.query(`SHOW COLUMNS FROM users LIKE 'role'`);
      if (columns.length === 0) {
        await connection.query(`ALTER TABLE users ADD COLUMN role VARCHAR(20) NOT NULL DEFAULT 'operator'`);
        await connection.query(`ALTER TABLE users ADD COLUMN full_name VARCHAR(100) NOT NULL DEFAULT ''`);
      }
    } catch (e) {
      // Column check ignore
    }

    // Seed default multi-role accounts
    for (const u of fallbackUsers) {
      await connection.query(`
        INSERT INTO users (user_id, password_hash, role, full_name)
        VALUES (?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE 
          role = VALUES(role),
          full_name = VALUES(full_name)
      `, [u.user_id, u.password_hash, u.role, u.full_name]);
    }

    console.log('[Database] Schema verified: users table provisioned with multi-role accounts.');
    connection.release();
  } catch (err) {
    isDbConnected = false;
    console.warn(`[Database Warning] Could not connect to MySQL: ${err.message || err.code || err}`);
    console.warn('[Database Notice] Running in demo mode with in-memory multi-role store (Admin, Operator, Field Worker, Guest).');
  }
})();

// =========================================================================
// CENTRAL MASTER TELEMETRY SIMULATION & STATE ENGINE
// =========================================================================
let scanPointsCache = null;
try {
  const pointsPath = path.join(__dirname, 'assets', 'scan_points.json');
  if (fs.existsSync(pointsPath)) {
    scanPointsCache = JSON.parse(fs.readFileSync(pointsPath, 'utf8'));
  }
} catch (e) {
  scanPointsCache = [];
}

const masterTelemetry = {
  roverId: 'ROVER_01',
  targetSite: 'NMDC Bailadila Deposit 5',
  fogDensity: 14,          // 0 to 100 range from slider
  visibility: 38,          // derived in meters
  speed: 24.5,             // km/h
  speedLimit: 25,          // km/h recommended by AI engine
  riskLevel: 'LOW',        // 'LOW' | 'MEDIUM' | 'HIGH'
  obstacleActive: false,
  obstacleDist: null,
  obstacleX: 0,
  gps: {
    lat: 18.7052,
    lng: 81.2384,
    alt: 1182
  },
  battery: 84.2,           // %
  gap: 38.5,               // distance to haul truck (m)
  ttc: 5.6,                // Time to Collision (s)
  eStop: false,            // Emergency Stop override
  status: 'AUTONOMOUS ESCORTING',
  // Deep AI internals (Admin only)
  cameraConfidence: 86,    // % (Acts as live optical fog proxy)
  lidarConfidence: 94,     // %
  aiRawMath: {
    riskFormula: 'f(gap, v_closing, 1-C_cam, d_obs, road_grade)',
    fogWeight: 0.14,
    closingVelocityDelta: 0.28,
    stoppingEnvelopeM: 14.8
  },
  updatedAt: new Date().toISOString()
};

// Simulation tick helper
function updateMasterTelemetry() {
  const fog = masterTelemetry.fogDensity;

  // 1. Calculate Visibility
  // Inverse curve: 0% fog -> 55m, 14% -> 38m, 50% -> 15m, 100% -> 3m
  masterTelemetry.visibility = Math.max(3, Math.round(55 - (fog * 0.52)));

  // 2. Camera confidence as live optical transmissometer proxy
  masterTelemetry.cameraConfidence = Math.max(12, Math.round(100 - fog * 0.88));
  masterTelemetry.lidarConfidence = Math.max(72, Math.round(98 - fog * 0.15));

  // 3. Synthetic obstacle cycling in Sector 3B
  const now = Date.now();
  if (fog > 45 || masterTelemetry.eStop) {
    masterTelemetry.obstacleActive = true;
    masterTelemetry.obstacleDist = masterTelemetry.obstacleDist !== null 
      ? Math.max(4.2, Math.round((masterTelemetry.obstacleDist - 0.2) * 10) / 10)
      : 14.2;
    masterTelemetry.obstacleX = 0.8;
  } else {
    masterTelemetry.obstacleActive = false;
    masterTelemetry.obstacleDist = null;
    masterTelemetry.obstacleX = 0;
  }

  // 4. Risk Level determination
  if (masterTelemetry.eStop) {
    masterTelemetry.riskLevel = 'HIGH';
    masterTelemetry.status = 'EMERGENCY STOPPED';
  } else if (masterTelemetry.visibility < 15 || (masterTelemetry.obstacleActive && masterTelemetry.obstacleDist < 12)) {
    masterTelemetry.riskLevel = 'HIGH';
    masterTelemetry.status = 'CRITICAL HAZARD SLOWDOWN';
  } else if (masterTelemetry.visibility < 35 || masterTelemetry.obstacleActive) {
    masterTelemetry.riskLevel = 'MEDIUM';
    masterTelemetry.status = 'CAUTIONARY ESCORT';
  } else {
    masterTelemetry.riskLevel = 'LOW';
    masterTelemetry.status = 'AUTONOMOUS ESCORTING';
  }

  // 5. Recommended speed governor limit
  if (masterTelemetry.eStop) {
    masterTelemetry.speedLimit = 0;
    masterTelemetry.speed = 0;
  } else if (masterTelemetry.riskLevel === 'HIGH') {
    masterTelemetry.speedLimit = 10;
  } else if (masterTelemetry.riskLevel === 'MEDIUM') {
    masterTelemetry.speedLimit = 22;
  } else {
    masterTelemetry.speedLimit = 35;
  }

  // Drive speed converges toward limit
  if (!masterTelemetry.eStop) {
    const diff = masterTelemetry.speedLimit - masterTelemetry.speed;
    masterTelemetry.speed += Math.round((diff * 0.25 + (Math.random() * 0.6 - 0.3)) * 10) / 10;
    masterTelemetry.speed = Math.max(0, Math.round(masterTelemetry.speed * 10) / 10);
  }

  // Convoy gap and TTC
  if (masterTelemetry.eStop) {
    masterTelemetry.gap = Math.max(18.0, Math.round((masterTelemetry.gap - 0.5) * 10) / 10);
  } else {
    masterTelemetry.gap = Math.round((36 + (Math.random() * 3 - 1.5)) * 10) / 10;
  }
  const relV = Math.abs(masterTelemetry.speed - 24) + 4.2;
  masterTelemetry.ttc = Math.max(1.5, Math.round((masterTelemetry.gap / relV) * 10) / 10);

  // GPS progression
  const inc = (masterTelemetry.speed / 3600) * 0.0001;
  masterTelemetry.gps.lat = Math.round((masterTelemetry.gps.lat + inc) * 10000) / 10000;
  masterTelemetry.gps.lng = Math.round((masterTelemetry.gps.lng + inc * 0.4) * 10000) / 10000;

  // Battery drain
  masterTelemetry.battery = Math.max(10, Math.round((masterTelemetry.battery - 0.002) * 100) / 100);

  // Raw math update
  masterTelemetry.aiRawMath.fogWeight = Math.round((fog / 100) * 100) / 100;
  masterTelemetry.aiRawMath.stoppingEnvelopeM = Math.round((masterTelemetry.speed * 0.55) * 10) / 10;
  masterTelemetry.updatedAt = new Date().toISOString();
}

// =========================================================================
// BACKEND ROLE-BASED TELEMETRY SLICING (DATA GATING)
// =========================================================================
function sliceTelemetryForRole(master, role) {
  switch (role) {
    case 'admin':
      // 100% Unredacted: Full AI internals, scan points, formulas, diagnostics
      return {
        role: 'admin',
        accessLevel: 'UNRESTRICTED_ADMIN',
        ...master,
        scanPoints: scanPointsCache ? scanPointsCache.slice(0, 1500) : []
      };

    case 'operator': {
      // Operational Diagnostic Slice: LiDAR radar scan, telemetry, convoy map
      // Omit deep algorithmic debug formulas & internal calibration
      const { aiRawMath, ...opData } = master;
      return {
        role: 'operator',
        accessLevel: 'OPERATIONAL_DISPATCH',
        ...opData,
        scanPoints: scanPointsCache ? scanPointsCache.slice(0, 1500) : []
      };
    }

    case 'field_worker':
      // SAFETY HEADS-UP DISPLAY (HUD) SLICE ONLY
      // Strips 1,500 LiDAR points, complex AI math, camera confidence decimals
      // Delivers clear operational decision, safe headway, and alerts
      return {
        role: 'field_worker',
        accessLevel: 'IN_CAB_HEADS_UP_DISPLAY',
        decision: master.riskLevel, // 'SAFE' | 'CAUTION' | 'HIGH' (Flashing E-STOP)
        recommendedSpeed: master.speedLimit,
        currentSpeed: master.speed,
        convoyGap: master.gap,
        ttc: master.ttc,
        hazardAlert: master.obstacleActive
          ? `HAZARD: Forward Obstacle at ${master.obstacleDist}m (Sector 3B)`
          : 'PILOT CORRIDOR CLEAR',
        visibility: master.visibility,
        fogDensity: master.fogDensity,
        status: master.status,
        eStop: master.eStop,
        zone: master.targetSite,
        leadUnit: master.roverId,
        trailingUnit: 'CAT 777D #04',
        updatedAt: master.updatedAt
      };

    case 'guest':
      // EXECUTIVE AUDIT / JUDGE SLICE
      // High-level overview, no raw points, read-only controls to prevent accidental halts
      return {
        role: 'guest',
        accessLevel: 'JUDGE_AUDIT_READ_ONLY',
        visibility: master.visibility,
        fogDensity: master.fogDensity,
        riskLevel: master.riskLevel,
        speedLimit: master.speedLimit,
        speed: master.speed,
        convoyGap: master.gap,
        ttc: master.ttc,
        status: master.status,
        eStop: master.eStop,
        gps: master.gps,
        activeRovers: 1,
        connectedTrucks: 1,
        zone: master.targetSite,
        updatedAt: master.updatedAt
      };

    default:
      return {
        role: 'anonymous',
        accessLevel: 'MINIMAL_PUBLIC',
        visibility: master.visibility,
        fogDensity: master.fogDensity,
        updatedAt: master.updatedAt
      };
  }
}

// =========================================================================
// AUTHENTICATION & RBAC MIDDLEWARE
// =========================================================================
function extractUserFromRequest(req) {
  let token = null;
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7);
  } else if (req.query && req.query.token) {
    token = req.query.token;
  }

  if (!token) return null;

  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (e) {
    return null;
  }
}

function requireRole(allowedRoles = []) {
  return (req, res, next) => {
    const user = extractUserFromRequest(req);
    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized: Missing or invalid authentication token.'
      });
    }

    if (allowedRoles.length > 0 && !allowedRoles.includes(user.role)) {
      return res.status(403).json({
        success: false,
        error: `Forbidden: Action requires role [${allowedRoles.join(', ')}]. Your current role is '${user.role}'.`
      });
    }

    req.user = user;
    next();
  };
}

// =========================================================================
// WEBSOCKET TELEMETRY BROADCAST ENGINE
// =========================================================================
wss.on('connection', (ws, req) => {
  // Extract token from query string (e.g., ws://host:port?token=...)
  let clientRole = 'guest';
  let clientUser = 'anonymous';

  try {
    const parsedUrl = new URL(req.url, 'http://localhost');
    const token = parsedUrl.searchParams.get('token');
    if (token) {
      const decoded = jwt.verify(token, JWT_SECRET);
      clientRole = decoded.role || 'guest';
      clientUser = decoded.userId || 'user';
    }
  } catch (err) {
    clientRole = 'guest';
  }

  ws.authenticatedRole = clientRole; // Immutable authenticated role from JWT
  ws.clientRole = clientRole;
  ws.clientUser = clientUser;
  console.log(`[WebSocket] Client connected: ${clientUser} (Role: ${clientRole})`);

  // Send immediate initial role-sliced telemetry
  const initialPayload = sliceTelemetryForRole(masterTelemetry, clientRole);
  ws.send(JSON.stringify({ type: 'TELEMETRY_UPDATE', data: initialPayload }));

  // Handle client-initiated actuation (E-STOP or Fog change)
  ws.on('message', (message) => {
    try {
      const parsed = JSON.parse(message);

      // Verify permissions before allowing mutations
      if (parsed.action === 'ESTOP') {
        if (ws.clientRole !== 'admin' && ws.clientRole !== 'operator') {
          return ws.send(JSON.stringify({
            type: 'ACTION_REJECTED',
            error: `Forbidden: Role '${ws.clientRole}' cannot actuate Emergency Stop. Restricted to Admin/Operator.`
          }));
        }

        masterTelemetry.eStop = !masterTelemetry.eStop;
        updateMasterTelemetry();
        broadcastTelemetry();
        console.log(`[E-STOP] State toggled to ${masterTelemetry.eStop} by ${ws.clientUser} (${ws.clientRole})`);
      }

      if (parsed.action === 'SET_FOG') {
        if (ws.clientRole !== 'admin' && ws.clientRole !== 'operator') {
          return ws.send(JSON.stringify({
            type: 'ACTION_REJECTED',
            error: `Forbidden: Role '${ws.clientRole}' cannot modify fog simulation density.`
          }));
        }

        const fogVal = parseInt(parsed.value, 10);
        if (!isNaN(fogVal) && fogVal >= 0 && fogVal <= 100) {
          masterTelemetry.fogDensity = fogVal;
          updateMasterTelemetry();
          broadcastTelemetry();
        }
      }

      if (parsed.action === 'SWITCH_ROLE_DEMO') {
        const targetRole = parsed.role;

        // 1. Field Worker cannot switch views at all
        if (ws.authenticatedRole === 'field_worker') {
          return ws.send(JSON.stringify({
            type: 'ACTION_REJECTED',
            error: 'Forbidden: Field Worker accounts are locked to the In-Cab Driver HUD and cannot switch views.'
          }));
        }

        // 2. Operator cannot switch to Admin view
        if (ws.authenticatedRole === 'operator' && targetRole === 'admin') {
          return ws.send(JSON.stringify({
            type: 'ACTION_REJECTED',
            error: 'Forbidden: Operator accounts cannot switch to Admin view.'
          }));
        }

        // 3. Guest accounts cannot switch to Admin or Operator view
        if (ws.authenticatedRole === 'guest' && (targetRole === 'admin' || targetRole === 'operator')) {
          return ws.send(JSON.stringify({
            type: 'ACTION_REJECTED',
            error: 'Forbidden: Guest accounts cannot switch to Admin or Operator view.'
          }));
        }

        // Allow authorized view switch
        if (['admin', 'operator', 'field_worker', 'guest'].includes(targetRole)) {
          ws.clientRole = targetRole;
          const updatedSlice = sliceTelemetryForRole(masterTelemetry, ws.clientRole);
          ws.send(JSON.stringify({
            type: 'ROLE_SWITCHED',
            role: ws.clientRole,
            data: updatedSlice
          }));
          console.log(`[WebSocket] Client ${ws.clientUser} (Auth: ${ws.authenticatedRole}) switched demo role to: ${ws.clientRole}`);
        }
      }

    } catch (e) {
      console.warn('[WebSocket Warning] Malformed message received:', e.message);
    }
  });

  ws.on('close', () => {
    console.log(`[WebSocket] Client disconnected: ${clientUser} (${clientRole})`);
  });
});

// Broadcast role-differentiated telemetry slice to all connected clients
function broadcastTelemetry() {
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      const slice = sliceTelemetryForRole(masterTelemetry, client.clientRole || 'guest');
      client.send(JSON.stringify({ type: 'TELEMETRY_UPDATE', data: slice }));
    }
  });
}

// Master tick interval: updates simulation and broadcasts every 1 second
setInterval(() => {
  updateMasterTelemetry();
  broadcastTelemetry();
}, 1000);

// =========================================================================
// REST API ROUTES
// =========================================================================

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
 * GET /api/health and GET /healthz
 */
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    uptime: process.uptime(), 
    timestamp: new Date().toISOString(),
    connectedClients: wss.clients.size
  });
});

app.get('/healthz', (req, res) => {
  res.status(200).send('OK');
});

/**
 * GET /api/telemetry/fog
 * Public overview of mine visibility
 */
app.get('/api/telemetry/fog', (req, res) => {
  res.json({
    fogDensity: masterTelemetry.fogDensity,
    visibilityIndex: Math.max(0, 100 - masterTelemetry.fogDensity),
    visibilityMeters: masterTelemetry.visibility,
    updatedAt: masterTelemetry.updatedAt
  });
});

/**
 * POST /api/telemetry/fog
 * RBAC Protected: Only Admin & Operator can modify fog density
 */
app.post('/api/telemetry/fog', requireRole(['admin', 'operator']), (req, res) => {
  const { fogDensity } = req.body;
  const parsed = parseInt(fogDensity, 10);
  if (!isNaN(parsed) && parsed >= 0 && parsed <= 100) {
    masterTelemetry.fogDensity = parsed;
    updateMasterTelemetry();
    broadcastTelemetry();
    return res.json({
      success: true,
      fogDensity: masterTelemetry.fogDensity,
      visibilityIndex: 100 - masterTelemetry.fogDensity,
      visibilityMeters: masterTelemetry.visibility,
      updatedBy: req.user.userId,
      role: req.user.role
    });
  }
  return res.status(400).json({
    success: false,
    message: 'Invalid fogDensity value. Must be an integer between 0 and 100.'
  });
});

/**
 * POST /api/telemetry/estop
 * RBAC Protected: Only Admin & Operator can actuate Emergency Stop
 */
app.post('/api/telemetry/estop', requireRole(['admin', 'operator']), (req, res) => {
  masterTelemetry.eStop = !masterTelemetry.eStop;
  updateMasterTelemetry();
  broadcastTelemetry();
  return res.json({
    success: true,
    eStop: masterTelemetry.eStop,
    status: masterTelemetry.status,
    actuatedBy: req.user.userId,
    role: req.user.role
  });
});

/**
 * GET /api/telemetry/live
 * Role-Filtered Telemetry Endpoint
 * Backend strictly filters data according to user token!
 */
app.get('/api/telemetry/live', (req, res) => {
  const user = extractUserFromRequest(req);
  const role = user ? user.role : 'guest';
  const slicedData = sliceTelemetryForRole(masterTelemetry, role);
  res.json({
    success: true,
    authenticatedUser: user ? user.userId : 'anonymous',
    role: role,
    data: slicedData
  });
});

/**
 * GET /api/telemetry/scan-points
 * RBAC Protected: Only Admin & Operator receive 1,500 point LiDAR scan
 * Field Worker and Guest are blocked with 403 Forbidden!
 */
app.get('/api/telemetry/scan-points', requireRole(['admin', 'operator']), (req, res) => {
  res.json({
    success: true,
    count: scanPointsCache ? scanPointsCache.length : 0,
    scanPoints: scanPointsCache || []
  });
});

/**
 * Page Routes
 */
app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'login.html'));
});

app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'dashboard.html'));
});

app.get('/landing', (req, res) => {
  res.redirect('/');
});

/**
 * POST /api/login
 * Authenticates user, verifies reCAPTCHA, and issues JWT with role claim
 */
app.post('/api/login', async (req, res) => {
  try {
    const { userId, password, recaptchaToken } = req.body;

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

    // Strict Backend Google reCAPTCHA v2 Validation (supports test_bypass_token for automated testing)
    let recaptchaSuccess = false;
    let errorCodes = [];

    if (recaptchaToken === 'test_bypass_token' || process.env.SKIP_CAPTCHA === 'true') {
      recaptchaSuccess = true;
    } else {
      const secretKey = process.env.RECAPTCHA_SECRET_KEY;
      if (!secretKey) {
        console.error('[Security Error] RECAPTCHA_SECRET_KEY is missing from environment.');
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
      recaptchaSuccess = Boolean(recaptchaResult.success);
      errorCodes = recaptchaResult['error-codes'] || [];
    }

    if (!recaptchaSuccess) {
      console.warn(`[Security] reCAPTCHA validation failed for user "${userId}":`, errorCodes);
      return res.status(400).json({
        success: false,
        message: 'reCAPTCHA verification failed. Please check the box again.',
        errorCodes: errorCodes
      });
    }

    // Query Database or fallback for user credentials
    let user = null;

    if (isDbConnected) {
      try {
        const [rows] = await pool.query(
          'SELECT id, user_id, password_hash, role, full_name, created_at FROM users WHERE user_id = ? LIMIT 1',
          [userId.trim()]
        );
        if (rows && rows.length > 0) {
          user = rows[0];
        }
      } catch (dbErr) {
        console.warn(`[Database Warning] Query failed: ${dbErr.message}. Checking in-memory fallback.`);
      }
    }

    // Graceful fallback store
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

    // Issue Signed JSON Web Token (JWT) with user ID and Role
    const userRole = user.role || 'operator';
    const fullName = user.full_name || user.user_id;

    const token = jwt.sign(
      {
        id: user.id,
        userId: user.user_id,
        role: userRole,
        fullName: fullName
      },
      JWT_SECRET,
      { expiresIn: '12h' }
    );

    return res.status(200).json({
      success: true,
      message: `Authentication successful! Welcome, ${fullName}.`,
      token: token,
      user: {
        id: user.id,
        userId: user.user_id,
        role: userRole,
        fullName: fullName,
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
const HOST = '0.0.0.0';
server.listen(PORT, HOST, () => {
  console.log(`====================================================`);
  console.log(` FogBot Command Center & RBAC Telemetry Server`);
  console.log(` HTTP & WebSocket Server Running on http://${HOST}:${PORT}`);
  console.log(` Landing Page:   http://${HOST}:${PORT}/`);
  console.log(` Login Gateway:  http://${HOST}:${PORT}/login`);
  console.log(` Command Center: http://${HOST}:${PORT}/dashboard`);
  console.log(` Active Roles:   Admin, Operator, Field Worker, Guest`);
  console.log(` Health Check:   http://${HOST}:${PORT}/healthz`);
  console.log(`====================================================`);
});

module.exports = { app, server };

/**
 * FogBot Command Center — dashboard.js
 * Client-side simulation, LiDAR canvas point cloud renderer,
 * AI Risk evaluation engine, and telemetry supervisor.
 */

(function () {
  'use strict';

  // =========================================================================
  // 1. AUTHENTICATION GUARD
  // =========================================================================
  const authSession = sessionStorage.getItem('fogbot_session');
  if (!authSession) {
    window.location.replace('login.html?redirect=dashboard.html');
    return;
  }
  let sessionUser = 'admin';
  try {
    const sessionData = JSON.parse(authSession);
    if (!sessionData.authenticated) {
      window.location.replace('login.html?redirect=dashboard.html');
      return;
    }
    if (sessionData.userId) sessionUser = sessionData.userId;
  } catch (e) {
    window.location.replace('login.html?redirect=dashboard.html');
    return;
  }

  // =========================================================================
  // 2. DOM REFERENCES
  // =========================================================================
  const fogSlider = document.getElementById('fogSlider');
  const fogValBadge = document.getElementById('fogValBadge');
  const btnEstop = document.getElementById('btnEstop');
  const estopText = document.getElementById('estopText');
  const logoutBtn = document.getElementById('logoutBtn');
  const operatorName = document.getElementById('operatorName');

  // KPI elements
  const kpiVisibility = document.getElementById('kpiVisibility');
  const kpiRiskBadge = document.getElementById('kpiRiskBadge');
  const kpiSpeedLimit = document.getElementById('kpiSpeedLimit');

  // Risk Engine elements
  const inputSpeed = document.getElementById('inputSpeed');
  const inputFog = document.getElementById('inputFog');
  const inputCamera = document.getElementById('inputCamera');
  const inputLidarObstacle = document.getElementById('inputLidarObstacle');
  const riskBarFill = document.getElementById('riskBarFill');
  const riskEngineBadge = document.getElementById('riskEngineBadge');
  const recSpeedVal = document.getElementById('recSpeedVal');
  const safetyAdvisoryText = document.getElementById('safetyAdvisoryText');

  // Telemetry elements
  const telemGps = document.getElementById('telemGps');
  const telemAlt = document.getElementById('telemAlt');
  const telemSpeed = document.getElementById('telemSpeed');
  const telemBatteryVal = document.getElementById('telemBatteryVal');
  const telemBatteryFill = document.getElementById('telemBatteryFill');
  const telemStatus = document.getElementById('telemStatus');

  // Map readout elements
  const mapGapReadout = document.getElementById('mapGapReadout');
  const mapTtcReadout = document.getElementById('mapTtcReadout');

  // Event Log stream
  const eventLogStream = document.getElementById('eventLogStream');
  const btnClearLog = document.getElementById('btnClearLog');

  // Mini HUD elements
  const hudVisibility = document.getElementById('hudVisibility');
  const hudSpeed = document.getElementById('hudSpeed');
  const hudObstacle = document.getElementById('hudObstacle');
  const hudRisk = document.getElementById('hudRisk');
  const hudDot = document.getElementById('hudDot');

  // Canvases
  const lidarCanvas = document.getElementById('lidarCanvas');
  const lidarCtx = lidarCanvas ? lidarCanvas.getContext('2d') : null;
  const mapCanvas = document.getElementById('mapCanvas');
  const mapCtx = mapCanvas ? mapCanvas.getContext('2d') : null;

  // Set operator display name
  if (operatorName) operatorName.textContent = sessionUser;

  // Logout listener
  if (logoutBtn) {
    logoutBtn.addEventListener('click', function () {
      sessionStorage.removeItem('fogbot_session');
      window.location.href = 'login.html';
    });
  }

  // =========================================================================
  // 3. STATE OBJECT & SIMULATION DATA
  // =========================================================================
  const state = {
    fogDensity: 35,          // 0 to 100 range from slider
    visibility: 38,          // derived in meters (inversely related to fog)
    speed: 24.5,             // current rover speed in km/h
    speedLimit: 25,          // recommended speed limit based on risk
    riskLevel: 'LOW',        // 'LOW' | 'MEDIUM' | 'HIGH'
    obstacleActive: false,   // true if synthetic obstacle in path
    obstacleDist: null,      // distance in meters
    obstacleX: 0,            // lateral offset in meters
    gps: {
      lat: 18.7052,
      lng: 81.2384,
      alt: 1182
    },
    battery: 84.2,           // battery percentage
    gap: 38.5,               // distance between rover and truck (m)
    ttc: 5.6,                // Time To Collision (seconds)
    eStop: false             // Emergency stop status
  };

  // State tracker for event logging (logs ONLY on state changes)
  let lastLoggedState = {
    riskLevel: null,
    obstacleActive: null,
    eStop: null,
    speedLimit: null
  };

  // LiDAR Scan Points array (loaded from assets/scan_points.json)
  let scanPoints = [];
  let isLidarLoaded = false;

  // =========================================================================
  // 4. FETCH REAL LIDAR SCAN POINTS
  // =========================================================================
  async function loadLidarPoints() {
    try {
      const response = await fetch('assets/scan_points.json');
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      scanPoints = await response.json();
      isLidarLoaded = true;
      addLogEntry('INFO', `LiDAR point cloud active (${scanPoints.length.toLocaleString()} points loaded).`);
      renderLidar();
    } catch (err) {
      console.warn('[LiDAR Warning] Could not fetch assets/scan_points.json:', err.message);
      // Fallback synthetic points if file access fails in isolated file:/// protocol
      generateFallbackPoints();
      isLidarLoaded = true;
      renderLidar();
    }
  }

  function generateFallbackPoints() {
    scanPoints = [];
    for (let i = 0; i < 800; i++) {
      const angle = Math.random() * Math.PI * 2;
      const r = 2 + Math.random() * 18;
      scanPoints.push({
        x: Math.cos(angle) * r,
        y: Math.sin(angle) * r
      });
    }
  }

  // =========================================================================
  // 5. SIMULATED TELEMETRY PIPELINE
  // =========================================================================
  /**
   * REPLACE THIS WITH REAL SENSOR INPUT LATER
   * 
   * Encapsulates all sensor acquisition, atmospheric modeling, and vehicle
   * telemetry calculations. When real hardware / ROS2 / WebSocket telemetry
   * is connected, replace the contents of this function.
   * 
   * @param {number} fogValue - Current fog slider position (0-100)
   * @returns {object} Updated state metrics
   */
  function getTelemetry(fogValue) {
    // 1. Calculate Visibility from Fog Density with random micro-jitter
    // At fog 0: ~58m visibility; At fog 100: ~5m visibility
    const baseVis = 58 - (fogValue * 0.52);
    const visJitter = (Math.random() * 2.4) - 1.2;
    const computedVisibility = Math.max(4, Math.min(60, Math.round((baseVis + visJitter) * 10) / 10));

    // 2. Obstacle Simulation Logic (15% chance to toggle or shift)
    let isObstacle = state.obstacleActive;
    let dist = state.obstacleDist;
    let xOffset = state.obstacleX;

    // Trigger obstacle occasionally
    if (!state.eStop) {
      const roll = Math.random();
      if (!isObstacle && roll < 0.12) {
        // New obstacle appears within 10-22 meters ahead
        isObstacle = true;
        dist = Math.round((9 + Math.random() * 13) * 10) / 10;
        xOffset = Math.round(((Math.random() * 4) - 2) * 10) / 10;
      } else if (isObstacle) {
        if (roll < 0.18) {
          // Obstacle cleared
          isObstacle = false;
          dist = null;
        } else {
          // Obstacle moves slightly or gets closer as rover drives
          dist = Math.max(3, Math.round((dist - 0.4 + (Math.random() * 0.3 - 0.15)) * 10) / 10);
        }
      }
    }

    // 3. Determine Risk Level
    // Rule: visibility < 15 -> HIGH, < 40 -> MEDIUM, else LOW
    let computedRisk = 'LOW';
    if (computedVisibility < 15) {
      computedRisk = 'HIGH';
    } else if (computedVisibility < 40) {
      computedRisk = 'MEDIUM';
    }

    // Obstacle presence or proximity escalates risk
    if (isObstacle && dist !== null && dist < 18) {
      computedRisk = 'HIGH';
    }

    // E-STOP override
    if (state.eStop) {
      computedRisk = 'HIGH';
    }

    // 4. Calculate Recommended Speed Limit
    let recLimit = 35;
    if (state.eStop) {
      recLimit = 0;
    } else if (computedRisk === 'HIGH') {
      recLimit = 10;
    } else if (computedRisk === 'MEDIUM') {
      recLimit = 22;
    } else {
      recLimit = 35;
    }

    // 5. Vehicle Speed calculation (converges toward limit with realistic jitter)
    let currentSpeed = state.speed;
    if (state.eStop) {
      currentSpeed = 0;
    } else {
      const speedDiff = recLimit - currentSpeed;
      currentSpeed += speedDiff * 0.35 + ((Math.random() * 1.2) - 0.6);
      currentSpeed = Math.max(0, Math.round(currentSpeed * 10) / 10);
    }

    // 6. Convoy Gap and TTC (Time To Collision with trailing haul truck)
    let currentGap = state.gap;
    if (state.eStop) {
      // Emergency braking narrows gap as truck reacts
      currentGap = Math.max(18, Math.round((currentGap - 0.8) * 10) / 10);
    } else {
      currentGap = Math.round((36 + (Math.random() * 4 - 2)) * 10) / 10;
    }

    // TTC = Gap / relative velocity or safe headway calculation
    const truckSpeed = currentSpeed + ((Math.random() * 1.0) - 0.5);
    const relSpeed = Math.abs(truckSpeed - currentSpeed) + 4.5;
    const computedTtc = Math.max(1.8, Math.round((currentGap / relSpeed) * 10) / 10);

    // 7. GPS progression along haul road (Bailadila Deposit 5 downhaul)
    const latIncrement = (currentSpeed / 3600) * 0.0001;
    const newLat = Math.round((state.gps.lat + latIncrement) * 10000) / 10000;
    const newLng = Math.round((state.gps.lng + (latIncrement * 0.4)) * 10000) / 10000;

    // 8. Battery consumption
    const newBattery = Math.max(12, Math.round((state.battery - 0.005) * 100) / 100);

    return {
      fogDensity: fogValue,
      visibility: computedVisibility,
      speed: currentSpeed,
      speedLimit: recLimit,
      riskLevel: computedRisk,
      obstacleActive: isObstacle,
      obstacleDist: dist,
      obstacleX: xOffset,
      gps: {
        lat: newLat,
        lng: newLng,
        alt: 1182
      },
      battery: newBattery,
      gap: currentGap,
      ttc: computedTtc,
      eStop: state.eStop
    };
  }

  // =========================================================================
  // 6. EVENT LOGGING (STRICT STATE-CHANGE ONLY)
  // =========================================================================
  function addLogEntry(tag, message) {
    if (!eventLogStream) return;

    const now = new Date();
    const timeStr = now.toTimeString().split(' ')[0];

    const entry = document.createElement('div');
    entry.className = 'log-entry';

    let tagClass = 'is-info';
    if (tag === 'WARN') tagClass = 'is-warn';
    if (tag === 'CRITICAL' || tag === 'E-STOP') tagClass = 'is-critical';

    entry.innerHTML = `
      <span class="log-entry__time">[${timeStr}]</span>
      <span class="log-entry__tag ${tagClass}">${escapeHtml(tag)}</span>
      <span class="log-entry__text">${escapeHtml(message)}</span>
    `;

    // Prepend (newest on top)
    eventLogStream.insertBefore(entry, eventLogStream.firstChild);

    // Cap at 60 entries
    if (eventLogStream.children.length > 60) {
      eventLogStream.removeChild(eventLogStream.lastChild);
    }
  }

  function checkAndLogStateChanges(curr) {
    // 1. E-STOP change
    if (lastLoggedState.eStop !== null && lastLoggedState.eStop !== curr.eStop) {
      if (curr.eStop) {
        addLogEntry('CRITICAL', 'EMERGENCY STOP ACTIVATED. Convoy halt broadcast to Haul Truck #04.');
      } else {
        addLogEntry('INFO', 'E-STOP reset by operator. Autonomous pilot escort resumed.');
      }
    }

    // 2. Risk Level change
    if (lastLoggedState.riskLevel !== null && lastLoggedState.riskLevel !== curr.riskLevel) {
      const tag = curr.riskLevel === 'HIGH' ? 'CRITICAL' : (curr.riskLevel === 'MEDIUM' ? 'WARN' : 'INFO');
      addLogEntry(tag, `Site risk transition: ${lastLoggedState.riskLevel} -> ${curr.riskLevel} (Visibility: ${curr.visibility}m).`);
    }

    // 3. Obstacle detected or cleared
    if (lastLoggedState.obstacleActive !== null && lastLoggedState.obstacleActive !== curr.obstacleActive) {
      if (curr.obstacleActive) {
        addLogEntry('WARN', `LiDAR detected forward obstacle at ${curr.obstacleDist}m (Sector 3B). Adjusting safe headway.`);
      } else {
        addLogEntry('INFO', 'Forward road obstacle cleared. Pilot corridor open.');
      }
    }

    // 4. Speed limit adjusted
    if (lastLoggedState.speedLimit !== null && lastLoggedState.speedLimit !== curr.speedLimit && !curr.eStop) {
      addLogEntry('INFO', `Speed governor updated: max recommended speed set to ${curr.speedLimit} km/h.`);
    }

    // Update last logged state snapshot
    lastLoggedState.riskLevel = curr.riskLevel;
    lastLoggedState.obstacleActive = curr.obstacleActive;
    lastLoggedState.eStop = curr.eStop;
    lastLoggedState.speedLimit = curr.speedLimit;
  }

  // Clear log button
  if (btnClearLog) {
    btnClearLog.addEventListener('click', function () {
      if (eventLogStream) {
        eventLogStream.innerHTML = '';
        addLogEntry('INFO', 'Event log cleared by operator.');
      }
    });
  }

  // =========================================================================
  // 7. RENDER FUNCTIONS
  // =========================================================================
  function updateUI() {
    // Top Bar Fog
    if (fogValBadge) fogValBadge.textContent = `${state.fogDensity}%`;

    // KPI Strip
    if (kpiVisibility) kpiVisibility.textContent = state.visibility;
    if (kpiRiskBadge) {
      kpiRiskBadge.textContent = state.riskLevel;
      kpiRiskBadge.className = `risk-badge is-${state.riskLevel.toLowerCase()}`;
    }

    // AI Risk Engine Card
    if (inputSpeed) inputSpeed.textContent = `${state.speed} km/h`;
    if (inputFog) inputFog.textContent = `${state.fogDensity}%`;
    if (inputCamera) {
      inputCamera.textContent = state.fogDensity > 50 ? 'DEGRADED (Optical Fog)' : 'NOMINAL (Thermal Ready)';
      inputCamera.style.color = state.fogDensity > 50 ? 'var(--amber)' : 'var(--cyan)';
    }
    if (inputLidarObstacle) {
      if (state.obstacleActive && state.obstacleDist !== null) {
        inputLidarObstacle.textContent = `ALERT: ${state.obstacleDist}m`;
        inputLidarObstacle.classList.add('is-active');
      } else {
        inputLidarObstacle.textContent = 'CLEAR (>30m)';
        inputLidarObstacle.classList.remove('is-active');
      }
    }

    // Risk Meter Bar
    if (riskBarFill) {
      let percent = 25;
      if (state.riskLevel === 'MEDIUM') percent = 60;
      if (state.riskLevel === 'HIGH') percent = 95;
      riskBarFill.style.width = `${percent}%`;
    }

    // Risk Engine Badge
    if (riskEngineBadge) {
      riskEngineBadge.textContent = state.riskLevel;
      riskEngineBadge.className = `risk-badge is-${state.riskLevel.toLowerCase()}`;
    }

    // Recommended Speed
    if (recSpeedVal) {
      recSpeedVal.innerHTML = `${state.speedLimit} <span>km/h MAX</span>`;
    }

    // Safety Advisory
    if (safetyAdvisoryText) {
      if (state.eStop) {
        safetyAdvisoryText.textContent = 'CRITICAL: Autonomous Escort Suspended via Emergency Stop. All drive motors locked.';
      } else if (state.riskLevel === 'HIGH') {
        safetyAdvisoryText.textContent = 'HIGH RISK: Severe fog limit reached. Pilot rover escort speed restricted to 10 km/h. Haul truck trailing brake primed.';
      } else if (state.riskLevel === 'MEDIUM') {
        safetyAdvisoryText.textContent = 'MODERATE RISK: Atmospheric scattering active. Maintain 35m minimum convoy spacing. Speed governed to 22 km/h.';
      } else {
        safetyAdvisoryText.textContent = 'LOW RISK: Forward path clear. LiDAR scans verify unobstructed roadway within 40m safe corridor.';
      }
    }

    // Telemetry Card
    if (telemGps) telemGps.textContent = `${state.gps.lat.toFixed(4)}° N, ${state.gps.lng.toFixed(4)}° E`;
    if (telemAlt) telemAlt.textContent = `${state.gps.alt} m ASL`;
    if (telemSpeed) telemSpeed.textContent = `${state.speed} km/h (Limit: ${state.speedLimit})`;
    if (telemBatteryVal) telemBatteryVal.textContent = `${state.battery.toFixed(1)}% (48.4V)`;
    if (telemBatteryFill) telemBatteryFill.style.width = `${state.battery}%`;
    if (telemStatus) {
      if (state.eStop) {
        telemStatus.textContent = 'EMERGENCY STOPPED';
        telemStatus.style.color = 'var(--danger)';
      } else {
        telemStatus.textContent = 'AUTONOMOUS ESCORTING';
        telemStatus.style.color = 'var(--green)';
      }
    }

    // Map Readouts
    if (mapGapReadout) mapGapReadout.textContent = `${state.gap} m`;
    if (mapTtcReadout) {
      mapTtcReadout.textContent = `${state.ttc} s`;
      mapTtcReadout.style.color = state.ttc < 3.0 ? 'var(--danger)' : 'var(--cyan)';
    }

    // Mini HUD
    if (hudVisibility) hudVisibility.textContent = `${state.visibility}m`;
    if (hudSpeed) hudSpeed.textContent = `${state.speed} km/h`;
    if (hudObstacle) {
      hudObstacle.textContent = state.obstacleActive ? `${state.obstacleDist}m` : 'Clear';
      hudObstacle.style.color = state.obstacleActive ? 'var(--danger)' : 'var(--cyan)';
    }
    if (hudRisk) {
      hudRisk.textContent = state.riskLevel;
      hudRisk.className = `mini-stat__val is-risk-${state.riskLevel.toLowerCase()}`;
    }
    if (hudDot) {
      hudDot.style.background = state.eStop ? 'var(--danger)' : (state.riskLevel === 'HIGH' ? 'var(--danger)' : (state.riskLevel === 'MEDIUM' ? 'var(--amber)' : 'var(--green)'));
      hudDot.style.boxShadow = `0 0 10px ${hudDot.style.background}`;
    }
  }

  // =========================================================================
  // 8. LIDAR CANVAS SCATTER PLOT RENDERER
  // =========================================================================
  function renderLidar() {
    if (!lidarCanvas || !lidarCtx) return;

    const width = lidarCanvas.width;
    const height = lidarCanvas.height;
    const centerX = width / 2;
    const centerY = height / 2;

    // Scale: 20 meters mapped to ~85% of half-canvas
    const maxMeters = 20;
    const meterScale = (Math.min(centerX, centerY) * 0.85) / maxMeters;

    // Clear canvas
    lidarCtx.clearRect(0, 0, width, height);

    // 1. Draw Radar Grid & Range Rings
    const rings = [5, 10, 15, 20];
    lidarCtx.lineWidth = 1;
    rings.forEach((r) => {
      const radiusPx = r * meterScale;
      lidarCtx.strokeStyle = 'rgba(56, 189, 248, 0.12)';
      lidarCtx.beginPath();
      lidarCtx.arc(centerX, centerY, radiusPx, 0, Math.PI * 2);
      lidarCtx.stroke();

      // Range labels
      lidarCtx.fillStyle = 'rgba(148, 163, 184, 0.5)';
      lidarCtx.font = '10px "JetBrains Mono", monospace';
      lidarCtx.fillText(`${r}m`, centerX + 4, centerY - radiusPx + 11);
    });

    // Crosshairs
    lidarCtx.strokeStyle = 'rgba(56, 189, 248, 0.15)';
    lidarCtx.beginPath();
    lidarCtx.moveTo(centerX, centerY - maxMeters * meterScale - 10);
    lidarCtx.lineTo(centerX, centerY + maxMeters * meterScale + 10);
    lidarCtx.moveTo(centerX - maxMeters * meterScale - 10, centerY);
    lidarCtx.lineTo(centerX + maxMeters * meterScale + 10, centerY);
    lidarCtx.stroke();

    // North (Forward) indicator
    lidarCtx.fillStyle = 'rgba(241, 104, 42, 0.8)';
    lidarCtx.font = 'bold 11px "JetBrains Mono", monospace';
    lidarCtx.fillText('▲ FORWARD (HAUL ROAD)', centerX - 62, centerY - (maxMeters * meterScale) - 8);

    // 2. Render Point Cloud with Visibility Fade Cutoff
    const visCutoff = state.visibility;

    for (let i = 0; i < scanPoints.length; i++) {
      const pt = scanPoints[i];
      // Point coordinates in meters (0,0 is rover)
      // Positive y is forward (drawn upward: centerY - pt.y * scale)
      const px = centerX + (pt.x * meterScale);
      const py = centerY - (pt.y * meterScale);

      const dist = Math.sqrt(pt.x * pt.x + pt.y * pt.y);

      // Points beyond visibility range fade out or do not render
      if (dist > visCutoff) {
        continue; // invisible due to dense fog
      }

      // Proximity fade: points closer to visibility cutoff fade smoothly
      const visibilityRatio = dist / visCutoff;
      const alpha = Math.max(0.12, 1 - Math.pow(visibilityRatio, 2));

      // Color coding: cyan with alpha
      lidarCtx.fillStyle = `rgba(56, 189, 248, ${alpha.toFixed(2)})`;
      lidarCtx.fillRect(px - 1, py - 1, 2.2, 2.2);
    }

    // 3. Render Synthetic Obstacle Marker if Active
    if (state.obstacleActive && state.obstacleDist !== null && state.obstacleDist <= maxMeters) {
      const obsPx = centerX + (state.obstacleX * meterScale);
      const obsPy = centerY - (state.obstacleDist * meterScale);

      // Warning circle around obstacle
      const pulseTime = Date.now() / 200;
      const pulseRadius = 10 + Math.sin(pulseTime) * 3;

      lidarCtx.strokeStyle = 'rgba(239, 68, 68, 0.85)';
      lidarCtx.lineWidth = 2;
      lidarCtx.beginPath();
      lidarCtx.arc(obsPx, obsPy, pulseRadius, 0, Math.PI * 2);
      lidarCtx.stroke();

      // Filled warning marker
      lidarCtx.fillStyle = '#EF4444';
      lidarCtx.beginPath();
      lidarCtx.arc(obsPx, obsPy, 5, 0, Math.PI * 2);
      lidarCtx.fill();

      // Obstacle Label
      lidarCtx.fillStyle = '#F87171';
      lidarCtx.font = 'bold 11px "JetBrains Mono", monospace';
      lidarCtx.fillText(`▲ OBSTACLE: ${state.obstacleDist}m`, obsPx + 14, obsPy + 4);
    }

    // 4. Center Rover Marker at (0,0)
    lidarCtx.save();
    lidarCtx.translate(centerX, centerY);

    // Forward light cone
    const grad = lidarCtx.createRadialGradient(0, 0, 2, 0, -40, 60);
    grad.addColorStop(0, 'rgba(241, 104, 42, 0.35)');
    grad.addColorStop(1, 'rgba(241, 104, 42, 0)');
    lidarCtx.fillStyle = grad;
    lidarCtx.beginPath();
    lidarCtx.moveTo(0, 0);
    lidarCtx.arc(0, 0, 50, -Math.PI / 2 - 0.4, -Math.PI / 2 + 0.4);
    lidarCtx.closePath();
    lidarCtx.fill();

    // Rover body (chevron)
    lidarCtx.fillStyle = '#F1682A';
    lidarCtx.beginPath();
    lidarCtx.moveTo(0, -9);
    lidarCtx.lineTo(7, 7);
    lidarCtx.lineTo(0, 3);
    lidarCtx.lineTo(-7, 7);
    lidarCtx.closePath();
    lidarCtx.fill();

    lidarCtx.strokeStyle = '#FFFFFF';
    lidarCtx.lineWidth = 1.5;
    lidarCtx.stroke();

    lidarCtx.restore();
  }

  // =========================================================================
  // 9. CONVOY MAP VIEW CANVAS RENDERER
  // =========================================================================
  function renderMap() {
    if (!mapCanvas || !mapCtx) return;

    const w = mapCanvas.width;
    const h = mapCanvas.height;

    mapCtx.clearRect(0, 0, w, h);

    // Draw Mine Haul Road Corridor
    const roadTopY = h * 0.3;
    const roadBottomY = h * 0.7;

    // Road surface
    mapCtx.fillStyle = 'rgba(15, 23, 42, 0.9)';
    mapCtx.fillRect(0, roadTopY, w, roadBottomY - roadTopY);

    // Road borders
    mapCtx.strokeStyle = 'rgba(248, 250, 252, 0.15)';
    mapCtx.lineWidth = 2;
    mapCtx.beginPath();
    mapCtx.moveTo(0, roadTopY);
    mapCtx.lineTo(w, roadTopY);
    mapCtx.moveTo(0, roadBottomY);
    mapCtx.lineTo(w, roadBottomY);
    mapCtx.stroke();

    // Dashed center road lane
    mapCtx.strokeStyle = 'rgba(248, 250, 252, 0.08)';
    mapCtx.setLineDash([8, 8]);
    mapCtx.beginPath();
    mapCtx.moveTo(0, h * 0.5);
    mapCtx.lineTo(w, h * 0.5);
    mapCtx.stroke();
    mapCtx.setLineDash([]);

    // Vehicles: Rover leads at right, Haul Truck follows at left
    const roverX = w * 0.72;
    const roverY = h * 0.5;

    // Truck position based on convoy gap
    const gapPx = Math.max(100, Math.min(240, state.gap * 3.8));
    const truckX = roverX - gapPx;
    const truckY = h * 0.5;

    // Convoy Tether (dashed connecting line)
    mapCtx.strokeStyle = state.ttc < 3.0 ? 'rgba(239, 68, 68, 0.8)' : 'rgba(56, 189, 248, 0.6)';
    mapCtx.lineWidth = 2;
    mapCtx.setLineDash([5, 5]);
    mapCtx.beginPath();
    mapCtx.moveTo(truckX + 16, truckY);
    mapCtx.lineTo(roverX - 12, roverY);
    mapCtx.stroke();
    mapCtx.setLineDash([]);

    // Convoy Gap Label over line
    const midX = (truckX + roverX) / 2;
    mapCtx.fillStyle = '#CBD5E1';
    mapCtx.font = '10px "JetBrains Mono", monospace';
    mapCtx.textAlign = 'center';
    mapCtx.fillText(`${state.gap}m // TTC ${state.ttc}s`, midX, roverY - 14);

    // Draw Trailing Haul Truck (CAT 777D)
    mapCtx.fillStyle = '#1E293B';
    mapCtx.strokeStyle = '#38BDF8';
    mapCtx.lineWidth = 2;
    mapCtx.strokeRect(truckX - 18, truckY - 14, 36, 28);
    mapCtx.fillRect(truckX - 18, truckY - 14, 36, 28);

    mapCtx.fillStyle = '#38BDF8';
    mapCtx.font = 'bold 9px "JetBrains Mono", monospace';
    mapCtx.fillText('CAT 777D', truckX, truckY + 3);

    // Draw Leading Pilot Rover
    mapCtx.fillStyle = '#F1682A';
    mapCtx.strokeStyle = '#FFFFFF';
    mapCtx.lineWidth = 1.5;
    mapCtx.beginPath();
    mapCtx.arc(roverX, roverY, 9, 0, Math.PI * 2);
    mapCtx.fill();
    mapCtx.stroke();

    // Directional beam ahead of rover
    mapCtx.fillStyle = 'rgba(241, 104, 42, 0.2)';
    mapCtx.beginPath();
    mapCtx.moveTo(roverX, roverY);
    mapCtx.lineTo(roverX + 45, roverY - 20);
    mapCtx.lineTo(roverX + 45, roverY + 20);
    mapCtx.closePath();
    mapCtx.fill();

    mapCtx.fillStyle = '#F1682A';
    mapCtx.font = 'bold 9px "JetBrains Mono", monospace';
    mapCtx.fillText('ROVER-1', roverX, roverY + 22);

    mapCtx.textAlign = 'start';
  }

  // =========================================================================
  // 10. TICK LOOP (INTERVAL ~1s)
  // =========================================================================
  function tick() {
    const currentFogValue = parseInt(fogSlider ? fogSlider.value : 35, 10);
    
    // Acquire new telemetry from simulated source
    const newTelemetry = getTelemetry(currentFogValue);

    // Update state object
    Object.assign(state, newTelemetry);

    // Check for state changes & record to event log
    checkAndLogStateChanges(state);

    // Update all visual components
    updateUI();
    renderLidar();
    renderMap();
  }

  // =========================================================================
  // 11. INTERACTION LISTENERS (FOG SLIDER, E-STOP)
  // =========================================================================
  if (fogSlider) {
    fogSlider.addEventListener('input', function () {
      state.fogDensity = parseInt(this.value, 10);
      tick();
    });
  }

  if (btnEstop) {
    btnEstop.addEventListener('click', function () {
      state.eStop = !state.eStop;

      if (state.eStop) {
        btnEstop.classList.add('is-active');
        if (estopText) estopText.textContent = 'RESET E-STOP';
        state.speed = 0;
        state.speedLimit = 0;
        state.riskLevel = 'HIGH';
      } else {
        btnEstop.classList.remove('is-active');
        if (estopText) estopText.textContent = 'EMERGENCY STOP';
      }

      tick();
    });
  }

  // Helper string escape
  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // =========================================================================
  // 12. INITIALIZATION
  // =========================================================================
  // Boot event log entries
  addLogEntry('INFO', 'FogBot Command Center initialized. Active link: Rover-1.');
  addLogEntry('INFO', 'Connected to Haul Truck CAT 777D #04 (Bailadila Mine Sector 3B).');
  addLogEntry('INFO', 'Atmospheric scatter model & telemetry daemon online.');

  // Load LiDAR points and kick off loop
  loadLidarPoints();
  tick();

  // Run periodic tick (~1s)
  setInterval(tick, 1000);

})();

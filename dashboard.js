/**
 * FogBot Command Center — dashboard.js
 * Real-time WebSocket Telemetry Supervisor & Role-Based Access Control (RBAC) Engine.
 * Supports Admin, Operator, Field Worker (In-Cab HUD), and Guest (Judge-Safe) roles.
 */

(function () {
  'use strict';

  // =========================================================================
  // 1. AUTHENTICATION & ROLE RESOLUTION
  // =========================================================================
  const authSession = sessionStorage.getItem('fogbot_session');
  if (!authSession) {
    window.location.replace('login.html?redirect=dashboard.html');
    return;
  }

  let sessionUser = 'admin';
  let sessionRole = 'admin';
  let sessionFullName = 'Chief Systems Engineer';
  let sessionToken = '';

  try {
    const sessionData = JSON.parse(authSession);
    if (!sessionData.authenticated) {
      window.location.replace('login.html?redirect=dashboard.html');
      return;
    }
    if (sessionData.userId) sessionUser = sessionData.userId;
    if (sessionData.role) sessionRole = sessionData.role;
    if (sessionData.fullName) sessionFullName = sessionData.fullName;
    if (sessionData.token) sessionToken = sessionData.token;
  } catch (e) {
    window.location.replace('login.html?redirect=dashboard.html');
    return;
  }

  // Current active persona
  let currentRole = sessionRole || 'operator';

  // =========================================================================
  // 2. DOM REFERENCES
  // =========================================================================
  const fogSlider = document.getElementById('fogSlider');
  const fogValBadge = document.getElementById('fogValBadge');
  const btnEstop = document.getElementById('btnEstop');
  const estopText = document.getElementById('estopText');
  const logoutBtn = document.getElementById('logoutBtn');
  const operatorName = document.getElementById('operatorName');
  const roleBadge = document.getElementById('roleBadge');
  const roleSwitchSelect = document.getElementById('roleSwitchSelect');
  const roleNoticeBanner = document.getElementById('roleNoticeBanner');

  // Sections
  const kpiStripSection = document.getElementById('kpiStripSection');
  const mainGridSection = document.getElementById('mainGridSection');
  const middleGridSection = document.getElementById('middleGridSection');
  const eventLogSection = document.getElementById('eventLogSection');
  const driverCabHud = document.getElementById('driverCabHud');

  // Field Worker Cab HUD elements
  const cabDecisionBanner = document.getElementById('cabDecisionBanner');
  const cabDecisionIcon = document.getElementById('cabDecisionIcon');
  const cabDecisionTitle = document.getElementById('cabDecisionTitle');
  const cabHazardAlert = document.getElementById('cabHazardAlert');
  const cabSpeedLimit = document.getElementById('cabSpeedLimit');
  const cabCurrentSpeed = document.getElementById('cabCurrentSpeed');
  const cabConvoyGap = document.getElementById('cabConvoyGap');
  const cabTtc = document.getElementById('cabTtc');
  const cabRoverStatus = document.getElementById('cabRoverStatus');

  // KPI elements
  const kpiVisibility = document.getElementById('kpiVisibility');
  const kpiRiskBadge = document.getElementById('kpiRiskBadge');

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

  // Set initial operator display name
  if (operatorName) operatorName.textContent = sessionUser;

  // Logout listener
  if (logoutBtn) {
    logoutBtn.addEventListener('click', function () {
      sessionStorage.removeItem('fogbot_session');
      window.location.href = 'login.html';
    });
  }

  // =========================================================================
  // 3. MASTER STATE OBJECT
  // =========================================================================
  const state = {
    role: currentRole,
    fogDensity: 14,
    visibility: 38,
    speed: 24.5,
    speedLimit: 25,
    riskLevel: 'LOW',
    obstacleActive: false,
    obstacleDist: null,
    obstacleX: 0,
    gps: { lat: 18.7052, lng: 81.2384, alt: 1182 },
    battery: 84.2,
    gap: 38.5,
    ttc: 5.6,
    eStop: false,
    status: 'AUTONOMOUS ESCORTING',
    hazardAlert: 'PILOT CORRIDOR CLEAR',
    cameraConfidence: 86,
    lidarConfidence: 94
  };

  // State tracker for event logging
  let lastLoggedState = {
    riskLevel: null,
    obstacleActive: null,
    eStop: null,
    speedLimit: null
  };

  // 1,500 LiDAR points (only populated if backend transmits them to permitted role)
  let scanPoints = [];

  // =========================================================================
  // 4. ROLE-BASED UI GATING & LAYOUT SWITCHER
  // =========================================================================
  function applyRoleLayout(role) {
    currentRole = role;
    state.role = role;
    document.body.setAttribute('data-role', role);

    // Update Role Switcher select value if present
    if (roleSwitchSelect) {
      roleSwitchSelect.value = role;
    }

    // 1. Configure Header Role Badge
    if (roleBadge) {
      roleBadge.className = `role-pill-badge role-badge--${role}`;
      switch (role) {
        case 'admin':
          roleBadge.innerHTML = '🛡️ ADMIN <span class="role-sub">Full Access</span>';
          break;
        case 'operator':
          roleBadge.innerHTML = '🎛️ OPERATOR <span class="role-sub">Dispatch</span>';
          break;
        case 'field_worker':
          roleBadge.innerHTML = '👷 FIELD WORKER <span class="role-sub">Driver HUD</span>';
          break;
        case 'guest':
          roleBadge.innerHTML = '👁️ GUEST / JUDGE <span class="role-sub">Safe View</span>';
          break;
      }
    }

    // 2. Role Notice Banner
    if (roleNoticeBanner) {
      if (role === 'field_worker') {
        roleNoticeBanner.style.display = 'flex';
        roleNoticeBanner.className = 'role-notice-banner is-worker';
        roleNoticeBanner.innerHTML = `
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
          <span><strong>HAUL TRUCK IN-CAB MODE:</strong> Showing streamlined safety decisions, headway gap, and speed regulation. Raw 1,500-point LiDAR point clouds and AI formula internals are filtered on the backend to eliminate in-motion cab distractions.</span>
        `;
      } else if (role === 'guest') {
        roleNoticeBanner.style.display = 'flex';
        roleNoticeBanner.className = 'role-notice-banner is-guest';
        roleNoticeBanner.innerHTML = `
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
          <span><strong>SIH 2026 JUDGE / AUDITOR VIEW:</strong> Executive monitoring mode. High-level telemetry and 3D twin parameters are fully visible, while remote E-STOP and fog actuation are safely locked to prevent accidental operational halts during evaluation.</span>
        `;
      } else {
        roleNoticeBanner.style.display = 'none';
      }
    }

    // 3. Section Visibility & Layout Transforms
    if (role === 'field_worker') {
      // Show Cab HUD prominently
      if (driverCabHud) driverCabHud.style.display = 'block';
      // Hide raw LiDAR canvas & AI math risk engine
      if (mainGridSection) mainGridSection.style.display = 'none';
      // Keep convoy map & telemetry, hide raw event logs
      if (eventLogSection) eventLogSection.style.display = 'none';
      if (middleGridSection) middleGridSection.style.display = 'grid';
      if (kpiStripSection) kpiStripSection.style.display = 'grid';

      // Actuator Gating
      if (btnEstop) {
        btnEstop.disabled = true;
        btnEstop.classList.add('is-disabled');
        btnEstop.title = 'Remote E-Stop restricted to Central Dispatch. In-cab braking armed.';
        if (estopText) estopText.textContent = 'E-STOP (CAB ARMED)';
      }
      if (fogSlider) {
        fogSlider.disabled = true;
        fogSlider.title = 'Environmental simulation restricted to Dispatch/Admin.';
      }
    } else if (role === 'guest') {
      // Guest / Judge Safe View
      if (driverCabHud) driverCabHud.style.display = 'none';
      if (mainGridSection) mainGridSection.style.display = 'grid';
      if (middleGridSection) middleGridSection.style.display = 'grid';
      if (eventLogSection) eventLogSection.style.display = 'block';
      if (kpiStripSection) kpiStripSection.style.display = 'grid';

      // Lock actuation controls in Read-Only Demo Safe Mode
      if (btnEstop) {
        btnEstop.disabled = true;
        btnEstop.classList.add('is-disabled');
        btnEstop.title = 'Emergency Stop locked in Guest / Judge demonstration mode.';
        if (estopText) estopText.textContent = 'E-STOP (VIEW ONLY)';
      }
      if (fogSlider) {
        fogSlider.disabled = false; // Allow judges to play with fog slider to test adaptive speed response
        fogSlider.title = 'Judge Interactive Fog Sandbox: Drag to observe real-time AI speed throttle.';
      }
      if (btnClearLog) btnClearLog.style.display = 'none';
    } else {
      // Admin & Operator
      if (driverCabHud) driverCabHud.style.display = 'none';
      if (mainGridSection) mainGridSection.style.display = 'grid';
      if (middleGridSection) middleGridSection.style.display = 'grid';
      if (eventLogSection) eventLogSection.style.display = 'block';
      if (kpiStripSection) kpiStripSection.style.display = 'grid';

      if (btnEstop) {
        btnEstop.disabled = false;
        btnEstop.classList.remove('is-disabled');
        btnEstop.title = 'Emergency Stop (Active Dispatch Control)';
        if (estopText) estopText.textContent = state.eStop ? 'RESET E-STOP' : 'EMERGENCY STOP';
      }
      if (fogSlider) {
        fogSlider.disabled = false;
        fogSlider.title = 'Simulate atmospheric fog density';
      }
      if (btnClearLog) btnClearLog.style.display = 'block';
    }

    updateUI();
  }

  // =========================================================================
  // 5. WEBSOCKET REAL-TIME CLIENT (WITH JWT AUTHENTICATION)
  // =========================================================================
  let ws = null;
  let wsReconnectTimer = null;

  function initWebSocket() {
    clearTimeout(wsReconnectTimer);

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const wsUrl = `${protocol}//${host}?token=${encodeURIComponent(sessionToken)}`;

    try {
      ws = new WebSocket(wsUrl);

      ws.onopen = function () {
        console.log(`[WebSocket] Connected successfully as ${sessionUser} (${currentRole})`);
        addLogEntry('INFO', `Live telemetry stream connected via WebSocket [Role: ${currentRole.toUpperCase()}].`);
      };

      ws.onmessage = function (event) {
        try {
          const message = JSON.parse(event.data);

          if (message.type === 'TELEMETRY_UPDATE') {
            const data = message.data;

            // Merge received backend-sliced data into state
            if (data) {
              if (data.role) state.role = data.role;
              if (typeof data.fogDensity === 'number') state.fogDensity = data.fogDensity;
              if (typeof data.visibility === 'number') state.visibility = data.visibility;
              if (typeof data.speed === 'number') state.speed = data.speed;
              if (typeof data.speedLimit === 'number') state.speedLimit = data.speedLimit;
              if (data.riskLevel) state.riskLevel = data.riskLevel;
              if (data.decision) state.riskLevel = data.decision;
              if (typeof data.eStop === 'boolean') state.eStop = data.eStop;
              if (typeof data.gap === 'number') state.gap = data.gap;
              if (typeof data.convoyGap === 'number') state.gap = data.convoyGap;
              if (typeof data.ttc === 'number') state.ttc = data.ttc;
              if (data.status) state.status = data.status;
              if (data.hazardAlert) state.hazardAlert = data.hazardAlert;
              if (data.gps) state.gps = data.gps;
              if (typeof data.battery === 'number') state.battery = data.battery;

              // Scan points: only populated if backend provided them (Admin/Operator)
              if (Array.isArray(data.scanPoints)) {
                scanPoints = data.scanPoints;
              } else if (currentRole === 'field_worker' || currentRole === 'guest') {
                scanPoints = []; // backend strictly redacted points!
              }

              // Check for state changes & log
              checkAndLogStateChanges(state);

              // Update visuals
              updateUI();
              renderLidar();
              renderMap();
            }
          }

          if (message.type === 'ROLE_SWITCHED') {
            addLogEntry('INFO', `Switched simulated view to: ${message.role.toUpperCase()}`);
            if (message.data) {
              Object.assign(state, message.data);
              updateUI();
              renderLidar();
              renderMap();
            }
          }

          if (message.type === 'ACTION_REJECTED') {
            addLogEntry('CRITICAL', `ACCESS DENIED: ${message.error}`);
            alert(message.error);
          }

        } catch (e) {
          console.warn('[WebSocket] Error processing message:', e.message);
        }
      };

      ws.onclose = function () {
        console.warn('[WebSocket] Connection closed. Attempting reconnect in 3s...');
        wsReconnectTimer = setTimeout(initWebSocket, 3000);
      };

      ws.onerror = function (err) {
        console.warn('[WebSocket Error]:', err);
      };

    } catch (e) {
      console.warn('[WebSocket Init Error]:', e);
      wsReconnectTimer = setTimeout(initWebSocket, 3000);
    }
  }

  // =========================================================================
  // 6. ACTUATION HANDLERS (RBAC PROTECTED)
  // =========================================================================
  function handleEstopClick() {
    // Only Admin & Operator have actuation authority
    if (currentRole !== 'admin' && currentRole !== 'operator') {
      alert(`Access Forbidden: Only Admin and Operator roles can trigger Emergency Stop. Your current role is '${currentRole}'.`);
      return;
    }

    state.eStop = !state.eStop;

    // Send action over WebSocket if open
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ action: 'ESTOP' }));
    } else {
      // Fallback REST call with JWT Bearer
      fetch('/api/telemetry/estop', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${sessionToken}`
        }
      }).catch((err) => console.warn('[E-Stop REST Error]:', err));
    }

    updateUI();
  }

  function handleFogSliderChange(e) {
    const val = Math.max(0, Math.min(100, parseInt(e.target.value, 10) || 0));

    // Field Worker cannot modify fog simulation
    if (currentRole === 'field_worker') {
      return;
    }

    state.fogDensity = val;

    // Send action over WebSocket if open
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ action: 'SET_FOG', value: val }));
    } else {
      // Fallback REST call with JWT Bearer
      fetch('/api/telemetry/fog', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${sessionToken}`
        },
        body: JSON.stringify({ fogDensity: val })
      }).catch((err) => console.warn('[Fog REST Error]:', err));
    }

    updateUI();
  }

  if (btnEstop) {
    btnEstop.addEventListener('click', handleEstopClick);
  }

  if (fogSlider) {
    fogSlider.addEventListener('input', handleFogSliderChange);
    fogSlider.addEventListener('change', handleFogSliderChange);
  }

  // SIH Judge Demo: 1-Click Role Switcher listener
  if (roleSwitchSelect) {
    roleSwitchSelect.value = currentRole;
    roleSwitchSelect.addEventListener('change', function (e) {
      const newRole = e.target.value;
      applyRoleLayout(newRole);

      // Persist in session
      try {
        const s = JSON.parse(sessionStorage.getItem('fogbot_session') || '{}');
        s.role = newRole;
        sessionStorage.setItem('fogbot_session', JSON.stringify(s));
      } catch (err) {}

      // Inform backend via WebSocket
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ action: 'SWITCH_ROLE_DEMO', role: newRole }));
      } else {
        // Fetch new slice via REST
        fetch(`/api/telemetry/live?token=${encodeURIComponent(sessionToken)}`)
          .then((res) => res.json())
          .then((res) => {
            if (res.data) {
              Object.assign(state, res.data);
              updateUI();
              renderLidar();
              renderMap();
            }
          });
      }
    });
  }

  // =========================================================================
  // 7. EVENT LOGGING (ADMIN & OPERATOR ONLY)
  // =========================================================================
  function addLogEntry(tag, message) {
    if (!eventLogStream || currentRole === 'field_worker') return;

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

    eventLogStream.insertBefore(entry, eventLogStream.firstChild);
    if (eventLogStream.children.length > 50) {
      eventLogStream.removeChild(eventLogStream.lastChild);
    }
  }

  function checkAndLogStateChanges(curr) {
    if (currentRole === 'field_worker') return;

    if (lastLoggedState.eStop !== null && lastLoggedState.eStop !== curr.eStop) {
      if (curr.eStop) {
        addLogEntry('CRITICAL', 'EMERGENCY STOP ENGAGED. Convoy halt broadcast to CAT 777D #04.');
      } else {
        addLogEntry('INFO', 'E-STOP reset. Autonomous pilot escorting resumed.');
      }
    }

    if (lastLoggedState.riskLevel !== null && lastLoggedState.riskLevel !== curr.riskLevel) {
      const tag = curr.riskLevel === 'HIGH' ? 'CRITICAL' : (curr.riskLevel === 'MEDIUM' ? 'WARN' : 'INFO');
      addLogEntry(tag, `Risk state transition: ${lastLoggedState.riskLevel} -> ${curr.riskLevel} (Visibility: ${curr.visibility}m).`);
    }

    lastLoggedState.riskLevel = curr.riskLevel;
    lastLoggedState.eStop = curr.eStop;
  }

  if (btnClearLog) {
    btnClearLog.addEventListener('click', function () {
      if (eventLogStream) {
        eventLogStream.innerHTML = '';
        addLogEntry('INFO', 'Event log cleared by operator.');
      }
    });
  }

  // =========================================================================
  // 8. RENDER FUNCTIONS
  // =========================================================================
  function updateUI() {
    // 1. Top Bar Fog Badge & Slider sync
    if (fogValBadge) fogValBadge.textContent = `${state.fogDensity}%`;
    if (fogSlider && document.activeElement !== fogSlider) {
      fogSlider.value = state.fogDensity;
    }

    // 2. E-Stop Button Visual State
    if (btnEstop && (currentRole === 'admin' || currentRole === 'operator')) {
      if (state.eStop) {
        btnEstop.classList.add('is-active');
        if (estopText) estopText.textContent = 'RESET E-STOP';
      } else {
        btnEstop.classList.remove('is-active');
        if (estopText) estopText.textContent = 'EMERGENCY STOP';
      }
    }

    // 3. FIELD WORKER IN-CAB HUD RENDERING
    if (currentRole === 'field_worker') {
      if (cabDecisionBanner) {
        if (state.eStop || state.riskLevel === 'HIGH') {
          cabDecisionBanner.className = 'cab-hud-banner is-danger';
          if (cabDecisionIcon) cabDecisionIcon.textContent = '✕';
          if (cabDecisionTitle) cabDecisionTitle.textContent = state.eStop ? 'EMERGENCY STOP // HALT TRUCK' : 'CRITICAL RISK // BRAKE READY';
        } else if (state.riskLevel === 'MEDIUM') {
          cabDecisionBanner.className = 'cab-hud-banner is-caution';
          if (cabDecisionIcon) cabDecisionIcon.textContent = '▲';
          if (cabDecisionTitle) cabDecisionTitle.textContent = 'CAUTION // REDUCE SPEED';
        } else {
          cabDecisionBanner.className = 'cab-hud-banner is-safe';
          if (cabDecisionIcon) cabDecisionIcon.textContent = '✓';
          if (cabDecisionTitle) cabDecisionTitle.textContent = 'SAFE TO PROCEED';
        }
      }

      if (cabHazardAlert) cabHazardAlert.textContent = state.hazardAlert || (state.obstacleActive ? `OBSTACLE DETECTED AT ${state.obstacleDist}m` : 'PILOT CORRIDOR CLEAR');
      if (cabSpeedLimit) cabSpeedLimit.textContent = state.speedLimit;
      if (cabCurrentSpeed) cabCurrentSpeed.textContent = state.speed.toFixed(1);
      if (cabConvoyGap) cabConvoyGap.textContent = state.gap.toFixed(1);
      if (cabTtc) cabTtc.textContent = `${state.ttc}s`;
      if (cabRoverStatus) {
        cabRoverStatus.textContent = state.eStop ? 'STOPPED' : (state.riskLevel === 'HIGH' ? 'HAZARD HOLD' : 'ESCORTING');
        cabRoverStatus.style.color = state.eStop ? 'var(--danger)' : (state.riskLevel === 'HIGH' ? 'var(--danger)' : (state.riskLevel === 'MEDIUM' ? 'var(--amber)' : 'var(--green)'));
      }
    }

    // 4. KPI STRIP
    if (kpiVisibility) kpiVisibility.textContent = state.visibility;
    if (kpiRiskBadge) {
      kpiRiskBadge.textContent = state.riskLevel;
      kpiRiskBadge.className = `risk-badge is-${state.riskLevel.toLowerCase()}`;
    }

    // 5. AI RISK ENGINE (Admin & Operator & Guest)
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

    if (riskBarFill) {
      let percent = 25;
      if (state.riskLevel === 'MEDIUM') percent = 60;
      if (state.riskLevel === 'HIGH') percent = 95;
      riskBarFill.style.width = `${percent}%`;
    }

    if (riskEngineBadge) {
      riskEngineBadge.textContent = state.riskLevel;
      riskEngineBadge.className = `risk-badge is-${state.riskLevel.toLowerCase()}`;
    }

    if (recSpeedVal) {
      recSpeedVal.innerHTML = `${state.speedLimit} <span>km/h MAX</span>`;
    }

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

    // 6. VEHICLE TELEMETRY CARD
    if (telemGps) telemGps.textContent = `${state.gps.lat.toFixed(4)}° N, ${state.gps.lng.toFixed(4)}° E`;
    if (telemAlt) telemAlt.textContent = `${state.gps.alt} m ASL`;
    if (telemSpeed) telemSpeed.textContent = `${state.speed} km/h (Limit: ${state.speedLimit})`;
    if (telemBatteryVal) telemBatteryVal.textContent = `${state.battery.toFixed(1)}% (48.4V)`;
    if (telemBatteryFill) telemBatteryFill.style.width = `${state.battery}%`;
    if (telemStatus) {
      telemStatus.textContent = state.status;
      telemStatus.style.color = state.eStop ? 'var(--danger)' : (state.riskLevel === 'HIGH' ? 'var(--danger)' : 'var(--green)');
    }

    // 7. CONVOY MAP READOUTS
    if (mapGapReadout) mapGapReadout.textContent = `${state.gap} m`;
    if (mapTtcReadout) {
      mapTtcReadout.textContent = `${state.ttc} s`;
      mapTtcReadout.style.color = state.ttc < 3.0 ? 'var(--danger)' : 'var(--cyan)';
    }

    // 8. MINI HUD WIDGET
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
  // 9. LIDAR CANVAS RADAR SCATTER (OMITTED FOR FIELD WORKER)
  // =========================================================================
  function renderLidar() {
    if (!lidarCanvas || !lidarCtx || currentRole === 'field_worker') return;

    const width = lidarCanvas.width;
    const height = lidarCanvas.height;
    const centerX = width / 2;
    const centerY = height / 2;

    const maxMeters = 20;
    const meterScale = (Math.min(centerX, centerY) * 0.85) / maxMeters;

    lidarCtx.clearRect(0, 0, width, height);

    // 1. Radar Grid & Range Rings
    const rings = [5, 10, 15, 20];
    lidarCtx.lineWidth = 1;
    rings.forEach((r) => {
      const radiusPx = r * meterScale;
      lidarCtx.strokeStyle = 'rgba(56, 189, 248, 0.12)';
      lidarCtx.beginPath();
      lidarCtx.arc(centerX, centerY, radiusPx, 0, Math.PI * 2);
      lidarCtx.stroke();

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

    // Forward direction indicator
    lidarCtx.fillStyle = 'rgba(241, 104, 42, 0.8)';
    lidarCtx.font = 'bold 11px "JetBrains Mono", monospace';
    lidarCtx.fillText('▲ FORWARD (HAUL ROAD)', centerX - 62, centerY - (maxMeters * meterScale) - 8);

    // 2. Render Point Cloud with Visibility Fade Cutoff
    const visCutoff = state.visibility;

    for (let i = 0; i < scanPoints.length; i++) {
      const pt = scanPoints[i];
      const px = centerX + (pt.x * meterScale);
      const py = centerY - (pt.y * meterScale);
      const dist = Math.sqrt(pt.x * pt.x + pt.y * pt.y);

      if (dist > visCutoff) continue;

      const visibilityRatio = dist / visCutoff;
      const alpha = Math.max(0.12, 1 - Math.pow(visibilityRatio, 2));

      lidarCtx.fillStyle = `rgba(56, 189, 248, ${alpha.toFixed(2)})`;
      lidarCtx.fillRect(px - 1, py - 1, 2.2, 2.2);
    }

    // 3. Render Synthetic Obstacle Marker if Active
    if (state.obstacleActive && state.obstacleDist !== null && state.obstacleDist <= maxMeters) {
      const obsPx = centerX + (state.obstacleX * meterScale);
      const obsPy = centerY - (state.obstacleDist * meterScale);

      const pulseTime = Date.now() / 200;
      const pulseRadius = 10 + Math.sin(pulseTime) * 3;

      lidarCtx.strokeStyle = 'rgba(239, 68, 68, 0.85)';
      lidarCtx.lineWidth = 2;
      lidarCtx.beginPath();
      lidarCtx.arc(obsPx, obsPy, pulseRadius, 0, Math.PI * 2);
      lidarCtx.stroke();

      lidarCtx.fillStyle = '#EF4444';
      lidarCtx.beginPath();
      lidarCtx.arc(obsPx, obsPy, 5, 0, Math.PI * 2);
      lidarCtx.fill();

      lidarCtx.fillStyle = '#F87171';
      lidarCtx.font = 'bold 11px "JetBrains Mono", monospace';
      lidarCtx.fillText(`▲ OBSTACLE: ${state.obstacleDist}m`, obsPx + 14, obsPy + 4);
    }

    // 4. Center Rover Chevron Marker
    lidarCtx.save();
    lidarCtx.translate(centerX, centerY);

    const grad = lidarCtx.createRadialGradient(0, 0, 2, 0, -40, 60);
    grad.addColorStop(0, 'rgba(241, 104, 42, 0.35)');
    grad.addColorStop(1, 'rgba(241, 104, 42, 0)');
    lidarCtx.fillStyle = grad;
    lidarCtx.beginPath();
    lidarCtx.moveTo(0, 0);
    lidarCtx.arc(0, 0, 50, -Math.PI / 2 - 0.4, -Math.PI / 2 + 0.4);
    lidarCtx.closePath();
    lidarCtx.fill();

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
  // 10. CONVOY MAP CANVAS RENDERER
  // =========================================================================
  function renderMap() {
    if (!mapCanvas || !mapCtx) return;

    const w = mapCanvas.width;
    const h = mapCanvas.height;

    mapCtx.clearRect(0, 0, w, h);

    const roadTopY = h * 0.3;
    const roadBottomY = h * 0.7;

    // Road surface & borders
    mapCtx.fillStyle = 'rgba(15, 23, 42, 0.9)';
    mapCtx.fillRect(0, roadTopY, w, roadBottomY - roadTopY);

    mapCtx.strokeStyle = 'rgba(248, 250, 252, 0.15)';
    mapCtx.lineWidth = 2;
    mapCtx.beginPath();
    mapCtx.moveTo(0, roadTopY);
    mapCtx.lineTo(w, roadTopY);
    mapCtx.moveTo(0, roadBottomY);
    mapCtx.lineTo(w, roadBottomY);
    mapCtx.stroke();

    // Center divider
    mapCtx.strokeStyle = 'rgba(248, 250, 252, 0.08)';
    mapCtx.setLineDash([8, 8]);
    mapCtx.beginPath();
    mapCtx.moveTo(0, h * 0.5);
    mapCtx.lineTo(w, h * 0.5);
    mapCtx.stroke();
    mapCtx.setLineDash([]);

    // Vehicle positions
    const roverX = w * 0.72;
    const roverY = h * 0.5;

    const gapPx = Math.max(100, Math.min(240, state.gap * 3.8));
    const truckX = roverX - gapPx;
    const truckY = h * 0.5;

    // Convoy Tether
    mapCtx.strokeStyle = state.ttc < 3.0 || state.eStop ? 'rgba(239, 68, 68, 0.85)' : 'rgba(56, 189, 248, 0.6)';
    mapCtx.lineWidth = 2;
    mapCtx.setLineDash([5, 5]);
    mapCtx.beginPath();
    mapCtx.moveTo(truckX + 16, truckY);
    mapCtx.lineTo(roverX - 12, roverY);
    mapCtx.stroke();
    mapCtx.setLineDash([]);

    // Gap Label
    const midX = (truckX + roverX) / 2;
    mapCtx.fillStyle = '#CBD5E1';
    mapCtx.font = '10px "JetBrains Mono", monospace';
    mapCtx.textAlign = 'center';
    mapCtx.fillText(`${state.gap}m // TTC ${state.ttc}s`, midX, roverY - 14);

    // Trailing Truck (CAT 777D)
    mapCtx.fillStyle = '#1E293B';
    mapCtx.strokeStyle = '#38BDF8';
    mapCtx.lineWidth = 2;
    mapCtx.strokeRect(truckX - 18, truckY - 14, 36, 28);
    mapCtx.fillRect(truckX - 18, truckY - 14, 36, 28);

    mapCtx.fillStyle = '#38BDF8';
    mapCtx.font = 'bold 9px "JetBrains Mono", monospace';
    mapCtx.fillText('CAT 777D', truckX, truckY + 3);

    // Leading Rover
    mapCtx.fillStyle = '#F1682A';
    mapCtx.strokeStyle = '#FFFFFF';
    mapCtx.lineWidth = 1.5;
    mapCtx.beginPath();
    mapCtx.arc(roverX, roverY, 9, 0, Math.PI * 2);
    mapCtx.fill();
    mapCtx.stroke();

    // Directional beam
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

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // =========================================================================
  // 11. INITIALIZATION
  // =========================================================================
  // 1. Initial UI layout based on session role
  applyRoleLayout(currentRole);

  // 2. Fetch real initial LiDAR scan points if permitted (Admin/Operator)
  if (currentRole === 'admin' || currentRole === 'operator') {
    fetch('/api/telemetry/scan-points', {
      headers: { 'Authorization': `Bearer ${sessionToken}` }
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && Array.isArray(data.scanPoints)) {
          scanPoints = data.scanPoints;
          renderLidar();
        }
      })
      .catch(() => {});
  }

  // 3. Connect real-time WebSocket
  initWebSocket();

  // 4. Initial paint
  updateUI();
  renderLidar();
  renderMap();

})();

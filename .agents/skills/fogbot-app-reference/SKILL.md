---
name: fogbot-app-reference
description: >-
  Complete engineering blueprint, telemetry schemas, sensor fusion algorithms,
  and API reference for the FogBot autonomous pilot rover system (SIH26007 NMDC).
  Use this skill whenever building, modifying, or integrating companion apps
  (e.g., Flutter mobile, React Native, or desktop dashboards) for FogBot.
---

# FogBot System Architecture & Companion App Reference

This skill encapsulates the full engineering knowledge, hardware specifications, mathematical formulations, telemetry protocols, backend APIs, and design system established in the **FogBot** project for **NMDC Limited (SIH 2026 Problem Statement SIH26007)**.

Use this document as the authoritative specification whenever building a companion application (e.g., in Flutter, React Native, iOS/Android native, or Electron/Web) for truck drivers, field technicians, or dispatch operators.

---

## 1. Operational Domain & Problem Context

### The Bailadila Monsoon Fog Crisis
- **Location**: NMDC Bailadila Iron Ore Complex (Bacheli and Kirandul Complexes in Dantewada, Chhattisgarh).
- **Geography & Climate**: Opencast hilltop iron ore mines with steep bench grades (1:16 gradient). During the prolonged monsoon season (June–October), dense clouds settle over the hilltops, reducing visibility to **3–5 meters**.
- **Operational Impact**: The site suffers **50–60 lost haul days per year**. At a current production rate of 37 MTPA (scaling to 80 MTPA by 2030), this downtime costs hundreds of crores in delayed ore evacuation.
- **Critical Safety Hazard**: 85-tonne to 240-tonne HEMM (Heavy Earth Moving Machinery) haul trucks (e.g. Caterpillar CAT 777D, BEML BH85/BH100) operate with stopping distances exceeding driver sightlines in dense fog.

### Why Existing Driving Aids Fail (Critique of Installed DAS)
- Existing systems mount proximity sensors and radars directly on truck bumpers.
- Due to extreme vehicle inertia and haul grade, when a truck-mounted sensor detects an obstacle 8m away in 3m fog, physical braking distance exceeds the detection distance.
- Sensors on heavy haul trucks also suffer severe chassis vibration and iron ore mud occlusion.

### The FogBot Paradigm Shift: Leading Pilot Rover
- **Decoupled Sensing & Hauling**: FogBot is an agile, autonomous, ruggedized rover that travels **15–25 meters ahead** of the haul truck.
- The rover penetrates the fog first at ground level, identifies obstacles, maps road edges, calculates real-time collision risk, and wirelessly broadcasts guidance and safe-speed envelopes to the trailing truck.

---

## 2. Hardware Architecture & Perception Suite

### Prototype Hardware Specifications
- **Primary Edge Compute**: Raspberry Pi 5 (4GB RAM) running 64-bit Linux. Executes computer vision inference, multi-sensor fusion, and telemetry dispatch.
- **Low-Level Motion Controller**: STM32 ARM Cortex microcontroller running closed-loop PID DC motor control, wheel encoder odometry, ultrasonic/IR sensor interrupts, and fail-safe relays.
- **Chassis & Drive**: Rugged 4WD high-clearance off-road chassis with metal gear DC motors and knobby terrain tires.
- **Power Subsystem**: Isolated logic and motor power rails powered by multi-cell LiFePO4 / Li-ion battery packs.

### Multi-Sensor Perception Suite
| Sensor | Primary Role | Key Advantage in Mine Fog |
|---|---|---|
| **STL-19P TOF LiDAR** | 360° point cloud, road boundary detection, SLAM localization | Optical time-of-flight penetrates light moisture; provides 12m–25m obstacle warning radius. |
| **Vision + 3D Depth Camera** | YOLO / MobileNet object classification & depth mapping | Distinguishes personnel, light vehicles, boulders, and berm edges. |
| **IR Distance Sensors** | High-speed close-range obstacle confirmation (<2m) | Millisecond interrupt response for emergency braking. |
| **Ultrasonic Array** | Acoustic ranging (40 kHz) | Acoustic waves are immune to optical scatter and reliably detect glossy mud and puddle reflections. |
| **GNSS / GPS Module** | Haul road waypoint tracking | Absolute pit localization along bench paths. |

### Deliberate Hardware Omissions & The "Fog Proxy" Innovation
1. **Thermal Imaging Cameras (Excluded)**: Suffer severe blooming and thermal scattering due to tropical rain droplets and saturated moisture.
2. **mmWave Radar (Excluded)**: High multipath reflection against iron-dense ore benches; high bill-of-materials (BOM).
3. **The CV Confidence "Fog Proxy"**: Instead of expensive optical scatterometers, FogBot uses camera detection confidence decay as a live transmissometer:
   $$\text{Fog Density Proxy} \propto 1.0 - \text{Confidence}_{\text{CV Model}}(\text{Known Markers / Terrain})$$
   As optical confidence drops, the AI safety engine automatically shifts sensor fusion weights toward LiDAR and ultrasonic readings.

---

## 3. Sensor Fusion & AI Risk Engine

### 1. Continuous Collision Risk Score Formula
$$\text{Risk Score} = f\Big(\Delta d_{\text{rover-truck}},\, v_{\text{closing}},\, (1 - C_{\text{cam}}),\, d_{\text{obstacle}},\, \kappa_{\text{road}}\Big)$$

Risk thresholds:
- **LOW / SAFE**: Clear sightline ($>40\text{m}$ visibility), no obstacle within $30\text{m}$.
- **MEDIUM / CAUTION**: Visibility $15\text{m}$–$40\text{m}$, or obstacle within $18\text{m}$–$30\text{m}$.
- **HIGH / CRITICAL**: Visibility $<15\text{m}$, obstacle $<18\text{m}$, or manual E-Stop engaged.

### 2. Dynamic Adaptive Speed Regulation Schedule
| Camera Confidence $C_{\text{cam}}$ | Visibility Range | System Status | Recommended Speed | Max Governed Limit |
|---|---|---|---|---|
| **> 75%** | Clear / High (> 50m) | **SAFE (Green)** | 15–20 km/h | 35 km/h |
| **40% – 75%** | Moderate Fog (20m–50m) | **CAUTION (Amber)** | 10–14 km/h | 22 km/h |
| **15% – 40%** | Dense Fog (5m–20m) | **HIGH RISK (Red)** | 5–8 km/h | 10 km/h |
| **< 15%** | Critical Fog (3m–5m) | **HOLD / STOP** | 0 km/h (Emergency Hold) | 0 km/h |

### 3. Convoy Gap & Time-to-Collision (TTC)
- **Target Gap**: $15\text{m}$–$25\text{m}$ (physical prototype spec); $35\text{m}$–$40\text{m}$ in open haul simulation.
- **TTC Formula**:
  $$\text{TTC} = \frac{\Delta d_{\text{rover-truck}}}{|v_{\text{truck}} - v_{\text{rover}}| + 4.5}$$
- **Thresholds**:
  - $\text{TTC} \ge 4.0\text{ s}$: Normal headway (Cyan/Emerald)
  - $3.0\text{ s} \le \text{TTC} < 4.0\text{ s}$: Caution headway (Amber)
  - $\text{TTC} < 3.0\text{ s}$: Collision risk alarm (Audible Cab Alarm + Visual Crimson Warning)

### 4. Mandatory Fail-Safe Watchdog Protocol
- Dual-redundant heartbeat between rover and truck receiver (sub-100ms interval).
- If the rover stalls, experiences motor failure, or drops localization, an immediate **E-STOP broadcast packet** floods the wireless channel.
- Trailing haul truck cab unit activates instantaneous visual warnings and audio sirens to brake before closing the gap.

---

## 4. Telemetry Schema & Backend APIs

### Standard IoT Telemetry JSON Packet
```json
{
  "rover_id": "ROVER_01",
  "timestamp": "2026-09-23T07:15:30.124Z",
  "gps": {
    "lat": 18.7052,
    "lng": 81.2384,
    "alt": 1182.0
  },
  "speed_kmh": 12.0,
  "fog_visibility_m": 18.0,
  "fog_density_pct": 35,
  "camera_confidence_pct": 31,
  "lidar_confidence_pct": 88,
  "obstacle": {
    "detected": true,
    "type": "boulder",
    "distance_m": 6.2,
    "lateral_offset_m": -0.8,
    "source": "lidar_ultrasonic_fusion"
  },
  "risk_level": "HIGH",
  "recommended_speed_kmh": 10,
  "gap_to_truck_m": 22.4,
  "time_to_collision_s": 2.8,
  "battery_pct": 84.2,
  "e_stop": false,
  "status": "AUTONOMOUS_ESCORTING"
}
```

### Backend REST API Endpoints (`server.js`)
All endpoints bind to port `3000` (or `process.env.PORT`):
- `GET /api/health` and `GET /healthz`: Health monitoring returning `{ status: "ok", uptime: ..., timestamp: ... }`.
- `GET /api/config`: Returns `{ siteKey: "..." }` for Google reCAPTCHA v2.
- `GET /api/telemetry/fog`: Returns `{ fogDensity: number, visibilityIndex: number, updatedAt: string }`.
- `POST /api/telemetry/fog`: Body `{ fogDensity: number }` (0–100). Broadcasts condition updates to all connected frontends.
- `POST /api/login`: Body `{ userId: string, password: string, recaptchaToken: string }`. Authenticates with bcrypt against MySQL/MariaDB with automatic in-memory fallback. Default demo credentials: `admin` / `password123`.

---

## 5. UI/UX Design System Tokens

When designing the companion mobile or desktop app, maintain consistency with the FogBot industrial interface:

### Color Palette
- **Deep Slate Canvas (Dark)**: `#020617` (Slate 950)
- **High-Tech Surface (Dark)**: `rgba(15, 23, 42, 0.85)` with frosted border `rgba(56, 189, 248, 0.15)`
- **Clean Canvas (Light)**: `#F8FAFC` (Slate 50)
- **Surface Card (Light)**: `#FFFFFF` with `#E2E8F0` border
- **Status - SAFE / NOMINAL**: `#10B981` (Emerald) or `#38BDF8` (Sky Cyan)
- **Status - CAUTION / ALERT**: `#F59E0B` (Industrial Amber)
- **Status - HIGH RISK / E-STOP**: `#EF4444` (Vivid Crimson)
- **Brand Industrial Accent**: `#F1682A` (Safety Orange)

### Typography
- **Headings, Badges, KPIs**: `Rajdhani, sans-serif` (uppercase, letter-spacing: 0.05em, font-weight 600–700)
- **Telemetry Readouts & Coordinates**: `JetBrains Mono, monospace`
- **Body & Labels**: `Inter, system-ui, sans-serif`

---

## 6. 3D Digital Twin Specification (Three.js)

The interactive 3D model (`rover3d.js` / `RoverDigitalTwin3D.jsx`) consists of:
1. **Chassis**: Box (`1.6 x 0.6 x 2.4`) in dark slate steel (`#334155`) with high-visibility orange side chevrons (`#f97316`).
2. **Wheels**: 4 high-clearance off-road wheels (`CylinderGeometry(0.35, 0.35, 0.25)`).
3. **Elevated Mast & Sensor Pod**: Central mast pillar (`y = 1.3`), forward camera pod (`y = 1.25`), and rotating STL-19P LiDAR cylinder (`rotation.y += 0.05` per frame).
4. **Front Bull-Bar & Projector Fog Lamps**:
   - Heavy bull-bar with twin projector fog pods.
   - Central auxiliary high-output LED light bar.
   - Forward spotlight beam (`SpotLight`, intensity 12–16, reach 35m, penumbra 0.5) piercing the fog.
5. **Rear Hazard Light Assembly**:
   - Heavy protective steel housing frame facing trailing truck.
   - Central amber hazard light strip pulsing at dynamic frequencies (4 Hz safe $\to$ 14 Hz critical).
   - Outer red hazard/brake light pods.
   - Backward-facing pointlight casting safety illumination onto the roadway.
   - Roof flashing strobe beacon.
6. **Volumetric Fog (`THREE.FogExp2`)**:
   $$\text{density} = \max(0.003, \min(0.02, 0.035 - \text{visibility} \times 0.00035))$$

---

## 7. Companion App Architecture Blueprint

When implementing a dedicated mobile or tablet app (e.g., using **Flutter**, **React Native**, or **native Kotlin/Swift**):

### Recommended Architecture (Layered Approach)
```text
lib/
├── data/
│   ├── models/
│   │   ├── telemetry_packet.dart      # Full JSON serialization matching FogBot schema
│   │   ├── obstacle_model.dart        # Type, distance, lateral offset, confidence
│   │   └── convoy_state.dart          # Gap distance, relative speed, TTC
│   ├── services/
│   │   ├── telemetry_client.dart      # WebSocket / MQTT client with auto-reconnect
│   │   ├── api_service.dart           # REST client for /api/health and /api/telemetry/fog
│   │   └── audio_alarm_service.dart   # High-decibel cab alarm audio player
│   └── mock/
│       └── mock_telemetry_stream.dart # Replicates getTelemetry() from dashboard.js
├── logic/
│   ├── risk_engine.dart               # Collision risk score and speed governor calculations
│   └── convoy_controller.dart         # Manages convoy gap, TTC, and fail-safe triggers
└── presentation/
    ├── screens/
    │   ├── cab_hud_screen.dart        # Driver-facing high-contrast cockpit dashboard
    │   ├── dispatch_screen.dart       # Fleet monitoring map & multi-rover manager
    │   └── settings_screen.dart       # Server URL, threshold configs, demo mode toggle
    ├── widgets/
    │   ├── convoy_gap_meter.dart      # Dynamic color-coded distance gauge
    │   ├── ttc_warning_banner.dart    # Flashing warning banner when TTC < 3.0s
    │   ├── emergency_stop_button.dart # Prominent, guarded one-touch E-Stop trigger
    │   ├── lidar_radar_view.dart      # CustomPainter rendering 2D LiDAR point cloud
    │   └── fog_override_slider.dart   # Interactive fog slider for demonstrations
    └── theme/
        ├── app_colors.dart            # Slate 950, Emerald, Amber, Crimson, Safety Orange
        └── app_typography.dart        # Rajdhani, JetBrains Mono, Inter text styles
```

### Essential Driver HUD Screen Requirements
1. **Cockpit Visibility**: Giant, high-contrast typography legible from 1.5 meters away inside an HEMM truck cab.
2. **Convoy Headway Widget**: Displays target gap ($15\text{m}$–$25\text{m}$) and current gap with instant color shifts (Green $\to$ Amber $\to$ Red).
3. **Audible Proximity Alarm**: Must play an alert tone when TTC drops below 3.0 seconds, and a continuous siren on Emergency Stop.
4. **Guarded E-Stop Button**: Large physical-style on-screen button with confirmation haptics that triggers immediate halt broadcast.
5. **Real-Time Mini LiDAR Radar**: 2D top-down view showing rover position, range rings (5m, 10m, 15m, 20m), obstacle markers, and road edge boundaries.

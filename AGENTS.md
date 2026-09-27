# FogBot Project Rules & System Invariants

## Operational Context
- **Project**: FogBot — Autonomous Leading Pilot Rover & IoT Command Center for Safe Operation of Mine Vehicles in Dense Fog.
- **Problem Statement**: SIH26007 (NMDC Limited) | Smart India Hackathon 2026.
- **Target Site**: NMDC Bailadila Iron Ore Complex (Deposit 5, Bacheli & Kirandul Complexes, Dantewada, Chhattisgarh).
- **Core Concept**: Autonomous pilot rover leading 85t–240t HEMM haul trucks by 15–25m on narrow 1:16 incline haul roads, penetrating 3–5m dense monsoon clouds first.

## Safety & Architectural Invariants
1. **The Leading Pilot Paradigm**: Sensing is decoupled from hauling. Never mount primary short-range obstacle sensors on the heavy dumper; the pilot rover carries the primary perception suite and broadcasts processed telemetry to the trailing vehicle.
2. **Mandatory Fail-Safe E-Stop**: If the rover suffers motor stall, power depletion, or loss of localization/heartbeat, an immediate fail-safe hard-stop broadcast must be dispatched to trailing haul trucks.
3. **Fog Proxy Principle**: Camera confidence $C_{\text{cam}}$ acts as the real-time optical transmissometer ($1.0 - C_{\text{cam}}$). When optical visibility decays, the sensor fusion engine must dynamically increase weighting on the STL-19P LiDAR and ultrasonic sensors while contracting safe headway buffers.
4. **Resilient Backend Fallback**: Any server implementation must provide graceful in-memory storage fallback when external MySQL/MariaDB databases are unreachable in cloud or demo environments.
5. **Color & Status Codes**:
   - `SAFE / NORMAL`: Emerald (`#10b981`) or Cyan (`#38bdf8`)
   - `CAUTION / MODERATE`: Amber (`#f59e0b`)
   - `HIGH RISK / E-STOP`: Crimson (`#ef4444`)
   - `BRAND ACCENT`: Industrial Safety Orange (`#f1682a`)

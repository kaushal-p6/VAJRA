# ⚡ VAJRA: Village Alert & Just-in-time Risk Assessment
## Real-Time Flash Flood & Landslide Early Warning System

**VAJRA** is an enterprise, 24x7 mission-critical command center web application designed for National and State Disaster Management Authorities (NDRF, SDMA, CWC, IMD, District Magistrates) and local safety authorities across India.

Located at: `/home/kaushal/Projects/vajra`

---

## 🌟 Key Features & Compliance

### 1. Secured Role-Based Access Control (`js/auth.js`)
- **Department ID & Password Login**: Secured login modal supporting official credentials (e.g. `NDRF-HQ-01`, `SDMA-UK-04`).
- **Authorized Authority Mode**:
  - Full access to the **Official Emergency Alert Box**, Emergency Broadcast Dispatcher (SMS / Cell Broadcast / Sirens), NDRF Quick Response deployment, and critical notification stream.
- **Normal Viewer Mode**:
  - Guest/Public view. Can view live maps, weather highlights, and general public advisories.
  - **Zero emergency alert dispatcher popups or official action triggers visible to unauthenticated viewers.**

### 2. Header & Notification Center (`js/alerts.js`)
- Notification Bell Icon with real-time badge and audio chime.
- Role-filtered dropdown drawer:
  - Authorized Officials: Emergency hazard warnings, evacuation orders, satellite uplink status, system telemetry.
  - Public Viewers: District highlights (e.g., *"Uttarkashi recorded 142mm rainfall today — High Caution"*).

### 3. Emergency Alert Box (`js/alerts.js`)
- Prominent top-of-screen emergency banner & modal displayed when Orange/Red hazard thresholds are breached.
- Real-time impact analysis: Region coordinates, slope polygon shape, estimated time to impact (hours), population at risk, primary risk triggers (3-day cumulative rainfall, soil saturation %, slope steepness).
- Integrated safe-zone relief shelter routing & contact helpline.
- One-click **"Confirm Emergency Broadcast to Locals"** and **"Deploy NDRF Unit"** actions.

### 4. Main Dashboard Page (`js/map.js`)
- **Real-Time India Map**: Built on Leaflet.js with interactive hazard overlays.
- **Map Base Layer Switcher**:
  - 🛰️ **Satellite Map** (Selected by default as requested!)
  - 🗺️ **Standard Map**
  - 🏔️ **Elevation / DEM Map**
- **Hazard Overlays**: Interactive risk polygons (Red, Orange, Yellow, Green) for slope units across India (Uttarakhand, Wayanad - Kerala, Mandi - HP, Sikkim, Assam Majuli, J&K Ramban, Darjeeling, etc.).
- **Interactive Region Inspection**: Click any polygon to view live telemetry, trigger factors, safe zone shelter, and route guidance.
- **Monsoon Cloudburst Simulation**: Click *"Simulate Rain Event"* to test dynamic rainfall surge, risk tier escalation (Green → Orange → Red), and audio/visual alert triggers in real time.

### 5. Analyze Page (`js/analyze.js`)
- Comprehensive regional telemetry table.
- **Sorting**: Ascending & Descending sort on any column (Rainfall 24h, Soil Saturation, Risk Score, Time to Impact, Slope Angle, Population).
- **Pagination**: Strictly **10 rows per page** with navigation controls and entry counts.
- **Search & Filter**: Search box for instant filtering by District/State/Village name + Hazard Tier dropdown filter.
- **Analytics Charts**: Interactive Chart.js graph comparing 24h Rainfall vs. Soil Saturation across regions.

### 6. System Journal & Model Payload Inspector — 🚧 Planned, not yet implemented
- Intended to provide a complete reference to the 15 Static & Dynamic Datasets, 9-step automated operational pipeline, and Section 4 JSON ML model payload schema (`vajra-v1.0.4-Gov`).
- **Not yet built**: there is currently no `js/journal.js`, no corresponding nav tab, and no script tag for it in `index.html`. The app currently ships 3 tabs only — Dashboard Map, Analyze Telemetry, Alert Management.

---

## 🚀 Quick Start & How to Run

### Method 1: Python HTTP Server (Recommended)
```bash
cd /home/kaushal/Projects/vajra
python3 server.py
```
Open your browser and navigate to: **`http://localhost:8080`**

### Method 2: Direct Browser Preview
Open `/home/kaushal/Projects/vajra/index.html` directly in any web browser.

---

## 🔑 Demo Credentials

| Role | Department ID | Password | Access Level |
|---|---|---|---|
| **Authorized Authority** | `NDRF-HQ-01` | `password123` | Full Access (Emergency Alert Box, SMS Dispatch, Siren Controls) |
| **State Authority** | `SDMA-UK-04` | `password123` | Full Access (Uttarakhand Sector) |
| **Public Viewer** | *Click "Public Viewer Mode"* | N/A | Maps, Weather Highlights, Public Advisories Only |

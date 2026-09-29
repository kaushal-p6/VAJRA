# ⚡ VAJRA: Flash Flood Prediction System
### Real-Time Multi-Hazard AI Early Warning & Tactical Command System
**Smart India Hackathon (SIH) | Problem Theme: Disaster Management & Resilient Infrastructure**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Python](https://img.shields.io/badge/Python-3.8%2B-blue.svg)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.100%2B-009688.svg)](https://fastapi.tiangolo.com)
[![Leaflet](https://img.shields.io/badge/Leaflet-1.9.4-199900.svg)](https://leafletjs.com/)
[![MapLibre GL](https://img.shields.io/badge/MapLibre_GL-3.6.2-3887be.svg)](https://maplibre.org/)
[![Chart.js](https://img.shields.io/badge/Chart.js-4.4.0-FF6384.svg)](https://www.chartjs.org/)

---

## 📌 1. Project Overview

**VAJRA** (*Flash Flood Prediction System*) is an enterprise, 24x7 mission-critical command center designed for **National and State Disaster Management Authorities (NDRF, SDMA, CWC, IMD, District Magistrates, and District Emergency Operation Centers)**.

Traditional disaster forecasting in India operates at coarse district scales, leaving vulnerable panchayats without village-level actionable lead time. **VAJRA bridges the last-mile gap** by fusing physics-informed machine learning with real-time hydro-meteorological telemetry, satellite remote sensing (InSAR ground displacement), and automated **Common Alerting Protocol (CAP)** cell broadcasting.

```
═══════════════════════════════════════════════════════════════════════════════════════════════════════
                                  VAJRA SYSTEM ARCHITECTURE
═══════════════════════════════════════════════════════════════════════════════════════════════════════

  [SATELLITE & SENSOR INGESTION]          [PHYSICS-INFORMED ML CORE]         [MISSION COMMAND CENTER]
  • NASA GPM / IMERG 30m Rainfall         • Slope-Unit Gradient Boosting     • 2D Leaflet GIS Dashboard
  • CWC River Stage & Barrage Outflow     • 72h Antecedent Saturation (API)  • 3D MapLibre Terrain Engine
  • Copernicus Sentinel-1 InSAR           • Geotechnical Factor of Safety    • Multi-Chart Analytics Grid
  • IMD Doppler Weather Radar             • Probabilistic Confidence Bounds  • CAP Emergency Cell Broadcast
                │                                    │                                    │
                ▼                                    ▼                                    ▼
       ┌─────────────────┐                 ┌──────────────────┐                ┌──────────────────┐
       │ Data Ingestion  │ ──────────────> │ ML Microservice  │ ─────────────> │ Command Portal   │
       │ & Normalization │                 │ FastAPI + Cache  │                │ Frontend (ES6+)  │
       └─────────────────┘                 └──────────────────┘                └──────────────────┘
```

---

## 🌟 2. Key Modules & Technical Innovations

### A. Dual Geospatial Engines (2D GIS & 3D Satellite Terrain)
* **2D Leaflet GIS Engine**:
  * Real-time hazard risk polygons color-coded by severity (**Red: Extreme, Orange: High, Yellow: Moderate, Green: Normal**).
  * Radial animated beacons displaying model prediction risk percentages and live telemetry docks.
  * Vector evacuation route generation pointing from hazard polygons directly to safe high-ground targets and designated district shelters.
* **3D MapLibre Terrain Engine**:
  * Integrated **MapTiler 3D Digital Elevation Model (DEM)** with satellite raster drapery.
  * Real-time pitch tilting (up to 60°) and 360° bearing rotation for inspecting valley topography and escarpments.
  * Floating mid-route badges calculating walking distances, estimated transit times, and elevation gains (`+X m`).
* **Context-Aware Dynamic Infrastructure Filtering**:
  * **Overview Zoom (`zoom < 10`)**: Tactical Emergency Posts and Hospitals are automatically hidden to prevent national/state map clutter.
  * **Local Impact Zoom (`zoom >= 10`)**: Local hospitals (with bed capacities) and NDRF/SDRF emergency stations fade in automatically.

### B. Multi-Dimensional Analytics Suite (`frontend/js/analyze.js`)
An executive visual intelligence suite powered by Chart.js, configured to **"All Graphs Grid"** by default with an instant **"Focused View"** toggle:
1. **Antecedent Precipitation (24h Burst vs 72h Deluge)**: Multi-axis clustered bar and saturation curve showing prolonged rainfall saturation before embankment failure.
2. **Time-to-Impact Urgency Matrix (ETA vs Risk Score)**: 4-quadrant scatter/bubble chart identifying **Immediate Evacuation Windows** (ETA < 2h & Risk ≥ 90%).
3. **ML Prediction Statistical Confidence Intervals**: Horizontal floating range bars illustrating lower-to-upper statistical certainty bounds (`[Confidence Low, High]`).
4. **Geotechnical Susceptibility Matrix**: Scatter plot correlating terrain steepness (°) with soil saturation (%) to define failure envelopes.
5. **Evacuation Transit Logistics**: Bar chart of safe-zone distances (km) and estimated foot-evacuation times (minutes).
6. **Humanitarian Exposure vs Hospital Surge Capacity**: Compares population at risk in the danger perimeter against available district hospital beds.
7. **Multi-Hazard Classification Donut**: Categorization of active disasters into Riverine Floods, Urban Cloudbursts, Mountain Landslides, and Dam Spills.

### C. Emergency Operations & CAP Broadcast Engine (`frontend/js/alerts.js`)
* **Common Alerting Protocol (CAP v1.2) Simulator**: One-click cell broadcasting (SMS, high-decibel siren chimes, push alerts) targeting affected geofenced polygons.
* **Tactical Emergency Dispatch Modal**: Authorizes immediate deployment of specialized units (NDRF 9th Bn, 5th Bn, SDRF, ITBP, ODRAF).
* **Audit History Log**: Searchable, filterable ledger recording all transmissions, logged authorities, timestamps, and incident resolutions.

### D. Role-Based Authority Access (`frontend/js/auth.js`)
* **Authorized Authority Mode**: Unlocks official emergency dispatching, alert publishing, and siren activation.
* **Public Viewer Mode**: Citizen-facing view displaying real-time hazard maps, weather telemetry, and public safety advisories without dispatch controls.

---

## 📐 3. Mathematical & Machine Learning Formulation

VAJRA computes hazard probabilities using a hybrid physics-guided gradient boosting framework:

### 1. Antecedent Precipitation Index ($API$)
To quantify multi-day soil saturation leading to embankment liquefaction or slope failure:
$$API_t = \sum_{i=1}^{k} P_{t-i} \cdot \lambda^i$$
*Where $P_{t-i}$ is the precipitation $i$ days prior, and $\lambda = 0.84$ is the hydrological soil drainage decay coefficient.*

### 2. Geotechnical Infinite-Slope Factor of Safety ($FS$)
$$FS = \frac{c' + (\gamma \cdot z \cdot \cos^2\beta - u) \tan\phi'}{\gamma \cdot z \cdot \sin\beta \cdot \cos\beta}$$
*Where $c'$ is effective cohesion, $\phi'$ is internal friction angle, $\beta$ is slope angle, $z$ is regolith depth, and $u$ is pore water pressure derived from real-time saturation.*

### 3. Probability Calibration & Confidence Bounds
The ensemble model outputs a calibrated risk score $R \in [0, 1]$ accompanied by non-parametric conformal confidence intervals:
$$\text{Confidence Interval} = \left[ \hat{R} - t_{\alpha/2} \cdot \sigma_{\text{ensemble}}, \; \hat{R} + t_{\alpha/2} \cdot \sigma_{\text{ensemble}} \right]$$

---

## 📂 4. Project Directory Structure

```
VAJRA/
│
├── frontend/                     # Web Command Center Application
│   ├── index.html                # Main Interface & Dashboard Layout
│   ├── assets/                   # Official Logos, Emblems, Badges & Favicons
│   ├── css/
│   │   └── styles.css            # Custom Styling & Responsive Layout Rules
│   └── js/
│       ├── alerts.js             # CAP Alert Engine, Audio Siren & Dispatch Modals
│       ├── analyze.js            # Multi-Dimensional Analytics Suite & Telemetry Table
│       ├── app.js                # App Lifecycle, Monsoon Simulation & KPI State
│       ├── auth.js               # Role-Based Authentication & Session Handlers
│       ├── clock.js              # Real-Time Dynamic IST Clock Engine
│       ├── config.js             # Layer Providers, Thresholds & System Constants
│       ├── data.js               # 12 Ground-Truth Datasets, GeoJSON & Infrastructure
│       ├── live-feed.js          # Polling Engine for Python ML Microservice
│       ├── map.js                # Leaflet 2D GIS & MapLibre 3D Terrain Controller
│       └── registration.js       # Official Access Request & Document Upload Modal
│
├── ml_service/                   # Machine Learning Microservice Scaffold
│   ├── api_server.py             # FastAPI Server (Serves GET /api/alerts)
│   ├── predict_batch.py          # Batch Prediction & Scoring Pipeline
│   ├── scheduler.py              # Automated 30-Minute Ingestion Loop
│   ├── requirements.txt          # Python ML & Geospatial Dependencies
│   └── cache/                    # Low-Latency Atomic Prediction Cache
│
├── server.py                     # Python 3 Local Preview Server (Zero-Dependency)
└── README.md                     # Comprehensive Project Documentation
```

---

## 🚀 5. Installation & Quick Start

### Prerequisites
* **Python 3.8+** installed on your system.
* Any modern web browser (**Google Chrome, Mozilla Firefox, Microsoft Edge**).

### Method 1: Python Preview Server (Recommended)
1. Open a terminal and navigate to the project directory:
   ```bash
   cd VAJRA
   ```
2. Start the local server:
   ```bash
   python server.py
   ```
3. Open your browser and navigate to:
   ```
   http://localhost:8080/index.html
   ```

### Method 2: Running with the ML Microservice Backend
1. Navigate to the `ml_service` directory and install dependencies:
   ```bash
   cd ml_service
   pip install -r requirements.txt
   ```
2. Start the FastAPI microservice:
   ```bash
   uvicorn api_server:app --host 0.0.0.0 --port 8000 --reload
   ```
3. In a separate terminal, launch the dashboard:
   ```bash
   python server.py
   ```
   *The frontend `live-feed.js` automatically connects to `http://localhost:8000/api/alerts` to ingest live model inferences.*

---

## 🔑 6. Demo Credentials for Evaluation

Use the following credentials in the login modal to demonstrate administrative vs. citizen access:

| Role | Department ID | Password | Access Privileges |
|---|---|---|---|
| **Authorized Authority (NDRF)** | `NDRF-HQ-01` | `password123` | Full Access: CAP Broadcasts, Siren Chime, Evacuation Dispatch |
| **State Authority (Bihar SDMA)** | `SDMA-BR-01` | `password123` | Full Access: Kosi & Gandak River Breach Commands |
| **State Authority (Uttarakhand)** | `SDMA-UK-04` | `password123` | Full Access: Himalayan Landslide & Flash Flood Commands |
| **Public Citizen Viewer** | *Click "Public Viewer Mode"* | N/A | Read-Only: Interactive Map, Weather Telemetry & Public Advisories |

---


## 🛡️ 7. Standards Compliance

* **NDMA Guidelines**: Aligned with the National Disaster Management Guidelines for Landslides and Floods (Govt. of India).
* **CWC Telemetry Standards**: Hydro-meteorological gauge protocols aligned with Central Water Commission telemetry archives.
* **ITU-T X.1303**: Compliant with the international **Common Alerting Protocol (CAP v1.2)** format for multi-channel public dissemination.

---

## 👥 8. Smart India Hackathon (SIH) Submission
* **Theme**: Disaster Management & Resilient Infrastructure
* **Target Users**: NDRF, SDMAs, District Emergency Operation Centers, Police Control Rooms, and Local Panchayats.
* **Objective**: Save lives and mitigate economic devastation through hyper-local, physics-informed early warnings.

/* ==========================================================================
   VAJRA - Operational System Configuration, Map Layers & Data Standards
   ========================================================================== */

const VAJRA_CONFIG = {
  SYSTEM_NAME: "VAJRA",
  FULL_NAME: "Flash flood prediction system",
  VERSION: "v3.0.0-Operational-Gov",

  // Primary Pilot Region & ML Model Scope
  ML_MODEL_SCOPE: {
    PILOT_REGION: "Kosi Basin & Multi-Hazard National Grid",
    MODEL_NAME: "VAJRA Multi-Hazard Prediction Engine v1.0",
    MODEL_TYPE: "Spatial Hydro-Geological Gradient Boosting Classifier",
    TRAINED_ON: "GSI Landslide Atlas, CWC River Stage & IMERG Telemetry Records",
    // Strictly synchronized with the 12 active verified disaster regions
    VALIDATED_AREAS: [
      "slope_unit_10820", "BR-WC-10830", "MH-MM-40100", "MH-PN-40200",
      "UK-SU-20820", "BR-ST-10840", "UK-CH-30112", "UP-GK-50110",
      "OD-SB-60100", "MH-NS-40300", "AS-LK-80130", "MH-PL-40400"
    ]
  },

  // Map Initialization (Centered on Uttarkashi Pilot Zone)
  MAP_INIT: {
    center: [30.9000, 78.4000],
    zoom: 9,
    minZoom: 4,
    maxZoom: 18
  },

  // Basemap Tile Providers
  TILE_PROVIDERS: {
    satellite: {
      name: "Satellite",
      url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      attribution: "Esri, Maxar, Earthstar Geographics, USDA, USGS"
    },
    standard: {
      name: "Standard",
      url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
      subdomains: "abc",
      attribution: "&copy; OpenStreetMap contributors"
    },
    elevation: {
      name: "DEM / Topographic",
      url: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
      subdomains: "abc",
      attribution: "Map data: &copy; OpenStreetMap contributors, SRTM | Style: OpenTopoMap"
    },
    terrain: {
      name: "Terrain",
      url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Shaded_Relief/MapServer/tile/{z}/{y}/{x}",
      attribution: "Esri, USGS, NOAA"
    },
    maptiler_hybrid: {
      name: "MapTiler 3D Real Satellite",
      url: "https://api.maptiler.com/maps/hybrid/style.json?key=rgoSdjnjeWOJOJ0mO1RH",
      attribution: "&copy; <a href=\"https://www.maptiler.com/\" target=\"_blank\">MapTiler</a> &copy; <a href=\"https://www.openstreetmap.org/copyright\" target=\"_blank\">OpenStreetMap</a>"
    }
  },

  // Operational Map Overlays Registry
  MAP_LAYERS_REGISTRY: {
    risk_prediction: [
      { id: "risk_extreme", name: "Extreme Risk (Red)", color: "#dc2626", defaultOn: true },
      { id: "risk_high", name: "High Risk (Orange)", color: "#ea580c", defaultOn: true },
      { id: "risk_moderate", name: "Moderate Risk (Yellow)", color: "#d97706", defaultOn: true },
      { id: "risk_low", name: "Low Risk (Green)", color: "#16a34a", defaultOn: true }
    ],
    environmental: [
      { id: "layer_rain_heatmap", name: "24h Rainfall Accumulation", defaultOn: true },
      { id: "layer_soil_moisture", name: "Soil Moisture Index (SMAP/ERA5)", defaultOn: true },
      { id: "layer_rain_forecast", name: "Rainfall Forecast Overlay", defaultOn: false }
    ],
    terrain: [
      { id: "layer_elevation_contours", name: "Elevation Contours", defaultOn: false },
      { id: "layer_slope_shading", name: "Slope Steepness Shading (>30°)", defaultOn: false },
      { id: "layer_aspect", name: "Slope Aspect Directions", defaultOn: false }
    ],
    history: [
      { id: "layer_hist_landslides", name: "Historical Landslides (GSI/NASA)", defaultOn: true },
      { id: "layer_hist_floods", name: "Historical Floods (CWC/Sentinel)", defaultOn: true }
    ],
    geography: [
      { id: "layer_watersheds", name: "Watershed Boundaries", defaultOn: true },
      { id: "layer_rivers", name: "Rivers & Drainage Streams", defaultOn: true },
      { id: "layer_villages", name: "Village Settlement Markers", defaultOn: true },
      { id: "layer_admin_boundaries", name: "District/Subdivision Borders", defaultOn: true }
    ],
    exposure: [
      { id: "layer_roads", name: "Road Network (NH-34 / State Highways)", defaultOn: true },
      { id: "layer_hospitals", name: "Hospitals & Medical Clinics", defaultOn: true },
      { id: "layer_schools", name: "Schools & Public Buildings", defaultOn: false },
      { id: "layer_emergency_facilities", name: "Emergency Relief Facilities", defaultOn: true }
    ]
  },

  // Risk Tier Definitions
  RISK_TIERS: {
    Red: { name: "Extreme", color: "#dc2626", fillColor: "rgba(220, 38, 38, 0.75)" },
    Orange: { name: "High", color: "#ea580c", fillColor: "rgba(234, 88, 12, 0.65)" },
    Yellow: { name: "Moderate", color: "#d97706", fillColor: "rgba(217, 119, 6, 0.45)" },
    Green: { name: "Low", color: "#16a34a", fillColor: "rgba(22, 163, 74, 0.3)" }
  },

  ROLES: {
    AUTHORIZED: "AUTHORIZED_AUTHORITY",
    PUBLIC: "NORMAL_VIEWER"
  }
};

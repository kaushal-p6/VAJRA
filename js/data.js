/* ==========================================================================
   VAJRA - Operational Datasets, Historical Event Catalogs & Infrastructure
   ========================================================================== */

const VAJRA_DATA = {
  // Department Login Presets
  DEPARTMENTS: [
    { id: "NDRF-HQ-01", name: "NDRF National Command HQ", state: "Central / New Delhi" },
    { id: "SDMA-UK-04", name: "Uttarakhand State Disaster Mgmt", state: "Uttarakhand" },
    { id: "SDMA-KL-02", name: "Kerala State Disaster Mgmt", state: "Kerala" },
    { id: "SDMA-HP-07", name: "Himachal Pradesh SDMA", state: "Himachal Pradesh" },
    { id: "SDMA-SK-01", name: "Sikkim SDMA", state: "Sikkim" }
  ],

  // 1. Uttarkashi Pilot Region Slope Units & Watershed Telemetry
  REGIONS: [
    {
      unit_id: "UK-SU-20820",
      village: "Bhatwari",
      district: "Uttarkashi",
      state: "Uttarakhand",
      watershed_id: "BHAGIRATHI-WS-04",
      hazard_type: "Landslide & Cloudburst",
      is_ml_validated: true, // ML Pilot Model validated region
      data_coverage_type: "ML Model Prediction (Uttarkashi Pilot)",
      center: [30.9821, 78.4512],
      coordinates: [
        [30.995, 78.435],
        [30.998, 78.465],
        [30.970, 78.472],
        [30.965, 78.440]
      ],
      // ML Model Output
      risk_score: 0.94,
      risk_tier: "Red",
      risk_trend: "Increasing", // Increasing / Stable / Decreasing
      hazard_window_hours: "Elevated risk expected during next 6 hours",
      ml_model_version: "VAJRA Landslide XGBoost v1.0",
      ml_timestamp: "2026-09-27 01:25 IST",
      
      // Data Quality Badges
      data_quality: {
        rainfall: "Good",
        soil_moisture: "Good",
        sensors: "Good",
        last_updated: "10 mins ago"
      },

      // Model Input Conditions & Environmental Variables
      environmental_inputs: {
        rainfall_latest_mm: 14.2,
        rainfall_1h_mm: 18.5,
        rainfall_3h_mm: 42.0,
        rainfall_6h_mm: 68.0,
        rainfall_12h_mm: 110.0,
        rainfall_24h_mm: 142.0,
        rainfall_72h_mm: 184.0,
        forecast_1h_mm: 22.0,
        forecast_3h_mm: 48.0,
        forecast_6h_mm: 75.0,
        forecast_12h_mm: 92.0,
        forecast_24h_mm: 115.0,
        soil_moisture_pct: 94.0,
        soil_moisture_source: "ERA5-Land / SMAP Sat (2026-09-27)",
        slope_angle_deg: 38.0,
        elevation_m: 1420,
        aspect: "NW (315°)",
        land_cover: "Sparse Vegetation / Fractured Slope",
        soil_type: "Dystric Cambisols (High Runoff Soil)"
      },

      // Main Risk Driver Categorization
      main_risk_drivers: [
        { name: "Rainfall (24h: 142mm)", level: "High", impact: "Triggers slope liquefaction & gully erosion" },
        { name: "Soil Moisture (94%)", level: "High", impact: "Exceeds saturation threshold" },
        { name: "Slope Angle (38°)", level: "High", impact: "Exceeds critical shear stability angle" },
        { name: "Land Cover / Fractured Bedrock", level: "Moderate", impact: "Unstable overburden topsoil" }
      ],

      // Historical Event Timeline for this location
      historical_event_timeline: [
        { year: "2013", date: "16-17 June 2013", type: "Major Landslide & Debris Flow", severity: "Extreme", rain_24h: "380 mm", source: "GSI Landslide Atlas" },
        { year: "2018", date: "12 August 2018", type: "Slope Failure & Road Blockade", severity: "Moderate", rain_24h: "125 mm", source: "Uttarakhand SDMA Logs" },
        { year: "2021", date: "19 October 2021", type: "Torrential Mudslide", severity: "High", rain_24h: "165 mm", source: "IMD Extreme Weather Archive" }
      ],

      // Exposure & Vulnerability Analysis
      exposure: {
        population_in_zone: 420,
        villages_affected_count: 1,
        buildings_count: 64,
        road_segments_affected: ["NH-34 Bhatwari Bypass (1.4 km)"],
        hospitals_nearby: ["Bhatwari Primary Health Center (0.8 km)"],
        schools_nearby: ["Govt Higher Secondary School Bhatwari (0.5 km)"],
        emergency_services: ["Bhatwari Fire & Rescue Station (1.1 km)"]
      },

      riverbed_elevation_m: 1120,
      predicted_flood_height_m: 18,

      // Candidate Safe High-Ground (Algorithmically Derived)
      candidate_safe_high_ground: {
        name: "Bhatwari Ridge Crest Candidate High-Ground",
        lat: 30.9925,
        lon: 78.4630,
        elevation_m: 1280,
        relative_safe_height_m: 142,
        distance_km: 1.9,
        est_walk_minutes: 25,
        road_accessibility: "Accessible via Footpath / Ridge Trail"
      },

      // Official Designated Government Shelter
      official_government_shelter: {
        name: "Bhatwari Govt Inter College Relief Camp (Official Shelter)",
        lat: 30.9905,
        lon: 78.4601,
        capacity: 800,
        contact: "+91 1374 222108",
        facility_type: "Designated SDMA Relief Center"
      }
    },
    {
      unit_id: "UK-SU-20821",
      village: "Gangotri Valley (Jangla)",
      district: "Uttarkashi",
      state: "Uttarakhand",
      watershed_id: "BHAGIRATHI-WS-02",
      hazard_type: "Debris Flow & Rockfall",
      is_ml_validated: true,
      data_coverage_type: "ML Model Prediction (Uttarkashi Pilot)",
      center: [31.0250, 78.7800],
      coordinates: [
        [31.040, 78.760],
        [31.045, 78.800],
        [31.010, 78.805],
        [31.005, 78.765]
      ],
      risk_score: 0.81,
      risk_tier: "Orange",
      risk_trend: "Stable",
      hazard_window_hours: "Elevated risk expected during next 12 hours",
      ml_model_version: "VAJRA Landslide XGBoost v1.0",
      ml_timestamp: "2026-09-27 01:25 IST",
      
      data_quality: {
        rainfall: "Good",
        soil_moisture: "Good",
        sensors: "Delayed",
        last_updated: "25 mins ago"
      },

      environmental_inputs: {
        rainfall_latest_mm: 11.0,
        rainfall_1h_mm: 14.0,
        rainfall_3h_mm: 32.0,
        rainfall_6h_mm: 54.0,
        rainfall_12h_mm: 86.0,
        rainfall_24h_mm: 112.0,
        rainfall_72h_mm: 148.0,
        forecast_1h_mm: 15.0,
        forecast_3h_mm: 35.0,
        forecast_6h_mm: 52.0,
        forecast_12h_mm: 68.0,
        forecast_24h_mm: 85.0,
        soil_moisture_pct: 88.0,
        soil_moisture_source: "ERA5-Land / SMAP Sat",
        slope_angle_deg: 41.0,
        elevation_m: 2650,
        aspect: "NE (45°)",
        land_cover: "Glacial Moraine / Steep Scree Slope",
        soil_type: "Leptosols (Shallow Stony Soil)"
      },

      main_risk_drivers: [
        { name: "Slope Steepness (41°)", level: "High", impact: "Unstable rockfall slope" },
        { name: "Soil Moisture (88%)", level: "High", impact: "Saturates glacial till" },
        { name: "Rainfall (24h: 112mm)", level: "Moderate", impact: "Continuous high-altitude drizzle" }
      ],

      historical_event_timeline: [
        { year: "2013", date: "17 June 2013", type: "Glacial Outburst & Rockslide", severity: "Extreme", rain_24h: "310 mm", source: "GSI Landslide Atlas" },
        { year: "2022", date: "04 August 2022", type: "NH-34 Highway Rockfall", severity: "Moderate", rain_24h: "95 mm", source: "Border Roads Organisation (BRO)" }
      ],

      exposure: {
        population_in_zone: 210,
        villages_affected_count: 1,
        buildings_count: 28,
        road_segments_affected: ["Gangotri Highway NH-34 (2.1 km)"],
        hospitals_nearby: ["Harsil Army Aid Post (4.2 km)"],
        schools_nearby: ["Govt Primary School Harsil (4.0 km)"],
        emergency_services: ["ITBP Battalion 35 Post (1.5 km)"]
      },

      riverbed_elevation_m: 2520,
      predicted_flood_height_m: 14,

      candidate_safe_high_ground: {
        name: "Jangla High Plateau Candidate Safe Area",
        lat: 31.0350,
        lon: 78.7900,
        elevation_m: 2780,
        relative_safe_height_m: 240,
        distance_km: 2.2,
        est_walk_minutes: 35,
        road_accessibility: "Accessible via BRO Patrol Road"
      },

      official_government_shelter: {
        name: "Harsil Tourist Lodge Emergency Shelter (Official)",
        lat: 31.0380,
        lon: 78.7350,
        capacity: 500,
        contact: "+91 1374 222215",
        facility_type: "Designated BRO / SDMA Staging Post"
      }
    },
    {
      unit_id: "UK-SU-20822",
      village: "Joshiyara & Maneri",
      district: "Uttarkashi",
      state: "Uttarakhand",
      watershed_id: "BHAGIRATHI-WS-05",
      hazard_type: "Flash Flood & Embankment Erosion",
      is_ml_validated: true,
      data_coverage_type: "ML Model Prediction (Uttarkashi Pilot)",
      center: [30.7300, 78.4450],
      coordinates: [
        [30.745, 78.425],
        [30.750, 78.465],
        [30.715, 78.470],
        [30.710, 78.430]
      ],
      risk_score: 0.74,
      risk_tier: "Orange",
      risk_trend: "Increasing",
      hazard_window_hours: "Elevated risk expected during next 8 hours",
      ml_model_version: "VAJRA Landslide XGBoost v1.0",
      ml_timestamp: "2026-09-27 01:25 IST",
      
      data_quality: {
        rainfall: "Good",
        soil_moisture: "Good",
        sensors: "Good",
        last_updated: "5 mins ago"
      },

      environmental_inputs: {
        rainfall_latest_mm: 12.5,
        rainfall_1h_mm: 16.0,
        rainfall_3h_mm: 36.0,
        rainfall_6h_mm: 58.0,
        rainfall_12h_mm: 88.0,
        rainfall_24h_mm: 105.0,
        rainfall_72h_mm: 138.0,
        forecast_1h_mm: 18.0,
        forecast_3h_mm: 40.0,
        forecast_6h_mm: 62.0,
        forecast_12h_mm: 78.0,
        forecast_24h_mm: 95.0,
        soil_moisture_pct: 86.0,
        soil_moisture_source: "ERA5-Land / SMAP Sat",
        slope_angle_deg: 26.0,
        elevation_m: 1150,
        aspect: "SW (225°)",
        land_cover: "River Terraces / Settlement Zone",
        soil_type: "Fluvisols (Alluvial River Soil)"
      },

      main_risk_drivers: [
        { name: "Upstream Bhagirathi Discharge", level: "High", impact: "Dam release & high surge volume" },
        { name: "Soil Saturation (86%)", level: "High", impact: "Terrace soil softening" }
      ],

      historical_event_timeline: [
        { year: "2012", date: "04 August 2012", type: "Uttarkashi Flash Flood", severity: "Extreme", rain_24h: "240 mm", source: "CWC Flood Records" },
        { year: "2013", date: "16 June 2013", type: "Bhagirathi Inundation", severity: "Extreme", rain_24h: "350 mm", source: "CWC Flood Records" }
      ],

      exposure: {
        population_in_zone: 680,
        villages_affected_count: 2,
        buildings_count: 112,
        road_segments_affected: ["Uttarkashi Main Market Road (1.8 km)"],
        hospitals_nearby: ["District Hospital Uttarkashi (1.2 km)"],
        schools_nearby: ["Govt Degree College Joshiyara (0.6 km)"],
        emergency_services: ["District Emergency Operations Centre DEOC (0.9 km)"]
      },

      riverbed_elevation_m: 1100,
      predicted_flood_height_m: 12,

      candidate_safe_high_ground: {
        name: "Joshiyara Upper Helipad Ground",
        lat: 30.7380,
        lon: 78.4520,
        elevation_m: 1220,
        relative_safe_height_m: 108,
        distance_km: 1.5,
        est_walk_minutes: 20,
        road_accessibility: "Paved Motorable Road"
      },

      official_government_shelter: {
        name: "District Sports Stadium Evacuation Center (Official)",
        lat: 30.7340,
        lon: 78.4480,
        capacity: 1500,
        contact: "+91 1374 222126",
        facility_type: "Designated District Emergency Shelter"
      }
    },
    {
      unit_id: "UK-SU-20823",
      village: "Barkot & Yamunotri Route",
      district: "Uttarkashi",
      state: "Uttarakhand",
      watershed_id: "YAMUNA-WS-01",
      hazard_type: "Slope Slump & Mudslide",
      is_ml_validated: true,
      data_coverage_type: "ML Model Prediction (Uttarkashi Pilot)",
      center: [30.8100, 78.2000],
      coordinates: [
        [30.825, 78.180],
        [30.830, 78.220],
        [30.795, 78.225],
        [30.790, 78.185]
      ],
      risk_score: 0.52,
      risk_tier: "Yellow",
      risk_trend: "Stable",
      hazard_window_hours: "Elevated risk expected during next 24 hours",
      ml_model_version: "VAJRA Landslide XGBoost v1.0",
      ml_timestamp: "2026-09-27 01:25 IST",
      
      data_quality: {
        rainfall: "Good",
        soil_moisture: "Good",
        sensors: "Good",
        last_updated: "15 mins ago"
      },

      environmental_inputs: {
        rainfall_latest_mm: 6.0,
        rainfall_1h_mm: 8.0,
        rainfall_3h_mm: 18.0,
        rainfall_6h_mm: 32.0,
        rainfall_12h_mm: 48.0,
        rainfall_24h_mm: 64.0,
        rainfall_72h_mm: 82.0,
        forecast_1h_mm: 10.0,
        forecast_3h_mm: 22.0,
        forecast_6h_mm: 35.0,
        forecast_12h_mm: 45.0,
        forecast_24h_mm: 58.0,
        soil_moisture_pct: 74.0,
        soil_moisture_source: "ERA5-Land / SMAP Sat",
        slope_angle_deg: 31.0,
        elevation_m: 1220,
        aspect: "S (180°)",
        land_cover: "Pine Forest / Terraced Agriculture",
        soil_type: "Eutric Cambisols"
      },

      main_risk_drivers: [
        { name: "Slope Steepness (31°)", level: "Moderate", impact: "Moderate hill slump potential" }
      ],

      historical_event_timeline: [
        { year: "2019", date: "22 July 2019", type: "Yamunotri Highway Mudslide", severity: "Moderate", rain_24h: "85 mm", source: "SDMA Incident Logs" }
      ],

      exposure: {
        population_in_zone: 340,
        villages_affected_count: 1,
        buildings_count: 45,
        road_segments_affected: ["Yamunotri Highway NH-123 (1.2 km)"],
        hospitals_nearby: ["Barkot Community Health Center (1.0 km)"],
        schools_nearby: ["Govt Primary School Barkot (0.7 km)"],
        emergency_services: ["Barkot Police Station (0.8 km)"]
      },

      riverbed_elevation_m: 1180,
      predicted_flood_height_m: 8,

      candidate_safe_high_ground: {
        name: "Barkot PWD Guest House Hill Crest",
        lat: 30.8160,
        lon: 78.2050,
        elevation_m: 1290,
        relative_safe_height_m: 102,
        distance_km: 1.2,
        est_walk_minutes: 15,
        road_accessibility: "Motorable Road"
      },

      official_government_shelter: {
        name: "Barkot Municipal Community Hall (Official)",
        lat: 30.8120,
        lon: 78.2020,
        capacity: 600,
        contact: "+91 1374 224210",
        facility_type: "Designated Local Relief Shelter"
      }
    },
    {
      unit_id: "KL-WY-10492",
      village: "Meppadi (Chooralmala)",
      district: "Wayanad",
      state: "Kerala",
      watershed_id: "CHALIYAR-WS-08",
      hazard_type: "Debris Flow & Landslide",
      is_ml_validated: false, // Broader Environmental Monitoring
      data_coverage_type: "Environmental Weather Monitoring",
      center: [11.5382, 76.1294],
      coordinates: [
        [11.550, 76.110],
        [11.555, 76.145],
        [11.525, 76.150],
        [11.520, 76.115]
      ],
      risk_score: 0.88,
      risk_tier: "Red",
      risk_trend: "Increasing",
      hazard_window_hours: "Elevated risk expected during next 6 hours",
      ml_model_version: "Weather Rule Telemetry",
      ml_timestamp: "2026-09-27 01:25 IST",

      data_quality: {
        rainfall: "Good",
        soil_moisture: "Good",
        sensors: "Good",
        last_updated: "8 mins ago"
      },

      environmental_inputs: {
        rainfall_latest_mm: 18.0,
        rainfall_1h_mm: 24.0,
        rainfall_3h_mm: 58.0,
        rainfall_6h_mm: 92.0,
        rainfall_12h_mm: 135.0,
        rainfall_24h_mm: 168.0,
        rainfall_72h_mm: 210.0,
        forecast_1h_mm: 25.0,
        forecast_3h_mm: 55.0,
        forecast_6h_mm: 80.0,
        forecast_12h_mm: 105.0,
        forecast_24h_mm: 130.0,
        soil_moisture_pct: 96.0,
        soil_moisture_source: "ERA5-Land / Open-Meteo",
        slope_angle_deg: 42.0,
        elevation_m: 740,
        aspect: "SW (210°)",
        land_cover: "Tea Estate / Forest Edge",
        soil_type: "Laterite Soil (High Permeability)"
      },

      main_risk_drivers: [
        { name: "Rainfall (24h: 168mm)", level: "High", impact: "Heavy monsoon downpour" },
        { name: "Soil Moisture (96%)", level: "High", impact: "Peak saturation capacity reached" },
        { name: "Slope Angle (42°)", level: "High", impact: "Steep tea estate slope" }
      ],

      historical_event_timeline: [
        { year: "2020", date: "07 August 2020", type: "Pettimudi / Wayanad Debris Flow", severity: "Extreme", rain_24h: "220 mm", source: "KSDMA Records" },
        { year: "2024", date: "30 July 2024", type: "Chooralmala Massive Landslide", severity: "Extreme", rain_24h: "340 mm", source: "NDRF Command Logs" }
      ],

      exposure: {
        population_in_zone: 650,
        villages_affected_count: 2,
        buildings_count: 85,
        road_segments_affected: ["Meppadi-Chooralmala Road (3.2 km)"],
        hospitals_nearby: ["Meppadi Community Health Center (2.5 km)"],
        schools_nearby: ["St. Joseph School Chooralmala (1.1 km)"],
        emergency_services: ["Fire & Rescue Station Kalpetta (8.0 km)"]
      },

      riverbed_elevation_m: 740,
      predicted_flood_height_m: 22,

      candidate_safe_high_ground: {
        name: "Vellarimala High Ridge Candidate Safe Area",
        lat: 11.5470,
        lon: 76.1410,
        elevation_m: 920,
        relative_safe_height_m: 158,
        distance_km: 2.4,
        est_walk_minutes: 32,
        road_accessibility: "Footpath Trail"
      },

      official_government_shelter: {
        name: "St. Joseph Higher Sec School Evacuation Hub (Official)",
        lat: 11.5450,
        lon: 76.1380,
        capacity: 1200,
        contact: "+91 4936 202350",
        facility_type: "Designated KSDMA Evacuation Shelter"
      }
    }
  ],

  // 2. Real Recorded Historical Disaster Catalog (GSI & CWC Datasets)
  HISTORICAL_DISASTER_CATALOG: [
    {
      id: "HIST-2013-01",
      date: "16-17 June 2013",
      location: "Kedarnath & Uttarkashi Upper Catchment",
      district: "Uttarkashi & Rudraprayag",
      state: "Uttarakhand",
      hazard_type: "Landslide & Glacial Debris Surge",
      category: "landslide", // drives which map layer toggle this marker belongs to
      coordinates: [30.9821, 78.4512],
      severity: "Extreme",
      rainfall_around_event_24h: "380 mm",
      soil_saturation_pct: 98,
      source: "Geological Survey of India (GSI) Landslide Atlas"
    },
    {
      id: "HIST-2018-02",
      date: "12 August 2018",
      location: "Bhatwari Bypass NH-34",
      district: "Uttarkashi",
      state: "Uttarakhand",
      hazard_type: "Slope Failure & Debris Blockade",
      category: "landslide",
      coordinates: [30.9750, 78.4480],
      severity: "Moderate",
      rainfall_around_event_24h: "125 mm",
      soil_saturation_pct: 89,
      source: "Uttarakhand State Disaster Management Authority Logs"
    },
    {
      id: "HIST-2021-03",
      date: "07 February 2021",
      location: "Chamoli & Dhauliganga River Basin",
      district: "Chamoli",
      state: "Uttarakhand",
      hazard_type: "Rock & Ice Avalanche Flash Flood",
      category: "flood",
      coordinates: [30.5500, 79.5800],
      severity: "Extreme",
      rainfall_around_event_24h: "145 mm (Combined Melt)",
      soil_saturation_pct: 92,
      source: "ISRO Bhuvan / CWC Flood Archive"
    },
    {
      id: "HIST-2023-04",
      date: "14 July 2023",
      location: "Thunag & Pandoh Dam Basin",
      district: "Mandi",
      state: "Himachal Pradesh",
      hazard_type: "Riverine Flash Flood",
      category: "flood",
      coordinates: [31.7084, 76.9320],
      severity: "High",
      rainfall_around_event_24h: "210 mm",
      soil_saturation_pct: 95,
      source: "Central Water Commission (CWC)"
    }
  ],

  // 2b. Approximate River Courses through the Pilot Region (Bhagirathi & Yamuna valleys)
  RIVERS: [
    {
      id: "RIVER-BHAGIRATHI",
      name: "Bhagirathi River",
      coordinates: [
        [31.030, 78.790], [31.010, 78.700], [30.998, 78.560],
        [30.982, 78.451], [30.870, 78.445], [30.732, 78.442],
        [30.600, 78.420]
      ]
    },
    {
      id: "RIVER-YAMUNA",
      name: "Yamuna River",
      coordinates: [
        [30.900, 78.450], [30.850, 78.320], [30.810, 78.200],
        [30.760, 78.150], [30.700, 78.090]
      ]
    }
  ],

  // 3. Infrastructure Datasets (Hospitals, Emergency Stations, Schools)
  INFRASTRUCTURE: [
    {
      id: "HOSP-01",
      name: "District Hospital Uttarkashi",
      type: "Hospital",
      lat: 30.7320,
      lon: 78.4420,
      district: "Uttarkashi",
      capacity_beds: 120,
      emergency_phone: "+91 1374 222201"
    },
    {
      id: "HOSP-02",
      name: "Bhatwari Primary Health Center",
      type: "Hospital",
      lat: 30.9850,
      lon: 78.4550,
      district: "Uttarkashi",
      capacity_beds: 25,
      emergency_phone: "+91 1374 222108"
    },
    {
      id: "EMERG-01",
      name: "NDRF Quick Response Staging Post #4",
      type: "Emergency Services",
      lat: 30.7400,
      lon: 78.4500,
      district: "Uttarkashi",
      capacity_beds: 0,
      emergency_phone: "+91 1374 222100"
    },
    {
      id: "EMERG-02",
      name: "Bhatwari Fire & Rescue Station",
      type: "Emergency Services",
      lat: 30.9810,
      lon: 78.4520,
      district: "Uttarkashi",
      capacity_beds: 0,
      emergency_phone: "+91 1374 222101"
    }
  ],

  // 4. Alert History Database (Logged Operational Warnings)
  ALERT_HISTORY: [
    {
      id: "ALT-2026-0927-01",
      timestamp: "2026-09-27 01:15 IST",
      location: "Bhatwari, Uttarkashi",
      district: "Uttarkashi",
      hazard_type: "Landslide & Cloudburst",
      risk_score: 94,
      risk_tier: "Red",
      status: "Active", // Active / Resolved
      action_taken: "CAP Broadcast Issued to C-DOT CBE (Cell Broadcast Active)",
      logged_by: "NDRF-HQ-01"
    },
    {
      id: "ALT-2026-0927-02",
      timestamp: "2026-09-27 00:45 IST",
      location: "Meppadi (Chooralmala), Wayanad",
      district: "Wayanad",
      hazard_type: "Debris Flow & Landslide",
      risk_score: 88,
      risk_tier: "Red",
      status: "Active",
      action_taken: "KSDMA District Control Notified & Evacuation Advisory Ready",
      logged_by: "SDMA-KL-02"
    },
    {
      id: "ALT-2026-0926-03",
      timestamp: "2026-09-26 18:30 IST",
      location: "Gangotri Valley (Jangla), Uttarkashi",
      district: "Uttarkashi",
      hazard_type: "Debris Flow & Rockfall",
      risk_score: 81,
      risk_tier: "Orange",
      status: "Active",
      action_taken: "BRO Highway Patrol Deployed on NH-34",
      logged_by: "NDRF-HQ-01"
    },
    {
      id: "ALT-2026-0926-04",
      timestamp: "2026-09-26 12:00 IST",
      location: "Joshiyara, Uttarkashi",
      district: "Uttarkashi",
      hazard_type: "Flash Flood",
      risk_score: 74,
      risk_tier: "Orange",
      status: "Resolved",
      action_taken: "Water Level Monitoring Stabilized at Maneri Dam",
      logged_by: "SDMA-UK-04"
    }
  ],

  // System Notifications
  NOTIFICATIONS: [
    {
      id: "notif-101",
      title: "ML ALERT: Uttarkashi Red Hazard (Bhatwari)",
      message: "VAJRA Model Prediction: Bhatwari (UK-SU-20820) reached 94% landslide risk probability. 142mm rain recorded.",
      timestamp: "01:15 IST - Today",
      type: "alert",
      target: "AUTHORIZED_ONLY",
      unread: true
    },
    {
      id: "notif-102",
      title: "EXTREME WARNING: Wayanad Heavy Rain",
      message: "Meppadi Chooralmala slope unit reached 96% soil saturation index. 168mm rainfall.",
      timestamp: "00:45 IST - Today",
      type: "alert",
      target: "AUTHORIZED_ONLY",
      unread: true
    },
    {
      id: "notif-103",
      title: "Weather Highlight: Uttarkashi 24h Rain Telemetry",
      message: "Uttarkashi rainfall telemetry: 142mm recorded in past 24 hours. Bhagirathi river water level monitored.",
      timestamp: "23:30 IST - Yesterday",
      type: "highlight",
      target: "ALL",
      unread: false
    }
  ]
};

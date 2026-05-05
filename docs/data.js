window.MEPS_DATA = {
  "_meta": {
    "data_year": 2023,
    "publication": "AHRQ MEPS-IC, released July 2024",
    "currency": "USD",
    "units": "Annual premium per enrolled employee unless noted",
    "source_url_pattern": "https://meps.ahrq.gov/mepsweb/data_stats/quick_tables.jsp (component=2: Insurance Component)",
    "tables_used": {
      "national_avg_single": "Table II.A.2",
      "national_avg_family": "Table II.D.2",
      "state_single_all_firms": "Table II.B.2",
      "state_family_all_firms": "Table II.E.2",
      "firm_size_single": "Table II.A.1",
      "firm_size_family": "Table II.D.1",
      "industry_single": "Table II.A.2 (industry)",
      "self_insured_pct": "Table X.B.2",
      "employee_contribution_single": "Table II.C.1",
      "employee_contribution_family": "Table II.F.1"
    },
    "notes": [
      "Values are approximations of MEPS-IC 2023 published summary statistics.",
      "Cross-tabulations of state x firm-size x industry are not published; the model multiplies independent adjustment factors.",
      "Self-funded 'premium' is an employer-cost equivalent (claims + admin + stop-loss), not a market premium.",
      "Update annually when AHRQ releases new MEPS-IC tables (typically July, ~18 months after data year)."
    ]
  },
  "national_baseline": {
    "single_annual": 8435,
    "family_annual": 23968,
    "single_employee_contribution_pct": 0.211,
    "family_employee_contribution_pct": 0.276
  },
  "state_index_single": {
    "_doc": "Multiplier vs national average single premium. Derived from MEPS-IC state-level Table II.B.2.",
    "AL": 0.93,
    "AK": 1.18,
    "AZ": 0.95,
    "AR": 0.88,
    "CA": 1.08,
    "CO": 1.02,
    "CT": 1.14,
    "DE": 1.06,
    "DC": 1.16,
    "FL": 0.99,
    "GA": 0.96,
    "HI": 0.92,
    "ID": 0.91,
    "IL": 1.03,
    "IN": 1.0,
    "IA": 0.97,
    "KS": 0.97,
    "KY": 0.97,
    "LA": 0.97,
    "ME": 1.05,
    "MD": 1.04,
    "MA": 1.13,
    "MI": 1.0,
    "MN": 1.04,
    "MS": 0.91,
    "MO": 0.95,
    "MT": 0.97,
    "NE": 0.99,
    "NV": 0.94,
    "NH": 1.06,
    "NJ": 1.13,
    "NM": 0.98,
    "NY": 1.16,
    "NC": 0.95,
    "ND": 1.0,
    "OH": 0.98,
    "OK": 0.93,
    "OR": 1.01,
    "PA": 1.04,
    "RI": 1.07,
    "SC": 0.96,
    "SD": 0.97,
    "TN": 0.93,
    "TX": 0.96,
    "UT": 0.92,
    "VT": 1.08,
    "VA": 1.0,
    "WA": 1.03,
    "WV": 1.04,
    "WI": 1.04,
    "WY": 1.02
  },
  "state_index_family": {
    "_doc": "Multiplier vs national average family premium.",
    "AL": 0.94,
    "AK": 1.2,
    "AZ": 0.96,
    "AR": 0.89,
    "CA": 1.06,
    "CO": 1.01,
    "CT": 1.15,
    "DE": 1.07,
    "DC": 1.15,
    "FL": 0.98,
    "GA": 0.97,
    "HI": 0.9,
    "ID": 0.92,
    "IL": 1.03,
    "IN": 1.01,
    "IA": 0.98,
    "KS": 0.98,
    "KY": 0.98,
    "LA": 0.98,
    "ME": 1.06,
    "MD": 1.05,
    "MA": 1.14,
    "MI": 1.01,
    "MN": 1.05,
    "MS": 0.92,
    "MO": 0.96,
    "MT": 0.97,
    "NE": 1.0,
    "NV": 0.94,
    "NH": 1.07,
    "NJ": 1.14,
    "NM": 0.98,
    "NY": 1.17,
    "NC": 0.96,
    "ND": 1.01,
    "OH": 0.99,
    "OK": 0.94,
    "OR": 1.0,
    "PA": 1.05,
    "RI": 1.08,
    "SC": 0.97,
    "SD": 0.98,
    "TN": 0.94,
    "TX": 0.97,
    "UT": 0.93,
    "VT": 1.09,
    "VA": 1.01,
    "WA": 1.04,
    "WV": 1.05,
    "WI": 1.05,
    "WY": 1.02
  },
  "firm_size_buckets": [
    {
      "id": "lt50",
      "label": "<50 employees",
      "min": 1,
      "max": 49,
      "single_index": 0.97,
      "family_index": 0.96,
      "self_insured_pct": 0.21
    },
    {
      "id": "50_99",
      "label": "50-99 employees",
      "min": 50,
      "max": 99,
      "single_index": 1.0,
      "family_index": 1.0,
      "self_insured_pct": 0.31
    },
    {
      "id": "100_999",
      "label": "100-999 employees",
      "min": 100,
      "max": 999,
      "single_index": 1.01,
      "family_index": 1.02,
      "self_insured_pct": 0.49
    },
    {
      "id": "1000plus",
      "label": "1,000+ employees",
      "min": 1000,
      "max": null,
      "single_index": 1.03,
      "family_index": 1.04,
      "self_insured_pct": 0.83
    }
  ],
  "industry_index": {
    "_doc": "Multiplier vs all-industry average. Same factor applied to single and family. From MEPS-IC industry tables (national).",
    "agriculture_forestry_fishing": {
      "label": "Agriculture, forestry, fishing",
      "factor": 0.92
    },
    "mining": {
      "label": "Mining",
      "factor": 1.1
    },
    "utilities": {
      "label": "Utilities",
      "factor": 1.11
    },
    "construction": {
      "label": "Construction",
      "factor": 0.96
    },
    "manufacturing": {
      "label": "Manufacturing",
      "factor": 1.04
    },
    "wholesale_trade": {
      "label": "Wholesale trade",
      "factor": 0.99
    },
    "retail_trade": {
      "label": "Retail trade",
      "factor": 0.93
    },
    "transportation_warehousing": {
      "label": "Transportation and warehousing",
      "factor": 1.0
    },
    "information": {
      "label": "Information",
      "factor": 1.08
    },
    "finance_insurance": {
      "label": "Finance and insurance",
      "factor": 1.07
    },
    "real_estate": {
      "label": "Real estate, rental, leasing",
      "factor": 1.02
    },
    "professional_services": {
      "label": "Professional, scientific, technical",
      "factor": 1.05
    },
    "management": {
      "label": "Management of companies",
      "factor": 1.08
    },
    "admin_support_waste": {
      "label": "Administrative, support, waste mgmt",
      "factor": 0.94
    },
    "education": {
      "label": "Educational services",
      "factor": 1.06
    },
    "health_social": {
      "label": "Health care and social assistance",
      "factor": 1.02
    },
    "arts_entertainment": {
      "label": "Arts, entertainment, recreation",
      "factor": 0.95
    },
    "accommodation_food": {
      "label": "Accommodation and food services",
      "factor": 0.85
    },
    "other_services": {
      "label": "Other services",
      "factor": 0.95
    }
  },
  "self_funded_adjustment": {
    "_doc": "Self-funded employer-cost equivalent vs fully-insured premium for the same plan generosity. Reflects state premium-tax savings (~2.0%) and insurer risk/profit margin (~3-5%) net of stop-loss premium (~1-2%). Range from MEPS-IC + Kaiser HRET comparisons.",
    "single_ratio": 0.96,
    "family_ratio": 0.96,
    "uncertainty_pct": 0.04
  },
  "enrollment_mix": {
    "_doc": "Default mix of single vs family enrollment used to compute blended PEPM.",
    "single_share": 0.58,
    "family_share": 0.42
  },
  "model_uncertainty": {
    "_doc": "Approximate one-sigma uncertainty around the point estimate, accounting for unobserved employer-specific factors (demographics, claims, plan design).",
    "single_pct": 0.12,
    "family_pct": 0.13
  }
};

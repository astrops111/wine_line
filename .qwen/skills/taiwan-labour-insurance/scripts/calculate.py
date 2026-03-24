#!/usr/bin/env python3
"""
Taiwan Labour Insurance Premium Calculator (台灣勞保保費計算器)
Supports: 2025 (民國114年) and 2026 (民國115年)

Usage:
  python calculate.py <salary> [options]

Options:
  --year 2025|2026          Data year (default: 2026)
  --category regular|union|fishermen|govt|self_employed
  --industry-rate 0.0041    OAI industry rate (decimal)
  --days 30                 Days enrolled (for proration)
  --dependants 0-9          Number of NHI dependants
  --disability none|mild|moderate|severe
  --low-income              Low-income household (NHI 100% govt)
  --mid-low-income          Mid-low income (NHI 50% subsidy)
  --typhoon regular|restday|holiday  Calculate typhoon day pay
  --typhoon-hours 8         Hours worked on typhoon day
  --json                    Output raw JSON

Examples:
  python calculate.py 35000
  python calculate.py 28590 --year 2025 --category union --dependants 2
  python calculate.py 50000 --dependants 3 --disability moderate
  python calculate.py 36000 --typhoon restday --typhoon-hours 8
"""

import argparse
import json
import math
import sys

# ============================================================
# YEAR-SPECIFIC DATA
# ============================================================

# NHI brackets shared across years (DB caps at 103,300; official extends to 219,500 from 2024)
_NHI_EXTENDED = [
    48200, 50600, 53000, 55400, 57800, 60800, 63800, 66800, 69800, 72800,
    76500, 80200, 83900, 87600, 92100, 96600, 101100, 105600, 110100, 115500,
    120900, 126300, 131700, 137100, 142500, 147900, 150000,
    156400, 162800, 169200, 175600, 182000, 189400, 197000, 204600, 212000, 219500,
]
# NHI brackets capped at DB limit (103,300) for 2020-2023
_NHI_DB_CAP = [
    48200, 50600, 53000, 55400, 57800, 60800, 63800, 66800, 69800, 72800,
    76500, 80200, 83900, 87600, 92100, 97700, 103300,
]


def _make_li_brackets(insured_values: list) -> list:
    """Generate LI bracket dicts from a list of insured salary values."""
    brackets = []
    for i, val in enumerate(insured_values):
        lo = 0 if i == 0 else insured_values[i - 1] + 1
        hi = val if i < len(insured_values) - 1 else 999999999
        brackets.append({"grade": i + 1, "min": lo, "max": hi, "insured": val})
    return brackets


def _make_oai_brackets(li_values: list, oai_extra: list) -> list:
    """Generate OAI brackets: LI brackets (with proper max) + extra tiers."""
    brackets = []
    all_vals = li_values + oai_extra
    for i, val in enumerate(all_vals):
        lo = 0 if i == 0 else all_vals[i - 1] + 1
        hi = val if i < len(all_vals) - 1 else 999999999
        brackets.append({"grade": i + 1, "min": lo, "max": hi, "insured": val})
    return brackets


# OAI extra tiers above LI cap (shared across all years with separate OAI)
_OAI_EXTRA = [48200, 50600, 53000, 55400, 57800, 60800, 63800, 66800, 69800, 72800]


YEAR_DATA = {
    2020: {
        "minimum_wage_monthly": 23800,
        "minimum_wage_hourly": 158,
        "ordinary_accident_rate": 0.10,  # 10% ordinary + 1% EI = 11% total
        "employment_insurance_rate": 0.01,
        "combined_rate": 0.11,
        "nhi_rate": 0.0469,
        "nhi_avg_dependant_factor": 1.57,
        "li_brackets": _make_li_brackets([
            23800, 24000, 25200, 26400, 27600, 28800, 30300, 31800,
            33300, 34800, 36300, 38200, 40100, 42000, 43900, 45800,
        ]),
        "oai_brackets": _make_li_brackets([  # OAI was part of LI before 2022-05
            23800, 24000, 25200, 26400, 27600, 28800, 30300, 31800,
            33300, 34800, 36300, 38200, 40100, 42000, 43900, 45800,
        ]),
        "nhi_brackets": [
            23800, 24000, 25200, 26400, 27600, 28800, 30300, 31800,
            33300, 34800, 36300, 38200, 40100, 42000, 43900, 45800,
        ] + _NHI_DB_CAP,
    },
    2021: {
        "minimum_wage_monthly": 24000,
        "minimum_wage_hourly": 160,
        "ordinary_accident_rate": 0.105,
        "employment_insurance_rate": 0.01,
        "combined_rate": 0.115,
        "nhi_rate": 0.0517,
        "nhi_avg_dependant_factor": 1.57,
        "li_brackets": _make_li_brackets([
            24000, 25200, 26400, 27600, 28800, 30300, 31800, 33300,
            34800, 36300, 38200, 40100, 42000, 43900, 45800,
        ]),
        "oai_brackets": _make_li_brackets([
            24000, 25200, 26400, 27600, 28800, 30300, 31800, 33300,
            34800, 36300, 38200, 40100, 42000, 43900, 45800,
        ]),
        "nhi_brackets": [
            24000, 25200, 26400, 27600, 28800, 30300, 31800, 33300,
            34800, 36300, 38200, 40100, 42000, 43900, 45800,
        ] + _NHI_DB_CAP,
    },
    2022: {
        "minimum_wage_monthly": 25250,
        "minimum_wage_hourly": 168,
        "ordinary_accident_rate": 0.105,
        "employment_insurance_rate": 0.01,
        "combined_rate": 0.115,
        "nhi_rate": 0.0517,
        "nhi_avg_dependant_factor": 1.57,
        "li_brackets": _make_li_brackets([
            25250, 26400, 27600, 28800, 30300, 31800, 33300, 34800,
            36300, 38200, 40100, 42000, 43900, 45800,
        ]),
        "oai_brackets": _make_oai_brackets([  # OAI separated May 2022
            25250, 26400, 27600, 28800, 30300, 31800, 33300, 34800,
            36300, 38200, 40100, 42000, 43900, 45800,
        ], _OAI_EXTRA),
        "nhi_brackets": [
            25250, 26400, 27600, 28800, 30300, 31800, 33300, 34800,
            36300, 38200, 40100, 42000, 43900, 45800,
        ] + _NHI_DB_CAP,
    },
    2023: {
        "minimum_wage_monthly": 26400,
        "minimum_wage_hourly": 176,
        "ordinary_accident_rate": 0.11,
        "employment_insurance_rate": 0.01,
        "combined_rate": 0.12,
        "nhi_rate": 0.0517,
        "nhi_avg_dependant_factor": 1.57,
        "li_brackets": _make_li_brackets([
            26400, 27600, 28800, 30300, 31800, 33300, 34800, 36300,
            38200, 40100, 42000, 43900, 45800,
        ]),
        "oai_brackets": _make_oai_brackets([
            26400, 27600, 28800, 30300, 31800, 33300, 34800, 36300,
            38200, 40100, 42000, 43900, 45800,
        ], _OAI_EXTRA),
        "nhi_brackets": [
            26400, 27600, 28800, 30300, 31800, 33300, 34800, 36300,
            38200, 40100, 42000, 43900, 45800,
        ] + _NHI_DB_CAP,
    },
    2024: {
        "minimum_wage_monthly": 27470,
        "minimum_wage_hourly": 183,
        "ordinary_accident_rate": 0.11,
        "employment_insurance_rate": 0.01,
        "combined_rate": 0.12,
        "nhi_rate": 0.0517,
        "nhi_avg_dependant_factor": 1.57,
        "li_brackets": _make_li_brackets([
            27470, 28800, 30300, 31800, 33300, 34800, 36300, 38200,
            40100, 42000, 43900, 45800,
        ]),
        "oai_brackets": _make_oai_brackets([
            27470, 28800, 30300, 31800, 33300, 34800, 36300, 38200,
            40100, 42000, 43900, 45800,
        ], _OAI_EXTRA),
        "nhi_brackets": [
            27470, 28800, 30300, 31800, 33300, 34800, 36300, 38200,
            40100, 42000, 43900, 45800,
        ] + _NHI_EXTENDED,
    },
    2025: {
        "minimum_wage_monthly": 28590,
        "minimum_wage_hourly": 190,
        "ordinary_accident_rate": 0.115,
        "employment_insurance_rate": 0.01,
        "combined_rate": 0.125,
        "nhi_rate": 0.0517,
        "nhi_avg_dependant_factor": 1.57,
        "li_brackets": [
            {"grade": 1,  "min": 0,     "max": 28590,    "insured": 28590},
            {"grade": 2,  "min": 28591, "max": 28800,     "insured": 28800},
            {"grade": 3,  "min": 28801, "max": 30300,     "insured": 30300},
            {"grade": 4,  "min": 30301, "max": 31800,     "insured": 31800},
            {"grade": 5,  "min": 31801, "max": 33300,     "insured": 33300},
            {"grade": 6,  "min": 33301, "max": 34800,     "insured": 34800},
            {"grade": 7,  "min": 34801, "max": 36300,     "insured": 36300},
            {"grade": 8,  "min": 36301, "max": 38200,     "insured": 38200},
            {"grade": 9,  "min": 38201, "max": 40100,     "insured": 40100},
            {"grade": 10, "min": 40101, "max": 42000,     "insured": 42000},
            {"grade": 11, "min": 42001, "max": 43900,     "insured": 43900},
            {"grade": 12, "min": 43901, "max": 999999999, "insured": 45800},
        ],
        "oai_brackets": [
            {"grade": 1,  "min": 0,     "max": 28590,    "insured": 28590},
            {"grade": 2,  "min": 28591, "max": 28800,     "insured": 28800},
            {"grade": 3,  "min": 28801, "max": 30300,     "insured": 30300},
            {"grade": 4,  "min": 30301, "max": 31800,     "insured": 31800},
            {"grade": 5,  "min": 31801, "max": 33300,     "insured": 33300},
            {"grade": 6,  "min": 33301, "max": 34800,     "insured": 34800},
            {"grade": 7,  "min": 34801, "max": 36300,     "insured": 36300},
            {"grade": 8,  "min": 36301, "max": 38200,     "insured": 38200},
            {"grade": 9,  "min": 38201, "max": 40100,     "insured": 40100},
            {"grade": 10, "min": 40101, "max": 42000,     "insured": 42000},
            {"grade": 11, "min": 42001, "max": 43900,     "insured": 43900},
            {"grade": 12, "min": 43901, "max": 45800,     "insured": 45800},
            {"grade": 13, "min": 45801, "max": 48200,     "insured": 48200},
            {"grade": 14, "min": 48201, "max": 50600,     "insured": 50600},
            {"grade": 15, "min": 50601, "max": 53000,     "insured": 53000},
            {"grade": 16, "min": 53001, "max": 55400,     "insured": 55400},
            {"grade": 17, "min": 55401, "max": 57800,     "insured": 57800},
            {"grade": 18, "min": 57801, "max": 60800,     "insured": 60800},
            {"grade": 19, "min": 60801, "max": 63800,     "insured": 63800},
            {"grade": 20, "min": 63801, "max": 66800,     "insured": 66800},
            {"grade": 21, "min": 66801, "max": 69800,     "insured": 69800},
            {"grade": 22, "min": 69801, "max": 999999999, "insured": 72800},
        ],
        "nhi_brackets": [
            28590, 28800, 30300, 31800, 33300, 34800, 36300, 38200,
            40100, 42000, 43900, 45800, 48200, 50600, 53000, 55400,
            57800, 60800, 63800, 66800, 69800, 72800, 76500, 80200,
            83900, 87600, 92100, 96600, 101100, 105600, 110100, 115500,
            120900, 126300, 131700, 137100, 142500, 147900, 150000,
            156400, 162800, 169200, 175600, 182000, 189400, 197000,
            204600, 212000, 219500,
        ],
    },
    2026: {
        "minimum_wage_monthly": 29500,
        "minimum_wage_hourly": 196,
        "ordinary_accident_rate": 0.115,
        "employment_insurance_rate": 0.01,
        "combined_rate": 0.125,
        "nhi_rate": 0.0517,
        "nhi_avg_dependant_factor": 1.57,
        "li_brackets": [
            {"grade": 1,  "min": 0,     "max": 29500,    "insured": 29500},
            {"grade": 2,  "min": 29501, "max": 30300,     "insured": 30300},
            {"grade": 3,  "min": 30301, "max": 31800,     "insured": 31800},
            {"grade": 4,  "min": 31801, "max": 33300,     "insured": 33300},
            {"grade": 5,  "min": 33301, "max": 34800,     "insured": 34800},
            {"grade": 6,  "min": 34801, "max": 36300,     "insured": 36300},
            {"grade": 7,  "min": 36301, "max": 38200,     "insured": 38200},
            {"grade": 8,  "min": 38201, "max": 40100,     "insured": 40100},
            {"grade": 9,  "min": 40101, "max": 42000,     "insured": 42000},
            {"grade": 10, "min": 42001, "max": 43900,     "insured": 43900},
            {"grade": 11, "min": 43901, "max": 999999999, "insured": 45800},
        ],
        "oai_brackets": [
            {"grade": 1,  "min": 0,     "max": 29500,    "insured": 29500},
            {"grade": 2,  "min": 29501, "max": 30300,     "insured": 30300},
            {"grade": 3,  "min": 30301, "max": 31800,     "insured": 31800},
            {"grade": 4,  "min": 31801, "max": 33300,     "insured": 33300},
            {"grade": 5,  "min": 33301, "max": 34800,     "insured": 34800},
            {"grade": 6,  "min": 34801, "max": 36300,     "insured": 36300},
            {"grade": 7,  "min": 36301, "max": 38200,     "insured": 38200},
            {"grade": 8,  "min": 38201, "max": 40100,     "insured": 40100},
            {"grade": 9,  "min": 40101, "max": 42000,     "insured": 42000},
            {"grade": 10, "min": 42001, "max": 43900,     "insured": 43900},
            {"grade": 11, "min": 43901, "max": 45800,     "insured": 45800},
            {"grade": 12, "min": 45801, "max": 48200,     "insured": 48200},
            {"grade": 13, "min": 48201, "max": 50600,     "insured": 50600},
            {"grade": 14, "min": 50601, "max": 53000,     "insured": 53000},
            {"grade": 15, "min": 53001, "max": 55400,     "insured": 55400},
            {"grade": 16, "min": 55401, "max": 57800,     "insured": 57800},
            {"grade": 17, "min": 57801, "max": 60800,     "insured": 60800},
            {"grade": 18, "min": 60801, "max": 63800,     "insured": 63800},
            {"grade": 19, "min": 63801, "max": 66800,     "insured": 66800},
            {"grade": 20, "min": 66801, "max": 69800,     "insured": 69800},
            {"grade": 21, "min": 69801, "max": 999999999, "insured": 72800},
        ],
        "nhi_brackets": [
            29500, 30300, 31800, 33300, 34800, 36300, 38200,
            40100, 42000, 43900, 45800, 48200, 50600, 53000, 55400,
            57800, 60800, 63800, 66800, 69800, 72800, 76500, 80200,
            83900, 87600, 92100, 96600, 101100, 105600, 110100, 115500,
            120900, 126300, 131700, 137100, 142500, 147900, 150000,
            156400, 162800, 169200, 175600, 182000, 189400, 197000,
            204600, 212000, 219500,
        ],
    },
}

# ============================================================
# CATEGORY DEFINITIONS
# ============================================================

OAI_COMMUTING_RATE = 0.0007
OAI_AVG_INDUSTRY_RATE = 0.0014

DISABILITY_SUBSIDY = {
    "none": 0.0,
    "mild": 0.25,
    "moderate": 0.50,
    "severe": 1.00,
}

def get_sharing(category: str, year_data: dict) -> dict:
    """Return premium sharing ratios for the given category."""
    configs = {
        "regular": {
            "label": "一般受僱勞工 (Regular Employee)",
            "li_rate": year_data["combined_rate"],
            "has_employment_insurance": True,
            "li_employee": 0.20, "li_employer": 0.70, "li_government": 0.10,
            "oai_employee": 0.00, "oai_employer": 1.00, "oai_government": 0.00,
            "nhi_category": "1-2",
            "nhi_employee": 0.30, "nhi_employer": 0.60, "nhi_government": 0.10,
        },
        "union": {
            "label": "職業工會會員 (Union Member)",
            "li_rate": year_data["ordinary_accident_rate"],  # 11.5%, no EI
            "has_employment_insurance": False,
            "li_employee": 0.60, "li_employer": 0.00, "li_government": 0.40,
            "oai_employee": 0.60, "oai_employer": 0.00, "oai_government": 0.40,
            "nhi_category": "2",
            "nhi_employee": 0.60, "nhi_employer": 0.00, "nhi_government": 0.40,
        },
        "fishermen": {
            "label": "漁會甲類會員 (Fishermen Assoc. Class A)",
            "li_rate": year_data["combined_rate"],
            "has_employment_insurance": True,
            "li_employee": 0.20, "li_employer": 0.00, "li_government": 0.80,
            "oai_employee": 0.20, "oai_employer": 0.00, "oai_government": 0.80,
            "nhi_category": "3",
            "nhi_employee": 0.30, "nhi_employer": 0.00, "nhi_government": 0.70,
        },
        "govt": {
            "label": "政府機關員工 (Government Staff)",
            "li_rate": year_data["combined_rate"],
            "has_employment_insurance": True,
            "li_employee": 0.20, "li_employer": 0.70, "li_government": 0.10,
            "oai_employee": 0.00, "oai_employer": 1.00, "oai_government": 0.00,
            "nhi_category": "1-1",
            "nhi_employee": 0.30, "nhi_employer": 0.70, "nhi_government": 0.00,
        },
        "self_employed": {
            "label": "自營作業者 (Self-Employed via Union)",
            "li_rate": year_data["ordinary_accident_rate"],
            "has_employment_insurance": False,
            "li_employee": 0.60, "li_employer": 0.00, "li_government": 0.40,
            "oai_employee": 0.60, "oai_employer": 0.00, "oai_government": 0.40,
            "nhi_category": "1-3",
            "nhi_employee": 1.00, "nhi_employer": 0.00, "nhi_government": 0.00,
        },
    }
    return configs[category]


# ============================================================
# BRACKET LOOKUP
# ============================================================

def lookup_bracket(salary: float, brackets: list) -> dict:
    for b in brackets:
        if b["min"] <= salary <= b["max"]:
            return b
    return brackets[-1]


def lookup_nhi_bracket(salary: float, nhi_amounts: list) -> int:
    for amt in nhi_amounts:
        if salary <= amt:
            return amt
    return nhi_amounts[-1]


def rnd(amount: float) -> int:
    """Round to nearest NT$1, half up."""
    return math.floor(amount + 0.5)


# ============================================================
# MAIN CALCULATION
# ============================================================

def calculate(salary: float, year: int = 2026, category: str = "regular",
              industry_rate: float = None, days: int = 30,
              dependants: int = 0, disability: str = "none",
              low_income: bool = False, mid_low_income: bool = False) -> dict:

    yd = YEAR_DATA[year]
    sharing = get_sharing(category, yd)

    if industry_rate is None:
        industry_rate = OAI_AVG_INDUSTRY_RATE
    oai_total_rate = industry_rate + OAI_COMMUTING_RATE
    proration = days / 30.0
    dep_factor = 1 + min(dependants, 3)
    disability_rate = DISABILITY_SUBSIDY.get(disability, 0.0)

    # Bracket lookups
    li_brk = lookup_bracket(salary, yd["li_brackets"])
    oai_brk = lookup_bracket(salary, yd["oai_brackets"])
    nhi_insured = lookup_nhi_bracket(salary, yd["nhi_brackets"])

    li_insured = li_brk["insured"]
    oai_insured = oai_brk["insured"]

    # --- Labour + Employment Insurance ---
    li_total = li_insured * sharing["li_rate"]
    li_emp_base = rnd(li_total * sharing["li_employee"] * proration)
    li_employer = rnd(li_total * sharing["li_employer"] * proration)
    li_govt_base = rnd(li_total * sharing["li_government"] * proration)

    # Apply disability subsidy to employee portion
    li_disability_subsidy = rnd(li_emp_base * disability_rate)
    li_employee = li_emp_base - li_disability_subsidy
    li_govt = li_govt_base + li_disability_subsidy

    # --- OAI ---
    oai_total = oai_insured * oai_total_rate
    oai_emp_base = rnd(oai_total * sharing["oai_employee"] * proration)
    oai_employer = rnd(oai_total * sharing["oai_employer"] * proration)
    oai_govt_base = rnd(oai_total * sharing["oai_government"] * proration)

    oai_disability_subsidy = rnd(oai_emp_base * disability_rate)
    oai_employee = oai_emp_base - oai_disability_subsidy
    oai_govt = oai_govt_base + oai_disability_subsidy

    # --- NHI ---
    nhi_rate = yd["nhi_rate"]
    nhi_base = nhi_insured * nhi_rate

    # Employee NHI (scales with dependants)
    nhi_emp_base = rnd(nhi_base * sharing["nhi_employee"] * dep_factor)

    # Apply disability subsidy to NHI employee portion
    nhi_disability_subsidy = rnd(nhi_emp_base * disability_rate)

    # Apply low-income / mid-low-income subsidy (higher wins)
    nhi_income_subsidy = 0
    income_subsidy_label = None
    if low_income:
        nhi_income_subsidy = nhi_emp_base  # 100%
        income_subsidy_label = "低收入戶 (100%)"
    elif mid_low_income:
        mid_low_sub = rnd(nhi_emp_base * 0.50)
        nhi_income_subsidy = mid_low_sub
        income_subsidy_label = "中低收入戶 (50%)"

    # Use the higher subsidy
    total_nhi_subsidy = max(nhi_disability_subsidy, nhi_income_subsidy)
    nhi_employee = max(0, nhi_emp_base - total_nhi_subsidy)

    # Employer NHI (uses fixed avg dependant factor 1.57)
    if sharing["nhi_employer"] > 0:
        nhi_employer = rnd(nhi_base * sharing["nhi_employer"] * yd["nhi_avg_dependant_factor"])
    else:
        nhi_employer = 0

    # Government NHI
    if sharing["nhi_government"] > 0:
        if sharing["nhi_employer"] > 0:
            # Cat 1-2: govt uses avg factor
            nhi_govt = rnd(nhi_base * sharing["nhi_government"] * yd["nhi_avg_dependant_factor"])
        else:
            # Cat 2, 3, 6-2: govt scales with actual dependants
            nhi_govt = rnd(nhi_base * sharing["nhi_government"] * dep_factor)
    else:
        nhi_govt = 0
    nhi_govt += total_nhi_subsidy

    # --- Labour Pension (勞退) ---
    pension_employer = rnd(salary * 0.06)  # 6% of gross salary, no ceiling

    result = {
        "input": {
            "monthly_salary": salary,
            "year": year,
            "category": category,
            "category_label": sharing["label"],
            "industry_rate": industry_rate,
            "oai_total_rate": oai_total_rate,
            "days": days,
            "proration": round(proration, 4),
            "dependants": dependants,
            "dep_factor": dep_factor,
            "disability": disability,
            "disability_subsidy_rate": disability_rate,
            "low_income": low_income,
            "mid_low_income": mid_low_income,
        },
        "brackets": {
            "labour_insurance": {"grade": li_brk["grade"], "insured_salary": li_insured},
            "occupational_accident": {"grade": oai_brk["grade"], "insured_salary": oai_insured},
            "nhi": {"insured_amount": nhi_insured},
        },
        "premiums": {
            "labour_employment_insurance": {
                "rate": sharing["li_rate"],
                "rate_label": f"{sharing['li_rate']*100:.1f}%",
                "includes_employment_insurance": sharing["has_employment_insurance"],
                "employee": li_employee,
                "employer": li_employer,
                "government": li_govt,
                "disability_subsidy": li_disability_subsidy,
                "total": li_employee + li_employer + li_govt,
            },
            "occupational_accident_insurance": {
                "rate": oai_total_rate,
                "rate_label": f"{oai_total_rate*100:.2f}%",
                "employee": oai_employee,
                "employer": oai_employer,
                "government": oai_govt,
                "disability_subsidy": oai_disability_subsidy,
                "total": oai_employee + oai_employer + oai_govt,
            },
            "nhi": {
                "rate": nhi_rate,
                "rate_label": "5.17%",
                "insured_amount": nhi_insured,
                "dependants": dependants,
                "dep_factor": dep_factor,
                "employee": nhi_employee,
                "employer": nhi_employer,
                "government": nhi_govt,
                "disability_subsidy": nhi_disability_subsidy if disability != "none" else 0,
                "income_subsidy": nhi_income_subsidy,
                "income_subsidy_label": income_subsidy_label,
                "total": nhi_employee + nhi_employer + nhi_govt,
            },
            "labour_pension": {
                "rate": 0.06,
                "rate_label": "6%",
                "employer": pension_employer,
                "note": "Based on gross salary (no ceiling)",
            },
            "combined_monthly": {
                "employee": li_employee + oai_employee + nhi_employee,
                "employer": li_employer + oai_employer + nhi_employer + pension_employer,
                "government": li_govt + oai_govt + nhi_govt,
                "total": (li_employee + oai_employee + nhi_employee +
                          li_employer + oai_employer + nhi_employer + pension_employer +
                          li_govt + oai_govt + nhi_govt),
            },
        },
        "annual": {
            "employee": (li_employee + oai_employee + nhi_employee) * 12,
            "employer": (li_employer + oai_employer + nhi_employer + pension_employer) * 12,
            "government": (li_govt + oai_govt + nhi_govt) * 12,
            "total": ((li_employee + oai_employee + nhi_employee +
                       li_employer + oai_employer + nhi_employer + pension_employer +
                       li_govt + oai_govt + nhi_govt) * 12),
        },
    }
    return result


# ============================================================
# TYPHOON DAY PAY CALCULATION
# ============================================================

def calculate_typhoon(salary: float, day_type: str = "regular",
                      hours: float = 8, year: int = 2026) -> dict:
    """Calculate typhoon day pay.

    day_type: 'regular' (regular workday), 'restday' (休息日), 'holiday' (國定假日)
    hours: hours worked on typhoon day
    """
    hourly = salary / 30 / 8
    daily = salary / 30

    result = {
        "input": {
            "monthly_salary": salary,
            "day_type": day_type,
            "hours_worked": hours,
            "hourly_wage": round(hourly, 2),
            "daily_wage": round(daily, 2),
        },
        "breakdown": {},
    }

    if day_type == "regular":
        # Regular workday: base pay (mandatory) + extra pay (recommended, not defined)
        base_pay = rnd(daily)
        regular_hours = min(hours, 8)
        ot_hours = max(0, hours - 8)

        ot_pay = 0
        ot_detail = []
        if ot_hours > 0:
            ot1 = min(ot_hours, 2)
            ot2 = min(max(ot_hours - 2, 0), 2)
            ot1_pay = rnd(hourly * (4/3) * ot1)
            ot2_pay = rnd(hourly * (5/3) * ot2)
            ot_pay = ot1_pay + ot2_pay
            ot_detail = [
                {"hours": ot1, "rate": "x1.34 (4/3)", "amount": ot1_pay},
            ]
            if ot2 > 0:
                ot_detail.append({"hours": ot2, "rate": "x1.67 (5/3)", "amount": ot2_pay})

        result["breakdown"] = {
            "base_daily_wage": base_pay,
            "base_note": "Mandatory (already in monthly salary)",
            "extra_pay_recommended": base_pay,
            "extra_pay_note": "Recommended (宜), amount not legally defined. Shown as 1x daily wage (common practice)",
            "overtime": {"hours": ot_hours, "pay": ot_pay, "detail": ot_detail},
            "total_mandatory": base_pay,
            "total_with_recommended_extra": base_pay + base_pay + ot_pay,
        }

    elif day_type == "restday":
        # Rest day: mandatory overtime rates (Art.24§2)
        h = hours
        tier1 = min(h, 2)
        tier2 = min(max(h - 2, 0), 6)
        tier3 = max(h - 8, 0)

        t1_pay = rnd(hourly * (4/3) * tier1)
        t2_pay = rnd(hourly * (5/3) * tier2)
        t3_pay = rnd(hourly * (8/3) * tier3)
        total_ot = t1_pay + t2_pay + t3_pay

        detail = [{"hours": tier1, "rate": "x1.34 (4/3)", "amount": t1_pay}]
        if tier2 > 0:
            detail.append({"hours": tier2, "rate": "x1.67 (5/3)", "amount": t2_pay})
        if tier3 > 0:
            detail.append({"hours": tier3, "rate": "x2.67 (8/3)", "amount": t3_pay})

        result["breakdown"] = {
            "rest_day_overtime_pay": total_ot,
            "note": "Mandatory rates under Art.24§2 (on top of base salary already included in monthly pay)",
            "detail": detail,
            "total": total_ot,
        }

    elif day_type == "holiday":
        # National holiday: Art.39 double pay + Art.40 comp day off
        extra_daily = rnd(daily)
        ot_hours = max(0, hours - 8)
        ot_pay = 0
        ot_detail = []
        if ot_hours > 0:
            ot1 = min(ot_hours, 2)
            ot2 = min(max(ot_hours - 2, 0), 2)
            ot1_pay = rnd(hourly * (4/3) * ot1)
            ot2_pay = rnd(hourly * (5/3) * ot2)
            ot_pay = ot1_pay + ot2_pay
            ot_detail = [{"hours": ot1, "rate": "x1.34", "amount": ot1_pay}]
            if ot2 > 0:
                ot_detail.append({"hours": ot2, "rate": "x1.67", "amount": ot2_pay})

        result["breakdown"] = {
            "base_daily_wage": rnd(daily),
            "base_note": "Already in monthly salary",
            "extra_daily_wage": extra_daily,
            "extra_note": "Mandatory +1x daily wage (Art.39 double pay)",
            "compensatory_day_off": True,
            "comp_note": "Mandatory under Art.40",
            "reporting_required": "Must report to labor authority within 24 hours",
            "overtime": {"hours": ot_hours, "pay": ot_pay, "detail": ot_detail},
            "total": rnd(daily) + extra_daily + ot_pay,
        }

    return result


# ============================================================
# FORMATTED OUTPUT
# ============================================================

def format_result(result: dict) -> str:
    inp = result["input"]
    brk = result["brackets"]
    prm = result["premiums"]
    ann = result["annual"]

    lines = [
        "=" * 70,
        f"  台灣社會保險保費計算 — {inp['year']}年",
        f"  Taiwan Social Insurance Premium Calculator — {inp['year']}",
        "=" * 70,
        "",
        f"  月薪 (Monthly Salary):       NT${inp['monthly_salary']:,.0f}",
        f"  身份 (Category):             {inp['category_label']}",
        f"  勞保投保薪資 (LI Insured):   Grade {brk['labour_insurance']['grade']}"
        f" → NT${brk['labour_insurance']['insured_salary']:,}",
        f"  職災投保薪資 (OAI Insured):  Grade {brk['occupational_accident']['grade']}"
        f" → NT${brk['occupational_accident']['insured_salary']:,}",
        f"  健保投保金額 (NHI Insured):  NT${brk['nhi']['insured_amount']:,}",
        f"  眷屬人數 (Dependants):       {inp['dependants']} (factor: {inp['dep_factor']})",
    ]

    if inp["disability"] != "none":
        lines.append(f"  身心障礙 (Disability):       {inp['disability']}"
                      f" ({inp['disability_subsidy_rate']*100:.0f}% subsidy)")
    if inp["low_income"]:
        lines.append("  低收入戶 (Low-Income):       NHI 100% govt-subsidized")
    if inp["mid_low_income"]:
        lines.append("  中低收入戶 (Mid-Low Income): NHI 50% subsidy")
    if inp["days"] < 30:
        lines.append(f"  在保天數 (Days):             {inp['days']}/30"
                      f" (proration: {inp['proration']:.4f})")

    li = prm["labour_employment_insurance"]
    oai = prm["occupational_accident_insurance"]
    nhi = prm["nhi"]
    comb = prm["combined_monthly"]

    lines += [
        "",
        "-" * 70,
        f"  勞保+就保 (LI + EI) @ {li['rate_label']}"
        + (" [含就保]" if li["includes_employment_insurance"] else " [不含就保]"),
        "-" * 70,
        f"    被保險人 (Employee):        NT${li['employee']:,}",
    ]
    if li["disability_subsidy"] > 0:
        lines.append(f"      └ 身心障礙補助:          -NT${li['disability_subsidy']:,}")
    lines += [
        f"    雇主 (Employer):            NT${li['employer']:,}",
        f"    政府 (Government):          NT${li['government']:,}",
        f"    小計 (Subtotal):            NT${li['total']:,}",
        "",
        "-" * 70,
        f"  職災保險 (OAI) @ {oai['rate_label']}",
        "-" * 70,
        f"    被保險人 (Employee):        NT${oai['employee']:,}",
        f"    雇主 (Employer):            NT${oai['employer']:,}",
        f"    政府 (Government):          NT${oai['government']:,}",
        f"    小計 (Subtotal):            NT${oai['total']:,}",
        "",
        "-" * 70,
        f"  健保 (NHI) @ {nhi['rate_label']}"
        f"  |  眷屬 {nhi['dependants']}人 (factor {nhi['dep_factor']})",
        "-" * 70,
        f"    被保險人 (Employee):        NT${nhi['employee']:,}",
    ]
    if nhi.get("disability_subsidy", 0) > 0:
        lines.append(f"      └ 身心障礙補助:          -NT${nhi['disability_subsidy']:,}")
    if nhi.get("income_subsidy", 0) > 0:
        lines.append(f"      └ {nhi['income_subsidy_label']}:  -NT${nhi['income_subsidy']:,}")
    lines += [
        f"    雇主 (Employer):            NT${nhi['employer']:,}",
        f"    政府 (Government):          NT${nhi['government']:,}",
        f"    小計 (Subtotal):            NT${nhi['total']:,}",
        "",
        "-" * 70,
        f"  勞退 (Labour Pension) @ {prm['labour_pension']['rate_label']}",
        "-" * 70,
        f"    雇主提撥 (Employer):        NT${prm['labour_pension']['employer']:,}",
        f"    ({prm['labour_pension']['note']})",
        "",
        "=" * 70,
        "  月繳合計 (Monthly Total)",
        "=" * 70,
        f"    被保險人 (Employee):        NT${comb['employee']:,}",
        f"    雇主 (Employer):            NT${comb['employer']:,}",
        f"    政府 (Government):          NT${comb['government']:,}",
        f"    總計 (Grand Total):         NT${comb['total']:,}",
        "",
        "-" * 70,
        "  年繳合計 (Annual Total)",
        "-" * 70,
        f"    被保險人 (Employee):        NT${ann['employee']:,}",
        f"    雇主 (Employer):            NT${ann['employer']:,}",
        f"    政府 (Government):          NT${ann['government']:,}",
        f"    總計 (Grand Total):         NT${ann['total']:,}",
        "=" * 70,
    ]
    return "\n".join(lines)


def format_typhoon(result: dict) -> str:
    inp = result["input"]
    bd = result["breakdown"]
    dt_labels = {"regular": "一般工作日 (Regular Workday)",
                 "restday": "休息日 (Rest Day)",
                 "holiday": "國定假日 (National Holiday)"}

    lines = [
        "=" * 70,
        "  颱風天薪資計算 (Typhoon Day Pay Calculation)",
        "=" * 70,
        "",
        f"  月薪 (Monthly Salary):   NT${inp['monthly_salary']:,.0f}",
        f"  日薪 (Daily Wage):       NT${inp['daily_wage']:,.2f}",
        f"  時薪 (Hourly Wage):      NT${inp['hourly_wage']:,.2f}",
        f"  日別 (Day Type):         {dt_labels.get(inp['day_type'], inp['day_type'])}",
        f"  工作時數 (Hours):        {inp['hours_worked']}",
        "",
    ]

    if inp["day_type"] == "regular":
        lines += [
            "-" * 70,
            "  Regular Workday Typhoon Pay",
            "-" * 70,
            f"  基本日薪 (Base, in salary):     NT${bd['base_daily_wage']:,}  [Mandatory]",
            f"  建議加給 (Recommended extra):   NT${bd['extra_pay_recommended']:,}  [宜, not required]",
            f"  加班費 (Overtime):              NT${bd['overtime']['pay']:,}  [{bd['overtime']['hours']}hrs]",
        ]
        for d in bd["overtime"].get("detail", []):
            lines.append(f"    └ {d['hours']}hrs @ {d['rate']} = NT${d['amount']:,}")
        lines += [
            "",
            f"  法定最低 (Legal minimum):       NT${bd['total_mandatory']:,}",
            f"  含建議加給 (With extra):        NT${bd['total_with_recommended_extra']:,}",
        ]

    elif inp["day_type"] == "restday":
        lines += [
            "-" * 70,
            "  Rest Day Overtime (Art.24§2) — Mandatory Rates",
            "-" * 70,
        ]
        for d in bd["detail"]:
            lines.append(f"    {d['hours']}hrs @ {d['rate']} = NT${d['amount']:,}")
        lines += [
            "",
            f"  加班費總計 (OT Total):          NT${bd['total']:,}",
            "  (On top of base salary already included in monthly pay)",
        ]

    elif inp["day_type"] == "holiday":
        lines += [
            "-" * 70,
            "  National Holiday Typhoon Pay (Art.39/40) — Mandatory",
            "-" * 70,
            f"  基本日薪 (Base, in salary):     NT${bd['base_daily_wage']:,}",
            f"  加倍日薪 (Extra 1x):            NT${bd['extra_daily_wage']:,}  [Mandatory]",
            f"  補假 (Comp day off):             Required [Art.40]",
            f"  加班費 (Overtime):               NT${bd['overtime']['pay']:,}  [{bd['overtime']['hours']}hrs]",
        ]
        for d in bd["overtime"].get("detail", []):
            lines.append(f"    └ {d['hours']}hrs @ {d['rate']} = NT${d['amount']:,}")
        lines += [
            "",
            f"  當日總額 (Day Total):            NT${bd['total']:,}",
            f"  ⚠ {bd['reporting_required']}",
        ]

    lines.append("=" * 70)
    return "\n".join(lines)


# ============================================================
# CLI
# ============================================================

def main():
    parser = argparse.ArgumentParser(
        description="Taiwan Social Insurance Premium Calculator (2025-2026)")
    parser.add_argument("salary", type=float, help="Monthly salary in NT$")
    parser.add_argument("--year", type=int, choices=list(range(2020, 2027)), default=2026)
    parser.add_argument("--category",
                        choices=["regular", "union", "fishermen", "govt", "self_employed"],
                        default="regular")
    parser.add_argument("--industry-rate", type=float, default=None,
                        help="OAI industry rate as decimal (e.g. 0.0041)")
    parser.add_argument("--days", type=int, default=30)
    parser.add_argument("--dependants", type=int, default=0,
                        help="Number of NHI dependants (0-9)")
    parser.add_argument("--disability",
                        choices=["none", "mild", "moderate", "severe"],
                        default="none")
    parser.add_argument("--low-income", action="store_true")
    parser.add_argument("--mid-low-income", action="store_true")
    parser.add_argument("--typhoon", choices=["regular", "restday", "holiday"],
                        default=None, help="Calculate typhoon day pay")
    parser.add_argument("--typhoon-hours", type=float, default=8)
    parser.add_argument("--json", action="store_true")

    args = parser.parse_args()

    # Insurance calculation
    result = calculate(
        salary=args.salary, year=args.year, category=args.category,
        industry_rate=args.industry_rate, days=args.days,
        dependants=args.dependants, disability=args.disability,
        low_income=args.low_income, mid_low_income=args.mid_low_income,
    )

    if args.json:
        output = {"insurance": result}
        if args.typhoon:
            output["typhoon"] = calculate_typhoon(
                args.salary, args.typhoon, args.typhoon_hours, args.year)
        print(json.dumps(output, indent=2, ensure_ascii=False))
    else:
        print(format_result(result))
        if args.typhoon:
            print()
            typhoon_result = calculate_typhoon(
                args.salary, args.typhoon, args.typhoon_hours, args.year)
            print(format_typhoon(typhoon_result))


if __name__ == "__main__":
    main()

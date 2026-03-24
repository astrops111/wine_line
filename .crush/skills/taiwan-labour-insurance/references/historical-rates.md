# Taiwan Insurance Historical Data (2020–2026)

> Used for payroll calculation in `admin/src/pages/PayrollManagement.tsx`
> Stored in DB: `labor_ins_brackets(year, grade)` and `health_ins_brackets(year, grade)`
> Sources: Bureau of Labor Insurance (勞工保險局) / NHI Administration (中央健保署)

---

## Labor Insurance (勞工保險) — Annual Rates

| Year | Total Rate | Employee (20%) | Employer (70%) | Govt (10%) | Min Wage (Grade 1) | Max Insured | Grades |
|------|-----------|----------------|----------------|------------|-------------------|-------------|--------|
| 2020 | 11.0% | 2.2% | 7.7% | 1.1% | 23,800 | 45,800 | 16 |
| 2021 | 11.5% | 2.3% | 8.05% | 1.15% | 24,000 | 45,800 | 15 |
| 2022 | 11.5% | 2.3% | 8.05% | 1.15% | 25,250 | 45,800 | 14 |
| 2023 | 12.0% | 2.4% | 8.4% | 1.2% | 26,400 | 45,800 | 13 |
| 2024 | 12.0% | 2.4% | 8.4% | 1.2% | 27,470 | 45,800 | 12 |
| 2025 | 12.5% | 2.5% | 8.75% | 1.25% | 28,590 | 45,800 | 12 |
| 2026 | 12.5% | 2.5% | 8.75% | 1.25% | 29,500 | 45,800 | 11 |

**Rate adjustment pattern**: biennial +0.5% ordinary accident rate (108→110→112→114年)
**Components**: ordinary accident rate + employment insurance (1.0%, fixed since inception)
**2026 change**: Grade at 28,800 eliminated (min wage surpassed it)

### Grade Insured Salary Breakpoints (stable intermediate values)

Common insured salaries used as breakpoints above each year's minimum wage:
```
23,800 / 24,000 / 25,200 / 26,400 / 27,600 / 28,800 / 30,300 / 31,800 /
33,300 / 34,800 / 36,300 / 38,200 / 40,100 / 42,000 / 43,900 / 45,800 (cap)
```

Each year's bracket table starts at that year's minimum wage and uses breakpoints above it.
As minimum wage rises, lower breakpoints are eliminated.

### Full Bracket Tables (2020-2024)

**2020** (16 grades, min NT$23,800):
23,800 / 24,000 / 25,200 / 26,400 / 27,600 / 28,800 / 30,300 / 31,800 /
33,300 / 34,800 / 36,300 / 38,200 / 40,100 / 42,000 / 43,900 / 45,800

**2021** (15 grades, min NT$24,000):
24,000 / 25,200 / 26,400 / 27,600 / 28,800 / 30,300 / 31,800 / 33,300 /
34,800 / 36,300 / 38,200 / 40,100 / 42,000 / 43,900 / 45,800

**2022** (14 grades, min NT$25,250):
25,250 / 26,400 / 27,600 / 28,800 / 30,300 / 31,800 / 33,300 / 34,800 /
36,300 / 38,200 / 40,100 / 42,000 / 43,900 / 45,800

**2023** (13 grades, min NT$26,400):
26,400 / 27,600 / 28,800 / 30,300 / 31,800 / 33,300 / 34,800 / 36,300 /
38,200 / 40,100 / 42,000 / 43,900 / 45,800

**2024** (12 grades, min NT$27,470):
27,470 / 28,800 / 30,300 / 31,800 / 33,300 / 34,800 / 36,300 / 38,200 /
40,100 / 42,000 / 43,900 / 45,800

**2025** (12 grades, min NT$28,590): see salary-brackets.md
**2026** (11 grades, min NT$29,500): see salary-brackets.md

---

## Health Insurance (全民健保) — Annual Rates

| Year | Total Rate | Employee (30%) | Employer (60%) | Govt (10%) | Min Insured | DB Max | Official Max | Grades |
|------|-----------|----------------|----------------|------------|------------|--------|-------------|--------|
| 2020 | 4.69% | 1.407% | 2.814% | 0.469% | 23,800 | 103,300 | 103,300 | 33 |
| 2021 | 5.17% | 1.551% | 3.102% | 0.517% | 24,000 | 103,300 | 103,300 | 32 |
| 2022 | 5.17% | 1.551% | 3.102% | 0.517% | 25,250 | 103,300 | 103,300 | 31 |
| 2023 | 5.17% | 1.551% | 3.102% | 0.517% | 26,400 | 103,300 | 103,300 | 30 |
| 2024 | 5.17% | 1.551% | 3.102% | 0.517% | 27,470 | 103,300 | 219,500 | 29 |
| 2025 | 5.17% | 1.551% | 3.102% | 0.517% | 28,590 | 103,300 | 219,500 | 29* |
| 2026 | 5.17% | 1.551% | 3.102% | 0.517% | 29,500 | 103,300 | 219,500 | 27* |

*DB stores up to 103,300; official table extends to 219,500 (2024+)

**Rate history**: 5.17% (2010) → 4.91% (2013) → 4.69% (Jan 2016) → 5.17% (Jan 2021, current)
**2024**: Official max expanded from 103,300 → 219,500; DB retains 103,300 cap

### Higher NHI Grade Breakpoints (above LI cap of 45,800)

**DB-stored grades** (up to 103,300):
```
48,200 / 50,600 / 53,000 / 55,400 / 57,800 / 60,800 / 63,800 / 66,800 /
69,800 / 72,800 / 76,500 / 80,200 / 83,900 / 87,600 / 92,100 / 97,700 / 103,300
```

**Official extended grades** (103,300 → 219,500, from 2024 onward):
```
105,600 / 110,100 / 115,500 / 120,900 / 126,300 / 131,700 / 137,100 /
142,500 / 147,900 / 150,000 / 156,400 / 162,800 / 169,200 / 175,600 /
182,000 / 189,400 / 197,000 / 204,600 / 212,000 / 219,500
```

### NHI Dependent Multiplier

- `employee_premium` stored as per-unit amount in DB
- Actual employee deduction = `employee_premium x (1 + health_ins_dependents)`
- Max dependents for premium calculation: **3** (超過3口以3口計)
- Employer uses fixed average dependent factor: **1.57**

---

## Taiwan Minimum Wage History

| Year | Monthly (NT$) | Hourly (NT$) |
|------|:---:|:---:|
| 2020 | 23,800 | 158 |
| 2021 | 24,000 | 160 |
| 2022 | 25,250 | 168 |
| 2023 | 26,400 | 176 |
| 2024 | 27,470 | 183 |
| 2025 | 28,590 | 190 |
| 2026 | 29,500 | 196 |

---

## Labor Pension (勞工退休金/勞退) — Fixed

- Employer must contribute **6%** of gross monthly salary to employee's individual pension account
- Employee can voluntarily contribute up to **6%** additional (tax-deductible)
- Employer contribution does NOT reduce employee net salary
- No ceiling — calculated on full gross salary (unlike LI which caps at 45,800)
- Legal basis: Labour Pension Act (勞工退休金條例)

### Formula
```
Employer pension contribution = gross_salary x 6%
Employee voluntary contribution = gross_salary x 0-6% (optional)
```

---

## Occupational Accident Insurance (職災保險) — Separated May 1, 2022

Prior to 2022-05-01: OAI was part of labour insurance (included in LI rate)
After 2022-05-01: Separate system under 勞工職業災害保險及保護法

| Year | OAI Status | Ceiling |
|------|-----------|---------|
| 2020–2022/04 | Included in LI rate | NT$45,800 |
| 2022/05–present | Separate insurance | NT$72,800 |

OAI rate: industry-specific (0.05%–0.89%) + commuting (0.07%)
See `industry-rates.md` for details.

---

## DB Migration Files

| File | Purpose |
|------|---------|
| `supabase/migrations/20260324100000_hrm_phase4_payroll.sql` | Creates payroll tables (salary_structures, payroll_runs, payroll_records) |
| `supabase/migrations/20260324200000_hrm_insurance_annual_brackets.sql` | Drops static tables, recreates with (year, grade) PK, seeds 2020–2026 data |

## Code Reference

- **Calculation**: `admin/src/pages/PayrollManagement.tsx` — `calculatePayroll()` function
  - Queries: `.from('labor_ins_brackets').eq('year', year).order('grade')`
  - Bracket lookup: `findBracket(salary, brackets)` — finds highest grade where `salary >= min_salary`
- **Reference tab**: PayrollManagement Tab 4 — year selector state `bracketYear`, options 2020–2026

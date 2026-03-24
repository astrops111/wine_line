---
name: taiwan-labour-insurance
description: >-
  Calculate Taiwan labour insurance (勞保), employment insurance (就業保險),
  occupational accident insurance (職災保險), and National Health Insurance (健保/NHI)
  premiums. Handles salary bracket lookups, premium cost sharing for regular employees,
  union members, fishermen, government staff, foreign workers, domestic caregivers,
  and self-employed. Supports special identity subsidies for disabled persons (身心障礙者),
  low-income (低收入戶), and mid-low income (中低收入戶) households. Calculates NHI
  dependant (眷屬) premiums. Includes labour pension (勞退 6%), typhoon day (颱風天)
  pay rules. Historical rate data 2020-2026. Calculator supports 2020-2026.
---

# Taiwan Labour Insurance Calculator (台灣勞工保險計算)

Calculates Taiwan social insurance premiums based on official data from the Bureau of
Labor Insurance (勞動部勞工保險局) and National Health Insurance Administration (健保署).

## When to Use

- Calculate 勞保/勞保費/保費/健保費
- Employer cost breakdown for Taiwan payroll
- 投保薪資分級表 (insured salary brackets) lookup
- Premium sharing ratios for any worker category
- Occupational accident insurance (職災保險) rates
- NHI premiums with dependants (眷屬)
- Special identity premium subsidies (身心障礙/低收入/中低收入)
- Typhoon day (颱風天/颱風假) pay calculation
- Labour pension (勞退) employer 6% contribution
- Historical rate lookups (2020-2026)

## Data Years Supported

| Year | Min Wage | LI+EI Rate | LI Tiers | NHI Rate | Calculator |
|------|:---:|:---:|:---:|:---:|:---:|
| 2020 (109年) | NT$23,800 | 11.0% | 16 | 4.69% | Yes |
| 2021 (110年) | NT$24,000 | 11.5% | 15 | 5.17% | Yes |
| 2022 (111年) | NT$25,250 | 11.5% | 14 | 5.17% | Yes |
| 2023 (112年) | NT$26,400 | 12.0% | 13 | 5.17% | Yes |
| 2024 (113年) | NT$27,470 | 12.0% | 12 | 5.17% | Yes |
| **2025** (114年) | NT$28,590 | 12.5% | 12 | 5.17% | Yes |
| **2026** (115年) | NT$29,500 | 12.5% | 11 | 5.17% | Yes |

When user does not specify a year, default to **2026**.
For historical rates and DB references, read `references/historical-rates.md`.

## Insurance Components

| Component | Rate | LI Ceiling | OAI Ceiling | NHI Ceiling |
|-----------|------|:---:|:---:|:---:|
| Ordinary Accident (普通事故) | 11.5% | NT$45,800 | -- | -- |
| Employment Insurance (就業保險) | 1.0% | NT$45,800 | -- | -- |
| OAI (職災保險) | 0.05%-0.89% + 0.07% | -- | NT$72,800 | -- |
| NHI (健保) | 5.17% | -- | -- | NT$219,500 |

## Calculation Steps

### Step 1: Determine Year and Salary Brackets

Read `references/salary-brackets.md` for full bracket tables for both 2025 and 2026.
If salary falls between two tiers, use the **higher** tier.

### Step 2: Determine Worker Category

Read `references/special-identities.md` for all categories and their sharing ratios.

**Core categories and LI cost sharing:**

| Category | Employee | Employer | Government |
|----------|:---:|:---:|:---:|
| Regular employees (一般受僱勞工) | 20% | 70% | 10% |
| Union members (職業工會) | 60% | -- | 40% |
| Fishermen Class A (漁會甲類) | 20% | -- | 80% |
| Foreign seafarers (外僱船員) | 80% | -- | 20% |
| Post-separation continuation (離職繼續加保) | 80% | -- | 20% |

**OAI cost sharing:**
- Regular employees: employer pays **100%**
- Union members: worker 60%, government 40%
- Fishermen: worker 20%, government 80%

**NHI cost sharing:**

| NHI Category | Employee | Employer | Government |
|-------------|:---:|:---:|:---:|
| 1-1 Government/public school staff | 30% | 70% | 0% |
| 1-2 Private enterprise employees | 30% | 60% | 10% |
| 1-3 Employers/self-employed professionals | 100% | -- | 0% |
| 2 Union members/seamen | 60% | -- | 40% |
| 3 Farmers/fishermen | 30% | -- | 70% |
| 5 Low-income households | 0% | -- | 100% |
| 6-2 Non-employed persons | 60% | -- | 40% |

### Step 3: Apply Special Identity Subsidies

Read `references/special-identities.md` for disability/low-income subsidy details.

| Special Identity | Subsidy on Self-Paid Portion |
|-----------------|:---:|
| Severe disability (重度/極重度) | 100% |
| Moderate disability (中度) | 50% |
| Mild disability (輕度) | 25% |
| Low-income household (低收入戶) | NHI 100% govt-paid |
| Mid-low income (中低收入戶) | NHI 50% subsidy |

### Step 4: Calculate Premiums

**Labour + Employment Insurance:**
```
Employee = Insured Salary x 12.5% x Employee Share
Employer = Insured Salary x 12.5% x Employer Share
Government = Insured Salary x 12.5% x Government Share
```

**OAI:**
```
Employer = OAI Insured Salary x (Industry Rate + 0.07%)
```
Default industry rate if not specified: average 0.14% (combined 0.21%).
Read `references/industry-rates.md` for industry-specific rates.

**Labour Pension (勞退):**
```
Employer contribution = Gross Salary x 6% (no ceiling, based on full salary)
Employee voluntary = Gross Salary x 0-6% (optional, tax-deductible)
```
Labour pension is separate from insurance — employer 6% is mandatory, does NOT reduce net salary.

**NHI (with dependants):**
```
Employee = NHI Insured Amount x 5.17% x Employee Share x (1 + dependants, max 3)
Employer = NHI Insured Amount x 5.17% x Employer Share x (1 + 0.57)
```
The employer uses a fixed average dependant factor of **1.57** regardless of actual dependant count.
Read `references/dependants-nhi.md` for full dependant rules.

### Step 5: Typhoon Day Pay (if applicable)

Read `references/typhoon-day.md` for complete rules. Key summary:

| Day Type | Doesn't Work | Works (within 8hrs) | Overtime |
|----------|:---:|:---:|:---:|
| Regular workday | Should pay full salary (recommended) | Regular pay + extra pay (recommended) | +1/3 first 2hrs, +2/3 next 2hrs |
| Rest day (休息日) | N/A | x1.34 first 2hrs, x1.67 hrs 3-8 | x2.67 hrs 9+ |
| Holiday (國定假日) | N/A | +1x daily wage + comp day off | Same + 24hr reporting |

A typhoon day is **NOT** a legal holiday. The "should pay" (宜) language is a recommendation.

## Output Format

Present results in clear tables with:
1. Year and determined insured salary grade
2. Breakdown by payer (employee/employer/government)
3. Separate lines for LI, EI, OAI, and NHI
4. NHI dependant count and calculation
5. Any special identity subsidies applied
6. Monthly and annual totals
7. All amounts in NT$ rounded to nearest integer

Use both Chinese and English labels.

## Rounding

Per BLI practice, round to nearest NT$1 (0.5 rounds up).
Mid-month proration: (days / 30) x monthly premium.

## Run Calculator Script

For precise calculations, run `scripts/calculate.py`:
```
python scripts/calculate.py 35000 --year 2026
python scripts/calculate.py 28590 --year 2025 --category union
python scripts/calculate.py 50000 --dependants 2 --json
python scripts/calculate.py 35000 --disability moderate
python scripts/calculate.py 26400 --year 2023
python scripts/calculate.py 23800 --year 2020 --category union
```

## Official Sources

- Bureau of Labor Insurance: https://www.bli.gov.tw/
- NHI Administration: https://www.nhi.gov.tw/
- LI Bracket Table: https://www.bli.gov.tw/0005475.html
- NHI Bracket Table: https://www.nhi.gov.tw/ch/cp-17661-84c1f-2569-1.html
- MOL Typhoon Guidelines: https://laws.mol.gov.tw/FLAW/FLAWDAT0202.aspx?id=FL049533

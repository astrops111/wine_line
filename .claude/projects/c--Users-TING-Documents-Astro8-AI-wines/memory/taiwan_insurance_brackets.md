# Taiwan Insurance Bracket Data (2020–2026)

> **Primary reference**: `.agents/skills/taiwan-labour-insurance/` skill
> Contains full bracket tables, calculator script, special identities, NHI dependants, typhoon day rules.
> Run: `python skills/taiwan-labour-insurance/scripts/calculate.py 35000 --year 2026 --dependants 2`

## DB References

- **Tables**: `labor_ins_brackets(year, grade)` and `health_ins_brackets(year, grade)`
- **DB NHI ceiling**: NT$103,300 (official extends to NT$219,500 from 2024)
- **Migrations**: `supabase/migrations/20260324*_hrm_*.sql`
- **Code**: `admin/src/pages/PayrollManagement.tsx` → `calculatePayroll()`, `findBracket()`
- **Reference tab**: PayrollManagement Tab 4 — year selector `bracketYear`, options 2020–2026

## Quick Rate Summary

| Year | LI+EI Rate | NHI Rate | Min Wage | LI Grades |
|------|:---:|:---:|:---:|:---:|
| 2020 | 11.0% | 4.69% | 23,800 | 16 |
| 2021 | 11.5% | 5.17% | 24,000 | 15 |
| 2022 | 11.5% | 5.17% | 25,250 | 14 |
| 2023 | 12.0% | 5.17% | 26,400 | 13 |
| 2024 | 12.0% | 5.17% | 27,470 | 12 |
| 2025 | 12.5% | 5.17% | 28,590 | 12 |
| 2026 | 12.5% | 5.17% | 29,500 | 11 |

For full details → see skill reference files in `.agents/skills/taiwan-labour-insurance/references/`

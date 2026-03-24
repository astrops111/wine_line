# NHI Dependant (眷屬) Premium Calculations

Source: National Health Insurance Administration (衛生福利部中央健康保險署)
URL: https://www.nhi.gov.tw/
Legal basis: NHI Act (全民健康保險法)

---

## Key Rule: Labour Insurance Does NOT Cover Dependants

Labour insurance (勞保) covers only the insured worker individually.
There is no concept of adding family members to LI.

**Dependants are covered under National Health Insurance (NHI/全民健保).**

---

## Who Can Be Added as NHI Dependant (眷屬依附)

1. **Spouse (配偶)** — unemployed spouse
2. **Children/grandchildren (直系血親卑親屬)** — who are:
   - Under age 20, OR
   - Unable to work due to disability, OR
   - Still in school (full-time student)
3. **Parents/grandparents/great-grandparents (直系血親尊親屬)** — who are unemployed

---

## Maximum Dependants for Premium Calculation

- **No limit** on how many dependants can be added to NHI enrollment
- For premium calculation, a maximum of **3 dependants** are counted
- If you have 4+ dependants, you only pay premiums for **3** (超過3口以3口計)

---

## Premium Formulas

### Employee Self-Paid NHI Premium (with dependants)

```
Premium = NHI Insured Amount x 5.17% x Employee Burden Ratio x (1 + min(dependants, 3))
```

The `(1 + dependants)` factor counts the employee themselves plus their dependants.

### Employer NHI Premium

Employers use a fixed **average dependant factor of 1.57** (平均眷口數 0.57),
regardless of actual dependant count of any individual employee:

```
Employer premium per employee = NHI Insured Amount x 5.17% x Employer Burden Ratio x 1.57
```

### Government NHI Subsidy

```
Government subsidy = NHI Insured Amount x 5.17% x Government Burden Ratio x 1.57
```

---

## Calculation Examples

### Example 1: Private employee (Cat.1-2), Insured Amount NT$36,300, 2 dependants

**Employee pays:**
```
NT$36,300 x 5.17% x 30% x (1+2) = NT$36,300 x 0.0517 x 0.30 x 3 = NT$1,690
```

**Employer pays:**
```
NT$36,300 x 5.17% x 60% x 1.57 = NT$36,300 x 0.0517 x 0.60 x 1.57 = NT$1,768
```

**Government pays:**
```
NT$36,300 x 5.17% x 10% x 1.57 = NT$36,300 x 0.0517 x 0.10 x 1.57 = NT$295
```

### Example 2: Union member (Cat.2), Insured Amount NT$28,590, 1 dependant

**Worker pays:**
```
NT$28,590 x 5.17% x 60% x (1+1) = NT$28,590 x 0.0517 x 0.60 x 2 = NT$1,774
```

**Government pays:**
```
NT$28,590 x 5.17% x 40% x 2 = NT$1,183
```

### Example 3: Self-employed professional (Cat.1-3), Insured Amount NT$45,800, 3 dependants

**Worker pays 100%:**
```
NT$45,800 x 5.17% x 100% x (1+3) = NT$45,800 x 0.0517 x 1.00 x 4 = NT$9,471
```

### Example 4: Max dependants cap — 5 actual dependants

Even with 5 dependants, premiums are calculated with max 3:
```
Factor = 1 + min(5, 3) = 1 + 3 = 4
```

---

## NHI Dependant Summary by Category

| NHI Category | Employee Factor | Employer Factor | Government Factor |
|:---:|:---:|:---:|:---:|
| 1-1 (Govt staff) | 1 + min(deps, 3) | 1.57 (fixed) | -- |
| 1-2 (Private employee) | 1 + min(deps, 3) | 1.57 (fixed) | 1.57 (fixed) |
| 1-3 (Self-employed) | 1 + min(deps, 3) | -- | -- |
| 2 (Union) | 1 + min(deps, 3) | -- | 1 + min(deps, 3) |
| 3 (Farmers/fishermen) | 1 + min(deps, 3) | -- | 1 + min(deps, 3) |
| 5 (Low-income) | -- | -- | 1 + actual deps |
| 6-2 (Non-employed) | 1 + min(deps, 3) | -- | 1 + min(deps, 3) |

**Note for Cat.2, 3, 6-2:** Both employee and government portions scale by the actual
dependant count (capped at 3), since there is no employer.

---

## NHI Rate

| Year | Rate |
|:---:|:---:|
| 2025 (114年) | **5.17%** |
| 2026 (115年) | **5.17%** |

The rate has been 5.17% since January 1, 2021 (110年).

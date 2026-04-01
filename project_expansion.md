# Project Expansion — Strategic & Low Priority Gaps

> **Last Updated**: 2026-04-01

Items below were identified from the OE gap analysis (vs. 104 HRM, BambooHR, Rippling, NUEIP, MAYO).
Quick Wins and High Value gaps have been implemented. The items below are for future phases.

## Recently Completed (Phase 5–8, 2026-03-28 to 2026-04-01)

The following gaps from the original analysis have been implemented:

| Gap | Feature | Phase | Status |
|-----|---------|-------|--------|
| OE-1 | Audit Logs — action tracking with old/new values, IP logging | 5 | ✅ Done |
| OE-2 | Document Management — employee docs with expiry tracking | 5 | ✅ Done |
| OE-3 | Performance Reviews — KPI tracking, review workflow | 5 | ✅ Done |
| OE-7 | Recruitment/ATS — job postings, candidate pipeline, interviews | 5 | ✅ Done |
| OE-8 | Expense Claims — reimbursement workflow with trip linking | 5 | ✅ Done |
| OE-13 | Business Trips — travel request and budget tracking | 5 | ✅ Done |
| — | RBAC Permission System — module-level access control | 5 | ✅ Done |
| — | Dark Mode — theme toggle with localStorage persistence | 5 | ✅ Done |
| — | AI Documentation Pipeline — multi-agent orchestration, Help Center | 5b | ✅ Done |
| — | LINE Analytics — message/command/error logging, daily summaries | 5c | ✅ Done |
| OE-6 | Training/certification tracking (food handler, fire safety, etc.) | 6b | ✅ Done |
| OE-10 | Disciplinary records (warnings, merit, commendation, termination) | 6b | ✅ Done |
| — | Onboarding/offboarding templates and per-employee task workflows | 6b | ✅ Done |
| — | Company announcements with targeting and read tracking | 6b | ✅ Done |
| — | Scheduling AI (Claude, 10+ labor law validations, scoring) | 6 | ✅ Done |
| — | Demand forecasting (DashScope Qwen, POS/historical data) | 6 | ✅ Done |
| — | Task file attachments (storage bucket + MIME validation) | 6 | ✅ Done |
| GAP-1 | Variable working hours (變形工時 2/4/8-week) | 6c | ✅ Done |
| GAP-3 | Open shift marketplace (bid_user_id, bid_message) | 6c | ✅ Done |
| GAP-6 | Labor cost budgeting (per-schedule + store defaults) | 6c | ✅ Done |
| GAP-10 | Schedule template library (reusable patterns) | 6c | ✅ Done |
| GAP-12 | Employee skills/certification tagging (proficiency levels) | 6c | ✅ Done |
| GAP-13 | Scheduling KPIs (acceptance rate, violations, OT hours) | 6c | ✅ Done |
| — | Employee auto-numbering (EMP-001 format) | 6c | ✅ Done |
| — | Multi-level approval chains (leave/overtime/expense) | 6c | ✅ Done |
| — | Foreign worker tracking (work permits + expiry) | 6c | ✅ Done |
| — | Payroll supplements (NHI supplement, leave buyout) | 6c | ✅ Done |
| — | Tiered LINE summaries (weekly/monthly AI generation + auto-pruning) | 6d | ✅ Done |
| — | LLM usage tracking (`llm_usage_logs` table, cost estimation) | 6d | ✅ Done |
| — | Minimum-admin safety (DB trigger prevents last admin deletion) | 6d | ✅ Done |
| — | Codebase modularization (12 component dirs, 55+ components, 10 types) | 7 | ✅ Done |
| — | Helper libraries (9 new: validation, exports, calculations, task/workflow) | 7 | ✅ Done |
| — | LINE webhook refactoring (monolith → 7 modular files) | 7 | ✅ Done |
| — | Task confirmation/approval flow (multi-approver) | 7 | ✅ Done |
| — | Dashboard analytics (turnover, compliance, probation, permits) | 7 | ✅ Done |
| — | Jobs/position management page | 7 | ✅ Done |
| — | Google Sheets ↔ Supabase bidirectional sync | 7 | ✅ Done |
| — | Inventory management (stock, transactions, stocktake, low-stock alerts) | 8 | ✅ Done |
| — | Vendor management + Purchase order workflow (draft→approved→received) | 8 | ✅ Done |
| — | Operations analytics (KPIs, labor cost trend, workflow rates, store compare) | 8 | ✅ Done |
| — | Clock-in edge function (GPS/WiFi validation, lateness detection) | 8 | ✅ Done |
| — | Withholding certificate tab (扣繳憑證) for annual tax filing | 8 | ✅ Done |
| — | Workflow template library (6 pre-seeded templates) | 8 | ✅ Done |
| — | Playwright test suite (8 modules, 65+ routes, automated runner) | 8 | ✅ Done |
| — | Task reminder cron job (pg_cron every 15 min) | 8 | ✅ Done |

---

## Strategic (High effort, high value)

### OE-4: Employee Self-Service Portal
- **What**: Employees can update personal info (address, emergency contact, bank), view payslips, submit leave/OT, check schedules — all from LIFF or a dedicated web portal.
- **Why**: Reduces HR burden; competitors all have this.
- **Effort**: Large — needs auth flow, RBAC, new pages/routes.
- **Dependencies**: LIFF app already exists; extend with self-service sections.

### OE-5: Employee Engagement Surveys
- **What**: Periodic anonymous surveys (satisfaction, eNPS, custom questions). Dashboard with aggregate results.
- **Why**: BambooHR and Rippling both include this; important for retention metrics.
- **Effort**: Medium — new `surveys` + `survey_responses` tables; survey builder UI; results visualization.
- **Dependencies**: None; standalone feature.

### ~~OE-6: Training & LMS (Learning Management System)~~ ✅ DONE (Phase 6b)
- Training records with certification tracking (food_handler, fire_safety, first_aid, labor_safety)
- Expiry date tracking for renewable certifications
- Certificate URL/file storage
- Remaining: Course builder UI, employee learning dashboard, video content hosting

---

## Low Priority (Nice-to-have, low urgency)

### OE-9: Employee Handbook / Policy Management
- **What**: Upload and manage company policies (handbooks, SOPs). Track employee acknowledgments.
- **Why**: Useful for compliance; most competitors have basic doc management.
- **Effort**: Low — `policy_documents` + `policy_acknowledgments` tables; file upload to Supabase storage; simple list UI.

### ~~OE-10: Discipline & Grievance UI~~ ✅ DONE (Phase 6b)
- Disciplinary records page with 7 record types (verbal/written warning, suspension, demerit, merit, commendation, termination)
- Employee and issuer tracking, effective dates, filtering

### OE-11: Asset Management
- **What**: Track company assets assigned to employees (laptops, keys, uniforms, phones). Track checkout/return.
- **Why**: Helpful for offboarding; prevents asset loss.
- **Effort**: Medium — `company_assets` + `asset_assignments` tables; assignment UI; integrate with offboarding checklist.

### OE-12: Nested Department Hierarchy
- **What**: Support multi-level department structure (department → sub-department → team). Currently flat one-level departments.
- **Why**: Needed for larger organizations; competitors support this.
- **Effort**: Medium — add `parent_department_id` to departments; tree rendering; cascading queries.

### OE-14: Bulk Employee Actions
- **What**: Select multiple employees → bulk update (department, store, status), bulk export, bulk send notifications.
- **Why**: Currently all operations are per-employee. Painful for large teams.
- **Effort**: Low — add checkboxes to employee list; bulk action toolbar; batch Supabase queries.

---

## Priority Matrix

| Gap | Priority | Effort | Value | Status |
|-----|----------|--------|-------|--------|
| OE-4 Self-Service | Strategic | High | High | 🔲 Pending |
| OE-5 Surveys | Strategic | Medium | Medium | 🔲 Pending |
| ~~OE-6 Training/LMS~~ | ~~Strategic~~ | ~~High~~ | ~~High~~ | ✅ Done |
| OE-9 Handbook | Low | Low | Low | 🔲 Pending |
| ~~OE-10 Discipline~~ | ~~Low~~ | ~~Low~~ | ~~Low~~ | ✅ Done |
| OE-11 Assets | Low | Medium | Medium | 🔲 Pending |
| OE-12 Nested Depts | Low | Medium | Low | 🔲 Pending |
| OE-14 Bulk Actions | Low | Low | Medium | 🔲 Pending |

## Recommended Next Phase
1. **OE-14 Bulk Actions** — Quick to implement, immediately useful
2. **OE-4 Self-Service** — Highest employee-facing value
3. **OE-11 Assets** — Integrates with existing offboarding checklist

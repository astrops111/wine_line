# AI LINE Bot — HRM Operations System

LINE-integrated HR management platform with multi-agent AI orchestration, built for Taiwan labor compliance.

## Tech Stack

- **Frontend**: React 19 + TypeScript + Vite (port 5173)
- **Backend**: Supabase (PostgreSQL + RLS + Edge Functions)
- **AI Models**: DashScope Qwen 3.5 | Claude Opus 4.6 | Gemini 2.5 Flash (fallback chain)
- **LINE**: LINE Messaging API + LIFF SDK
- **Theme**: Dark/Light mode with design system ("The Executive Insight")
- **Auth**: Role-based access control (admin / manager / staff / operations)

## Project Structure

```
wines/
├── supabase/
│   ├── migrations/              # 24+ SQL schema migrations
│   ├── functions/               # 17 Deno Edge Functions
│   │   ├── line-webhook/        # LINE message handler + HR commands (7 modular files)
│   │   ├── hr-notify/           # Push approve/reject notifications
│   │   ├── send-payslips/       # Batch payslip distribution
│   │   ├── workflow-ai/         # AI workflow processing
│   │   ├── task-ai-agent/       # AI task assistant
│   │   ├── scheduling-ai/       # AI schedule generation + labor law validation
│   │   ├── demand-forecast/     # AI staffing prediction from POS/historical data
│   │   ├── orchestrator/        # Multi-agent coordinator
│   │   ├── doc-flow-analyzer/   # Extract user flows from pages
│   │   ├── doc-content-gen/     # Generate bilingual articles
│   │   ├── doc-indexer/         # Upsert articles with FTS
│   │   ├── help-chatbot/        # RAG Q&A chatbot
│   │   ├── summarize-history/   # Tiered LINE summary generation (weekly/monthly)
│   │   ├── clock-in/            # GPS/WiFi clock-in/out with lateness detection
│   │   ├── liff-new-task/       # Mobile task creation
│   │   └── liff-task/           # Mobile task updates
│   └── config.toml
├── admin/                       # React admin panel
│   ├── src/pages/               # 41+ page components
│   ├── src/components/          # 12 feature dirs, 55+ sub-components
│   ├── src/types/               # 10 TypeScript type definition files
│   ├── src/lib/                 # 16 shared libraries (helpers, validation, exports)
│   ├── scripts/generate-docs.mjs  # Documentation pipeline runner
│   ├── tests/                   # Playwright Python tests
│   ├── Dockerfile               # Multi-stage Docker build (Node → Nginx)
│   ├── design.md                # Design system document
│   ├── docs/PRD-scheduling-ai.md  # Scheduling AI PRD
│   ├── docs/apps-script-sync.gs   # Google Sheets ↔ Supabase sync
│   └── HRM_DOCUMENTATION.md     # Full system documentation (23 sections)
└── README.md
```

## Modules

| Category | Features |
|----------|----------|
| **HR Core** | Employee management, Time tracking (GPS/WiFi), Leave, Overtime, Scheduling |
| **Payroll** | Salary structures, Taiwan labor/health insurance brackets (2020-2026), Tax withholding, Payslip via LINE, NHI supplements |
| **Enterprise** | Audit logs, Performance reviews, Recruitment ATS, Document management, Business trips, Expense claims, Multi-level approvals |
| **Operations** | Onboarding/offboarding workflows, Training/certification tracking, Company announcements, Disciplinary records |
| **Scheduling** | AI auto-scheduling (Claude), Demand forecasting, Variable working hours (變形工時), Open shift marketplace, Labor budgeting, Employee skills, Schedule templates, KPI tracking |
| **Workflows** | Templates (AI-generated), Tasks (with attachments + confirmation flow), Checklists, Event triggers |
| **LINE Bot** | HR commands (leave balance, OT, payslip), Notifications, Message/command/error logging, Tiered summaries (daily/weekly/monthly) |
| **ERP/Supply** | Inventory management (stock/transactions/stocktake), Vendor CRUD, Purchase orders (draft→approved→received), Operations analytics |
| **AI Tools** | Help center (RAG chatbot), Multi-agent orchestration, Auto-documentation pipeline, LLM usage tracking |
| **Mobile** | LIFF employee app (clock-in, schedule, leave, payslip), Manager dashboard |
| **Testing** | 8 Playwright test modules (65+ routes), automated test runner with Vite server |

## Getting Started

```bash
# Admin UI
cd admin
npm install
npm run dev          # http://localhost:5173

# Docker build
cd admin
docker build -t hrm-admin .
docker run -p 8080:8080 hrm-admin

# Deploy edge functions
npx supabase functions deploy --project-ref <ref>

# Generate help documentation
node admin/scripts/generate-docs.mjs
```

## Documentation

See [admin/HRM_DOCUMENTATION.md](admin/HRM_DOCUMENTATION.md) for complete system documentation including:
- Enterprise HRM architecture & gap analysis
- Payroll calculation engine (13-step process)
- Taiwan insurance bracket tables (2020-2026)
- Scheduling AI with 10+ labor law validations
- LINE bot command reference
- Database schema reference (50+ tables)
- All 23 implementation phases

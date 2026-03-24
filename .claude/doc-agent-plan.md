# Documentation Agent + Help Center — Implementation Plan

## Architecture

```
LOCAL (scripts/ — Agent SDK + Claude Code CLI)
  doc-agent/
  ├── Orchestrator (claude-opus-4-6, Agent SDK)
  │     └── spawns subagents via Task tool
  ├── Subagent: Flow Analyzer  (Read/Glob/Grep codebase)
  ├── Subagent: Content Writer (Qwen via DashScope)
  └── Subagent: DB Uploader   (writes to Supabase help_articles)

CLOUD (Supabase)
  functions/help-chatbot/    ← always-on RAG chatbot (Claude API HTTP)
  DB tables:
    help_articles            ← generated articles
    agent_runs               ← run history + status

FRONTEND (admin/src/pages/HelpCenter.tsx)
  /help-center route
    ├── Article browser (categories + search)
    └── RAG chatbot (calls help-chatbot edge function)
```

## Step-by-Step Plan

### Step 1 — Install Claude Code CLI globally
```bash
npm install -g @anthropic/claude-code
```
Also add the VS Code extension binary to PATH as fallback.

### Step 2 — Create scripts/ package
New `scripts/package.json` with:
- `@anthropic-ai/claude-agent-sdk`
- `@supabase/supabase-js`
- `@anthropic-ai/sdk` (for Anthropic API in chatbot)
- `dotenv`

New `scripts/tsconfig.json` (ESM, Node 20+)

### Step 3 — Create doc-agent orchestrator
`scripts/doc-agent/index.ts`
- Uses `query()` from Agent SDK with `Task` tool to spawn subagents
- Subagents defined inline with `agents: { ... }`
- Flow Analyzer: `allowedTools: ["Read", "Glob", "Grep"]`
- Content Writer: calls DashScope (Qwen) for bulk article generation
- DB Uploader: uses Supabase client to upsert `help_articles`

`scripts/doc-agent/prompts.ts`
- System prompts for each subagent role
- Flow analysis prompt: "identify user flows, operational flows, logic flows"
- Content generation prompt: "write step-by-step guide in zh-TW and en"

### Step 4 — Add npm scripts
Root `package.json` (or scripts/package.json):
```json
"scripts": {
  "generate-docs": "tsx scripts/doc-agent/index.ts",
  "generate-docs:page": "tsx scripts/doc-agent/index.ts --page"
}
```

### Step 5 — Supabase DB migration
`supabase/migrations/XXXXXX_help_center.sql`:
```sql
create table help_articles (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  title_zh text not null,
  title_en text,
  content_zh text not null,
  content_en text,
  category text not null,  -- 'hr', 'scheduling', 'workflow', 'org', 'system'
  tags text[],
  source_page text,        -- which tsx file this was generated from
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table agent_runs (
  id uuid primary key default gen_random_uuid(),
  type text not null,      -- 'doc-generation', 'doc-update'
  status text not null,    -- 'running', 'completed', 'failed'
  articles_generated int,
  started_at timestamptz default now(),
  completed_at timestamptz,
  summary text
);
```

### Step 6 — help-chatbot edge function
`supabase/functions/help-chatbot/index.ts`
- Receives: `{ question: string, language: 'zh-TW' | 'en' }`
- Searches `help_articles` using PostgreSQL full-text search (tsvector)
- Passes top 3 matching articles as context to Claude API
- Returns: `{ answer: string, sources: Article[] }`
- Uses `ANTHROPIC_API_KEY` secret (Claude Opus 4.6)
- Streams response via SSE

### Step 7 — HelpCenter.tsx frontend
`admin/src/pages/HelpCenter.tsx`
- Left sidebar: category nav (HR管理/排班/工作流程/組織管理/系統)
- Main area: article list → article detail view
- Bottom panel: RAG chatbot (calls help-chatbot function)
- Top-right: "🔄 重新生成文件" button (triggers agent run status check)
- Bilingual toggle (uses existing locale system)

### Step 8 — Update App.tsx
- Add `/help-center` route
- Add "📖 說明中心" to System nav group in sidebar

## Key Design Decisions

| Component | Model | Why |
|-----------|-------|-----|
| Orchestrator | claude-opus-4-6 (Agent SDK) | Needs reasoning to plan doc structure |
| Flow Analyzer | claude-opus-4-6 (Agent SDK) | Reads real codebase, needs understanding |
| Content Writer | Qwen qwen3.5-plus (DashScope) | Bulk generation, consistent with existing |
| Help Chatbot | claude-opus-4-6 (Anthropic API) | Better answer quality for end users |

## Files Created/Modified
| File | Action |
|------|--------|
| `scripts/package.json` | NEW |
| `scripts/tsconfig.json` | NEW |
| `scripts/doc-agent/index.ts` | NEW |
| `scripts/doc-agent/prompts.ts` | NEW |
| `scripts/doc-agent/supabase.ts` | NEW |
| `supabase/migrations/*_help_center.sql` | NEW |
| `supabase/functions/help-chatbot/index.ts` | NEW |
| `admin/src/pages/HelpCenter.tsx` | NEW |
| `admin/src/App.tsx` | MODIFY (add route + nav) |

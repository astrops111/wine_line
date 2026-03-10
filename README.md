# AI LINE Bot System

LINE-based workflow & task management platform with AI assistance.

## Tech Stack

- **Database**: Supabase (PostgreSQL)
- **Backend**: Supabase Edge Functions (Deno)
- **AI**: Qwen 3.5 via DashScope API
- **LINE**: LINE Messaging API
- **Admin UI**: Vite + React + TypeScript

## Project Structure

```
wines/
├── supabase/
│   ├── migrations/     # SQL migrations
│   └── functions/      # Edge Functions
├── admin/              # React admin panel
├── .env                # API keys (not committed)
└── README.md
```

## Getting Started

```bash
# Admin UI
cd admin
npm install
npm run dev
```

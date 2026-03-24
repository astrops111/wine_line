/**
 * Documentation Agent — uses Claude Code Agent SDK (CLI-based)
 *
 * Scans the HRM admin codebase and generates bilingual help articles.
 * Uses Claude Code's built-in Read/Glob/Grep tools via subagents.
 *
 * Usage:
 *   npm run generate-docs              # full scan (all 23 pages)
 *   npm run generate-docs:page -- Scheduling  # single page
 */

import { query } from '@anthropic-ai/claude-agent-sdk';
import 'dotenv/config';
import { startAgentRun, finishAgentRun, upsertArticles, type HelpArticle } from './supabase.ts';
import { FLOW_ANALYZER_SYSTEM, CONTENT_WRITER_SYSTEM, ORCHESTRATOR_SYSTEM } from './prompts.ts';

const PROJECT_ROOT = new URL('../../', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1');
const PAGES_DIR = `${PROJECT_ROOT}admin/src/pages`;

// Pages to document with their routes and categories
const PAGE_MANIFEST = [
  { file: 'Dashboard.tsx',        route: '/',                    category: 'system' },
  { file: 'HrDashboard.tsx',      route: '/hr-dashboard',        category: 'hr' },
  { file: 'ManagerDashboard.tsx', route: '/manager-dashboard',   category: 'hr' },
  { file: 'TimeTracker.tsx',      route: '/time-tracker',        category: 'hr' },
  { file: 'Scheduling.tsx',       route: '/scheduling',          category: 'scheduling' },
  { file: 'LeaveManagement.tsx',  route: '/leave-management',    category: 'hr' },
  { file: 'Holidays.tsx',         route: '/holidays',            category: 'hr' },
  { file: 'OvertimeRequests.tsx', route: '/overtime-requests',   category: 'hr' },
  { file: 'PayrollManagement.tsx',route: '/payroll',             category: 'hr' },
  { file: 'Employees.tsx',        route: '/org-management',      category: 'org' },
  { file: 'OrgManagement.tsx',    route: '/org-management',      category: 'org' },
  { file: 'Workflows.tsx',        route: '/workflow-management', category: 'workflow' },
  { file: 'Tasks.tsx',            route: '/workflow-management', category: 'workflow' },
  { file: 'Checklists.tsx',       route: '/workflow-management', category: 'workflow' },
  { file: 'LineManagement.tsx',   route: '/line',                category: 'system' },
  { file: 'Users.tsx',            route: '/users',               category: 'system' },
  { file: 'Notifications.tsx',    route: '/notifications',       category: 'system' },
  { file: 'Triggers.tsx',         route: '/triggers',            category: 'system' },
  { file: 'AdminSettings.tsx',    route: '/admin',               category: 'system' },
];

function extractJsonBlocks(text: string): unknown[] {
  const results: unknown[] = [];
  const regex = /```json\n([\s\S]*?)\n```/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    try {
      results.push(JSON.parse(match[1]));
    } catch {
      // skip malformed blocks
    }
  }
  return results;
}

async function runFlowAnalyzer(pageFile: string, category: string): Promise<unknown[]> {
  const filePath = `${PAGES_DIR}/${pageFile}`;
  let result = '';

  for await (const msg of query({
    prompt: `Read the file at "${filePath}" and extract all user flows, operational flows, and logic flows. Output ONE JSON block per the format in your instructions.`,
    options: {
      cwd: PROJECT_ROOT,
      allowedTools: ['Read', 'Glob', 'Grep'],
      systemPrompt: FLOW_ANALYZER_SYSTEM,
      maxTurns: 5,
      model: 'claude-opus-4-6',
    },
  })) {
    if ('result' in msg && msg.result) {
      result = String(msg.result);
    }
  }

  return extractJsonBlocks(result);
}

async function runContentWriter(flows: unknown[], pageFile: string): Promise<HelpArticle | null> {
  const flowsJson = JSON.stringify(flows, null, 2);
  let result = '';

  for await (const msg of query({
    prompt: `Write a comprehensive bilingual help article for these flows:\n\n${flowsJson}\n\nOutput ONE JSON block with the article.`,
    options: {
      allowedTools: [],
      systemPrompt: CONTENT_WRITER_SYSTEM,
      maxTurns: 3,
      model: 'claude-opus-4-6',
    },
  })) {
    if ('result' in msg && msg.result) {
      result = String(msg.result);
    }
  }

  const blocks = extractJsonBlocks(result);
  if (blocks.length === 0) return null;

  const article = blocks[0] as HelpArticle;
  article.source_page = pageFile;
  return article;
}

async function main() {
  const targetPage = process.argv.find((a, i) => process.argv[i - 1] === '--page');
  const pages = targetPage
    ? PAGE_MANIFEST.filter(p => p.file.toLowerCase().includes(targetPage.toLowerCase()))
    : PAGE_MANIFEST;

  if (pages.length === 0) {
    console.error(`No pages matched "${targetPage}"`);
    process.exit(1);
  }

  console.log(`\n🤖 Documentation Agent starting...`);
  console.log(`📄 Pages to process: ${pages.length}`);
  console.log(`📁 Source: ${PAGES_DIR}\n`);

  const runId = await startAgentRun('doc-generation');
  const articles: HelpArticle[] = [];
  let failed = 0;

  for (const page of pages) {
    console.log(`\n▶ Analyzing: ${page.file}`);

    try {
      // Step 1: Flow Analyzer (Agent SDK — uses Read tool to scan codebase)
      console.log(`  🔍 Flow Analyzer...`);
      const flows = await runFlowAnalyzer(page.file, page.category);
      console.log(`  ✓ Found ${flows.length} flow(s)`);

      if (flows.length === 0) {
        console.log(`  ⚠ Skipping (no flows found)`);
        failed++;
        continue;
      }

      // Step 2: Content Writer (Agent SDK — generates bilingual article)
      console.log(`  ✍ Content Writer...`);
      const article = await runContentWriter(flows, page.file);

      if (!article) {
        console.log(`  ⚠ Skipping (content generation failed)`);
        failed++;
        continue;
      }

      // Ensure page_route is set
      if (!article.page_route) {
        article.page_route = page.route;
      }
      article.page_route = page.route; // always override with canonical route

      articles.push(article);
      console.log(`  ✅ Article ready: "${article.title}"`);

    } catch (err) {
      console.error(`  ❌ Error: ${err}`);
      failed++;
    }
  }

  // Step 3: Upload to Supabase
  if (articles.length > 0) {
    console.log(`\n📤 Uploading ${articles.length} articles to Supabase...`);
    try {
      const count = await upsertArticles(articles);
      console.log(`✅ ${count} articles indexed in help_articles table`);
      await finishAgentRun(runId, 'completed', count,
        `Generated ${count} articles. ${failed} pages skipped.`);
    } catch (err) {
      console.error(`❌ Upload failed: ${err}`);
      await finishAgentRun(runId, 'failed', 0, String(err));
    }
  } else {
    console.log('\n⚠ No articles generated.');
    await finishAgentRun(runId, 'failed', 0, 'No articles generated');
  }

  console.log(`\n🏁 Done. ${articles.length} articles | ${failed} failed`);
}

main().catch(console.error);

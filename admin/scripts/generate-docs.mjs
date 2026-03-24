#!/usr/bin/env node
/**
 * Documentation pipeline runner — calls each agent function directly
 * so we don't hit Supabase's 60s edge function timeout.
 *
 * Usage: node admin/scripts/generate-docs.mjs
 */

const SUPABASE_URL = 'https://kzawtuvmchhtdsokrjys.supabase.co';
const ANON_KEY = 'sb_publishable_j4d5NBq-JxIBz-F8GpOLog_u8bEkynM';
const FUNCTIONS_BASE = `${SUPABASE_URL}/functions/v1`;

const PAGE_MANIFEST = [
    { route: '/', name: 'Dashboard', name_zh: '儀表板', category: 'System',
      description: 'Aggregated task/workflow/HR stats; pending leave/OT/punch-correction badges' },
    { route: '/manager-dashboard', name: 'Manager Dashboard', name_zh: '營運看板', category: 'System',
      description: 'Real-time store ops: open tasks, active workflows, staff on shift' },
    { route: '/hr-dashboard', name: 'HR Dashboard', name_zh: 'HR 報表', category: 'HR',
      description: 'Monthly attendance reports, absence risk alerts, export CSV/PDF' },
    { route: '/time-tracker', name: 'Time Tracker', name_zh: '打卡追蹤', category: 'HR',
      description: 'Clock-in/out records (4 tabs): today punch, history, LINE binding, correction approval' },
    { route: '/leave-management', name: 'Leave Management', name_zh: '請假管理', category: 'HR',
      description: 'Submit/approve/reject leave requests, leave balance tracking per type per year' },
    { route: '/overtime-requests', name: 'Overtime Requests', name_zh: '加班申請', category: 'HR',
      description: 'Pre/post overtime filings, pay vs compensatory type, manager approval workflow' },
    { route: '/payroll', name: 'Payroll Management', name_zh: '薪資管理', category: 'HR',
      description: 'Payroll run creation, salary structure config, Taiwan labor/health insurance brackets, payslip send' },
    { route: '/scheduling', name: 'Scheduling', name_zh: '排班', category: 'HR',
      description: '3-tab: weekly shift calendar (AI auto-schedule), store settings, employee shift preferences' },
    { route: '/holidays', name: 'Holidays', name_zh: '假日管理', category: 'HR',
      description: 'National/company/custom holidays with pay multipliers; affects payroll and scheduling' },
    { route: '/shift-rules', name: 'Shift Rules', name_zh: '排班規則', category: 'HR',
      description: 'Labor law compliance rules: min rest hours, consecutive day limits, weekly hour caps' },
    { route: '/workflow-management', name: 'Workflow Management', name_zh: '流程管理', category: 'Workflows',
      description: '4-tab hub: dashboard overview, workflow templates (AI-generated), tasks, checklists' },
    { route: '/employees', name: 'Employees', name_zh: '員工管理', category: 'HR',
      description: 'Employee CRUD, multi-store assignment, departments, LINE binding, roles, avatar upload' },
    { route: '/line', name: 'LINE Management', name_zh: 'LINE 管理', category: 'System',
      description: 'LINE user list, verification status, LINE group management for notifications' },
    { route: '/notifications', name: 'Notifications', name_zh: '通知', category: 'System',
      description: 'Broadcast messages to LINE groups or individual users' },
    { route: '/triggers', name: 'Triggers', name_zh: '觸發器', category: 'System',
      description: 'Automated event triggers: event → action rules (e.g. task complete → LINE notify)' },
    { route: '/users', name: 'Users', name_zh: '系統使用者', category: 'System',
      description: 'Admin user accounts, role assignments (admin/manager/hr/staff), auth management' },
    { route: '/admin', name: 'Admin Settings', name_zh: '系統設定', category: 'System',
      description: 'Organization-level config, LINE webhook URL, API key management, integrations' },
    { route: '/org-management', name: 'Org Management', name_zh: '組織管理', category: 'System',
      description: '8-tab hub: organizations, companies, store locations, departments, employees, LINE groups, billing' },
    { route: '/liff/app', name: 'LIFF Employee App', name_zh: '員工 LIFF App', category: 'LIFF',
      description: 'Mobile LINE app: GPS/WiFi clock-in/out, weekly schedule, hours, leave request, payslip, preferences' },
];

async function callFunction(name, payload) {
    const res = await fetch(`${FUNCTIONS_BASE}/${name}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${ANON_KEY}` },
        body: JSON.stringify(payload),
    });
    if (!res.ok && res.headers.get('content-type')?.includes('text/html')) {
        throw new Error(`[${name}] HTTP ${res.status} — non-JSON response (payload too large?)`);
    }
    const data = await res.json();
    if (data.error) throw new Error(`[${name}] ${data.error}`);
    return data;
}

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
    console.log('🤖 Documentation Pipeline Starting...');
    console.log(`📄 ${PAGE_MANIFEST.length} pages to document\n`);

    // ── Step 1: Flow Analysis (batches of 5 pages) ────────────────────────────
    console.log('⏳ [1/3] Flow Analyzer — extracting user flows per page...');
    const FLOW_BATCH = 5;
    const allFlows = [];
    for (let i = 0; i < PAGE_MANIFEST.length; i += FLOW_BATCH) {
        const batch = PAGE_MANIFEST.slice(i, i + FLOW_BATCH);
        process.stdout.write(`  Batch ${Math.floor(i/FLOW_BATCH)+1}/${Math.ceil(PAGE_MANIFEST.length/FLOW_BATCH)}: pages ${i+1}-${Math.min(i+FLOW_BATCH, PAGE_MANIFEST.length)}... `);
        const result = await callFunction('doc-flow-analyzer', { page_manifest: batch });
        allFlows.push(...(result.flows || []));
        console.log(`✓ (${result.flows?.length || 0} pages processed)`);
        if (i + FLOW_BATCH < PAGE_MANIFEST.length) await sleep(800);
    }
    console.log(`  ✅ Total flows extracted: ${allFlows.length} pages\n`);

    // ── Step 2: Content Generation (batches of 5 flows) ─────────────────────
    console.log('⏳ [2/3] Content Generator — writing bilingual articles...');
    const CONTENT_BATCH = 5;
    const allArticles = [];
    for (let i = 0; i < allFlows.length; i += CONTENT_BATCH) {
        const batch = allFlows.slice(i, i + CONTENT_BATCH);
        process.stdout.write(`  Batch ${Math.floor(i/CONTENT_BATCH)+1}/${Math.ceil(allFlows.length/CONTENT_BATCH)}: articles ${i+1}-${Math.min(i+CONTENT_BATCH, allFlows.length)}... `);
        const result = await callFunction('doc-content-gen', { flows: batch });
        allArticles.push(...(result.articles || []));
        console.log(`✓ (${result.articles?.length || 0} articles generated)`);
        if (i + CONTENT_BATCH < allFlows.length) await sleep(800);
    }
    console.log(`  ✅ Total articles generated: ${allArticles.length}\n`);

    // ── Step 3: Indexer (batches of 5 to avoid payload size limits) ─────────
    console.log('⏳ [3/3] Indexer — storing articles in help_articles table...');
    const INDEX_BATCH = 5;
    let totalIndexed = 0;
    const allArticleIds = [];
    const allIndexErrors = [];
    for (let i = 0; i < allArticles.length; i += INDEX_BATCH) {
        const batch = allArticles.slice(i, i + INDEX_BATCH);
        process.stdout.write(`  Batch ${Math.floor(i/INDEX_BATCH)+1}/${Math.ceil(allArticles.length/INDEX_BATCH)}: articles ${i+1}-${Math.min(i+INDEX_BATCH, allArticles.length)}... `);
        const indexResult = await callFunction('doc-indexer', { articles: batch });
        totalIndexed += indexResult.indexed_count || 0;
        if (indexResult.article_ids) allArticleIds.push(...indexResult.article_ids);
        if (indexResult.errors) allIndexErrors.push(...indexResult.errors);
        console.log(`✓ (${indexResult.indexed_count || 0} indexed)`);
        if (i + INDEX_BATCH < allArticles.length) await sleep(500);
    }
    console.log(`  ✅ Indexed: ${totalIndexed}/${allArticles.length} articles`);
    if (allIndexErrors.length > 0) {
        console.warn(`  ⚠️  Errors:`, allIndexErrors);
    }

    console.log('\n🎉 Documentation pipeline complete!');
    console.log(`📚 ${totalIndexed} articles now available in /help-center`);
    if (allArticleIds.length > 0) {
        console.log(`🔑 First article ID: ${allArticleIds[0]}`);
    }
}

main().catch(err => {
    console.error('\n❌ Pipeline failed:', err.message);
    process.exit(1);
});

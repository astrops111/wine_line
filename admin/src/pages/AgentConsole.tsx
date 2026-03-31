import { useState, useEffect, useRef } from 'react';
import { supabase, FUNCTIONS_URL } from '../lib/supabase';
import { getLocale } from '../lib/i18n';

interface AgentTask {
    id: string;
    orchestration_id: string;
    agent_team: string;
    agent_name: string;
    status: string;
    input: any;
    output: any;
    error: string | null;
    started_at: string | null;
    completed_at: string | null;
    created_at: string;
}

interface AgentReg {
    id: string;
    team_name: string;
    agent_name: string;
    description: string;
    description_en: string;
    endpoint: string;
    model: string;
    status: string;
    sort_order: number;
}

interface LLMUsageLog {
    id: string;
    function_name: string;
    provider: string;
    model: string;
    input_tokens: number;
    output_tokens: number;
    total_tokens: number;
    estimated_cost: number;
    latency_ms: number;
    status: string;
    error_message: string | null;
    purpose: string | null;
    metadata: Record<string, unknown> | null;
    created_at: string;
}

type Tab = 'overview' | 'tasks' | 'registry' | 'llm-usage';

const TEAM_COLORS: Record<string, string> = {
    documentation: 'var(--accent-primary)',
    dev: 'var(--accent-blue)',
    testing: 'var(--accent-purple)',
};

const STATUS_BADGE: Record<string, string> = {
    pending: 'pending',
    running: 'in_progress',
    completed: 'completed',
    failed: 'blocked',
    awaiting_approval: 'on_hold',
};

const PROVIDER_COLORS: Record<string, string> = {
    dashscope: '#f59e0b',
    gemini: '#3b82f6',
    anthropic: '#a855f7',
};

export function AgentConsole() {
    const zh = getLocale() === 'zh-TW';
    const [tab, setTab] = useState<Tab>('overview');
    const [tasks, setTasks] = useState<AgentTask[]>([]);
    const [registry, setRegistry] = useState<AgentReg[]>([]);
    const [loading, setLoading] = useState(true);
    const [running, setRunning] = useState(false);
    const [customTask, setCustomTask] = useState('');
    const [selectedOrch, setSelectedOrch] = useState<string | null>(null);
    const [helpArticleCount, setHelpArticleCount] = useState<number | null>(null);
    const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // LLM Usage state
    const [llmLogs, setLlmLogs] = useState<LLMUsageLog[]>([]);
    const [llmLoading, setLlmLoading] = useState(false);
    const [llmDateFrom, setLlmDateFrom] = useState(() => {
        const d = new Date(); d.setDate(d.getDate() - 7);
        return d.toISOString().split('T')[0];
    });
    const [llmDateTo, setLlmDateTo] = useState(() => new Date().toISOString().split('T')[0]);
    const [llmProviderFilter, setLlmProviderFilter] = useState<string>('all');
    const [expandedLogId, setExpandedLogId] = useState<string | null>(null);

    useEffect(() => {
        loadData();
        return () => { if (pollRef.current) clearInterval(pollRef.current); };
    }, []);

    useEffect(() => {
        if (pollRef.current) clearInterval(pollRef.current);
        const hasRunning = tasks.some(t => t.status === 'running' || t.status === 'pending');
        if (hasRunning) {
            pollRef.current = setInterval(loadTasks, 3000);
        }
        return () => { if (pollRef.current) clearInterval(pollRef.current); };
    }, [tasks]);

    useEffect(() => {
        if (tab === 'llm-usage') loadLlmLogs();
    }, [tab, llmDateFrom, llmDateTo, llmProviderFilter]);

    async function loadData() {
        setLoading(true);
        await Promise.all([loadTasks(), loadRegistry(), loadArticleCount()]);
        setLoading(false);
    }

    async function loadTasks() {
        const { data } = await supabase
            .from('agent_tasks')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(200);
        setTasks(data || []);
    }

    async function loadRegistry() {
        const { data } = await supabase
            .from('agent_registry')
            .select('*')
            .order('team_name')
            .order('sort_order');
        setRegistry(data || []);
    }

    async function loadArticleCount() {
        const { count } = await supabase
            .from('help_articles')
            .select('id', { count: 'exact', head: true });
        setHelpArticleCount(count ?? 0);
    }

    async function loadLlmLogs() {
        setLlmLoading(true);
        let query = supabase
            .from('llm_usage_logs')
            .select('*')
            .gte('created_at', llmDateFrom + 'T00:00:00')
            .lte('created_at', llmDateTo + 'T23:59:59')
            .order('created_at', { ascending: false })
            .limit(1000);
        if (llmProviderFilter !== 'all') {
            query = query.eq('provider', llmProviderFilter);
        }
        const { data } = await query;
        setLlmLogs(data || []);
        setLlmLoading(false);
    }

    async function triggerOrchestration() {
        const taskText = customTask.trim() || 'Generate full documentation for all HRM pages';
        if (!confirm(zh ? `開始執行 Agent 編排？\n任務：${taskText}` : `Start agent orchestration?\nTask: ${taskText}`)) return;
        setRunning(true);
        try {
            const { data: { session } } = await supabase.auth.getSession();
            const token = session?.access_token || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
            const res = await fetch(`${FUNCTIONS_URL}/orchestrator`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ task: taskText }),
            });
            const data = await res.json();
            if (data.error) throw new Error(data.error);
            setSelectedOrch(data.orchestration_id);
            setCustomTask('');
            await loadData();
            setTab('tasks');
        } catch (e: any) {
            alert(`${zh ? '執行失敗：' : 'Error: '}${e.message}`);
        } finally {
            setRunning(false);
        }
    }

    // Group tasks by orchestration_id, most recent first
    const orchestrationIds = [...new Set(tasks.map(t => t.orchestration_id))];
    const orchestrations: Record<string, AgentTask[]> = {};
    for (const id of orchestrationIds) {
        orchestrations[id] = tasks
            .filter(t => t.orchestration_id === id)
            .sort((a, b) => (a.created_at < b.created_at ? -1 : 1));
    }

    const completedRuns = orchestrationIds.filter(id =>
        orchestrations[id].every(t => t.status === 'completed')
    ).length;
    const failedTasks = tasks.filter(t => t.status === 'failed').length;

    const teamNames = ['documentation', 'dev', 'testing'];

    return (
        <div>
            {/* Page Header */}
            <div style={{ marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                    <h2 style={{ fontSize: '22px', fontWeight: 700, marginBottom: '4px' }}>
                        🤖 {zh ? 'Agent 控制台' : 'Agent Console'}
                    </h2>
                    <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                        {zh ? '管理 AI Agent 團隊、任務佇列與執行日誌' : 'Manage AI agent teams, task queue, and execution logs'}
                    </p>
                </div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <input
                        className="input-field"
                        style={{ width: '260px', fontSize: '13px' }}
                        aria-label="Custom task" name="customTask" autoComplete="off" placeholder={zh ? '自訂任務說明（選填）' : 'Custom task description (optional)'}
                        value={customTask}
                        onChange={e => setCustomTask(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && !running && triggerOrchestration()}
                    />
                    <button className="btn btn-primary" onClick={triggerOrchestration} disabled={running}>
                        {running
                            ? (zh ? '⏳ 執行中…' : '⏳ Running…')
                            : `🚀 ${zh ? '啟動編排' : 'Run Orchestration'}`}
                    </button>
                </div>
            </div>

            {/* Tabs */}
            <div className="tab-bar" style={{ marginBottom: '20px' }}>
                {(['overview', 'tasks', 'registry', 'llm-usage'] as Tab[]).map(t => (
                    <button key={t} className={`tab-item ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>
                        {t === 'overview' ? (zh ? '📊 總覽' : '📊 Overview')
                            : t === 'tasks' ? (zh ? `📋 任務佇列${orchestrationIds.length > 0 ? ` (${orchestrationIds.length})` : ''}` : `📋 Task Queue${orchestrationIds.length > 0 ? ` (${orchestrationIds.length})` : ''}`)
                            : t === 'registry' ? (zh ? '🗂 Agent 清單' : '🗂 Agent Registry')
                            : (zh ? '💰 LLM 用量' : '💰 LLM Usage')}
                    </button>
                ))}
            </div>

            {/* Overview Tab */}
            {tab === 'overview' && (
                <div>
                    {/* Stats */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '20px' }}>
                        {[
                            { label: zh ? '總編排次數' : 'Total Runs', value: orchestrationIds.length, color: '#2dd4bf', bg: 'rgba(45,212,191,0.1)' },
                            { label: zh ? '成功完成' : 'Completed', value: completedRuns, color: '#3b82f6', bg: 'rgba(59,130,246,0.1)' },
                            { label: zh ? '已索引文章' : 'Indexed Articles', value: helpArticleCount ?? '—', color: '#a855f7', bg: 'rgba(168,85,247,0.1)' },
                            { label: zh ? '失敗任務' : 'Failed Tasks', value: failedTasks, color: '#f43f5e', bg: 'rgba(244,63,94,0.1)' },
                        ].map((s, i) => (
                            <div key={i} className="card" style={{ padding: '16px', borderLeft: `3px solid ${s.color}`, background: s.bg }}>
                                <div style={{ fontSize: '24px', fontWeight: 700, color: s.color }}>{s.value}</div>
                                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>{s.label}</div>
                            </div>
                        ))}
                    </div>

                    {/* Team Status Grid */}
                    <div className="card" style={{ padding: '0' }}>
                        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--outline-variant)', fontWeight: 600, fontSize: '14px' }}>
                            {zh ? 'Agent 團隊狀態' : 'Agent Team Status'}
                        </div>
                        {teamNames.map(team => {
                            const teamAgents = registry.filter(r => r.team_name === team);
                            const available = teamAgents.length > 0 && teamAgents.some(a => a.status === 'active');
                            return (
                                <div key={team} style={{
                                    padding: '14px 16px', borderBottom: '1px solid var(--outline-variant)',
                                    display: 'flex', alignItems: 'center', gap: '14px',
                                }}>
                                    <div style={{
                                        width: '10px', height: '10px', borderRadius: '50%', flexShrink: 0,
                                        background: available ? (TEAM_COLORS[team] || 'var(--text-muted)') : 'var(--text-muted)',
                                        boxShadow: available ? `0 0 6px ${TEAM_COLORS[team] || 'transparent'}` : 'none',
                                    }} />
                                    <div style={{ flex: 1 }}>
                                        <div style={{ fontWeight: 600, fontSize: '14px', color: TEAM_COLORS[team] || 'var(--text-primary)', textTransform: 'capitalize' }}>
                                            {team} Team
                                        </div>
                                        <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                                            {teamAgents.length > 0
                                                ? teamAgents.map(a => a.agent_name).join(' → ')
                                                : (zh ? '尚未配置' : 'Not configured')}
                                        </div>
                                    </div>
                                    <span className="badge" style={{
                                        background: available ? 'rgba(45,212,191,0.15)' : 'rgba(100,116,139,0.2)',
                                        color: available ? 'var(--accent-primary)' : 'var(--text-muted)',
                                        fontSize: '11px', padding: '3px 8px', borderRadius: '8px',
                                    }}>
                                        {available
                                            ? (zh ? '✅ 可用' : '✅ Available')
                                            : (zh ? '⏳ 尚未實作' : '⏳ Not yet implemented')}
                                    </span>
                                </div>
                            );
                        })}
                    </div>

                    {/* Architecture diagram */}
                    <div className="card" style={{ marginTop: '16px', padding: '16px', borderLeft: '3px solid var(--accent-primary)' }}>
                        <div style={{ fontWeight: 600, fontSize: '13px', marginBottom: '10px' }}>
                            {zh ? '💡 編排架構說明' : '💡 Orchestration Architecture'}
                        </div>
                        <pre style={{
                            fontSize: '11px', color: 'var(--text-secondary)', lineHeight: 1.6,
                            fontFamily: "'SF Mono', 'Fira Code', monospace", whiteSpace: 'pre-wrap',
                        }}>
{zh
? `使用者觸發任務
    ↓
Orchestrator (Claude) — 規劃 Agent 團隊與執行順序
    ↓
Documentation Team (依序執行):
  [1] doc-flow-analyzer  → Qwen — 萃取每頁操作流程
  [2] doc-content-gen    → Qwen — 生成雙語 Markdown 文章
  [3] doc-indexer        → DB   — 寫入 help_articles + FTS 索引
  [4] help-chatbot       → Claude — 隨需 RAG 問答（由說明中心呼叫）`
: `User triggers task
    ↓
Orchestrator (Claude) — Plans agent team and pipeline order
    ↓
Documentation Team (sequential pipeline):
  [1] doc-flow-analyzer  → Qwen — Extract flows per page
  [2] doc-content-gen    → Qwen — Generate bilingual Markdown articles
  [3] doc-indexer        → DB   — Write to help_articles + FTS index
  [4] help-chatbot       → Claude — On-demand RAG Q&A (called by Help Center)`}
                        </pre>
                    </div>
                </div>
            )}

            {/* Task Queue Tab */}
            {tab === 'tasks' && (
                <div>
                    {orchestrationIds.length === 0 && !loading ? (
                        <div style={{ textAlign: 'center', padding: '80px 20px', color: 'var(--text-muted)' }}>
                            <div style={{ fontSize: '48px', marginBottom: '16px' }}>🤖</div>
                            <p style={{ fontSize: '14px' }}>
                                {zh ? '尚無執行記錄。點擊「啟動編排」開始。' : 'No runs yet. Click "Run Orchestration" to start.'}
                            </p>
                        </div>
                    ) : (
                        orchestrationIds.map(orchId => {
                            const orchTasks = orchestrations[orchId];
                            const isSelected = selectedOrch === orchId;
                            const hasFailure = orchTasks.some(t => t.status === 'failed');
                            const allDone = orchTasks.every(t => t.status === 'completed' || t.status === 'failed');
                            const hasRunning = orchTasks.some(t => t.status === 'running');

                            return (
                                <div key={orchId} className="card" style={{ marginBottom: '10px', padding: '0' }}>
                                    <div
                                        style={{
                                            padding: '12px 16px', display: 'flex', alignItems: 'center',
                                            justifyContent: 'space-between', cursor: 'pointer',
                                        }}
                                        onClick={() => setSelectedOrch(isSelected ? null : orchId)}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                            {hasRunning && (
                                                <div style={{
                                                    width: '8px', height: '8px', borderRadius: '50%',
                                                    background: 'var(--accent-blue)',
                                                    animation: 'pulse 1.5s infinite',
                                                }} />
                                            )}
                                            <div>
                                                <div style={{ fontWeight: 600, fontSize: '13px' }}>
                                                    {zh ? '編排 #' : 'Run #'}{orchId.slice(0, 8)}
                                                    <span style={{ fontWeight: 400, color: 'var(--text-muted)', fontSize: '12px', marginLeft: '6px' }}>
                                                        · {orchTasks[0]?.agent_team} team
                                                    </span>
                                                </div>
                                                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                                                    {orchTasks[0]?.created_at?.replace('T', ' ').slice(0, 19)}
                                                </div>
                                            </div>
                                        </div>
                                        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                                            <span className="badge" style={{
                                                fontSize: '11px', padding: '3px 8px', borderRadius: '8px',
                                                background: hasFailure ? 'rgba(244,63,94,0.15)' : allDone ? 'rgba(45,212,191,0.15)' : 'rgba(59,130,246,0.15)',
                                                color: hasFailure ? '#f43f5e' : allDone ? 'var(--accent-primary)' : '#3b82f6',
                                            }}>
                                                {hasFailure ? (zh ? '❌ 失敗' : '❌ Failed')
                                                    : allDone ? (zh ? '✅ 完成' : '✅ Done')
                                                    : (zh ? '🔄 執行中' : '🔄 Running')}
                                            </span>
                                            <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
                                                {isSelected ? '▾' : '▸'}
                                            </span>
                                        </div>
                                    </div>

                                    {isSelected && (
                                        <div style={{ borderTop: '1px solid var(--outline-variant)', padding: '8px 16px 12px' }}>
                                            {orchTasks.map((t, i) => (
                                                <div key={t.id} style={{
                                                    display: 'flex', alignItems: 'flex-start', gap: '12px',
                                                    padding: '8px 0',
                                                    borderBottom: i < orchTasks.length - 1 ? '1px solid var(--border-color)' : 'none',
                                                }}>
                                                    {/* Step number */}
                                                    <div style={{
                                                        width: '22px', height: '22px', borderRadius: '50%', flexShrink: 0,
                                                        background: t.status === 'completed' ? 'rgba(45,212,191,0.2)'
                                                            : t.status === 'failed' ? 'rgba(244,63,94,0.2)'
                                                            : t.status === 'running' ? 'rgba(59,130,246,0.2)'
                                                            : 'var(--bg-primary)',
                                                        border: `2px solid ${t.status === 'completed' ? 'var(--accent-primary)'
                                                            : t.status === 'failed' ? '#f43f5e'
                                                            : t.status === 'running' ? '#3b82f6'
                                                            : 'var(--border-color)'}`,
                                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                        fontSize: '10px', fontWeight: 700, color: 'var(--text-secondary)',
                                                    }}>
                                                        {t.status === 'completed' ? '✓' : t.status === 'failed' ? '✕' : i + 1}
                                                    </div>
                                                    <div style={{ flex: 1 }}>
                                                        <div style={{ fontWeight: 500, fontSize: '13px' }}>
                                                            {t.agent_name}
                                                        </div>
                                                        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                                                            {t.started_at && `${zh ? '開始' : 'Start'}: ${t.started_at.slice(11, 19)}`}
                                                            {t.completed_at && ` · ${zh ? '完成' : 'Done'}: ${t.completed_at.slice(11, 19)}`}
                                                        </div>
                                                        {t.error && (
                                                            <div style={{
                                                                marginTop: '4px', fontSize: '12px', color: '#f43f5e',
                                                                background: 'rgba(244,63,94,0.1)', padding: '4px 8px', borderRadius: '4px',
                                                            }}>
                                                                ❌ {t.error}
                                                            </div>
                                                        )}
                                                        {t.output && t.status === 'completed' && (
                                                            <div style={{ marginTop: '4px', fontSize: '11px', color: 'var(--text-muted)' }}>
                                                                {t.agent_name === 'indexer' && t.output.indexed_count != null
                                                                    ? `📄 ${t.output.indexed_count} ${zh ? '篇文章已索引' : 'articles indexed'}`
                                                                    : `${zh ? '輸出欄位' : 'Output keys'}: ${Object.keys(t.output).join(', ')}`}
                                                            </div>
                                                        )}
                                                    </div>
                                                    <span className="badge" style={{
                                                        fontSize: '10px', padding: '2px 7px', borderRadius: '8px',
                                                        background: STATUS_BADGE[t.status] === 'completed' ? 'rgba(45,212,191,0.15)'
                                                            : STATUS_BADGE[t.status] === 'blocked' ? 'rgba(244,63,94,0.15)'
                                                            : STATUS_BADGE[t.status] === 'in_progress' ? 'rgba(59,130,246,0.15)'
                                                            : 'rgba(100,116,139,0.15)',
                                                        color: STATUS_BADGE[t.status] === 'completed' ? 'var(--accent-primary)'
                                                            : STATUS_BADGE[t.status] === 'blocked' ? '#f43f5e'
                                                            : STATUS_BADGE[t.status] === 'in_progress' ? '#3b82f6'
                                                            : 'var(--text-muted)',
                                                    }}>
                                                        {t.status}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            );
                        })
                    )}
                </div>
            )}

            {/* Registry Tab */}
            {tab === 'registry' && (
                <div className="card" style={{ padding: '0', overflow: 'hidden' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{ background: 'var(--bg-primary)' }}>
                                {[zh ? '團隊' : 'Team', zh ? 'Agent' : 'Agent', zh ? '說明' : 'Description', zh ? '端點' : 'Endpoint', zh ? '模型' : 'Model', zh ? '狀態' : 'Status'].map(h => (
                                    <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, fontSize: '12px', color: 'var(--text-muted)', borderBottom: '1px solid var(--outline-variant)' }}>
                                        {h}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {registry.map((r, i) => (
                                <tr key={r.id} style={{ borderBottom: i < registry.length - 1 ? '1px solid var(--border-color)' : 'none' }}>
                                    <td style={{ padding: '10px 14px' }}>
                                        <span style={{ color: TEAM_COLORS[r.team_name] || 'inherit', fontWeight: 600, fontSize: '13px' }}>
                                            {r.team_name}
                                        </span>
                                    </td>
                                    <td style={{ padding: '10px 14px' }}>
                                        <code style={{ fontSize: '12px', color: 'var(--accent-primary)', background: 'rgba(45,212,191,0.1)', padding: '2px 6px', borderRadius: '4px' }}>
                                            {r.agent_name}
                                        </code>
                                    </td>
                                    <td style={{ padding: '10px 14px', maxWidth: '280px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                                        {zh ? r.description : r.description_en}
                                    </td>
                                    <td style={{ padding: '10px 14px' }}>
                                        <code style={{ fontSize: '11px', color: '#3b82f6' }}>{r.endpoint}</code>
                                    </td>
                                    <td style={{ padding: '10px 14px', fontSize: '11px', color: 'var(--text-muted)' }}>
                                        {r.model}
                                    </td>
                                    <td style={{ padding: '10px 14px' }}>
                                        <span className="badge" style={{
                                            fontSize: '10px', padding: '2px 7px', borderRadius: '8px',
                                            background: r.status === 'active' ? 'rgba(45,212,191,0.15)' : 'rgba(100,116,139,0.15)',
                                            color: r.status === 'active' ? 'var(--accent-primary)' : 'var(--text-muted)',
                                        }}>
                                            {r.status}
                                        </span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    {registry.length === 0 && !loading && (
                        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
                            {zh ? '尚無 Agent 資料。請先執行資料庫遷移。' : 'No agents found. Please run the database migration first.'}
                        </div>
                    )}
                </div>
            )}

            {/* LLM Usage Tab */}
            {tab === 'llm-usage' && (() => {
                const today = new Date().toISOString().split('T')[0];
                const todayLogs = llmLogs.filter(l => l.created_at.startsWith(today));
                const totalCalls = llmLogs.length;
                const totalTokens = llmLogs.reduce((s, l) => s + (l.total_tokens || 0), 0);
                const totalCost = llmLogs.reduce((s, l) => s + (Number(l.estimated_cost) || 0), 0);
                const errorCount = llmLogs.filter(l => l.status === 'error').length;
                const errorRate = totalCalls > 0 ? ((errorCount / totalCalls) * 100).toFixed(1) : '0';

                // Group by provider
                const byProvider: Record<string, { calls: number; tokens: number; cost: number }> = {};
                for (const l of llmLogs) {
                    if (!byProvider[l.provider]) byProvider[l.provider] = { calls: 0, tokens: 0, cost: 0 };
                    byProvider[l.provider].calls++;
                    byProvider[l.provider].tokens += l.total_tokens || 0;
                    byProvider[l.provider].cost += Number(l.estimated_cost) || 0;
                }

                // Group by function
                const byFunc: Record<string, { calls: number; tokens: number; cost: number; latencySum: number; errors: number }> = {};
                for (const l of llmLogs) {
                    if (!byFunc[l.function_name]) byFunc[l.function_name] = { calls: 0, tokens: 0, cost: 0, latencySum: 0, errors: 0 };
                    byFunc[l.function_name].calls++;
                    byFunc[l.function_name].tokens += l.total_tokens || 0;
                    byFunc[l.function_name].cost += Number(l.estimated_cost) || 0;
                    byFunc[l.function_name].latencySum += l.latency_ms || 0;
                    if (l.status === 'error') byFunc[l.function_name].errors++;
                }
                const funcEntries = Object.entries(byFunc).sort((a, b) => b[1].cost - a[1].cost);

                return (
                    <div>
                        {/* Filters */}
                        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap' }}>
                            <label style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{zh ? '從' : 'From'}</label>
                            <input type="date" className="input-field" style={{ width: '150px', fontSize: '13px' }}
                                value={llmDateFrom} onChange={e => setLlmDateFrom(e.target.value)} />
                            <label style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{zh ? '到' : 'To'}</label>
                            <input type="date" className="input-field" style={{ width: '150px', fontSize: '13px' }}
                                value={llmDateTo} onChange={e => setLlmDateTo(e.target.value)} />
                            <select className="input-field" style={{ width: '140px', fontSize: '13px' }}
                                value={llmProviderFilter} onChange={e => setLlmProviderFilter(e.target.value)}>
                                <option value="all">{zh ? '所有供應商' : 'All Providers'}</option>
                                <option value="dashscope">DashScope</option>
                                <option value="gemini">Gemini</option>
                                <option value="anthropic">Anthropic</option>
                            </select>
                            <button className="btn btn-secondary" onClick={loadLlmLogs} disabled={llmLoading}
                                style={{ fontSize: '12px', padding: '6px 12px' }}>
                                {llmLoading ? '...' : (zh ? '🔄 重新整理' : '🔄 Refresh')}
                            </button>
                        </div>

                        {/* Stats Cards */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '20px' }}>
                            {[
                                { label: zh ? '總呼叫數' : 'Total Calls', value: totalCalls, sub: `${zh ? '今日' : 'Today'}: ${todayLogs.length}`, color: '#3b82f6', bg: 'rgba(59,130,246,0.1)' },
                                { label: zh ? '總 Token 數' : 'Total Tokens', value: totalTokens >= 1000000 ? `${(totalTokens / 1000000).toFixed(1)}M` : totalTokens >= 1000 ? `${(totalTokens / 1000).toFixed(1)}K` : totalTokens, sub: `in+out`, color: '#a855f7', bg: 'rgba(168,85,247,0.1)' },
                                { label: zh ? '預估費用' : 'Est. Cost', value: `$${totalCost.toFixed(4)}`, sub: 'USD', color: '#f59e0b', bg: 'rgba(245,158,11,0.1)' },
                                { label: zh ? '錯誤率' : 'Error Rate', value: `${errorRate}%`, sub: `${errorCount} / ${totalCalls}`, color: errorCount > 0 ? '#f43f5e' : '#2dd4bf', bg: errorCount > 0 ? 'rgba(244,63,94,0.1)' : 'rgba(45,212,191,0.1)' },
                            ].map((s, i) => (
                                <div key={i} className="card" style={{ padding: '16px', borderLeft: `3px solid ${s.color}`, background: s.bg }}>
                                    <div style={{ fontSize: '22px', fontWeight: 700, color: s.color }}>{s.value}</div>
                                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>{s.label}</div>
                                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>{s.sub}</div>
                                </div>
                            ))}
                        </div>

                        {/* Usage by Provider */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '16px', marginBottom: '20px' }}>
                            <div className="card" style={{ padding: '0' }}>
                                <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--outline-variant)', fontWeight: 600, fontSize: '13px' }}>
                                    {zh ? '依供應商統計' : 'By Provider'}
                                </div>
                                {Object.entries(byProvider).length === 0 ? (
                                    <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px' }}>
                                        {zh ? '無資料' : 'No data'}
                                    </div>
                                ) : Object.entries(byProvider).sort((a, b) => b[1].calls - a[1].calls).map(([prov, stats]) => {
                                    const pct = totalCalls > 0 ? ((stats.calls / totalCalls) * 100) : 0;
                                    return (
                                        <div key={prov} style={{ padding: '10px 16px', borderBottom: '1px solid var(--border-color)' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                                                <span style={{ fontSize: '13px', fontWeight: 600, color: PROVIDER_COLORS[prov] || 'var(--text-primary)', textTransform: 'capitalize' }}>
                                                    {prov}
                                                </span>
                                                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{stats.calls} {zh ? '次' : 'calls'}</span>
                                            </div>
                                            <div style={{ height: '6px', borderRadius: '3px', background: 'var(--bg-primary)', overflow: 'hidden' }}>
                                                <div style={{ height: '100%', width: `${pct}%`, borderRadius: '3px', background: PROVIDER_COLORS[prov] || '#64748b', transition: 'width 0.3s' }} />
                                            </div>
                                            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                                                {stats.tokens.toLocaleString()} tokens · ${stats.cost.toFixed(4)}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>

                            {/* Usage by Function */}
                            <div className="card" style={{ padding: '0', overflow: 'hidden' }}>
                                <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--outline-variant)', fontWeight: 600, fontSize: '13px' }}>
                                    {zh ? '依功能統計' : 'By Function'}
                                </div>
                                <div style={{ maxHeight: '320px', overflowY: 'auto' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                        <thead>
                                            <tr style={{ background: 'var(--bg-primary)' }}>
                                                {[zh ? '功能' : 'Function', zh ? '次數' : 'Calls', zh ? '平均延遲' : 'Avg Latency', 'Tokens', zh ? '費用' : 'Cost', zh ? '錯誤' : 'Errors'].map(h => (
                                                    <th key={h} style={{ padding: '8px 10px', textAlign: 'left', fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', borderBottom: '1px solid var(--outline-variant)' }}>
                                                        {h}
                                                    </th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {funcEntries.map(([fn, s]) => (
                                                <tr key={fn} style={{ borderBottom: '1px solid var(--border-color)' }}>
                                                    <td style={{ padding: '8px 10px' }}>
                                                        <code style={{ fontSize: '11px', color: 'var(--accent-primary)', background: 'rgba(45,212,191,0.1)', padding: '1px 5px', borderRadius: '3px' }}>
                                                            {fn}
                                                        </code>
                                                    </td>
                                                    <td style={{ padding: '8px 10px', fontSize: '12px' }}>{s.calls}</td>
                                                    <td style={{ padding: '8px 10px', fontSize: '12px', color: 'var(--text-muted)' }}>
                                                        {s.calls > 0 ? `${Math.round(s.latencySum / s.calls)}ms` : '—'}
                                                    </td>
                                                    <td style={{ padding: '8px 10px', fontSize: '12px' }}>{s.tokens.toLocaleString()}</td>
                                                    <td style={{ padding: '8px 10px', fontSize: '12px', fontWeight: 600, color: '#f59e0b' }}>
                                                        ${s.cost.toFixed(4)}
                                                    </td>
                                                    <td style={{ padding: '8px 10px', fontSize: '12px', color: s.errors > 0 ? '#f43f5e' : 'var(--text-muted)' }}>
                                                        {s.errors > 0 ? `❌ ${s.errors}` : '—'}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                    {funcEntries.length === 0 && (
                                        <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px' }}>
                                            {zh ? '無資料' : 'No data'}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Recent Calls Log */}
                        <div className="card" style={{ padding: '0', overflow: 'hidden' }}>
                            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--outline-variant)', fontWeight: 600, fontSize: '13px', display: 'flex', justifyContent: 'space-between' }}>
                                <span>{zh ? '近期呼叫紀錄' : 'Recent Call Logs'}</span>
                                <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 400 }}>
                                    {llmLogs.length} {zh ? '筆' : 'records'}
                                </span>
                            </div>
                            <div style={{ maxHeight: '480px', overflowY: 'auto' }}>
                                {llmLogs.length === 0 && !llmLoading && (
                                    <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
                                        {zh ? '此期間無 LLM 使用紀錄。' : 'No LLM usage records for this period.'}
                                    </div>
                                )}
                                {llmLoading && (
                                    <div style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)' }}>
                                        {zh ? '載入中…' : 'Loading…'}
                                    </div>
                                )}
                                {llmLogs.slice(0, 200).map(log => (
                                    <div key={log.id} style={{
                                        padding: '10px 16px', borderBottom: '1px solid var(--border-color)',
                                        cursor: 'pointer', background: expandedLogId === log.id ? 'var(--bg-secondary)' : 'transparent',
                                    }}
                                        onClick={() => setExpandedLogId(expandedLogId === log.id ? null : log.id)}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                            <span style={{
                                                width: '7px', height: '7px', borderRadius: '50%', flexShrink: 0,
                                                background: log.status === 'success' ? '#2dd4bf' : log.status === 'fallback' ? '#f59e0b' : '#f43f5e',
                                            }} />
                                            <code style={{ fontSize: '11px', color: 'var(--accent-primary)', minWidth: '130px' }}>{log.function_name}</code>
                                            <span style={{ fontSize: '11px', color: PROVIDER_COLORS[log.provider] || 'var(--text-muted)', fontWeight: 600, textTransform: 'capitalize', minWidth: '70px' }}>
                                                {log.provider}
                                            </span>
                                            <span style={{ fontSize: '11px', color: 'var(--text-muted)', minWidth: '100px' }}>{log.model}</span>
                                            <span style={{ fontSize: '11px', color: 'var(--text-secondary)', minWidth: '65px' }}>
                                                {(log.total_tokens || 0).toLocaleString()} tok
                                            </span>
                                            <span style={{ fontSize: '11px', fontWeight: 600, color: '#f59e0b', minWidth: '60px' }}>
                                                ${(Number(log.estimated_cost) || 0).toFixed(4)}
                                            </span>
                                            <span style={{ fontSize: '11px', color: 'var(--text-muted)', minWidth: '55px' }}>
                                                {log.latency_ms}ms
                                            </span>
                                            {log.purpose && (
                                                <span style={{
                                                    fontSize: '10px', padding: '1px 6px', borderRadius: '6px',
                                                    background: 'rgba(59,130,246,0.1)', color: '#3b82f6',
                                                }}>{log.purpose}</span>
                                            )}
                                            <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginLeft: 'auto' }}>
                                                {log.created_at.replace('T', ' ').slice(0, 19)}
                                            </span>
                                        </div>
                                        {expandedLogId === log.id && (
                                            <div style={{ marginTop: '8px', paddingLeft: '17px', fontSize: '12px' }}>
                                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginBottom: '6px' }}>
                                                    <div><span style={{ color: 'var(--text-muted)' }}>Input:</span> {(log.input_tokens || 0).toLocaleString()}</div>
                                                    <div><span style={{ color: 'var(--text-muted)' }}>Output:</span> {(log.output_tokens || 0).toLocaleString()}</div>
                                                    <div><span style={{ color: 'var(--text-muted)' }}>Status:</span> <span style={{ color: log.status === 'success' ? '#2dd4bf' : '#f43f5e' }}>{log.status}</span></div>
                                                </div>
                                                {log.error_message && (
                                                    <div style={{ color: '#f43f5e', background: 'rgba(244,63,94,0.1)', padding: '4px 8px', borderRadius: '4px', marginBottom: '4px' }}>
                                                        {log.error_message}
                                                    </div>
                                                )}
                                                {log.metadata && Object.keys(log.metadata).length > 0 && (
                                                    <pre style={{ fontSize: '11px', color: 'var(--text-muted)', background: 'var(--bg-primary)', padding: '6px 8px', borderRadius: '4px', whiteSpace: 'pre-wrap', maxHeight: '120px', overflow: 'auto' }}>
                                                        {JSON.stringify(log.metadata, null, 2)}
                                                    </pre>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                );
            })()}
        </div>
    );
}

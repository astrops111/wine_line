import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { t, getLocale } from '../lib/i18n';
import { useOrg } from '../lib/OrgContext';

interface Trigger {
    id: string;
    name: string;
    trigger_type: string;
    event_source: string;
    conditions: Record<string, unknown> | null;
    actions: Record<string, unknown> | null;
    is_active: boolean;
    created_at: string;
}

interface TriggerLog {
    id: string;
    trigger_name: string;
    event_type: string;
    status: string;
    executed_at: string;
    result: Record<string, unknown> | null;
}

export function Triggers() {
    const [triggers, setTriggers] = useState<Trigger[]>([]);
    const [logs, setLogs] = useState<TriggerLog[]>([]);
    const [tab, setTab] = useState<'triggers' | 'logs'>('triggers');
    const [loading, setLoading] = useState(true);
    const [showCreate, setShowCreate] = useState(false);
    const [newTrigger, setNewTrigger] = useState({
        name: '', trigger_type: 'event', event_source: 'task_status_changed',
        condition_field: 'status', condition_op: 'equals', condition_value: 'completed',
        action_type: 'notify', action_channel: 'line', action_message: '',
    });
    const zh = getLocale() === 'zh-TW';
    const { orgId } = useOrg();

    useEffect(() => { loadData(); }, []);

    async function loadData() {
        setLoading(true);
        const [triggersRes, logsRes] = await Promise.all([
            supabase.from('workflow_triggers').select('*').order('created_at', { ascending: false }),
            supabase.from('trigger_logs').select('*').order('executed_at', { ascending: false }).limit(50),
        ]);
        if (triggersRes.data) setTriggers(triggersRes.data);
        if (logsRes.data) setLogs(logsRes.data.map((l: any) => ({
            ...l,
            trigger_name: triggersRes.data?.find((t: any) => t.id === l.trigger_id)?.name || '—',
        })));
        setLoading(false);
    }

    async function createTrigger() {
        if (!newTrigger.name.trim()) return;
        await supabase.from('workflow_triggers').insert({
            organization_id: orgId,
            name: newTrigger.name,
            trigger_type: newTrigger.trigger_type,
            event_source: newTrigger.event_source,
            conditions: {
                field: newTrigger.condition_field,
                operator: newTrigger.condition_op,
                value: newTrigger.condition_value,
            },
            actions: {
                type: newTrigger.action_type,
                channel: newTrigger.action_channel,
                message: newTrigger.action_message,
            },
            is_active: true,
        });
        setShowCreate(false);
        setNewTrigger({ name: '', trigger_type: 'event', event_source: 'task_status_changed', condition_field: 'status', condition_op: 'equals', condition_value: 'completed', action_type: 'notify', action_channel: 'line', action_message: '' });
        loadData();
    }

    async function toggleTrigger(id: string, current: boolean) {
        await supabase.from('workflow_triggers').update({ is_active: !current }).eq('id', id);
        loadData();
    }

    async function deleteTrigger(id: string) {
        await supabase.from('workflow_triggers').delete().eq('id', id);
        loadData();
    }

    const eventSources: Record<string, string> = {
        task_status_changed: zh ? '任務狀態變更' : 'Task Status Changed',
        task_assigned: zh ? '任務指派' : 'Task Assigned',
        task_created: zh ? '任務建立' : 'Task Created',
        workflow_started: zh ? '流程啟動' : 'Workflow Started',
        workflow_completed: zh ? '流程完成' : 'Workflow Completed',
        checklist_completed: zh ? '清單完成' : 'Checklist Completed',
        schedule: zh ? '排程' : 'Schedule',
    };

    const actionTypes: Record<string, string> = {
        notify: zh ? '發送通知' : 'Send Notification',
        update_field: zh ? '更新欄位' : 'Update Field',
        start_workflow: zh ? '啟動流程' : 'Start Workflow',
        assign_task: zh ? '自動指派' : 'Auto Assign',
    };

    return (
        <div className="fade-in">
            <div className="page-header">
                <h2>⚡ {t('nav.triggers')}</h2>
                <p>{zh ? '流程觸發與自動化控制' : 'Workflow triggers and automation control'}</p>
            </div>

            <div className="page-body">
                <div className="tab-bar">
                    <button className={`tab-item ${tab === 'triggers' ? 'active' : ''}`} onClick={() => setTab('triggers')}>
                        ⚡ {zh ? '觸發器' : 'Triggers'} ({triggers.length})
                    </button>
                    <button className={`tab-item ${tab === 'logs' ? 'active' : ''}`} onClick={() => setTab('logs')}>
                        📜 {zh ? '執行紀錄' : 'Logs'} ({logs.length})
                    </button>
                </div>

                {loading ? <p className="loading-pulse">{t('common.loading')}</p> : tab === 'triggers' ? (
                    <>
                        <div style={{ marginBottom: '16px', display: 'flex', justifyContent: 'flex-end' }}>
                            <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
                                ➕ {zh ? '新增觸發器' : 'New Trigger'}
                            </button>
                        </div>

                        {showCreate && (
                            <div className="card" style={{ marginBottom: '16px' }}>
                                <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '12px' }}>
                                    {zh ? '⚡ 建立觸發器' : '⚡ Create Trigger'}
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                                    <div>
                                        <label className="detail-label">{zh ? '名稱' : 'Name'}</label>
                                        <input className="input-field" value={newTrigger.name} onChange={e => setNewTrigger({ ...newTrigger, name: e.target.value })}
                                            placeholder={zh ? '例：任務完成時通知主管' : 'e.g.: Notify manager on task done'} />
                                    </div>
                                    <div>
                                        <label className="detail-label">{zh ? '觸發事件' : 'Event Source'}</label>
                                        <select className="select" style={{ width: '100%' }} value={newTrigger.event_source}
                                            onChange={e => setNewTrigger({ ...newTrigger, event_source: e.target.value })}>
                                            {Object.entries(eventSources).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                                        </select>
                                    </div>
                                </div>

                                {/* Condition Builder */}
                                <div style={{ padding: '12px', background: 'var(--bg-primary)', borderRadius: 'var(--radius-sm)', marginBottom: '12px' }}>
                                    <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--accent-blue)', marginBottom: '8px' }}>
                                        🔍 {zh ? '條件 (WHEN)' : 'Condition (WHEN)'}
                                    </div>
                                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                        <input className="input-field" style={{ width: '120px' }} value={newTrigger.condition_field}
                                            onChange={e => setNewTrigger({ ...newTrigger, condition_field: e.target.value })} placeholder="field" />
                                        <select className="select" value={newTrigger.condition_op}
                                            onChange={e => setNewTrigger({ ...newTrigger, condition_op: e.target.value })}>
                                            <option value="equals">=</option>
                                            <option value="not_equals">≠</option>
                                            <option value="contains">{zh ? '包含' : 'contains'}</option>
                                            <option value="greater_than">&gt;</option>
                                            <option value="less_than">&lt;</option>
                                        </select>
                                        <input className="input-field" style={{ width: '120px' }} value={newTrigger.condition_value}
                                            onChange={e => setNewTrigger({ ...newTrigger, condition_value: e.target.value })} placeholder="value" />
                                    </div>
                                </div>

                                {/* Action Builder */}
                                <div style={{ padding: '12px', background: 'var(--bg-primary)', borderRadius: 'var(--radius-sm)', marginBottom: '12px' }}>
                                    <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--accent-primary)', marginBottom: '8px' }}>
                                        🎯 {zh ? '動作 (THEN)' : 'Action (THEN)'}
                                    </div>
                                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                        <select className="select" value={newTrigger.action_type}
                                            onChange={e => setNewTrigger({ ...newTrigger, action_type: e.target.value })}>
                                            {Object.entries(actionTypes).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                                        </select>
                                        <select className="select" value={newTrigger.action_channel}
                                            onChange={e => setNewTrigger({ ...newTrigger, action_channel: e.target.value })}>
                                            <option value="line">💬 LINE</option>
                                            <option value="email">📧 Email</option>
                                            <option value="system">⚙️ System</option>
                                        </select>
                                        <input className="input-field" style={{ flex: 1 }} value={newTrigger.action_message}
                                            onChange={e => setNewTrigger({ ...newTrigger, action_message: e.target.value })}
                                            placeholder={zh ? '訊息內容...' : 'Message...'} />
                                    </div>
                                </div>

                                <div style={{ display: 'flex', gap: '8px' }}>
                                    <button className="btn btn-primary" onClick={createTrigger}>{t('common.save')}</button>
                                    <button className="btn btn-secondary" onClick={() => setShowCreate(false)}>{t('common.cancel')}</button>
                                </div>
                            </div>
                        )}

                        {triggers.length === 0 ? (
                            <div className="card" style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                                {zh ? '尚未設定觸發器。觸發器可自動執行通知、更新、或啟動流程。' : 'No triggers configured. Triggers can auto-notify, update, or start workflows.'}
                            </div>
                        ) : (
                            triggers.map(tr => (
                                <div key={tr.id} className="card" style={{ marginBottom: '10px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <div>
                                            <div style={{ fontWeight: 600, fontSize: '14px' }}>⚡ {tr.name}</div>
                                            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px', display: 'flex', gap: '12px' }}>
                                                <span>📡 {eventSources[tr.event_source] || tr.event_source}</span>
                                                {tr.conditions && <span>🔍 {(tr.conditions as any).field} {(tr.conditions as any).operator} {(tr.conditions as any).value}</span>}
                                                {tr.actions && <span>🎯 {actionTypes[(tr.actions as any).type] || (tr.actions as any).type}</span>}
                                            </div>
                                        </div>
                                        <div style={{ display: 'flex', gap: '6px' }}>
                                            <button className={`btn btn-sm ${tr.is_active ? 'btn-primary' : 'btn-secondary'}`}
                                                onClick={() => toggleTrigger(tr.id, tr.is_active)}>
                                                {tr.is_active ? '🟢' : '⚪'}
                                            </button>
                                            <button className="btn btn-sm" style={{ color: 'var(--accent-red)' }}
                                                onClick={() => { if (confirm(zh ? '確定刪除？' : 'Delete?')) deleteTrigger(tr.id); }}>🗑</button>
                                        </div>
                                    </div>
                                </div>
                            ))
                        )}
                    </>
                ) : (
                    /* Logs Tab */
                    <div className="card">
                        {logs.length === 0 ? (
                            <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '40px' }}>
                                {zh ? '尚無觸發執行紀錄' : 'No trigger execution logs'}
                            </p>
                        ) : (
                            <table className="data-table">
                                <thead>
                                    <tr>
                                        <th>{zh ? '觸發器' : 'Trigger'}</th>
                                        <th>{zh ? '事件' : 'Event'}</th>
                                        <th>{zh ? '狀態' : 'Status'}</th>
                                        <th>{zh ? '時間' : 'Time'}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {logs.map(l => (
                                        <tr key={l.id}>
                                            <td style={{ fontWeight: 500 }}>{l.trigger_name}</td>
                                            <td>{eventSources[l.event_type] || l.event_type}</td>
                                            <td><span className={`status-badge ${l.status === 'success' ? 'completed' : l.status === 'failed' ? 'blocked' : 'pending'}`}>{l.status}</span></td>
                                            <td style={{ color: 'var(--text-muted)', fontSize: '11px' }}>{new Date(l.executed_at).toLocaleString('zh-TW')}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

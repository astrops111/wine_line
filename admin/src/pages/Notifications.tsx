import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { t, getLocale } from '../lib/i18n';
import { useOrg } from '../lib/OrgContext';

interface NotificationRule {
    id: string;
    name: string;
    event_type: string;
    channel: string;
    condition_config: Record<string, unknown> | null;
    message_template: string | null;
    is_active: boolean;
    created_at: string;
}

interface NotificationLog {
    id: string;
    channel: string;
    message: string;
    status: string;
    sent_at: string;
    recipient_user: { name: string } | null;
}

interface ScheduledReminder {
    id: string;
    name: string;
    cron_expression: string | null;
    reminder_type: string;
    message_template: string | null;
    is_active: boolean;
    next_run_at: string | null;
}

export function Notifications() {
    const [tab, setTab] = useState<'rules' | 'logs' | 'reminders'>('rules');
    const [rules, setRules] = useState<NotificationRule[]>([]);
    const [logs, setLogs] = useState<NotificationLog[]>([]);
    const [reminders, setReminders] = useState<ScheduledReminder[]>([]);
    const [loading, setLoading] = useState(true);
    const [showCreate, setShowCreate] = useState(false);
    const [newRule, setNewRule] = useState({ name: '', event_type: 'task_status_changed', channel: 'line', message_template: '' });
    const [showCreateReminder, setShowCreateReminder] = useState(false);
    const [newReminder, setNewReminder] = useState({ name: '', reminder_type: 'daily_summary', cron_expression: '0 9 * * *', message_template: '' });
    const zh = getLocale() === 'zh-TW';
    const { orgId } = useOrg();

    useEffect(() => { loadData(); }, []);

    async function loadData() {
        setLoading(true);
        const [rulesRes, logsRes, remindersRes] = await Promise.all([
            supabase.from('notification_rules').select('*').order('created_at', { ascending: false }),
            supabase.from('notification_logs').select('*, users(name)').order('sent_at', { ascending: false }).limit(50),
            supabase.from('scheduled_reminders').select('*').order('created_at', { ascending: false }),
        ]);
        if (rulesRes.data) setRules(rulesRes.data);
        if (logsRes.data) setLogs(logsRes.data.map((l: any) => ({ ...l, recipient_user: l.users })));
        if (remindersRes.data) setReminders(remindersRes.data);
        setLoading(false);
    }

    async function createRule() {
        if (!newRule.name.trim()) return;
        await supabase.from('notification_rules').insert({
            organization_id: orgId,
            name: newRule.name,
            event_type: newRule.event_type,
            channel: newRule.channel,
            message_template: newRule.message_template || null,
            is_active: true,
        });
        setShowCreate(false);
        setNewRule({ name: '', event_type: 'task_status_changed', channel: 'line', message_template: '' });
        loadData();
    }

    async function toggleRule(id: string, current: boolean) {
        await supabase.from('notification_rules').update({ is_active: !current }).eq('id', id);
        loadData();
    }

    async function deleteRule(id: string) {
        await supabase.from('notification_rules').delete().eq('id', id);
        loadData();
    }

    async function createReminder() {
        if (!newReminder.name.trim()) return;
        await supabase.from('scheduled_reminders').insert({
            organization_id: orgId,
            name: newReminder.name,
            reminder_type: newReminder.reminder_type,
            cron_expression: newReminder.cron_expression || null,
            message_template: newReminder.message_template || null,
            is_active: true,
        });
        setShowCreateReminder(false);
        setNewReminder({ name: '', reminder_type: 'daily_summary', cron_expression: '0 9 * * *', message_template: '' });
        loadData();
    }

    async function toggleReminder(id: string, current: boolean) {
        await supabase.from('scheduled_reminders').update({ is_active: !current }).eq('id', id);
        loadData();
    }

    const eventTypes: Record<string, string> = {
        task_status_changed: zh ? '任務狀態變更' : 'Task Status Changed',
        task_assigned: zh ? '任務指派' : 'Task Assigned',
        task_overdue: zh ? '任務逾期' : 'Task Overdue',
        workflow_started: zh ? '流程啟動' : 'Workflow Started',
        workflow_completed: zh ? '流程完成' : 'Workflow Completed',
        checklist_completed: zh ? '清單完成' : 'Checklist Completed',
        comment_added: zh ? '備註新增' : 'Comment Added',
    };

    const channelIcons: Record<string, string> = { line: '💬', email: '📧', push: '📱', sms: '📲' };
    const statusIcons: Record<string, string> = { sent: '✅', pending: '⏳', failed: '❌' };

    return (
        <div className="fade-in">
            <div className="page-header">
                <h2>🔔 {t('nav.notifications')}</h2>
                <p>{zh ? '自動提醒與通知規則管理' : 'Manage automated notification rules and reminders'}</p>
            </div>

            <div className="page-body">
                <div className="tab-bar">
                    <button className={`tab-item ${tab === 'rules' ? 'active' : ''}`} onClick={() => setTab('rules')}>
                        📐 {zh ? '通知規則' : 'Rules'} ({rules.length})
                    </button>
                    <button className={`tab-item ${tab === 'reminders' ? 'active' : ''}`} onClick={() => setTab('reminders')}>
                        ⏰ {zh ? '排程提醒' : 'Reminders'} ({reminders.length})
                    </button>
                    <button className={`tab-item ${tab === 'logs' ? 'active' : ''}`} onClick={() => setTab('logs')}>
                        📜 {zh ? '發送紀錄' : 'Logs'} ({logs.length})
                    </button>
                </div>

                {loading ? <p className="loading-pulse">{t('common.loading')}</p> : tab === 'rules' ? (
                    <>
                        <div style={{ marginBottom: '16px', display: 'flex', justifyContent: 'flex-end' }}>
                            <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
                                ➕ {zh ? '新增規則' : 'New Rule'}
                            </button>
                        </div>

                        {showCreate && (
                            <div className="card" style={{ marginBottom: '16px' }}>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                                    <div>
                                        <label className="detail-label">{zh ? '規則名稱' : 'Rule Name'}</label>
                                        <input className="input-field" value={newRule.name} onChange={e => setNewRule({ ...newRule, name: e.target.value })}
                                            placeholder={zh ? '例：任務完成通知' : 'e.g.: Task Completion Alert'} />
                                    </div>
                                    <div>
                                        <label className="detail-label">{zh ? '觸發事件' : 'Event Type'}</label>
                                        <select className="select" style={{ width: '100%' }} value={newRule.event_type}
                                            onChange={e => setNewRule({ ...newRule, event_type: e.target.value })}>
                                            {Object.entries(eventTypes).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="detail-label">{zh ? '發送通道' : 'Channel'}</label>
                                        <select className="select" style={{ width: '100%' }} value={newRule.channel}
                                            onChange={e => setNewRule({ ...newRule, channel: e.target.value })}>
                                            <option value="line">💬 LINE</option>
                                            <option value="email">📧 Email</option>
                                            <option value="push">📱 Push</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="detail-label">{zh ? '訊息模板' : 'Message Template'}</label>
                                        <input className="input-field" value={newRule.message_template} onChange={e => setNewRule({ ...newRule, message_template: e.target.value })}
                                            placeholder="{user} {action} {task}" />
                                    </div>
                                </div>
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    <button className="btn btn-primary" onClick={createRule}>{t('common.save')}</button>
                                    <button className="btn btn-secondary" onClick={() => setShowCreate(false)}>{t('common.cancel')}</button>
                                </div>
                            </div>
                        )}

                        {rules.length === 0 ? (
                            <div className="card" style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                                {zh ? '尚未設定通知規則' : 'No notification rules configured'}
                            </div>
                        ) : (
                            <div className="card">
                                <table className="data-table">
                                    <thead>
                                        <tr>
                                            <th>{zh ? '規則名稱' : 'Rule'}</th>
                                            <th>{zh ? '事件' : 'Event'}</th>
                                            <th>{zh ? '通道' : 'Channel'}</th>
                                            <th>{zh ? '狀態' : 'Status'}</th>
                                            <th>{t('common.actions')}</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {rules.map(r => (
                                            <tr key={r.id}>
                                                <td style={{ fontWeight: 500 }}>{r.name}</td>
                                                <td><span className="status-badge in_progress" style={{ fontSize: '11px' }}>{eventTypes[r.event_type] || r.event_type}</span></td>
                                                <td>{channelIcons[r.channel] || '📨'} {r.channel}</td>
                                                <td>
                                                    <button className={`btn btn-sm ${r.is_active ? 'btn-primary' : 'btn-secondary'}`}
                                                        onClick={() => toggleRule(r.id, r.is_active)}>
                                                        {r.is_active ? (zh ? '🟢 啟用' : '🟢 Active') : (zh ? '⚪ 停用' : '⚪ Disabled')}
                                                    </button>
                                                </td>
                                                <td>
                                                    <button className="btn btn-sm" style={{ color: 'var(--accent-red)' }}
                                                        onClick={() => { if (confirm(zh ? '確定刪除？' : 'Delete?')) deleteRule(r.id); }}>🗑</button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </>

                ) : tab === 'reminders' ? (
                    <>
                        <div style={{ marginBottom: '16px', display: 'flex', justifyContent: 'flex-end' }}>
                            <button className="btn btn-primary" onClick={() => setShowCreateReminder(true)}>
                                ➕ {zh ? '新增排程提醒' : 'New Reminder'}
                            </button>
                        </div>

                        {showCreateReminder && (
                            <div className="card" style={{ marginBottom: '16px' }}>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                                    <div>
                                        <label className="detail-label">{zh ? '提醒名稱' : 'Reminder Name'}</label>
                                        <input className="input-field" value={newReminder.name} onChange={e => setNewReminder({ ...newReminder, name: e.target.value })}
                                            placeholder={zh ? '例：每日任務摘要' : 'e.g.: Daily Task Summary'} />
                                    </div>
                                    <div>
                                        <label className="detail-label">{zh ? '類型' : 'Type'}</label>
                                        <select className="select" style={{ width: '100%' }} value={newReminder.reminder_type}
                                            onChange={e => setNewReminder({ ...newReminder, reminder_type: e.target.value })}>
                                            <option value="daily_summary">{zh ? '每日摘要' : 'Daily Summary'}</option>
                                            <option value="overdue_check">{zh ? '逾期檢查' : 'Overdue Check'}</option>
                                            <option value="weekly_report">{zh ? '每週報告' : 'Weekly Report'}</option>
                                            <option value="custom">{zh ? '自訂' : 'Custom'}</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="detail-label">Cron {zh ? '表達式' : 'Expression'}</label>
                                        <input className="input-field" value={newReminder.cron_expression} onChange={e => setNewReminder({ ...newReminder, cron_expression: e.target.value })}
                                            placeholder="0 9 * * *" />
                                    </div>
                                    <div>
                                        <label className="detail-label">{zh ? '訊息模板' : 'Message'}</label>
                                        <input className="input-field" value={newReminder.message_template} onChange={e => setNewReminder({ ...newReminder, message_template: e.target.value })} />
                                    </div>
                                </div>
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    <button className="btn btn-primary" onClick={createReminder}>{t('common.save')}</button>
                                    <button className="btn btn-secondary" onClick={() => setShowCreateReminder(false)}>{t('common.cancel')}</button>
                                </div>
                            </div>
                        )}

                        {reminders.length === 0 ? (
                            <div className="card" style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                                {zh ? '尚未設定排程提醒' : 'No scheduled reminders'}
                            </div>
                        ) : (
                            <div className="card">
                                <table className="data-table">
                                    <thead>
                                        <tr>
                                            <th>{zh ? '名稱' : 'Name'}</th>
                                            <th>{zh ? '類型' : 'Type'}</th>
                                            <th>Cron</th>
                                            <th>{zh ? '狀態' : 'Status'}</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {reminders.map(r => (
                                            <tr key={r.id}>
                                                <td style={{ fontWeight: 500 }}>{r.name}</td>
                                                <td><span className="status-badge in_progress" style={{ fontSize: '11px' }}>{r.reminder_type}</span></td>
                                                <td style={{ fontFamily: 'monospace', color: 'var(--text-muted)', fontSize: '12px' }}>{r.cron_expression || '—'}</td>
                                                <td>
                                                    <button className={`btn btn-sm ${r.is_active ? 'btn-primary' : 'btn-secondary'}`}
                                                        onClick={() => toggleReminder(r.id, r.is_active)}>
                                                        {r.is_active ? '🟢' : '⚪'}
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </>

                ) : (
                    /* Logs */
                    <div className="card">
                        {logs.length === 0 ? (
                            <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '40px' }}>
                                {zh ? '尚無發送紀錄' : 'No notification logs'}
                            </p>
                        ) : (
                            <table className="data-table">
                                <thead>
                                    <tr>
                                        <th>{zh ? '通道' : 'Channel'}</th>
                                        <th>{zh ? '訊息' : 'Message'}</th>
                                        <th>{zh ? '收件者' : 'Recipient'}</th>
                                        <th>{zh ? '狀態' : 'Status'}</th>
                                        <th>{zh ? '時間' : 'Time'}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {logs.map(l => (
                                        <tr key={l.id}>
                                            <td>{channelIcons[l.channel] || '📨'} {l.channel}</td>
                                            <td style={{ fontSize: '12px', maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.message}</td>
                                            <td>{l.recipient_user?.name || '—'}</td>
                                            <td>{statusIcons[l.status] || '❓'} {l.status}</td>
                                            <td style={{ color: 'var(--text-muted)', fontSize: '11px' }}>{new Date(l.sent_at).toLocaleString('zh-TW')}</td>
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

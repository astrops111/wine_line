import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { t, getLocale } from '../lib/i18n';

interface LineUser {
    id: string;
    line_user_id: string;
    display_name: string;
    is_verified: boolean;
    is_active: boolean;
    user_id: string | null;
    last_active_at: string;
    user: { id: string; name: string } | null;
}

interface LineGroup {
    id: string;
    line_group_id: string;
    group_name: string;
    group_type: string;
    is_active: boolean;
    joined_at: string;
}

interface SystemUser {
    id: string;
    name: string;
}

export function LineManagement() {
    const [lineUsers, setLineUsers] = useState<LineUser[]>([]);
    const [lineGroups, setLineGroups] = useState<LineGroup[]>([]);
    const [systemUsers, setSystemUsers] = useState<SystemUser[]>([]);
    const [loading, setLoading] = useState(true);
    const [tab, setTab] = useState<'users' | 'groups' | 'archive' | 'webhook'>('users');
    const zh = getLocale() === 'zh-TW';

    const webhookUrl = `https://kzawtuvmchhtdsokrjys.supabase.co/functions/v1/line-webhook`;

    useEffect(() => { loadData(); }, []);

    async function loadData() {
        const [usersRes, groupsRes, sysUsersRes] = await Promise.all([
            supabase.from('line_users').select('*, user:users(id, name)').order('last_active_at', { ascending: false }),
            supabase.from('line_groups').select('*').order('joined_at', { ascending: false }),
            supabase.from('users').select('id, name').order('name'),
        ]);
        if (usersRes.data) setLineUsers(usersRes.data as any);
        if (groupsRes.data) setLineGroups(groupsRes.data);
        if (sysUsersRes.data) setSystemUsers(sysUsersRes.data);
        setLoading(false);
    }

    async function mapLineUser(lineUserId: string, systemUserId: string | null) {
        await supabase.from('line_users')
            .update({ user_id: systemUserId, is_verified: systemUserId ? true : false })
            .eq('id', lineUserId);
        loadData();
    }

    async function archiveLineUser(id: string) {
        await supabase.from('line_users').update({ is_active: false }).eq('id', id);
        setLineUsers(prev => prev.map(u => u.id === id ? { ...u, is_active: false } : u));
    }

    async function unarchiveLineUser(id: string) {
        await supabase.from('line_users').update({ is_active: true }).eq('id', id);
        setLineUsers(prev => prev.map(u => u.id === id ? { ...u, is_active: true } : u));
    }

    async function archiveLineGroup(id: string) {
        await supabase.from('line_groups').update({ is_active: false }).eq('id', id);
        setLineGroups(prev => prev.map(g => g.id === id ? { ...g, is_active: false } : g));
    }

    async function unarchiveLineGroup(id: string) {
        await supabase.from('line_groups').update({ is_active: true }).eq('id', id);
        setLineGroups(prev => prev.map(g => g.id === id ? { ...g, is_active: true } : g));
    }

    async function updateGroupType(groupId: string, newType: string) {
        await supabase.from('line_groups').update({ group_type: newType }).eq('id', groupId);
        loadData();
    }

    async function updateGroupName(groupId: string, name: string) {
        await supabase.from('line_groups').update({ group_name: name }).eq('id', groupId);
        loadData();
    }

    const groupTypes: Record<string, string> = {
        general: zh ? '一般' : 'General',
        department: zh ? '部門' : 'Department',
        store: zh ? '門市' : 'Store',
        project: zh ? '專案' : 'Project',
    };

    const activeUsers  = lineUsers.filter(u => u.is_active !== false);
    const archivedUsers = lineUsers.filter(u => u.is_active === false);
    const activeGroups  = lineGroups.filter(g => g.is_active !== false);
    const archivedGroups = lineGroups.filter(g => g.is_active === false);

    return (
        <div className="fade-in">
            <div className="page-header">
                <h2>💬 {t('nav.line')}</h2>
                <p>{zh ? '管理 LINE 使用者、群組對應與 Webhook 設定' : 'Manage LINE users, groups, and webhook settings'}</p>
            </div>

            <div className="page-body">
                {/* Tabs */}
                <div className="tab-bar">
                    <button className={`tab-item ${tab === 'users' ? 'active' : ''}`} onClick={() => setTab('users')}>
                        👤 {zh ? 'LINE 使用者' : 'LINE Users'} ({activeUsers.length})
                    </button>
                    <button className={`tab-item ${tab === 'groups' ? 'active' : ''}`} onClick={() => setTab('groups')}>
                        👥 {zh ? 'LINE 群組' : 'LINE Groups'} ({activeGroups.length})
                    </button>
                    <button className={`tab-item ${tab === 'archive' ? 'active' : ''}`} onClick={() => setTab('archive')}>
                        📦 {zh ? '封存' : 'Archive'} ({archivedUsers.length + archivedGroups.length})
                    </button>
                    <button className={`tab-item ${tab === 'webhook' ? 'active' : ''}`} onClick={() => setTab('webhook')}>
                        🔗 Webhook
                    </button>
                </div>

                {loading ? (
                    <p className="loading-pulse">{t('common.loading')}</p>
                ) : tab === 'users' ? (
                    /* ===== Users Tab ===== */
                    <div className="card">
                        {activeUsers.length === 0 ? (
                            <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '40px' }}>
                                {zh ? '尚未有 LINE 使用者連接。使用者加入 Bot 後將自動出現。' : 'No LINE users connected. Users appear when they add the bot.'}
                            </p>
                        ) : (
                            <table className="data-table">
                                <thead>
                                    <tr>
                                        <th>LINE {zh ? '名稱' : 'Name'}</th>
                                        <th>{zh ? '對應系統使用者' : 'Mapped System User'}</th>
                                        <th>{zh ? '狀態' : 'Status'}</th>
                                        <th>{zh ? '最後活動' : 'Last Active'}</th>
                                        <th style={{ width: '80px' }}></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {activeUsers.map(u => (
                                        <tr key={u.id}>
                                            <td>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                    <span style={{ fontSize: '18px' }}>💬</span>
                                                    <div>
                                                        <div style={{ fontWeight: 500 }}>{u.display_name || 'Unknown'}</div>
                                                        <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>{u.line_user_id.substring(0, 16)}...</div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td>
                                                <select className="select" style={{ width: '100%', fontSize: '12px' }}
                                                    value={u.user_id || ''}
                                                    onChange={e => mapLineUser(u.id, e.target.value || null)}>
                                                    <option value="">{zh ? '— 未對應 —' : '— Not mapped —'}</option>
                                                    {systemUsers.map(su => <option key={su.id} value={su.id}>{su.name}</option>)}
                                                </select>
                                            </td>
                                            <td>
                                                <span className={`status-badge ${u.is_verified ? 'completed' : 'pending'}`}>
                                                    {u.is_verified ? (zh ? '✅ 已驗證' : '✅ Verified') : (zh ? '⏳ 未驗證' : '⏳ Unverified')}
                                                </span>
                                            </td>
                                            <td style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
                                                {new Date(u.last_active_at).toLocaleString('zh-TW')}
                                            </td>
                                            <td>
                                                <button className="btn btn-sm btn-secondary" style={{ fontSize: '11px' }}
                                                    title={zh ? '封存' : 'Archive'}
                                                    onClick={() => archiveLineUser(u.id)}>
                                                    📦
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>

                ) : tab === 'groups' ? (
                    /* ===== Groups Tab ===== */
                    <div className="card">
                        {activeGroups.length === 0 ? (
                            <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '40px' }}>
                                {zh ? '尚未有 LINE 群組。將 Bot 加入群組後將自動出現。' : 'No groups. Groups appear when the bot is added.'}
                            </p>
                        ) : (
                            <table className="data-table">
                                <thead>
                                    <tr>
                                        <th>{zh ? '群組名稱' : 'Group Name'}</th>
                                        <th>{zh ? '類型' : 'Type'}</th>
                                        <th>{zh ? '狀態' : 'Status'}</th>
                                        <th>{zh ? '加入時間' : 'Joined'}</th>
                                        <th style={{ width: '80px' }}></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {activeGroups.map(g => (
                                        <tr key={g.id}>
                                            <td>
                                                <input className="input-field" style={{ fontSize: '13px', padding: '4px 8px' }}
                                                    defaultValue={g.group_name || ''} onBlur={e => updateGroupName(g.id, e.target.value)} />
                                            </td>
                                            <td>
                                                <select className="select" style={{ fontSize: '12px' }} value={g.group_type}
                                                    onChange={e => updateGroupType(g.id, e.target.value)}>
                                                    {Object.entries(groupTypes).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                                                </select>
                                            </td>
                                            <td>
                                                <span className={`status-badge ${g.is_active ? 'completed' : 'cancelled'}`}>
                                                    {g.is_active ? (zh ? '🟢 活躍' : '🟢 Active') : (zh ? '⚪ 已離開' : '⚪ Left')}
                                                </span>
                                            </td>
                                            <td style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
                                                {new Date(g.joined_at).toLocaleString('zh-TW')}
                                            </td>
                                            <td>
                                                <button className="btn btn-sm btn-secondary" style={{ fontSize: '11px' }}
                                                    title={zh ? '封存' : 'Archive'}
                                                    onClick={() => archiveLineGroup(g.id)}>
                                                    📦
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>

                ) : tab === 'archive' ? (
                    /* ===== Archive Tab ===== */
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                        {/* Archived Users */}
                        <div className="card">
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                                <h3 style={{ fontSize: '14px', fontWeight: 600 }}>
                                    👤 {zh ? '封存的使用者' : 'Archived Users'} ({archivedUsers.length})
                                </h3>
                            </div>
                            {archivedUsers.length === 0 ? (
                                <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '24px' }}>
                                    {zh ? '沒有封存的使用者。' : 'No archived users.'}
                                </p>
                            ) : (
                                <table className="data-table">
                                    <thead>
                                        <tr>
                                            <th>LINE {zh ? '名稱' : 'Name'}</th>
                                            <th>{zh ? '對應系統使用者' : 'Mapped User'}</th>
                                            <th>{zh ? '狀態' : 'Status'}</th>
                                            <th>{zh ? '最後活動' : 'Last Active'}</th>
                                            <th style={{ width: '90px' }}></th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {archivedUsers.map(u => (
                                            <tr key={u.id} style={{ opacity: 0.7 }}>
                                                <td>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                        <span style={{ fontSize: '18px' }}>💬</span>
                                                        <div>
                                                            <div style={{ fontWeight: 500 }}>{u.display_name || 'Unknown'}</div>
                                                            <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>{u.line_user_id.substring(0, 16)}...</div>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                                                    {u.user?.name || <span style={{ opacity: 0.5 }}>—</span>}
                                                </td>
                                                <td>
                                                    <span className={`status-badge ${u.is_verified ? 'completed' : 'pending'}`}>
                                                        {u.is_verified ? (zh ? '✅ 已驗證' : '✅ Verified') : (zh ? '⏳ 未驗證' : '⏳ Unverified')}
                                                    </span>
                                                </td>
                                                <td style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
                                                    {new Date(u.last_active_at).toLocaleString('zh-TW')}
                                                </td>
                                                <td>
                                                    <button className="btn btn-sm btn-secondary" style={{ fontSize: '11px' }}
                                                        onClick={() => unarchiveLineUser(u.id)}>
                                                        ↩ {zh ? '還原' : 'Restore'}
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>

                        {/* Archived Groups */}
                        <div className="card">
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                                <h3 style={{ fontSize: '14px', fontWeight: 600 }}>
                                    👥 {zh ? '封存的群組' : 'Archived Groups'} ({archivedGroups.length})
                                </h3>
                            </div>
                            {archivedGroups.length === 0 ? (
                                <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '24px' }}>
                                    {zh ? '沒有封存的群組。' : 'No archived groups.'}
                                </p>
                            ) : (
                                <table className="data-table">
                                    <thead>
                                        <tr>
                                            <th>{zh ? '群組名稱' : 'Group Name'}</th>
                                            <th>{zh ? '類型' : 'Type'}</th>
                                            <th>{zh ? '加入時間' : 'Joined'}</th>
                                            <th style={{ width: '90px' }}></th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {archivedGroups.map(g => (
                                            <tr key={g.id} style={{ opacity: 0.7 }}>
                                                <td style={{ fontWeight: 500 }}>{g.group_name || '—'}</td>
                                                <td style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                                                    {groupTypes[g.group_type] || g.group_type}
                                                </td>
                                                <td style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
                                                    {new Date(g.joined_at).toLocaleString('zh-TW')}
                                                </td>
                                                <td>
                                                    <button className="btn btn-sm btn-secondary" style={{ fontSize: '11px' }}
                                                        onClick={() => unarchiveLineGroup(g.id)}>
                                                        ↩ {zh ? '還原' : 'Restore'}
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    </div>

                ) : (
                    /* ===== Webhook Tab ===== */
                    <div>
                        <div className="card" style={{ marginBottom: '16px' }}>
                            <div className="card-header">
                                <span className="card-title">🔗 LINE Webhook URL</span>
                            </div>
                            <div style={{ padding: '12px', background: 'var(--bg-primary)', borderRadius: 'var(--radius-sm)', fontFamily: 'monospace', fontSize: '13px', color: 'var(--accent-primary)', wordBreak: 'break-all' }}>
                                {webhookUrl}
                            </div>
                            <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '8px' }}>
                                {zh ? '請在 LINE Developers Console 設定此 URL 為 Webhook URL。' : 'Set this URL as the Webhook URL in LINE Developers Console.'}
                            </p>
                        </div>

                        <div className="card" style={{ marginBottom: '16px' }}>
                            <div className="card-header">
                                <span className="card-title">⚙️ {zh ? '需要的環境變數' : 'Required Environment Variables'}</span>
                            </div>
                            <div style={{ display: 'grid', gap: '8px' }}>
                                {[
                                    { key: 'LINE_CHANNEL_ID', desc: zh ? 'LINE Channel ID (從 LINE Developers Console)' : 'LINE Channel ID (from LINE Developers Console)' },
                                    { key: 'LINE_CHANNEL_SECRET', desc: zh ? 'LINE Channel Secret' : 'LINE Channel Secret' },
                                    { key: 'LINE_CHANNEL_ACCESS_TOKEN', desc: zh ? 'LINE Channel Access Token (Long-lived)' : 'LINE Channel Access Token (Long-lived)' },
                                    { key: 'DASHSCOPE_API_KEY', desc: zh ? 'DashScope API Key (Qwen 3.5 AI)' : 'DashScope API Key (Qwen 3.5 AI)' },
                                ].map(env => (
                                    <div key={env.key} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '8px 12px', background: 'var(--bg-primary)', borderRadius: 'var(--radius-sm)' }}>
                                        <code style={{ color: 'var(--accent-blue)', fontSize: '12px', fontWeight: 600, minWidth: '200px' }}>{env.key}</code>
                                        <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{env.desc}</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="card">
                            <div className="card-header">
                                <span className="card-title">📋 {zh ? '支援的指令' : 'Supported Commands'}</span>
                            </div>
                            <table className="data-table" style={{ fontSize: '12px' }}>
                                <thead>
                                    <tr>
                                        <th>{zh ? '中文指令' : 'Chinese'}</th>
                                        <th>{zh ? '英文指令' : 'English'}</th>
                                        <th>{zh ? '功能' : 'Function'}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {[
                                        ['/任務 列表', '/task list', zh ? '查看任務' : 'View tasks'],
                                        ['/任務 新增 [標題]', '/task create [title]', zh ? '建立任務' : 'Create task'],
                                        ['/任務 [ID] 完成', '/task [ID] done', zh ? '完成任務' : 'Complete task'],
                                        ['/任務 [ID] 更新 [備註]', '/task [ID] update [note]', zh ? '新增備註' : 'Add note'],
                                        ['/任務 [ID] 狀態 [狀態]', '/task [ID] status [status]', zh ? '變更狀態' : 'Change status'],
                                        ['/流程 狀態', '/workflow status', zh ? '查看流程進度' : 'View progress'],
                                        ['/說明', '/help', zh ? '查看指令' : 'View commands'],
                                    ].map(([cn, en, desc], i) => (
                                        <tr key={i}>
                                            <td style={{ fontFamily: 'monospace', color: 'var(--accent-primary)' }}>{cn}</td>
                                            <td style={{ fontFamily: 'monospace', color: 'var(--accent-blue)' }}>{en}</td>
                                            <td style={{ color: 'var(--text-secondary)' }}>{desc}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

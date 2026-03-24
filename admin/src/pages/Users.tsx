import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { t, getLocale } from '../lib/i18n';
import { useOrg } from '../lib/OrgContext';

interface User {
    id: string;
    name: string;
    email: string;
    status: string;
    created_at: string;
    roles: { role_name: string; description: string }[];
    line_user: { display_name: string; is_verified: boolean } | null;
}

export function Users() {
    const [users, setUsers] = useState<User[]>([]);
    const [loading, setLoading] = useState(true);
    const [showCreate, setShowCreate] = useState(false);
    const [newUser, setNewUser] = useState({ name: '', email: '', role: '' });
    const zh = getLocale() === 'zh-TW';
    const { orgId } = useOrg();

    useEffect(() => { loadData(); }, []);

    async function loadData() {
        setLoading(true);
        const { data } = await supabase.from('users')
            .select(`id, name, email, status, created_at,
        user_roles(roles(role_name, description)),
        line_users(display_name, is_verified)`)
            .order('created_at', { ascending: true });

        if (data) {
            setUsers(data.map((u: any) => ({
                ...u,
                roles: u.user_roles?.map((ur: any) => ur.roles).filter(Boolean) || [],
                line_user: u.line_users?.[0] || null,
            })));
        }
        setLoading(false);
    }

    async function createUser() {
        if (!newUser.name.trim() || !newUser.email.trim()) return;
        const { data } = await supabase.from('users').insert({
            organization_id: orgId,
            name: newUser.name.trim(),
            email: newUser.email.trim(),
            status: 'active',
        }).select().single();

        if (data && newUser.role) {
            const { data: role } = await supabase.from('roles').select('id').eq('role_name', newUser.role).single();
            if (role) {
                await supabase.from('user_roles').insert({ user_id: data.id, role_id: role.id });
            }
        }
        setShowCreate(false);
        setNewUser({ name: '', email: '', role: '' });
        loadData();
    }

    async function toggleStatus(userId: string, current: string) {
        const next = current === 'active' ? 'inactive' : 'active';
        await supabase.from('users').update({ status: next }).eq('id', userId);
        loadData();
    }

    const roleColors: Record<string, string> = {
        admin: 'var(--accent-red)',
        manager: 'var(--accent-purple)',
        staff: 'var(--accent-blue)',
        operations: 'var(--accent-orange)',
    };

    return (
        <div className="fade-in">
            <div className="page-header">
                <h2>👤 {t('nav.users')}</h2>
                <p>{zh ? '管理系統使用者與角色' : 'Manage system users and roles'}</p>
            </div>

            <div className="page-body">
                <div style={{ marginBottom: '16px', display: 'flex', justifyContent: 'flex-end' }}>
                    <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
                        ➕ {zh ? '新增使用者' : 'New User'}
                    </button>
                </div>

                {showCreate && (
                    <div className="card" style={{ marginBottom: '16px' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                            <div>
                                <label className="detail-label">{zh ? '姓名' : 'Name'}</label>
                                <input className="input-field" value={newUser.name} onChange={e => setNewUser({ ...newUser, name: e.target.value })} />
                            </div>
                            <div>
                                <label className="detail-label">Email</label>
                                <input className="input-field" value={newUser.email} onChange={e => setNewUser({ ...newUser, email: e.target.value })} />
                            </div>
                            <div>
                                <label className="detail-label">{zh ? '角色' : 'Role'}</label>
                                <select className="select" style={{ width: '100%' }} value={newUser.role}
                                    onChange={e => setNewUser({ ...newUser, role: e.target.value })}>
                                    <option value="">{zh ? '選擇角色' : 'Select role'}</option>
                                    <option value="admin">{zh ? '管理員' : 'Admin'}</option>
                                    <option value="manager">{zh ? '主管' : 'Manager'}</option>
                                    <option value="staff">{zh ? '人員' : 'Staff'}</option>
                                    <option value="operations">{zh ? '營運' : 'Operations'}</option>
                                </select>
                            </div>
                        </div>
                        <div style={{ display: 'flex', gap: '8px' }}>
                            <button className="btn btn-primary" onClick={createUser}>{t('common.save')}</button>
                            <button className="btn btn-secondary" onClick={() => setShowCreate(false)}>{t('common.cancel')}</button>
                        </div>
                    </div>
                )}

                {loading ? <p className="loading-pulse">{t('common.loading')}</p> : (
                    <div className="card">
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>{zh ? '姓名' : 'Name'}</th>
                                    <th>Email</th>
                                    <th>{zh ? '角色' : 'Role'}</th>
                                    <th>LINE</th>
                                    <th>{zh ? '狀態' : 'Status'}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {users.map(u => (
                                    <tr key={u.id}>
                                        <td style={{ fontWeight: 500 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <div style={{
                                                    width: '28px', height: '28px', borderRadius: '50%',
                                                    background: `linear-gradient(135deg, ${roleColors[u.roles[0]?.role_name] || 'var(--text-muted)'}, var(--bg-primary))`,
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                    fontSize: '12px', fontWeight: 600, color: '#fff',
                                                }}>
                                                    {u.name[0]}
                                                </div>
                                                {u.name}
                                            </div>
                                        </td>
                                        <td style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>{u.email}</td>
                                        <td>
                                            {u.roles.map((r, i) => (
                                                <span key={i} style={{
                                                    display: 'inline-block', padding: '2px 8px', borderRadius: '10px',
                                                    fontSize: '11px', fontWeight: 500, marginRight: '4px',
                                                    background: `${roleColors[r.role_name] || 'var(--text-muted)'}20`,
                                                    color: roleColors[r.role_name] || 'var(--text-muted)',
                                                }}>
                                                    {r.role_name}
                                                </span>
                                            ))}
                                        </td>
                                        <td>
                                            {u.line_user ? (
                                                <span className={`status-badge ${u.line_user.is_verified ? 'completed' : 'pending'}`} style={{ fontSize: '11px' }}>
                                                    💬 {u.line_user.display_name}
                                                </span>
                                            ) : (
                                                <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>—</span>
                                            )}
                                        </td>
                                        <td>
                                            <button className={`btn btn-sm ${u.status === 'active' ? 'btn-primary' : 'btn-secondary'}`}
                                                onClick={() => toggleStatus(u.id, u.status)}>
                                                {u.status === 'active' ? (zh ? '🟢 啟用' : '🟢 Active') : (zh ? '⚪ 停用' : '⚪ Inactive')}
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}

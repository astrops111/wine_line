import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { t, getLocale } from '../lib/i18n';
import { useOrg } from '../lib/OrgContext';
import { writeAuditLog } from '../lib/auditLog';

interface UserRole {
    role_name: string;
    description: string;
    user_role_id: string;
    role_id: string;
}

interface User {
    id: string;
    name: string;
    email: string;
    status: string;
    created_at: string;
    roles: UserRole[];
    line_user: { display_name: string; is_verified: boolean } | null;
}

interface RoleDef {
    id: string;
    role_name: string;
    description: string;
}

export function Users() {
    const [users, setUsers] = useState<User[]>([]);
    const [allRoles, setAllRoles] = useState<RoleDef[]>([]);
    const [loading, setLoading] = useState(true);
    const [showCreate, setShowCreate] = useState(false);
    const [newUser, setNewUser] = useState({ name: '', email: '', role: '' });
    const [editingRolesFor, setEditingRolesFor] = useState<string | null>(null);
    const zh = getLocale() === 'zh-TW';
    const { orgId, currentUser } = useOrg();

    useEffect(() => { loadData(); }, []);

    async function loadData() {
        setLoading(true);
        const [usersRes, rolesRes] = await Promise.all([
            supabase.from('users')
                .select(`id, name, email, status, created_at,
                    user_roles(id, role_id, roles(role_name, description)),
                    line_users(display_name, is_verified)`)
                .order('created_at', { ascending: true }),
            supabase.from('roles').select('id, role_name, description'),
        ]);

        if (usersRes.data) {
            setUsers(usersRes.data.map((u: any) => ({
                ...u,
                roles: u.user_roles?.map((ur: any) => ({
                    ...ur.roles,
                    user_role_id: ur.id,
                    role_id: ur.role_id,
                })).filter((r: any) => r?.role_name) || [],
                line_user: u.line_users?.[0] || null,
            })));
        }
        if (rolesRes.data) setAllRoles(rolesRes.data);
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
            const role = allRoles.find(r => r.role_name === newUser.role);
            if (role) {
                await supabase.from('user_roles').insert({ user_id: data.id, role_id: role.id });
            }
        }
        setShowCreate(false);
        setNewUser({ name: '', email: '', role: '' });
        loadData();
    }

    async function addRoleToUser(userId: string, roleName: string) {
        const role = allRoles.find(r => r.role_name === roleName);
        if (!role) return;
        const user = users.find(u => u.id === userId);
        if (user?.roles.some(r => r.role_name === roleName)) return;

        const { error } = await supabase.from('user_roles').insert({
            user_id: userId,
            role_id: role.id,
        });
        if (!error) {
            writeAuditLog({
                organization_id: orgId,
                user_id: currentUser?.id,
                user_name: currentUser?.name,
                action: 'create',
                module: 'users',
                table_name: 'user_roles',
                record_label: `${user?.name} + ${roleName}`,
                new_values: { user_id: userId, role_name: roleName },
            });
            loadData();
        }
    }

    async function removeRoleFromUser(userId: string, userRoleId: string, roleName: string) {
        if (roleName === 'admin') {
            const adminCount = users.filter(u =>
                u.status === 'active' && u.roles.some(r => r.role_name === 'admin')
            ).length;
            if (adminCount <= 1) {
                alert(zh ? '無法移除最後一位管理員的管理員角色。' : 'Cannot remove admin role from the last admin user.');
                return;
            }
        }

        const user = users.find(u => u.id === userId);
        const { error } = await supabase.from('user_roles').delete().eq('id', userRoleId);
        if (!error) {
            writeAuditLog({
                organization_id: orgId,
                user_id: currentUser?.id,
                user_name: currentUser?.name,
                action: 'delete',
                module: 'users',
                table_name: 'user_roles',
                record_label: `${user?.name} - ${roleName}`,
                old_values: { user_id: userId, role_name: roleName },
            });
            loadData();
        }
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
                                <label className="detail-label" htmlFor="new-user-name">{zh ? '姓名' : 'Name'}</label>
                                <input id="new-user-name" className="input-field" name="name" autoComplete="off" value={newUser.name} onChange={e => setNewUser({ ...newUser, name: e.target.value })} />
                            </div>
                            <div>
                                <label className="detail-label" htmlFor="new-user-email">Email</label>
                                <input id="new-user-email" className="input-field" type="email" name="email" autoComplete="email" spellCheck={false} value={newUser.email} onChange={e => setNewUser({ ...newUser, email: e.target.value })} />
                            </div>
                            <div>
                                <label className="detail-label" htmlFor="new-user-role">{zh ? '角色' : 'Role'}</label>
                                <select id="new-user-role" className="select" name="role" style={{ width: '100%' }} value={newUser.role}
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
                                    <th>{zh ? '角色' : 'Roles'}</th>
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
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }}>
                                                {u.roles.map((r, i) => (
                                                    <span key={i} style={{
                                                        display: 'inline-flex', alignItems: 'center', gap: '4px',
                                                        padding: '2px 8px', borderRadius: '10px',
                                                        fontSize: '11px', fontWeight: 500,
                                                        background: `${roleColors[r.role_name] || 'var(--text-muted)'}20`,
                                                        color: roleColors[r.role_name] || 'var(--text-muted)',
                                                    }}>
                                                        {r.role_name}
                                                        {editingRolesFor === u.id && (
                                                            <button
                                                                onClick={() => removeRoleFromUser(u.id, r.user_role_id, r.role_name)}
                                                                style={{ background: 'none', border: 'none', cursor: 'pointer',
                                                                         fontSize: '10px', color: 'inherit', padding: '0 2px', lineHeight: 1 }}
                                                                title={zh ? '移除角色' : 'Remove role'}
                                                            >✕</button>
                                                        )}
                                                    </span>
                                                ))}
                                                {editingRolesFor === u.id && (
                                                    <select
                                                        className="input-field"
                                                        style={{ width: '90px', fontSize: '11px', padding: '2px 4px' }}
                                                        value=""
                                                        onChange={e => { if (e.target.value) addRoleToUser(u.id, e.target.value); }}
                                                    >
                                                        <option value="">+</option>
                                                        {allRoles
                                                            .filter(r => !u.roles.some(ur => ur.role_name === r.role_name))
                                                            .map(r => (
                                                                <option key={r.id} value={r.role_name}>{r.role_name}</option>
                                                            ))
                                                        }
                                                    </select>
                                                )}
                                                <button
                                                    onClick={() => setEditingRolesFor(editingRolesFor === u.id ? null : u.id)}
                                                    style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '12px', padding: '0 4px' }}
                                                    title={zh ? '編輯角色' : 'Edit roles'}
                                                >
                                                    {editingRolesFor === u.id ? '✓' : '✏️'}
                                                </button>
                                            </div>
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

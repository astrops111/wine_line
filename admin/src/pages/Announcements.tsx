import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { getLocale } from '../lib/i18n';
import { useOrg } from '../lib/OrgContext';

interface Announcement {
    id: string; title: string; content: string; priority: string;
    target_type: string; target_id: string | null;
    author_id: string | null; is_pinned: boolean;
    published_at: string; expires_at: string | null; created_at: string;
    author_name?: string;
    read_count?: number;
}
interface Department { id: string; name: string; }
interface Store { id: string; name: string; }

export function Announcements() {
    const zh = getLocale() === 'zh-TW';
    const { orgId, currentUser } = useOrg();
    const [tab, setTab] = useState<'list' | 'create'>('list');
    const [announcements, setAnnouncements] = useState<Announcement[]>([]);
    const [departments, setDepartments] = useState<Department[]>([]);
    const [stores, setStores] = useState<Store[]>([]);
    const [loading, setLoading] = useState(true);
    const [expandedId, setExpandedId] = useState<string | null>(null);

    // Form
    const [form, setForm] = useState({ title: '', content: '', priority: 'normal', target_type: 'all', target_id: '', is_pinned: false, expires_at: '' });
    const [editId, setEditId] = useState<string | null>(null);

    useEffect(() => { if (orgId) loadAll(); }, [orgId]);

    async function loadAll() {
        setLoading(true);
        const [annRes, deptRes, storeRes] = await Promise.all([
            supabase.from('announcements')
                .select('*, author:users!announcements_author_id_fkey(name)')
                .eq('organization_id', orgId)
                .order('is_pinned', { ascending: false })
                .order('published_at', { ascending: false }),
            supabase.from('departments').select('id, name, company_id').eq('organization_id', orgId),
            supabase.from('stores').select('id, name').eq('organization_id', orgId),
        ]);

        // Get read counts
        const anns = (annRes.data || []) as any[];
        const annIds = anns.map(a => a.id);
        let readCounts: Record<string, number> = {};
        if (annIds.length > 0) {
            const { data: reads } = await supabase.from('announcement_reads')
                .select('announcement_id')
                .in('announcement_id', annIds);
            (reads || []).forEach((r: any) => {
                readCounts[r.announcement_id] = (readCounts[r.announcement_id] || 0) + 1;
            });
        }

        setAnnouncements(anns.map(a => ({
            ...a,
            author_name: a.author?.name || '—',
            read_count: readCounts[a.id] || 0,
        })));
        setDepartments(deptRes.data || []);
        setStores(storeRes.data || []);
        setLoading(false);
    }

    function resetForm() {
        setForm({ title: '', content: '', priority: 'normal', target_type: 'all', target_id: '', is_pinned: false, expires_at: '' });
        setEditId(null);
    }

    function startEdit(a: Announcement) {
        setEditId(a.id);
        setForm({
            title: a.title, content: a.content, priority: a.priority,
            target_type: a.target_type, target_id: a.target_id || '',
            is_pinned: a.is_pinned, expires_at: a.expires_at?.slice(0, 10) || '',
        });
        setTab('create');
    }

    async function saveAnnouncement() {
        if (!form.title.trim() || !form.content.trim()) return;
        const payload = {
            organization_id: orgId,
            title: form.title.trim(),
            content: form.content.trim(),
            priority: form.priority,
            target_type: form.target_type,
            target_id: form.target_type !== 'all' && form.target_id ? form.target_id : null,
            author_id: currentUser?.id || null,
            is_pinned: form.is_pinned,
            expires_at: form.expires_at ? new Date(form.expires_at).toISOString() : null,
        };
        if (editId) {
            await supabase.from('announcements').update(payload).eq('id', editId);
        } else {
            await supabase.from('announcements').insert(payload);
        }
        resetForm();
        setTab('list');
        await loadAll();
    }

    async function deleteAnnouncement(id: string) {
        if (!confirm(zh ? '確定刪除此公告？' : 'Delete this announcement?')) return;
        await supabase.from('announcements').delete().eq('id', id);
        await loadAll();
    }

    async function togglePin(a: Announcement) {
        await supabase.from('announcements').update({ is_pinned: !a.is_pinned }).eq('id', a.id);
        await loadAll();
    }

    const priorityStyle: Record<string, { bg: string; color: string; label: string }> = {
        normal: { bg: 'rgba(107,114,128,0.15)', color: '#6b7280', label: zh ? '一般' : 'Normal' },
        important: { bg: 'rgba(245,158,11,0.15)', color: '#f59e0b', label: zh ? '重要' : 'Important' },
        urgent: { bg: 'rgba(239,68,68,0.15)', color: '#ef4444', label: zh ? '緊急' : 'Urgent' },
    };

    const isExpired = (a: Announcement) => a.expires_at && new Date(a.expires_at) < new Date();

    return (
        <div className="fade-in">
            <div className="page-header">
                <h2>📢 {zh ? '公告管理' : 'Announcements'}</h2>
                <p>{zh ? '發布與管理公司公告' : 'Publish and manage company announcements'}</p>
            </div>

            <div className="page-body">
                <div className="tab-bar" style={{ marginBottom: '20px' }}>
                    <button className={`tab-item ${tab === 'list' ? 'active' : ''}`} onClick={() => { setTab('list'); resetForm(); }}>
                        📋 {zh ? '公告列表' : 'All Announcements'}
                    </button>
                    <button className={`tab-item ${tab === 'create' ? 'active' : ''}`} onClick={() => { setTab('create'); if (!editId) resetForm(); }}>
                        ✏️ {editId ? (zh ? '編輯公告' : 'Edit') : (zh ? '新增公告' : 'Create')}
                    </button>
                </div>

                {loading ? <p className="loading-pulse">{zh ? '載入中…' : 'Loading…'}</p> : (
                    <>
                        {/* ═══ LIST TAB ═══ */}
                        {tab === 'list' && (
                            <div>
                                {announcements.length === 0 ? (
                                    <div className="card" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                                        {zh ? '尚無公告' : 'No announcements yet'}
                                    </div>
                                ) : (
                                    <div style={{ display: 'grid', gap: '12px' }}>
                                        {announcements.map(a => {
                                            const ps = priorityStyle[a.priority] || priorityStyle.normal;
                                            const expired = isExpired(a);
                                            return (
                                                <div key={a.id} className="card" style={{ padding: '16px', opacity: expired ? 0.6 : 1 }}>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                                        <div style={{ flex: 1 }}>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                                                {a.is_pinned && <span title={zh ? '已置頂' : 'Pinned'}>📌</span>}
                                                                <span style={{ fontWeight: 600, fontSize: '14px' }}>{a.title}</span>
                                                                <span style={{ fontSize: '10px', padding: '2px 7px', borderRadius: '4px', fontWeight: 600, background: ps.bg, color: ps.color }}>
                                                                    {ps.label}
                                                                </span>
                                                                {expired && (
                                                                    <span style={{ fontSize: '10px', padding: '2px 7px', borderRadius: '4px', background: 'rgba(107,114,128,0.15)', color: '#6b7280' }}>
                                                                        {zh ? '已過期' : 'Expired'}
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                                                                {a.author_name} · {new Date(a.published_at).toLocaleDateString('zh-TW')}
                                                                {a.target_type !== 'all' && <span> · {zh ? '對象' : 'Target'}: {a.target_type}</span>}
                                                                <span> · 👁 {a.read_count}</span>
                                                            </div>
                                                        </div>
                                                        <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                                                            <button className="btn btn-sm btn-secondary" onClick={() => togglePin(a)} title={zh ? '置頂' : 'Pin'}>
                                                                {a.is_pinned ? '📌' : '📍'}
                                                            </button>
                                                            <button className="btn btn-sm btn-secondary" onClick={() => setExpandedId(expandedId === a.id ? null : a.id)}>
                                                                {expandedId === a.id ? '▲' : '▼'}
                                                            </button>
                                                            <button className="btn btn-sm btn-secondary" onClick={() => startEdit(a)}>✏️</button>
                                                            <button className="btn btn-sm btn-secondary" style={{ color: 'var(--accent-red)' }} onClick={() => deleteAnnouncement(a.id)}>✕</button>
                                                        </div>
                                                    </div>
                                                    {expandedId === a.id && (
                                                        <div style={{ marginTop: '12px', padding: '12px', background: 'var(--bg-primary)', borderRadius: '6px', fontSize: '13px', whiteSpace: 'pre-wrap' }}>
                                                            {a.content}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* ═══ CREATE/EDIT TAB ═══ */}
                        {tab === 'create' && (
                            <div className="card" style={{ padding: '20px' }}>
                                <div style={{ display: 'grid', gap: '16px' }}>
                                    <div>
                                        <label className="detail-label">{zh ? '標題' : 'Title'} *</label>
                                        <input className="input-field" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} />
                                    </div>
                                    <div>
                                        <label className="detail-label">{zh ? '內容' : 'Content'} *</label>
                                        <textarea className="input-field" rows={6} value={form.content} onChange={e => setForm({ ...form, content: e.target.value })} style={{ resize: 'vertical' }} />
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '12px' }}>
                                        <div>
                                            <label className="detail-label">{zh ? '優先級' : 'Priority'}</label>
                                            <select className="input-field" value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value })}>
                                                <option value="normal">{zh ? '一般' : 'Normal'}</option>
                                                <option value="important">{zh ? '重要' : 'Important'}</option>
                                                <option value="urgent">{zh ? '緊急' : 'Urgent'}</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="detail-label">{zh ? '對象' : 'Target'}</label>
                                            <select className="input-field" value={form.target_type} onChange={e => setForm({ ...form, target_type: e.target.value, target_id: '' })}>
                                                <option value="all">{zh ? '全部' : 'All'}</option>
                                                <option value="department">{zh ? '部門' : 'Department'}</option>
                                                <option value="store">{zh ? '門市' : 'Store'}</option>
                                            </select>
                                        </div>
                                        {form.target_type === 'department' && (
                                            <div>
                                                <label className="detail-label">{zh ? '部門' : 'Department'}</label>
                                                <select className="input-field" value={form.target_id} onChange={e => setForm({ ...form, target_id: e.target.value })}>
                                                    <option value="">--</option>
                                                    {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                                                </select>
                                            </div>
                                        )}
                                        {form.target_type === 'store' && (
                                            <div>
                                                <label className="detail-label">{zh ? '門市' : 'Store'}</label>
                                                <select className="input-field" value={form.target_id} onChange={e => setForm({ ...form, target_id: e.target.value })}>
                                                    <option value="">--</option>
                                                    {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                                                </select>
                                            </div>
                                        )}
                                        <div>
                                            <label className="detail-label">{zh ? '到期日' : 'Expires At'}</label>
                                            <input className="input-field" type="date" value={form.expires_at} onChange={e => setForm({ ...form, expires_at: e.target.value })} />
                                        </div>
                                    </div>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', cursor: 'pointer' }}>
                                        <input type="checkbox" checked={form.is_pinned} onChange={e => setForm({ ...form, is_pinned: e.target.checked })} />
                                        📌 {zh ? '置頂此公告' : 'Pin this announcement'}
                                    </label>
                                    <div style={{ display: 'flex', gap: '8px' }}>
                                        <button className="btn btn-primary" onClick={saveAnnouncement}>{editId ? (zh ? '更新' : 'Update') : (zh ? '發布' : 'Publish')}</button>
                                        <button className="btn btn-secondary" onClick={() => { resetForm(); setTab('list'); }}>{zh ? '取消' : 'Cancel'}</button>
                                    </div>
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}

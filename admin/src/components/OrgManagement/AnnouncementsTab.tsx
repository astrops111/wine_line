import { useState } from 'react';
import type { Announcement } from '../../types/orgManagement';

interface AnnouncementsTabProps {
    zh: boolean;
    announcements: Announcement[];
    onCreateAnnouncement: (form: AnnFormData) => Promise<void>;
    onDeleteAnnouncement: (id: string) => Promise<void>;
}

export interface AnnFormData {
    title: string;
    content: string;
    priority: string;
    target_type: string;
    is_pinned: boolean;
    expires_at: string;
}

export function AnnouncementsTab({ zh, announcements, onCreateAnnouncement, onDeleteAnnouncement }: AnnouncementsTabProps) {
    const [showCreate, setShowCreate] = useState(false);
    const [form, setForm] = useState<AnnFormData>({ title: '', content: '', priority: 'normal', target_type: 'all', is_pinned: false, expires_at: '' });

    async function handleCreate() {
        await onCreateAnnouncement(form);
        setForm({ title: '', content: '', priority: 'normal', target_type: 'all', is_pinned: false, expires_at: '' });
        setShowCreate(false);
    }

    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h3 style={{ fontSize: '16px', fontWeight: 600 }}>📢 {zh ? '公司公告管理' : 'Announcement Management'}</h3>
                <button className="btn btn-primary" onClick={() => setShowCreate(!showCreate)}>
                    {showCreate ? (zh ? '取消' : 'Cancel') : `+ ${zh ? '新增公告' : 'New Announcement'}`}
                </button>
            </div>

            {showCreate && (
                <div className="card" style={{ marginBottom: '16px' }}>
                    <div style={{ display: 'grid', gap: '10px' }}>
                        <input className="input-field" placeholder={zh ? '標題' : 'Title'} value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} />
                        <textarea className="input-field" rows={3} placeholder={zh ? '公告內容' : 'Content'} value={form.content} onChange={e => setForm({ ...form, content: e.target.value })} style={{ resize: 'vertical' }} />
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: '10px', alignItems: 'center' }}>
                            <select className="input-field" value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value })}>
                                <option value="normal">{zh ? '一般' : 'Normal'}</option>
                                <option value="important">{zh ? '重要' : 'Important'}</option>
                                <option value="urgent">{zh ? '緊急' : 'Urgent'}</option>
                            </select>
                            <select className="input-field" value={form.target_type} onChange={e => setForm({ ...form, target_type: e.target.value })}>
                                <option value="all">{zh ? '全體' : 'All'}</option>
                                <option value="department">{zh ? '部門' : 'Department'}</option>
                                <option value="store">{zh ? '門市' : 'Store'}</option>
                            </select>
                            <input className="input-field" type="date" value={form.expires_at} onChange={e => setForm({ ...form, expires_at: e.target.value })} title={zh ? '到期日' : 'Expiry date'} />
                            <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', cursor: 'pointer' }}>
                                <input type="checkbox" checked={form.is_pinned} onChange={e => setForm({ ...form, is_pinned: e.target.checked })} />
                                📌 {zh ? '置頂' : 'Pin'}
                            </label>
                        </div>
                        <button className="btn btn-primary" onClick={handleCreate} disabled={!form.title.trim() || !form.content.trim()}>
                            {zh ? '發布公告' : 'Publish'}
                        </button>
                    </div>
                </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {announcements.map(ann => {
                    const badge = ann.priority === 'urgent' ? { icon: '🔴', bg: '#f43f5e22', color: '#f43f5e' } : ann.priority === 'important' ? { icon: '🟡', bg: '#f59e0b22', color: '#f59e0b' } : { icon: '', bg: '', color: '' };
                    return (
                        <div key={ann.id} className="card" style={{ padding: '14px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                <div style={{ flex: 1 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                                        {ann.is_pinned && <span>📌</span>}
                                        {badge.icon && <span style={{ fontSize: '12px', padding: '1px 8px', borderRadius: '4px', background: badge.bg, color: badge.color }}>{ann.priority === 'urgent' ? (zh ? '緊急' : 'Urgent') : (zh ? '重要' : 'Important')}</span>}
                                        <span style={{ fontWeight: 600, fontSize: '14px' }}>{ann.title}</span>
                                    </div>
                                    <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '6px', lineHeight: 1.5 }}>{ann.content}</div>
                                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'flex', gap: '12px' }}>
                                        <span>{new Date(ann.published_at).toLocaleDateString()}</span>
                                        <span>{zh ? '對象' : 'Target'}: {ann.target_type === 'all' ? (zh ? '全體' : 'All') : ann.target_type}</span>
                                        {ann.expires_at && <span>{zh ? '到期' : 'Expires'}: {new Date(ann.expires_at).toLocaleDateString()}</span>}
                                    </div>
                                </div>
                                <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#f43f5e', fontSize: '14px' }} onClick={() => onDeleteAnnouncement(ann.id)}>🗑</button>
                            </div>
                        </div>
                    );
                })}
                {announcements.length === 0 && (
                    <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                        {zh ? '尚無公告' : 'No announcements yet'}
                    </div>
                )}
            </div>
        </div>
    );
}

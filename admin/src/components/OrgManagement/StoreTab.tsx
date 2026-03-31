import { useState } from 'react';
import type { Store, Company } from '../../types/orgManagement';

interface StoreTabProps {
    zh: boolean;
    stores: Store[];
    companies: Company[];
    onSaveStore: (editingStore: string, editStore: any) => Promise<void>;
    onDeleteStore: (id: string, name: string) => Promise<void>;
}

export function StoreTab({ zh, stores, companies, onSaveStore, onDeleteStore }: StoreTabProps) {
    const [editingStore, setEditingStore] = useState<string | null>(null);
    const [editStore, setEditStore] = useState<any>({});

    async function handleSave() {
        if (!editingStore) return;
        await onSaveStore(editingStore, editStore);
        setEditingStore(null);
        setEditStore({});
    }

    return (
        <div className="card" style={{ padding: 0 }}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--outline-variant)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 600, fontSize: '13px' }}>📍 {zh ? '門市管理' : 'Locations'}</span>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{stores.length} {zh ? '間' : 'total'}</span>
            </div>
            {stores.length === 0
                ? <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>{zh ? '尚無門市' : 'No locations'}</div>
                : (<>
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                            <thead>
                                <tr style={{ borderBottom: '1px solid var(--outline-variant)' }}>
                                    {[
                                        zh ? '代碼' : 'Code',
                                        zh ? '門市名稱' : 'Store Name',
                                        zh ? '狀態' : 'Status',
                                        zh ? '歸屬公司' : 'Company',
                                        zh ? '類型' : 'Type',
                                        zh ? '打卡方式' : 'Clock-In',
                                        'GPS',
                                        zh ? '操作' : 'Actions',
                                    ].map(h => (
                                        <th key={h} style={{ padding: '10px 12px', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 500, fontSize: '12px', whiteSpace: 'nowrap' }}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {stores.map(store => (
                                    <tr key={store.id} style={{ borderBottom: '1px solid var(--outline-variant)' }}>
                                        <td style={{ padding: '10px 12px', fontFamily: 'monospace', fontSize: '12px', color: 'var(--text-muted)' }}>{store.store_code}</td>
                                        <td style={{ padding: '10px 12px', fontWeight: 600 }}>{store.name}</td>
                                        <td style={{ padding: '10px 12px' }}>
                                            <span className={`status-badge ${store.is_active ? 'completed' : 'cancelled'}`} style={{ fontSize: '10px' }}>
                                                {store.is_active ? (zh ? '營業' : 'Active') : (zh ? '關閉' : 'Closed')}
                                            </span>
                                        </td>
                                        <td style={{ padding: '10px 12px', fontSize: '12px' }}>
                                            {(store as any).company?.name || <span style={{ color: 'var(--text-muted)' }}>—</span>}
                                        </td>
                                        <td style={{ padding: '10px 12px', fontSize: '12px' }}>
                                            {store.store_type === 'headquarters' ? (zh ? '總部' : 'HQ') : (zh ? '零售' : 'Retail')}
                                        </td>
                                        <td style={{ padding: '10px 12px', fontSize: '12px' }}>
                                            {store.clock_in_method === 'gps_required' ? (zh ? '必須GPS' : 'GPS') : store.clock_in_method === 'gps_or_wifi' ? (zh ? 'GPS/WiFi' : 'GPS/WiFi') : (zh ? '任意' : 'Any')}
                                        </td>
                                        <td style={{ padding: '10px 12px', fontSize: '11px', color: 'var(--text-muted)' }}>
                                            {store.gps_lat ? `${store.gps_lat}, ${store.gps_lng}` : '—'}
                                        </td>
                                        <td style={{ padding: '10px 12px' }}>
                                            <div style={{ display: 'flex', gap: '4px' }}>
                                                <button className="btn btn-sm btn-secondary" onClick={() => {
                                                    setEditingStore(store.id);
                                                    setEditStore({
                                                        company_id: store.company_id || '',
                                                        gps_lat: store.gps_lat || '',
                                                        gps_lng: store.gps_lng || '',
                                                        gps_radius_m: store.gps_radius_m || 200,
                                                        clock_in_method: store.clock_in_method || 'any',
                                                    });
                                                }}>✏️</button>
                                                <button className="btn btn-sm btn-secondary" style={{ color: 'var(--accent-red)' }} onClick={() => onDeleteStore(store.id, store.name)}>✕</button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* Edit panel (shows below table when editing) */}
                    {editingStore && (() => {
                        const store = stores.find(s => s.id === editingStore);
                        if (!store) return null;
                        return (
                            <div style={{ padding: '16px', borderTop: '1px solid var(--outline-variant)', background: 'var(--bg-secondary)' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                                    <span style={{ fontWeight: 600, fontSize: '13px' }}>{zh ? '編輯' : 'Edit'}: {store.name}</span>
                                    <button className="btn btn-sm btn-secondary" onClick={() => { setEditingStore(null); setEditStore({}); }}>{zh ? '取消' : 'Cancel'}</button>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '12px' }}>
                                    <div>
                                        <label className="detail-label">{zh ? '歸屬公司' : 'Company'}</label>
                                        <select className="select" style={{ width: '100%', fontSize: '12px' }} value={editStore.company_id || ''} onChange={e => setEditStore({ ...editStore, company_id: e.target.value || null })}>
                                            <option value="">{zh ? '— 未指定 —' : '— None —'}</option>
                                            {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="detail-label">{zh ? '緯度' : 'Latitude'}</label>
                                        <input className="input-field" type="number" step="0.000001" placeholder="25.033964" value={editStore.gps_lat || ''} onChange={e => setEditStore({ ...editStore, gps_lat: e.target.value })} />
                                    </div>
                                    <div>
                                        <label className="detail-label">{zh ? '經度' : 'Longitude'}</label>
                                        <input className="input-field" type="number" step="0.000001" placeholder="121.564472" value={editStore.gps_lng || ''} onChange={e => setEditStore({ ...editStore, gps_lng: e.target.value })} />
                                    </div>
                                    <div>
                                        <label className="detail-label">{zh ? '半徑 (m)' : 'Radius (m)'}</label>
                                        <input className="input-field" type="number" min="50" max="2000" value={editStore.gps_radius_m || 200} onChange={e => setEditStore({ ...editStore, gps_radius_m: parseInt(e.target.value) || 200 })} />
                                    </div>
                                    <div>
                                        <label className="detail-label">{zh ? '打卡方式' : 'Clock-In'}</label>
                                        <select className="input-field" value={editStore.clock_in_method || 'any'} onChange={e => setEditStore({ ...editStore, clock_in_method: e.target.value })}>
                                            <option value="any">{zh ? '任意方式' : 'Any'}</option>
                                            <option value="gps_required">{zh ? '必須 GPS' : 'GPS Required'}</option>
                                            <option value="gps_or_wifi">{zh ? 'GPS 或 WiFi' : 'GPS or WiFi'}</option>
                                        </select>
                                    </div>
                                </div>
                                <button className="btn btn-primary btn-sm" style={{ marginTop: '12px' }} onClick={handleSave}>💾 {zh ? '儲存' : 'Save'}</button>
                            </div>
                        );
                    })()}
                </>)
            }
        </div>
    );
}

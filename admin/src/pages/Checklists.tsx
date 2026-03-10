import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { t, getLocale } from '../lib/i18n';

interface ChecklistItem {
    id: string;
    category: string;
    name: string;
    quantity: string | null;
    is_purchased: boolean;
    sort_order: number;
}

interface Checklist {
    id: string;
    name: string;
    items: ChecklistItem[];
}

export function Checklists() {
    const [checklists, setChecklists] = useState<Checklist[]>([]);
    const [loading, setLoading] = useState(true);
    const zh = getLocale() === 'zh-TW';

    useEffect(() => { loadData(); }, []);

    async function loadData() {
        const { data } = await supabase.from('checklists')
            .select('id, name, items:checklist_items(id, category, name, quantity, is_purchased, sort_order)')
            .order('created_at', { ascending: true });
        if (data) setChecklists(data as any);
        setLoading(false);
    }

    async function togglePurchased(itemId: string, current: boolean) {
        await supabase.from('checklist_items')
            .update({ is_purchased: !current, updated_at: new Date().toISOString() })
            .eq('id', itemId);
        loadData();
    }

    return (
        <div className="fade-in">
            <div className="page-header">
                <h2>✅ {t('nav.checklists')}</h2>
                <p>{zh ? '營業用品採購清單' : 'Operational procurement checklists'}</p>
            </div>

            <div className="page-body">
                {loading ? (
                    <p className="loading-pulse">{t('common.loading')}</p>
                ) : checklists.length === 0 ? (
                    <div className="card" style={{ textAlign: 'center', padding: '60px' }}>
                        <p style={{ color: 'var(--text-muted)' }}>{t('common.no_data')}</p>
                    </div>
                ) : (
                    checklists.map(cl => {
                        const items = cl.items?.sort((a, b) => a.sort_order - b.sort_order) || [];
                        const categories = [...new Set(items.map(i => i.category))];
                        const purchasedCount = items.filter(i => i.is_purchased).length;
                        const progress = items.length > 0 ? Math.round((purchasedCount / items.length) * 100) : 0;

                        return (
                            <div key={cl.id} className="card" style={{ marginBottom: '20px' }}>
                                <div className="card-header">
                                    <span className="card-title">📦 {cl.name}</span>
                                    <span style={{ fontSize: '13px', color: 'var(--accent-primary)', fontWeight: 600 }}>
                                        {purchasedCount}/{items.length} ({progress}%)
                                    </span>
                                </div>

                                <div className="progress-bar" style={{ marginBottom: '20px' }}>
                                    <div className="progress-bar-fill" style={{ width: `${progress}%` }} />
                                </div>

                                {categories.map(cat => (
                                    <div key={cat} style={{ marginBottom: '16px' }}>
                                        <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--accent-blue)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                            {cat}
                                        </div>
                                        {items.filter(i => i.category === cat).map(item => (
                                            <div
                                                key={item.id}
                                                style={{
                                                    display: 'flex', alignItems: 'center', gap: '10px',
                                                    padding: '8px 12px', borderRadius: 'var(--radius-sm)',
                                                    marginBottom: '2px', cursor: 'pointer',
                                                    background: item.is_purchased ? 'var(--accent-primary-dim)' : 'transparent',
                                                    opacity: item.is_purchased ? 0.7 : 1,
                                                }}
                                                onClick={() => togglePurchased(item.id, item.is_purchased)}
                                            >
                                                <span style={{ fontSize: '16px' }}>
                                                    {item.is_purchased ? '✅' : '⬜'}
                                                </span>
                                                <span style={{
                                                    flex: 1, fontSize: '13px',
                                                    textDecoration: item.is_purchased ? 'line-through' : 'none',
                                                    color: item.is_purchased ? 'var(--text-muted)' : 'var(--text-primary)',
                                                }}>
                                                    {item.name}
                                                </span>
                                                {item.quantity && (
                                                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                                                        {item.quantity}
                                                    </span>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                ))}
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
}

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { getLocale } from '../lib/i18n';
import { useOrg } from '../lib/OrgContext';

interface InventoryItem {
  id: string; organization_id: string; store_id: string | null; name: string;
  sku: string | null; category: string | null; unit: string; quantity: number;
  min_quantity: number; cost_price: number | null; vendor_id: string | null;
  notes: string | null; is_active: boolean; created_at: string;
  store?: { name: string }; vendor?: { name: string };
}

interface InventoryTransaction {
  id: string; item_id: string; transaction_type: string; quantity: number;
  reference: string | null; performed_by: string | null; notes: string | null;
  created_at: string; item?: { name: string }; user?: { name: string };
}

interface Stocktake {
  id: string; store_id: string | null; status: string; started_by: string | null;
  started_at: string | null; completed_at: string | null; notes: string | null;
  created_at: string; store?: { name: string }; starter?: { name: string };
}

interface Store { id: string; name: string; }
interface Vendor { id: string; name: string; }

const ITEM_CATEGORIES = ['食材', '飲料', '包材', '清潔用品', '設備耗材', '文具用品', '其他'];
const TXN_TYPES: Record<string, { label: string; labelEn: string; color: string; icon: string }> = {
  in:     { label: '入庫', labelEn: 'Stock In',  color: '#15803d', icon: '📥' },
  out:    { label: '出庫', labelEn: 'Stock Out', color: '#b91c1c', icon: '📤' },
  adjust: { label: '調整', labelEn: 'Adjust',    color: '#a16207', icon: '🔧' },
  count:  { label: '盤點', labelEn: 'Count',     color: '#1d4ed8', icon: '📋' },
};

export function InventoryManagement() {
  const zh = getLocale() === 'zh-TW';
  const { orgId, currentUser } = useOrg();
  const [tab, setTab] = useState<'stock' | 'transactions' | 'stocktake' | 'alerts'>('stock');

  // Stock
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [itemLoading, setItemLoading] = useState(true);
  const [itemSearch, setItemSearch] = useState('');
  const [storeFilter, setStoreFilter] = useState('all');
  const [showItemForm, setShowItemForm] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [itemForm, setItemForm] = useState({ name: '', sku: '', category: '', unit: '個', quantity: 0, min_quantity: 0, cost_price: 0, store_id: '', vendor_id: '', notes: '' });
  const [saving, setSaving] = useState(false);

  // Transactions
  const [transactions, setTransactions] = useState<InventoryTransaction[]>([]);
  const [txnLoading, setTxnLoading] = useState(true);
  const [showTxnForm, setShowTxnForm] = useState(false);
  const [txnForm, setTxnForm] = useState({ item_id: '', transaction_type: 'in', quantity: 0, reference: '', notes: '' });

  // Stocktake
  const [stocktakes, setStocktakes] = useState<Stocktake[]>([]);
  const [stLoading, setStLoading] = useState(true);

  // Reference data
  const [stores, setStores] = useState<Store[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);

  // ── Data Loading ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!orgId) return;
    supabase.from('stores').select('id, name').order('name').then(r => setStores(r.data || []));
    supabase.from('vendors').select('id, name').eq('organization_id', orgId).eq('is_active', true).order('name').then(r => setVendors(r.data || []));
  }, [orgId]);

  const loadItems = useCallback(async () => {
    if (!orgId) return;
    setItemLoading(true);
    let q = supabase
      .from('inventory_items')
      .select('*, store:stores(name), vendor:vendors(name)')
      .eq('organization_id', orgId)
      .order('name');
    if (storeFilter !== 'all') q = q.eq('store_id', storeFilter);
    const { data } = await q;
    setItems(data || []);
    setItemLoading(false);
  }, [orgId, storeFilter]);

  const loadTransactions = useCallback(async () => {
    if (!orgId) return;
    setTxnLoading(true);
    const { data } = await supabase
      .from('inventory_transactions')
      .select('*, item:inventory_items(name), user:users(name)')
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false })
      .limit(200);
    setTransactions(data || []);
    setTxnLoading(false);
  }, [orgId]);

  const loadStocktakes = useCallback(async () => {
    if (!orgId) return;
    setStLoading(true);
    const { data } = await supabase
      .from('stocktakes')
      .select('*, store:stores(name), starter:users!stocktakes_started_by_fkey(name)')
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false });
    setStocktakes(data || []);
    setStLoading(false);
  }, [orgId]);

  useEffect(() => { loadItems(); }, [loadItems]);
  useEffect(() => { if (tab === 'transactions') loadTransactions(); }, [tab, loadTransactions]);
  useEffect(() => { if (tab === 'stocktake') loadStocktakes(); }, [tab, loadStocktakes]);

  // ── Item CRUD ────────────────────────────────────────────────────────────
  const openItemForm = (item?: InventoryItem) => {
    if (item) {
      setEditingItem(item);
      setItemForm({
        name: item.name, sku: item.sku || '', category: item.category || '', unit: item.unit,
        quantity: item.quantity, min_quantity: item.min_quantity, cost_price: item.cost_price || 0,
        store_id: item.store_id || '', vendor_id: item.vendor_id || '', notes: item.notes || '',
      });
    } else {
      setEditingItem(null);
      setItemForm({ name: '', sku: '', category: '', unit: '個', quantity: 0, min_quantity: 0, cost_price: 0, store_id: '', vendor_id: '', notes: '' });
    }
    setShowItemForm(true);
  };

  const saveItem = async () => {
    if (!itemForm.name.trim()) return;
    setSaving(true);
    const payload = {
      organization_id: orgId, name: itemForm.name, sku: itemForm.sku || null,
      category: itemForm.category || null, unit: itemForm.unit, quantity: itemForm.quantity,
      min_quantity: itemForm.min_quantity, cost_price: itemForm.cost_price || null,
      store_id: itemForm.store_id || null, vendor_id: itemForm.vendor_id || null, notes: itemForm.notes || null,
    };
    if (editingItem) {
      await supabase.from('inventory_items').update(payload).eq('id', editingItem.id);
    } else {
      await supabase.from('inventory_items').insert(payload);
    }
    setSaving(false);
    setShowItemForm(false);
    loadItems();
  };

  // ── Transaction ──────────────────────────────────────────────────────────
  const openTxnForm = (itemId?: string) => {
    setTxnForm({ item_id: itemId || items[0]?.id || '', transaction_type: 'in', quantity: 0, reference: '', notes: '' });
    setShowTxnForm(true);
  };

  const saveTxn = async () => {
    if (!txnForm.item_id || txnForm.quantity === 0) return;
    setSaving(true);
    await supabase.from('inventory_transactions').insert({
      organization_id: orgId, item_id: txnForm.item_id,
      transaction_type: txnForm.transaction_type, quantity: txnForm.quantity,
      reference: txnForm.reference || null, performed_by: currentUser?.id, notes: txnForm.notes || null,
    });

    // Update item quantity
    const item = items.find(i => i.id === txnForm.item_id);
    if (item) {
      const delta = txnForm.transaction_type === 'out' ? -Math.abs(txnForm.quantity) : Math.abs(txnForm.quantity);
      await supabase.from('inventory_items').update({ quantity: item.quantity + delta }).eq('id', item.id);
    }
    setSaving(false);
    setShowTxnForm(false);
    loadItems();
    if (tab === 'transactions') loadTransactions();
  };

  // ── Stocktake ────────────────────────────────────────────────────────────
  const startStocktake = async () => {
    await supabase.from('stocktakes').insert({
      organization_id: orgId, store_id: storeFilter !== 'all' ? storeFilter : null,
      status: 'in_progress', started_by: currentUser?.id, started_at: new Date().toISOString(),
    });
    loadStocktakes();
  };

  const completeStocktake = async (id: string) => {
    await supabase.from('stocktakes').update({ status: 'completed', completed_at: new Date().toISOString() }).eq('id', id);
    loadStocktakes();
  };

  // ── Derived data ─────────────────────────────────────────────────────────
  const filteredItems = items.filter(i =>
    !itemSearch || i.name.toLowerCase().includes(itemSearch.toLowerCase()) ||
    (i.sku || '').toLowerCase().includes(itemSearch.toLowerCase())
  );

  const lowStockItems = items.filter(i => i.is_active && i.quantity <= i.min_quantity && i.min_quantity > 0);

  const inputStyle = { width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: '13px' };
  const labelStyle = { fontSize: '12px', fontWeight: 600 as const, color: 'var(--text-secondary)', marginBottom: '4px', display: 'block' };

  const tabs_list: { key: typeof tab; label: string; icon: string; count?: number }[] = [
    { key: 'stock',        label: zh ? '庫存總覽' : 'Stock Levels',   icon: '📦', count: items.length },
    { key: 'transactions', label: zh ? '異動記錄' : 'Transactions',   icon: '🔄' },
    { key: 'stocktake',    label: zh ? '盤點' : 'Stocktake',          icon: '📋' },
    { key: 'alerts',       label: zh ? '低庫存' : 'Low Stock',        icon: '⚠️', count: lowStockItems.length },
  ];

  return (
    <div className="fade-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2 style={{ fontSize: '20px', fontWeight: 700 }}>
          {zh ? '📦 庫存管理' : '📦 Inventory Management'}
        </h2>
        <div style={{ display: 'flex', gap: '6px' }}>
          {tab === 'stock' && <button className="btn btn-primary" onClick={() => openItemForm()}>+ {zh ? '新增品項' : 'Add Item'}</button>}
          {tab === 'stock' && <button className="btn btn-ghost" onClick={() => openTxnForm()}>📥 {zh ? '入/出庫' : 'Stock In/Out'}</button>}
          {tab === 'stocktake' && <button className="btn btn-primary" onClick={startStocktake}>📋 {zh ? '開始盤點' : 'Start Stocktake'}</button>}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '4px', marginBottom: '20px', flexWrap: 'wrap' }}>
        {tabs_list.map(t => (
          <button key={t.key} className={`btn ${tab === t.key ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setTab(t.key)} style={{ fontSize: '13px' }}>
            {t.icon} {t.label} {t.count !== undefined && <span style={{ marginLeft: '4px', opacity: 0.7 }}>({t.count})</span>}
          </button>
        ))}
      </div>

      {/* ── Stock Levels Tab ── */}
      {tab === 'stock' && (
        <div>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', flexWrap: 'wrap' }}>
            <input style={{ ...inputStyle, maxWidth: '240px' }} placeholder={zh ? '搜尋品項/SKU...' : 'Search items/SKU...'}
              value={itemSearch} onChange={e => setItemSearch(e.target.value)} />
            <select style={{ ...inputStyle, maxWidth: '180px' }} value={storeFilter} onChange={e => setStoreFilter(e.target.value)}>
              <option value="all">{zh ? '所有門市' : 'All Stores'}</option>
              {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>

          {itemLoading ? (
            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>Loading...</div>
          ) : filteredItems.length === 0 ? (
            <div className="card" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
              {zh ? '尚無庫存品項' : 'No inventory items yet'}
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>{zh ? '品名' : 'Name'}</th>
                    <th>{zh ? 'SKU' : 'SKU'}</th>
                    <th>{zh ? '門市' : 'Store'}</th>
                    <th>{zh ? '分類' : 'Category'}</th>
                    <th style={{ textAlign: 'right' }}>{zh ? '庫存' : 'Qty'}</th>
                    <th style={{ textAlign: 'right' }}>{zh ? '最低量' : 'Min'}</th>
                    <th style={{ textAlign: 'right' }}>{zh ? '成本' : 'Cost'}</th>
                    <th>{zh ? '供應商' : 'Vendor'}</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredItems.map(item => {
                    const isLow = item.min_quantity > 0 && item.quantity <= item.min_quantity;
                    return (
                      <tr key={item.id} style={{ background: isLow ? 'var(--danger-dim, rgba(239,68,68,0.05))' : undefined }}>
                        <td style={{ fontWeight: 500 }}>
                          {isLow && <span title={zh ? '低庫存' : 'Low stock'}>⚠️ </span>}
                          {item.name}
                        </td>
                        <td style={{ fontFamily: 'monospace', fontSize: '12px' }}>{item.sku || '—'}</td>
                        <td>{(item.store as any)?.name || '—'}</td>
                        <td>{item.category || '—'}</td>
                        <td style={{ textAlign: 'right', fontWeight: 600, color: isLow ? 'var(--danger, #b91c1c)' : undefined }}>
                          {item.quantity} {item.unit}
                        </td>
                        <td style={{ textAlign: 'right', fontSize: '12px', color: 'var(--text-muted)' }}>{item.min_quantity} {item.unit}</td>
                        <td style={{ textAlign: 'right' }}>{item.cost_price ? `$${item.cost_price}` : '—'}</td>
                        <td>{(item.vendor as any)?.name || '—'}</td>
                        <td>
                          <div style={{ display: 'flex', gap: '4px' }}>
                            <button className="btn btn-ghost" style={{ fontSize: '11px', padding: '3px 6px' }} onClick={() => openItemForm(item)}>
                              {zh ? '編輯' : 'Edit'}
                            </button>
                            <button className="btn btn-ghost" style={{ fontSize: '11px', padding: '3px 6px' }} onClick={() => openTxnForm(item.id)}>
                              {zh ? '異動' : 'Txn'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Transactions Tab ── */}
      {tab === 'transactions' && (
        <div>
          {txnLoading ? (
            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>Loading...</div>
          ) : transactions.length === 0 ? (
            <div className="card" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
              {zh ? '尚無異動記錄' : 'No transactions yet'}
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>{zh ? '日期' : 'Date'}</th>
                    <th>{zh ? '品項' : 'Item'}</th>
                    <th>{zh ? '類型' : 'Type'}</th>
                    <th style={{ textAlign: 'right' }}>{zh ? '數量' : 'Qty'}</th>
                    <th>{zh ? '參考' : 'Reference'}</th>
                    <th>{zh ? '操作者' : 'By'}</th>
                    <th>{zh ? '備註' : 'Notes'}</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map(txn => {
                    const tt = TXN_TYPES[txn.transaction_type] || TXN_TYPES['adjust'];
                    return (
                      <tr key={txn.id}>
                        <td style={{ fontSize: '12px' }}>{new Date(txn.created_at).toLocaleString('zh-TW', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</td>
                        <td style={{ fontWeight: 500 }}>{(txn.item as any)?.name || '—'}</td>
                        <td>
                          <span style={{ fontSize: '12px' }}>{tt.icon} {zh ? tt.label : tt.labelEn}</span>
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: 600, color: tt.color }}>
                          {txn.transaction_type === 'out' ? '-' : '+'}{Math.abs(txn.quantity)}
                        </td>
                        <td style={{ fontSize: '12px' }}>{txn.reference || '—'}</td>
                        <td style={{ fontSize: '12px' }}>{(txn.user as any)?.name || '—'}</td>
                        <td style={{ fontSize: '12px', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{txn.notes || '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Stocktake Tab ── */}
      {tab === 'stocktake' && (
        <div>
          {stLoading ? (
            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>Loading...</div>
          ) : stocktakes.length === 0 ? (
            <div className="card" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
              {zh ? '尚無盤點記錄' : 'No stocktakes yet'}
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>{zh ? '日期' : 'Date'}</th>
                    <th>{zh ? '門市' : 'Store'}</th>
                    <th>{zh ? '狀態' : 'Status'}</th>
                    <th>{zh ? '開始者' : 'Started By'}</th>
                    <th>{zh ? '完成時間' : 'Completed'}</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {stocktakes.map(st => (
                    <tr key={st.id}>
                      <td style={{ fontSize: '12px' }}>{new Date(st.created_at).toLocaleDateString()}</td>
                      <td>{(st.store as any)?.name || (zh ? '全部' : 'All')}</td>
                      <td>
                        <span style={{
                          padding: '2px 8px', borderRadius: '10px', fontSize: '11px',
                          background: st.status === 'completed' ? '#dcfce7' : st.status === 'in_progress' ? '#fef9c3' : '#f3f4f6',
                          color: st.status === 'completed' ? '#15803d' : st.status === 'in_progress' ? '#a16207' : '#374151',
                        }}>
                          {st.status === 'completed' ? (zh ? '已完成' : 'Completed') : st.status === 'in_progress' ? (zh ? '進行中' : 'In Progress') : (zh ? '草稿' : 'Draft')}
                        </span>
                      </td>
                      <td style={{ fontSize: '12px' }}>{(st.starter as any)?.name || '—'}</td>
                      <td style={{ fontSize: '12px' }}>{st.completed_at ? new Date(st.completed_at).toLocaleString() : '—'}</td>
                      <td>
                        {st.status === 'in_progress' && (
                          <button className="btn btn-ghost" style={{ fontSize: '11px', padding: '3px 6px' }} onClick={() => completeStocktake(st.id)}>
                            {zh ? '完成' : 'Complete'}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Low Stock Alerts Tab ── */}
      {tab === 'alerts' && (
        <div>
          {lowStockItems.length === 0 ? (
            <div className="card" style={{ padding: '40px', textAlign: 'center' }}>
              <div style={{ fontSize: '36px', marginBottom: '12px' }}>✅</div>
              <p style={{ color: 'var(--text-secondary)' }}>{zh ? '目前沒有低庫存品項' : 'No low stock items'}</p>
            </div>
          ) : (
            <div style={{ display: 'grid', gap: '8px' }}>
              {lowStockItems.map(item => (
                <div key={item.id} className="card" style={{ padding: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderLeft: '4px solid #ef4444' }}>
                  <div>
                    <div style={{ fontWeight: 600 }}>⚠️ {item.name}</div>
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                      {(item.store as any)?.name || ''} · {item.category || ''} · {(item.vendor as any)?.name || ''}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '20px', fontWeight: 700, color: '#ef4444' }}>{item.quantity} {item.unit}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{zh ? '最低' : 'Min'}: {item.min_quantity} {item.unit}</div>
                  </div>
                  <button className="btn btn-ghost" style={{ fontSize: '12px', marginLeft: '12px' }} onClick={() => openTxnForm(item.id)}>
                    📥 {zh ? '補貨' : 'Restock'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Item Form Modal ── */}
      {showItemForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="card" style={{ width: '500px', maxHeight: '80vh', overflow: 'auto', padding: '24px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '16px' }}>
              {editingItem ? (zh ? '編輯品項' : 'Edit Item') : (zh ? '新增品項' : 'New Item')}
            </h3>
            <div style={{ display: 'grid', gap: '12px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '12px' }}>
                <div>
                  <label style={labelStyle}>{zh ? '品名 *' : 'Name *'}</label>
                  <input style={inputStyle} value={itemForm.name} onChange={e => setItemForm({ ...itemForm, name: e.target.value })} />
                </div>
                <div>
                  <label style={labelStyle}>SKU</label>
                  <input style={inputStyle} value={itemForm.sku} onChange={e => setItemForm({ ...itemForm, sku: e.target.value })} />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={labelStyle}>{zh ? '分類' : 'Category'}</label>
                  <select style={inputStyle} value={itemForm.category} onChange={e => setItemForm({ ...itemForm, category: e.target.value })}>
                    <option value="">—</option>
                    {ITEM_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>{zh ? '單位' : 'Unit'}</label>
                  <input style={inputStyle} value={itemForm.unit} onChange={e => setItemForm({ ...itemForm, unit: e.target.value })} />
                </div>
                <div>
                  <label style={labelStyle}>{zh ? '成本' : 'Cost'}</label>
                  <input style={inputStyle} type="number" value={itemForm.cost_price} onChange={e => setItemForm({ ...itemForm, cost_price: Number(e.target.value) })} />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={labelStyle}>{zh ? '目前庫存' : 'Current Qty'}</label>
                  <input style={inputStyle} type="number" value={itemForm.quantity} onChange={e => setItemForm({ ...itemForm, quantity: Number(e.target.value) })} />
                </div>
                <div>
                  <label style={labelStyle}>{zh ? '最低庫存' : 'Min Qty'}</label>
                  <input style={inputStyle} type="number" value={itemForm.min_quantity} onChange={e => setItemForm({ ...itemForm, min_quantity: Number(e.target.value) })} />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={labelStyle}>{zh ? '門市' : 'Store'}</label>
                  <select style={inputStyle} value={itemForm.store_id} onChange={e => setItemForm({ ...itemForm, store_id: e.target.value })}>
                    <option value="">{zh ? '— 全部 —' : '— All —'}</option>
                    {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>{zh ? '供應商' : 'Vendor'}</label>
                  <select style={inputStyle} value={itemForm.vendor_id} onChange={e => setItemForm({ ...itemForm, vendor_id: e.target.value })}>
                    <option value="">—</option>
                    {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label style={labelStyle}>{zh ? '備註' : 'Notes'}</label>
                <textarea style={{ ...inputStyle, minHeight: '50px' }} value={itemForm.notes} onChange={e => setItemForm({ ...itemForm, notes: e.target.value })} />
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '20px' }}>
              <button className="btn btn-ghost" onClick={() => setShowItemForm(false)}>{zh ? '取消' : 'Cancel'}</button>
              <button className="btn btn-primary" onClick={saveItem} disabled={saving || !itemForm.name.trim()}>
                {saving ? '...' : (zh ? '儲存' : 'Save')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Transaction Form Modal ── */}
      {showTxnForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="card" style={{ width: '420px', padding: '24px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '16px' }}>
              {zh ? '庫存異動' : 'Stock Transaction'}
            </h3>
            <div style={{ display: 'grid', gap: '12px' }}>
              <div>
                <label style={labelStyle}>{zh ? '品項 *' : 'Item *'}</label>
                <select style={inputStyle} value={txnForm.item_id} onChange={e => setTxnForm({ ...txnForm, item_id: e.target.value })}>
                  {items.map(i => <option key={i.id} value={i.id}>{i.name} ({i.quantity} {i.unit})</option>)}
                </select>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={labelStyle}>{zh ? '類型' : 'Type'}</label>
                  <select style={inputStyle} value={txnForm.transaction_type} onChange={e => setTxnForm({ ...txnForm, transaction_type: e.target.value })}>
                    {Object.entries(TXN_TYPES).map(([k, v]) => <option key={k} value={k}>{v.icon} {zh ? v.label : v.labelEn}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>{zh ? '數量' : 'Quantity'}</label>
                  <input style={inputStyle} type="number" value={txnForm.quantity} onChange={e => setTxnForm({ ...txnForm, quantity: Number(e.target.value) })} />
                </div>
              </div>
              <div>
                <label style={labelStyle}>{zh ? '參考/單號' : 'Reference'}</label>
                <input style={inputStyle} value={txnForm.reference} onChange={e => setTxnForm({ ...txnForm, reference: e.target.value })} />
              </div>
              <div>
                <label style={labelStyle}>{zh ? '備註' : 'Notes'}</label>
                <input style={inputStyle} value={txnForm.notes} onChange={e => setTxnForm({ ...txnForm, notes: e.target.value })} />
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '20px' }}>
              <button className="btn btn-ghost" onClick={() => setShowTxnForm(false)}>{zh ? '取消' : 'Cancel'}</button>
              <button className="btn btn-primary" onClick={saveTxn} disabled={saving || !txnForm.item_id || txnForm.quantity === 0}>
                {saving ? '...' : (zh ? '確認' : 'Confirm')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

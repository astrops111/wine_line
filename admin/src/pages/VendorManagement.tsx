import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { getLocale } from '../lib/i18n';
import { useOrg } from '../lib/OrgContext';

interface Vendor {
  id: string; organization_id: string; name: string; contact_person: string | null;
  phone: string | null; email: string | null; address: string | null; category: string | null;
  payment_terms: string | null; tax_id: string | null; rating: number | null;
  notes: string | null; is_active: boolean; created_at: string;
}

interface PurchaseOrder {
  id: string; organization_id: string; vendor_id: string; po_number: string;
  items: any[]; total_amount: number; status: string; ordered_by: string | null;
  expected_date: string | null; received_date: string | null; notes: string | null;
  created_at: string; vendor?: { name: string };
}

const VENDOR_CATEGORIES = ['食材', '飲料', '包材', '設備', '清潔用品', '行銷物料', '其他'];
const PO_STATUSES: Record<string, { bg: string; color: string; label: string; labelEn: string }> = {
  draft:     { bg: '#f3f4f6', color: '#374151', label: '草稿',   labelEn: 'Draft' },
  submitted: { bg: '#dbeafe', color: '#1d4ed8', label: '已送出', labelEn: 'Submitted' },
  approved:  { bg: '#dcfce7', color: '#15803d', label: '已核准', labelEn: 'Approved' },
  received:  { bg: '#e0e7ff', color: '#4338ca', label: '已收貨', labelEn: 'Received' },
  cancelled: { bg: '#fee2e2', color: '#b91c1c', label: '已取消', labelEn: 'Cancelled' },
};

export function VendorManagement() {
  const zh = getLocale() === 'zh-TW';
  const { orgId, currentUser } = useOrg();
  const [tab, setTab] = useState<'vendors' | 'orders'>('vendors');

  // Vendor state
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [vendorLoading, setVendorLoading] = useState(true);
  const [vendorSearch, setVendorSearch] = useState('');
  const [showVendorForm, setShowVendorForm] = useState(false);
  const [editingVendor, setEditingVendor] = useState<Vendor | null>(null);
  const [vendorForm, setVendorForm] = useState({
    name: '', contact_person: '', phone: '', email: '', address: '',
    category: '', payment_terms: '', tax_id: '', rating: 0, notes: '',
  });
  const [saving, setSaving] = useState(false);

  // PO state
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [orderLoading, setOrderLoading] = useState(true);
  const [showOrderForm, setShowOrderForm] = useState(false);
  const [orderForm, setOrderForm] = useState({
    vendor_id: '', po_number: '', expected_date: '', notes: '',
    items: [{ name: '', quantity: 1, unit_price: 0 }] as { name: string; quantity: number; unit_price: number }[],
  });
  const [orderFilter, setOrderFilter] = useState('all');

  // ── Load vendors ─────────────────────────────────────────────────────────
  const loadVendors = useCallback(async () => {
    if (!orgId) return;
    setVendorLoading(true);
    const { data } = await supabase
      .from('vendors')
      .select('*')
      .eq('organization_id', orgId)
      .order('name');
    setVendors(data || []);
    setVendorLoading(false);
  }, [orgId]);

  const loadOrders = useCallback(async () => {
    if (!orgId) return;
    setOrderLoading(true);
    let q = supabase
      .from('purchase_orders')
      .select('*, vendor:vendors(name)')
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false });
    if (orderFilter !== 'all') q = q.eq('status', orderFilter);
    const { data } = await q;
    setOrders(data || []);
    setOrderLoading(false);
  }, [orgId, orderFilter]);

  useEffect(() => { loadVendors(); }, [loadVendors]);
  useEffect(() => { if (tab === 'orders') loadOrders(); }, [tab, loadOrders]);

  // ── Vendor CRUD ──────────────────────────────────────────────────────────
  const openVendorForm = (v?: Vendor) => {
    if (v) {
      setEditingVendor(v);
      setVendorForm({
        name: v.name, contact_person: v.contact_person || '', phone: v.phone || '',
        email: v.email || '', address: v.address || '', category: v.category || '',
        payment_terms: v.payment_terms || '', tax_id: v.tax_id || '',
        rating: v.rating || 0, notes: v.notes || '',
      });
    } else {
      setEditingVendor(null);
      setVendorForm({ name: '', contact_person: '', phone: '', email: '', address: '', category: '', payment_terms: '', tax_id: '', rating: 0, notes: '' });
    }
    setShowVendorForm(true);
  };

  const saveVendor = async () => {
    if (!vendorForm.name.trim()) return;
    setSaving(true);
    const payload = { ...vendorForm, organization_id: orgId, rating: vendorForm.rating || null };
    if (editingVendor) {
      await supabase.from('vendors').update(payload).eq('id', editingVendor.id);
    } else {
      await supabase.from('vendors').insert(payload);
    }
    setSaving(false);
    setShowVendorForm(false);
    loadVendors();
  };

  const toggleVendorActive = async (v: Vendor) => {
    await supabase.from('vendors').update({ is_active: !v.is_active }).eq('id', v.id);
    loadVendors();
  };

  // ── PO CRUD ──────────────────────────────────────────────────────────────
  const openOrderForm = () => {
    setOrderForm({
      vendor_id: vendors[0]?.id || '', po_number: `PO-${Date.now().toString(36).toUpperCase()}`,
      expected_date: '', notes: '', items: [{ name: '', quantity: 1, unit_price: 0 }],
    });
    setShowOrderForm(true);
  };

  const saveOrder = async () => {
    if (!orderForm.vendor_id || !orderForm.po_number) return;
    setSaving(true);
    const total = orderForm.items.reduce((s, i) => s + i.quantity * i.unit_price, 0);
    await supabase.from('purchase_orders').insert({
      organization_id: orgId,
      vendor_id: orderForm.vendor_id,
      po_number: orderForm.po_number,
      items: orderForm.items,
      total_amount: total,
      status: 'draft',
      ordered_by: currentUser?.id,
      expected_date: orderForm.expected_date || null,
      notes: orderForm.notes || null,
    });
    setSaving(false);
    setShowOrderForm(false);
    loadOrders();
  };

  const updateOrderStatus = async (id: string, status: string) => {
    const updates: any = { status };
    if (status === 'received') updates.received_date = new Date().toISOString().split('T')[0];
    await supabase.from('purchase_orders').update(updates).eq('id', id);
    loadOrders();
  };

  const filteredVendors = vendors.filter(v =>
    !vendorSearch || v.name.toLowerCase().includes(vendorSearch.toLowerCase()) ||
    (v.contact_person || '').toLowerCase().includes(vendorSearch.toLowerCase())
  );

  const inputStyle = { width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: '13px' };
  const labelStyle = { fontSize: '12px', fontWeight: 600 as const, color: 'var(--text-secondary)', marginBottom: '4px', display: 'block' };

  return (
    <div className="fade-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2 style={{ fontSize: '20px', fontWeight: 700 }}>
          {zh ? '🏭 供應商管理' : '🏭 Vendor Management'}
        </h2>
        <button className="btn btn-primary" onClick={() => tab === 'vendors' ? openVendorForm() : openOrderForm()}>
          + {tab === 'vendors' ? (zh ? '新增供應商' : 'Add Vendor') : (zh ? '新增採購單' : 'New PO')}
        </button>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '4px', marginBottom: '20px' }}>
        <button className={`btn ${tab === 'vendors' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setTab('vendors')}>
          🏢 {zh ? '供應商' : 'Vendors'} ({vendors.length})
        </button>
        <button className={`btn ${tab === 'orders' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setTab('orders')}>
          📋 {zh ? '採購單' : 'Purchase Orders'} ({orders.length})
        </button>
      </div>

      {/* ── Vendors Tab ── */}
      {tab === 'vendors' && (
        <div>
          <div style={{ marginBottom: '12px' }}>
            <input
              style={{ ...inputStyle, maxWidth: '300px' }}
              placeholder={zh ? '搜尋供應商...' : 'Search vendors...'}
              value={vendorSearch}
              onChange={e => setVendorSearch(e.target.value)}
            />
          </div>

          {vendorLoading ? (
            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>Loading...</div>
          ) : filteredVendors.length === 0 ? (
            <div className="card" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
              {zh ? '尚無供應商資料' : 'No vendors yet'}
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>{zh ? '名稱' : 'Name'}</th>
                    <th>{zh ? '聯絡人' : 'Contact'}</th>
                    <th>{zh ? '電話' : 'Phone'}</th>
                    <th>{zh ? '分類' : 'Category'}</th>
                    <th>{zh ? '統編' : 'Tax ID'}</th>
                    <th>{zh ? '評分' : 'Rating'}</th>
                    <th>{zh ? '狀態' : 'Status'}</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredVendors.map(v => (
                    <tr key={v.id} style={{ opacity: v.is_active ? 1 : 0.5 }}>
                      <td style={{ fontWeight: 500 }}>{v.name}</td>
                      <td>{v.contact_person || '—'}</td>
                      <td>{v.phone || '—'}</td>
                      <td>{v.category || '—'}</td>
                      <td style={{ fontFamily: 'monospace', fontSize: '12px' }}>{v.tax_id || '—'}</td>
                      <td>{'⭐'.repeat(v.rating || 0)}</td>
                      <td>
                        <span style={{
                          padding: '2px 8px', borderRadius: '10px', fontSize: '11px',
                          background: v.is_active ? '#dcfce7' : '#fee2e2',
                          color: v.is_active ? '#15803d' : '#b91c1c',
                        }}>
                          {v.is_active ? (zh ? '啟用' : 'Active') : (zh ? '停用' : 'Inactive')}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '4px' }}>
                          <button className="btn btn-ghost" style={{ fontSize: '12px', padding: '4px 8px' }} onClick={() => openVendorForm(v)}>
                            {zh ? '編輯' : 'Edit'}
                          </button>
                          <button className="btn btn-ghost" style={{ fontSize: '12px', padding: '4px 8px' }} onClick={() => toggleVendorActive(v)}>
                            {v.is_active ? (zh ? '停用' : 'Disable') : (zh ? '啟用' : 'Enable')}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Purchase Orders Tab ── */}
      {tab === 'orders' && (
        <div>
          <div style={{ display: 'flex', gap: '4px', marginBottom: '12px', flexWrap: 'wrap' }}>
            {['all', 'draft', 'submitted', 'approved', 'received', 'cancelled'].map(s => (
              <button key={s} className={`btn ${orderFilter === s ? 'btn-primary' : 'btn-ghost'}`}
                style={{ fontSize: '12px' }} onClick={() => setOrderFilter(s)}>
                {s === 'all' ? (zh ? '全部' : 'All') : (PO_STATUSES[s] ? (zh ? PO_STATUSES[s].label : PO_STATUSES[s].labelEn) : s)}
              </button>
            ))}
          </div>

          {orderLoading ? (
            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>Loading...</div>
          ) : orders.length === 0 ? (
            <div className="card" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
              {zh ? '尚無採購單' : 'No purchase orders yet'}
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>{zh ? '單號' : 'PO #'}</th>
                    <th>{zh ? '供應商' : 'Vendor'}</th>
                    <th style={{ textAlign: 'right' }}>{zh ? '金額' : 'Amount'}</th>
                    <th>{zh ? '狀態' : 'Status'}</th>
                    <th>{zh ? '預計到貨' : 'Expected'}</th>
                    <th>{zh ? '建立日期' : 'Created'}</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map(o => {
                    const st = PO_STATUSES[o.status] || PO_STATUSES['draft'];
                    return (
                      <tr key={o.id}>
                        <td style={{ fontFamily: 'monospace', fontSize: '12px', fontWeight: 500 }}>{o.po_number}</td>
                        <td>{(o.vendor as any)?.name || '—'}</td>
                        <td style={{ textAlign: 'right', fontWeight: 500 }}>${o.total_amount.toLocaleString()}</td>
                        <td>
                          <span style={{ padding: '2px 8px', borderRadius: '10px', fontSize: '11px', background: st.bg, color: st.color }}>
                            {zh ? st.label : st.labelEn}
                          </span>
                        </td>
                        <td style={{ fontSize: '12px' }}>{o.expected_date || '—'}</td>
                        <td style={{ fontSize: '12px' }}>{new Date(o.created_at).toLocaleDateString()}</td>
                        <td>
                          <div style={{ display: 'flex', gap: '4px' }}>
                            {o.status === 'draft' && (
                              <button className="btn btn-ghost" style={{ fontSize: '11px', padding: '3px 6px' }}
                                onClick={() => updateOrderStatus(o.id, 'submitted')}>
                                {zh ? '送出' : 'Submit'}
                              </button>
                            )}
                            {o.status === 'submitted' && (
                              <button className="btn btn-ghost" style={{ fontSize: '11px', padding: '3px 6px' }}
                                onClick={() => updateOrderStatus(o.id, 'approved')}>
                                {zh ? '核准' : 'Approve'}
                              </button>
                            )}
                            {o.status === 'approved' && (
                              <button className="btn btn-ghost" style={{ fontSize: '11px', padding: '3px 6px' }}
                                onClick={() => updateOrderStatus(o.id, 'received')}>
                                {zh ? '收貨' : 'Receive'}
                              </button>
                            )}
                            {['draft', 'submitted'].includes(o.status) && (
                              <button className="btn btn-ghost" style={{ fontSize: '11px', padding: '3px 6px', color: 'var(--danger)' }}
                                onClick={() => updateOrderStatus(o.id, 'cancelled')}>
                                {zh ? '取消' : 'Cancel'}
                              </button>
                            )}
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

      {/* ── Vendor Form Modal ── */}
      {showVendorForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="card" style={{ width: '500px', maxHeight: '80vh', overflow: 'auto', padding: '24px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '16px' }}>
              {editingVendor ? (zh ? '編輯供應商' : 'Edit Vendor') : (zh ? '新增供應商' : 'New Vendor')}
            </h3>
            <div style={{ display: 'grid', gap: '12px' }}>
              <div>
                <label style={labelStyle}>{zh ? '名稱 *' : 'Name *'}</label>
                <input style={inputStyle} value={vendorForm.name} onChange={e => setVendorForm({ ...vendorForm, name: e.target.value })} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={labelStyle}>{zh ? '聯絡人' : 'Contact Person'}</label>
                  <input style={inputStyle} value={vendorForm.contact_person} onChange={e => setVendorForm({ ...vendorForm, contact_person: e.target.value })} />
                </div>
                <div>
                  <label style={labelStyle}>{zh ? '電話' : 'Phone'}</label>
                  <input style={inputStyle} value={vendorForm.phone} onChange={e => setVendorForm({ ...vendorForm, phone: e.target.value })} />
                </div>
              </div>
              <div>
                <label style={labelStyle}>{zh ? '電子信箱' : 'Email'}</label>
                <input style={inputStyle} type="email" value={vendorForm.email} onChange={e => setVendorForm({ ...vendorForm, email: e.target.value })} />
              </div>
              <div>
                <label style={labelStyle}>{zh ? '地址' : 'Address'}</label>
                <input style={inputStyle} value={vendorForm.address} onChange={e => setVendorForm({ ...vendorForm, address: e.target.value })} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={labelStyle}>{zh ? '分類' : 'Category'}</label>
                  <select style={inputStyle} value={vendorForm.category} onChange={e => setVendorForm({ ...vendorForm, category: e.target.value })}>
                    <option value="">—</option>
                    {VENDOR_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>{zh ? '統一編號' : 'Tax ID'}</label>
                  <input style={inputStyle} value={vendorForm.tax_id} onChange={e => setVendorForm({ ...vendorForm, tax_id: e.target.value })} />
                </div>
              </div>
              <div>
                <label style={labelStyle}>{zh ? '付款條件' : 'Payment Terms'}</label>
                <input style={inputStyle} value={vendorForm.payment_terms} onChange={e => setVendorForm({ ...vendorForm, payment_terms: e.target.value })} placeholder={zh ? '例：月結30天' : 'e.g. Net 30'} />
              </div>
              <div>
                <label style={labelStyle}>{zh ? '評分 (1-5)' : 'Rating (1-5)'}</label>
                <div style={{ display: 'flex', gap: '4px' }}>
                  {[1, 2, 3, 4, 5].map(n => (
                    <button key={n} onClick={() => setVendorForm({ ...vendorForm, rating: n })}
                      style={{ fontSize: '20px', background: 'none', border: 'none', cursor: 'pointer', opacity: n <= vendorForm.rating ? 1 : 0.3 }}>
                      ⭐
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label style={labelStyle}>{zh ? '備註' : 'Notes'}</label>
                <textarea style={{ ...inputStyle, minHeight: '60px' }} value={vendorForm.notes} onChange={e => setVendorForm({ ...vendorForm, notes: e.target.value })} />
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '20px' }}>
              <button className="btn btn-ghost" onClick={() => setShowVendorForm(false)}>{zh ? '取消' : 'Cancel'}</button>
              <button className="btn btn-primary" onClick={saveVendor} disabled={saving || !vendorForm.name.trim()}>
                {saving ? '...' : (zh ? '儲存' : 'Save')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── PO Form Modal ── */}
      {showOrderForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="card" style={{ width: '560px', maxHeight: '80vh', overflow: 'auto', padding: '24px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '16px' }}>
              {zh ? '新增採購單' : 'New Purchase Order'}
            </h3>
            <div style={{ display: 'grid', gap: '12px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={labelStyle}>{zh ? '供應商 *' : 'Vendor *'}</label>
                  <select style={inputStyle} value={orderForm.vendor_id} onChange={e => setOrderForm({ ...orderForm, vendor_id: e.target.value })}>
                    {vendors.filter(v => v.is_active).map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>{zh ? '單號' : 'PO Number'}</label>
                  <input style={inputStyle} value={orderForm.po_number} onChange={e => setOrderForm({ ...orderForm, po_number: e.target.value })} />
                </div>
              </div>
              <div>
                <label style={labelStyle}>{zh ? '預計到貨日' : 'Expected Date'}</label>
                <input style={inputStyle} type="date" value={orderForm.expected_date} onChange={e => setOrderForm({ ...orderForm, expected_date: e.target.value })} />
              </div>

              <div>
                <label style={labelStyle}>{zh ? '品項' : 'Items'}</label>
                {orderForm.items.map((item, idx) => (
                  <div key={idx} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr auto', gap: '6px', marginBottom: '6px' }}>
                    <input style={inputStyle} placeholder={zh ? '品名' : 'Item name'} value={item.name}
                      onChange={e => { const items = [...orderForm.items]; items[idx].name = e.target.value; setOrderForm({ ...orderForm, items }); }} />
                    <input style={inputStyle} type="number" placeholder={zh ? '數量' : 'Qty'} value={item.quantity}
                      onChange={e => { const items = [...orderForm.items]; items[idx].quantity = Number(e.target.value); setOrderForm({ ...orderForm, items }); }} />
                    <input style={inputStyle} type="number" placeholder={zh ? '單價' : 'Price'} value={item.unit_price}
                      onChange={e => { const items = [...orderForm.items]; items[idx].unit_price = Number(e.target.value); setOrderForm({ ...orderForm, items }); }} />
                    {orderForm.items.length > 1 && (
                      <button className="btn btn-ghost" style={{ padding: '4px 8px', color: 'var(--danger)' }}
                        onClick={() => { const items = orderForm.items.filter((_, i) => i !== idx); setOrderForm({ ...orderForm, items }); }}>✕</button>
                    )}
                  </div>
                ))}
                <button className="btn btn-ghost" style={{ fontSize: '12px' }}
                  onClick={() => setOrderForm({ ...orderForm, items: [...orderForm.items, { name: '', quantity: 1, unit_price: 0 }] })}>
                  + {zh ? '增加品項' : 'Add Item'}
                </button>
                <div style={{ fontSize: '13px', fontWeight: 600, marginTop: '8px', textAlign: 'right' }}>
                  {zh ? '合計' : 'Total'}: ${orderForm.items.reduce((s, i) => s + i.quantity * i.unit_price, 0).toLocaleString()}
                </div>
              </div>

              <div>
                <label style={labelStyle}>{zh ? '備註' : 'Notes'}</label>
                <textarea style={{ ...inputStyle, minHeight: '50px' }} value={orderForm.notes} onChange={e => setOrderForm({ ...orderForm, notes: e.target.value })} />
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '20px' }}>
              <button className="btn btn-ghost" onClick={() => setShowOrderForm(false)}>{zh ? '取消' : 'Cancel'}</button>
              <button className="btn btn-primary" onClick={saveOrder} disabled={saving || !orderForm.vendor_id}>
                {saving ? '...' : (zh ? '建立採購單' : 'Create PO')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

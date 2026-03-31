import { useState } from 'react';
import type { Org, Subscription, Payment } from '../../types/orgManagement';
import { planColors, payStatusColors, getPlanLabel } from '../../types/orgManagement';

interface BillingTabProps {
    zh: boolean;
    orgs: Org[];
    selectedOrg: Org | null;
    subscriptions: Subscription[];
    payments: Payment[];
    onSelectOrg: (org: Org) => void;
    onAddSubscription: (form: Partial<Subscription>, editingSub: Subscription | null) => Promise<void>;
    onAddPayment: (form: Partial<Payment>) => Promise<void>;
}

export function BillingTab({
    zh, orgs, selectedOrg, subscriptions, payments,
    onSelectOrg, onAddSubscription, onAddPayment,
}: BillingTabProps) {
    const [showAddSub, setShowAddSub] = useState(false);
    const [subForm, setSubForm] = useState<Partial<Subscription>>({ plan: 'starter', status: 'active', price_monthly: 0, max_users: 50, max_stores: 5 } as any);
    const [editingSub, setEditingSub] = useState<Subscription | null>(null);
    const [showAddPayment, setShowAddPayment] = useState(false);
    const [payForm, setPayForm] = useState<Partial<Payment>>({ status: 'paid', currency: 'TWD', amount: 0, payment_method: 'bank_transfer' } as any);

    async function handleSaveSub() {
        await onAddSubscription(subForm, editingSub);
        setShowAddSub(false);
        setEditingSub(null);
        setSubForm({ plan: 'starter', status: 'active', price_monthly: 0, max_users: 50, max_stores: 5 } as any);
    }

    async function handleSavePayment() {
        await onAddPayment(payForm);
        setShowAddPayment(false);
        setPayForm({ status: 'paid', currency: 'TWD', amount: 0, payment_method: 'bank_transfer' } as any);
    }

    return (
        <div>
            {/* Org selector */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
                <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                    {zh ? '選擇組織：' : 'Organization:'}
                </label>
                <select className="select" style={{ minWidth: '220px' }}
                    value={selectedOrg?.id || ''}
                    onChange={e => { const o = orgs.find(x => x.id === e.target.value); if (o) onSelectOrg(o); }}>
                    {orgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                </select>
                {selectedOrg && (
                    <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '5px', fontWeight: 600, background: planColors[selectedOrg.plan]?.bg, color: planColors[selectedOrg.plan]?.color }}>
                        {getPlanLabel(selectedOrg.plan, zh)}
                    </span>
                )}
            </div>

            {selectedOrg && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>

                    {/* Subscriptions */}
                    <div className="card" style={{ padding: 0 }}>
                        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--outline-variant)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontWeight: 600, fontSize: '13px' }}>📋 {zh ? '訂閱方案' : 'Subscriptions'}</span>
                            <button className="btn btn-sm btn-primary" onClick={() => { setShowAddSub(s => !s); setEditingSub(null); setSubForm({ plan: 'starter', status: 'active', price_monthly: 0, max_users: 50, max_stores: 5 } as any); }}>
                                {showAddSub ? (zh ? '取消' : 'Cancel') : `+ ${zh ? '新增' : 'Add'}`}
                            </button>
                        </div>

                        {showAddSub && (
                            <div style={{ padding: '14px 16px', background: 'var(--bg-secondary)', borderBottom: '1px solid var(--outline-variant)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                                <div>
                                    <label className="detail-label">{zh ? '方案' : 'Plan'}</label>
                                    <select className="select" style={{ width: '100%' }} value={subForm.plan || 'starter'} onChange={e => setSubForm(f => ({ ...f, plan: e.target.value }))}>
                                        <option value="free">{zh ? '免費版' : 'Free'}</option>
                                        <option value="starter">{zh ? '入門版' : 'Starter'}</option>
                                        <option value="pro">{zh ? '專業版' : 'Pro'}</option>
                                        <option value="enterprise">{zh ? '企業版' : 'Enterprise'}</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="detail-label">{zh ? '狀態' : 'Status'}</label>
                                    <select className="select" style={{ width: '100%' }} value={subForm.status || 'active'} onChange={e => setSubForm(f => ({ ...f, status: e.target.value }))}>
                                        <option value="active">{zh ? '啟用' : 'Active'}</option>
                                        <option value="cancelled">{zh ? '取消' : 'Cancelled'}</option>
                                        <option value="expired">{zh ? '已過期' : 'Expired'}</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="detail-label">{zh ? '月費 (NT$)' : 'Monthly (NT$)'}</label>
                                    <input type="number" className="input-field" value={subForm.price_monthly || 0} onChange={e => setSubForm(f => ({ ...f, price_monthly: Number(e.target.value) }))} />
                                </div>
                                <div>
                                    <label className="detail-label">{zh ? '最大用戶數' : 'Max Users'}</label>
                                    <input type="number" className="input-field" value={subForm.max_users || 50} onChange={e => setSubForm(f => ({ ...f, max_users: Number(e.target.value) }))} />
                                </div>
                                <div>
                                    <label className="detail-label">{zh ? '最大門市數' : 'Max Stores'}</label>
                                    <input type="number" className="input-field" value={subForm.max_stores || 5} onChange={e => setSubForm(f => ({ ...f, max_stores: Number(e.target.value) }))} />
                                </div>
                                <div>
                                    <label className="detail-label">{zh ? '到期日' : 'Period End'}</label>
                                    <input type="date" className="input-field" value={subForm.current_period_end?.slice(0, 10) || ''} onChange={e => setSubForm(f => ({ ...f, current_period_end: e.target.value }))} />
                                </div>
                                <div style={{ gridColumn: '1/-1' }}>
                                    <label className="detail-label">{zh ? '備註' : 'Notes'}</label>
                                    <input className="input-field" value={subForm.notes || ''} onChange={e => setSubForm(f => ({ ...f, notes: e.target.value }))} />
                                </div>
                                <div style={{ gridColumn: '1/-1' }}>
                                    <button className="btn btn-primary btn-sm" onClick={handleSaveSub}>
                                        💾 {zh ? '儲存' : 'Save'}
                                    </button>
                                </div>
                            </div>
                        )}

                        <div style={{ padding: '12px 16px' }}>
                            {subscriptions.length === 0
                                ? <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '30px 0', fontSize: '13px' }}>{zh ? '尚無訂閱' : 'No subscriptions'}</p>
                                : subscriptions.map(sub => (
                                    <div key={sub.id} style={{ padding: '12px', borderRadius: '8px', marginBottom: '8px', background: 'var(--bg-secondary)', border: `1px solid ${sub.status === 'active' ? 'var(--accent-primary)' : 'var(--border-color)'}` }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
                                            <div>
                                                <span style={{ fontWeight: 700, fontSize: '14px', padding: '2px 8px', borderRadius: '5px', background: planColors[sub.plan]?.bg, color: planColors[sub.plan]?.color }}>
                                                    {getPlanLabel(sub.plan, zh)}
                                                </span>
                                            </div>
                                            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                                                <span style={{ fontSize: '10px', padding: '2px 7px', borderRadius: '4px', fontWeight: 600, background: sub.status === 'active' ? '#22c55e20' : '#f59e0b20', color: sub.status === 'active' ? '#22c55e' : '#f59e0b' }}>
                                                    {sub.status}
                                                </span>
                                                <button className="btn btn-sm btn-secondary" style={{ padding: '2px 8px' }} onClick={() => { setEditingSub(sub); setSubForm({ ...sub }); setShowAddSub(true); }}>✏️</button>
                                            </div>
                                        </div>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                                            <div><div style={{ fontSize: '10px', color: 'var(--text-muted)', marginBottom: '2px' }}>{zh ? '月費' : 'Monthly'}</div><strong>NT${sub.price_monthly.toLocaleString()}</strong></div>
                                            <div><div style={{ fontSize: '10px', color: 'var(--text-muted)', marginBottom: '2px' }}>{zh ? '用戶上限' : 'Max Users'}</div><strong>{sub.max_users}</strong></div>
                                            <div><div style={{ fontSize: '10px', color: 'var(--text-muted)', marginBottom: '2px' }}>{zh ? '門市上限' : 'Max Stores'}</div><strong>{sub.max_stores}</strong></div>
                                        </div>
                                        {sub.current_period_end && (
                                            <div style={{ marginTop: '6px', fontSize: '11px', color: 'var(--text-muted)' }}>
                                                {zh ? '到期' : 'Expires'}: {new Date(sub.current_period_end).toLocaleDateString('zh-TW')}
                                            </div>
                                        )}
                                        {sub.notes && <div style={{ marginTop: '4px', fontSize: '11px', color: 'var(--text-muted)', fontStyle: 'italic' }}>{sub.notes}</div>}
                                    </div>
                                ))
                            }
                        </div>
                    </div>

                    {/* Payments */}
                    <div className="card" style={{ padding: 0 }}>
                        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--outline-variant)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontWeight: 600, fontSize: '13px' }}>💰 {zh ? '付款紀錄' : 'Payment History'}</span>
                            <button className="btn btn-sm btn-primary" onClick={() => { setShowAddPayment(p => !p); setPayForm({ status: 'paid', currency: 'TWD', amount: 0, payment_method: 'bank_transfer' } as any); }}>
                                {showAddPayment ? (zh ? '取消' : 'Cancel') : `+ ${zh ? '新增' : 'Log'}`}
                            </button>
                        </div>

                        {showAddPayment && (
                            <div style={{ padding: '14px 16px', background: 'var(--bg-secondary)', borderBottom: '1px solid var(--outline-variant)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                                <div>
                                    <label className="detail-label">{zh ? '金額' : 'Amount'}</label>
                                    <input type="number" className="input-field" value={payForm.amount || 0} onChange={e => setPayForm(f => ({ ...f, amount: Number(e.target.value) }))} />
                                </div>
                                <div>
                                    <label className="detail-label">{zh ? '幣別' : 'Currency'}</label>
                                    <select className="select" style={{ width: '100%' }} value={payForm.currency || 'TWD'} onChange={e => setPayForm(f => ({ ...f, currency: e.target.value }))}>
                                        <option value="TWD">TWD</option>
                                        <option value="USD">USD</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="detail-label">{zh ? '狀態' : 'Status'}</label>
                                    <select className="select" style={{ width: '100%' }} value={payForm.status || 'paid'} onChange={e => setPayForm(f => ({ ...f, status: e.target.value }))}>
                                        <option value="paid">{zh ? '已付' : 'Paid'}</option>
                                        <option value="pending">{zh ? '待付' : 'Pending'}</option>
                                        <option value="failed">{zh ? '失敗' : 'Failed'}</option>
                                        <option value="refunded">{zh ? '退款' : 'Refunded'}</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="detail-label">{zh ? '付款方式' : 'Method'}</label>
                                    <select className="select" style={{ width: '100%' }} value={payForm.payment_method || 'bank_transfer'} onChange={e => setPayForm(f => ({ ...f, payment_method: e.target.value }))}>
                                        <option value="bank_transfer">{zh ? '銀行轉帳' : 'Bank Transfer'}</option>
                                        <option value="credit_card">{zh ? '信用卡' : 'Credit Card'}</option>
                                        <option value="cash">{zh ? '現金' : 'Cash'}</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="detail-label">{zh ? '發票號碼' : 'Invoice #'}</label>
                                    <input className="input-field" value={payForm.invoice_number || ''} onChange={e => setPayForm(f => ({ ...f, invoice_number: e.target.value }))} />
                                </div>
                                <div>
                                    <label className="detail-label">{zh ? '付款日期' : 'Paid At'}</label>
                                    <input type="date" className="input-field" value={payForm.paid_at?.slice(0, 10) || new Date().toISOString().slice(0, 10)} onChange={e => setPayForm(f => ({ ...f, paid_at: e.target.value }))} />
                                </div>
                                <div style={{ gridColumn: '1/-1' }}>
                                    <label className="detail-label">{zh ? '備註' : 'Notes'}</label>
                                    <input className="input-field" value={payForm.notes || ''} onChange={e => setPayForm(f => ({ ...f, notes: e.target.value }))} />
                                </div>
                                <div style={{ gridColumn: '1/-1' }}>
                                    <button className="btn btn-primary btn-sm" onClick={handleSavePayment}>💾 {zh ? '儲存' : 'Save'}</button>
                                </div>
                            </div>
                        )}

                        <div style={{ padding: '4px 0' }}>
                            {payments.length === 0
                                ? <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '30px', fontSize: '13px' }}>{zh ? '尚無付款紀錄' : 'No payments yet'}</p>
                                : <table className="data-table" style={{ fontSize: '12px' }}>
                                    <thead><tr>
                                        <th>{zh ? '日期' : 'Date'}</th>
                                        <th>{zh ? '金額' : 'Amount'}</th>
                                        <th>{zh ? '方式' : 'Method'}</th>
                                        <th>{zh ? '狀態' : 'Status'}</th>
                                        <th>{zh ? '發票' : 'Invoice'}</th>
                                    </tr></thead>
                                    <tbody>
                                        {payments.map(p => (
                                            <tr key={p.id}>
                                                <td>{p.paid_at ? new Date(p.paid_at).toLocaleDateString('zh-TW') : '—'}</td>
                                                <td style={{ fontWeight: 600 }}>{p.currency} {p.amount.toLocaleString()}</td>
                                                <td style={{ color: 'var(--text-muted)' }}>{p.payment_method || '—'}</td>
                                                <td><span style={{ fontSize: '10px', padding: '1px 6px', borderRadius: '4px', fontWeight: 600, background: payStatusColors[p.status]?.bg, color: payStatusColors[p.status]?.color }}>{p.status}</span></td>
                                                <td style={{ fontFamily: 'monospace', fontSize: '11px' }}>{p.invoice_number || '—'}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            }
                        </div>
                    </div>

                </div>
            )}
        </div>
    );
}

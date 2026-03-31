import { t, getLocale } from '../../lib/i18n';
import {
    getColor, getInitials, getTypeLabel,
    SPECIAL_IDENTITY_OPTIONS,
} from '../../lib/employeeHelpers';
import type { Employee, EditForm, Store, Company, Department } from '../../types/employees';

interface EmployeeEditCardProps {
    selected: Employee;
    employees: Employee[];
    stores: Store[];
    companies: Company[];
    departments: Department[];
    editForm: EditForm | null;
    isDirty: boolean;
    patchForm: (patch: Partial<EditForm>) => void;
    saveEmployee: () => Promise<void>;
    onClose: () => void;
    generateCertificate: (emp: Employee) => void;
    doTransfer: (emp: Employee) => Promise<void>;
}

export function EmployeeEditCard({
    selected, employees, stores, companies, departments,
    editForm, isDirty, patchForm, saveEmployee,
    onClose, generateCertificate, doTransfer,
}: EmployeeEditCardProps) {
    const zh = getLocale() === 'zh-TW';
    const typeLabel = getTypeLabel(zh);

    return (
        <div className="card" style={{ position: 'sticky', top: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
                <div style={{ display: 'flex', gap: '14px', alignItems: 'center' }}>
                    <div style={{
                        width: '56px', height: '56px', borderRadius: '50%', background: getColor(selected.name),
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontWeight: 700, fontSize: '22px', color: '#fff',
                    }}>{getInitials(selected.name)}</div>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <h3 style={{ fontSize: '18px', fontWeight: 600 }}>{selected.name}</h3>
                            {selected.employee_number && <span style={{ fontSize: '11px', color: 'var(--accent-primary)', fontWeight: 600, fontFamily: 'monospace', background: 'var(--accent-primary-dim)', padding: '1px 8px', borderRadius: '4px' }}>{selected.employee_number}</span>}
                            {selected.probation_end_date && new Date(selected.probation_end_date) >= new Date() && (() => {
                                const days = Math.ceil((new Date(selected.probation_end_date!).getTime() - Date.now()) / 86400000);
                                const color = days <= 7 ? '#f59e0b' : '#22c55e';
                                return <span style={{ fontSize: '11px', fontWeight: 600, padding: '1px 8px', borderRadius: '4px', background: color + '22', color }}>{zh ? `試用中 (剩${days}天)` : `Probation (${days}d left)`}</span>;
                            })()}
                        </div>
                        <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                            {selected.position || (zh ? '\u672a\u8a2d\u5b9a\u8077\u4f4d' : 'No position')} {'\u00B7'} {typeLabel[selected.employee_type]}
                        </div>
                    </div>
                </div>
                <button className="btn btn-sm btn-secondary" onClick={onClose}>{'\u2715'}</button>
            </div>

            {editForm && (
            <div style={{ display: 'grid', gap: '12px' }}>
                <div>
                    <label className="detail-label">{t('employee.type')}</label>
                    <select className="input-field" value={editForm.employee_type} onChange={e => patchForm({ employee_type: e.target.value })}>
                        <option value="full_time">{typeLabel.full_time}</option>
                        <option value="part_time">{typeLabel.part_time}</option>
                        <option value="contract">{typeLabel.contract}</option>
                    </select>
                </div>
                <div style={{ gridColumn: '1/-1' }}>
                    <label className="detail-label">{t('employee.store')} ({zh ? '可多選' : 'multi-select'})</label>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '4px' }}>
                        {stores.map(s => {
                            const checked = editForm.store_ids.includes(s.id);
                            return (
                                <label key={s.id} style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '4px 10px', borderRadius: '6px', border: `1px solid ${checked ? 'var(--accent-primary)' : 'var(--border-color)'}`, background: checked ? 'var(--accent-primary-dim)' : 'var(--bg-secondary)', cursor: 'pointer', fontSize: '12px', fontWeight: checked ? 600 : 400 }}>
                                    <input type="checkbox" checked={checked} style={{ accentColor: 'var(--accent-primary)' }}
                                        onChange={() => patchForm({ store_ids: checked ? editForm.store_ids.filter(id => id !== s.id) : [...editForm.store_ids, s.id] })} />
                                    {s.name}
                                    {editForm.store_ids[0] === s.id && <span style={{ fontSize: '9px', color: 'var(--accent-primary)', marginLeft: '2px' }}>★</span>}
                                </label>
                            );
                        })}
                        {stores.length === 0 && <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>{zh ? '尚無門市' : 'No stores'}</span>}
                    </div>
                    {editForm.store_ids.length > 1 && <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '4px' }}>★ {zh ? '為主要門市（第一個勾選）' : 'Primary store (first selected)'}</div>}
                </div>
                <div>
                    <label className="detail-label">{zh ? '公司' : 'Company'}</label>
                    <select className="input-field" value={editForm.company_id} onChange={e => {
                        const newCid = e.target.value;
                        const deptOk = departments.find(d => d.id === editForm.department_id && d.company_id === newCid);
                        patchForm({ company_id: newCid, ...(!deptOk ? { department_id: '', department: '' } : {}) });
                    }}>
                        <option value="">{zh ? '未指派' : 'Unassigned'}</option>
                        {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                </div>
                <div>
                    <label className="detail-label">{zh ? '部門' : 'Department'}</label>
                    <select className="input-field" value={editForm.department_id} onChange={e => patchForm({ department_id: e.target.value, department: departments.find(d => d.id === e.target.value)?.name || '' })}>
                        <option value="">{zh ? '— 未指派 —' : '— None —'}</option>
                        {(editForm.company_id ? departments.filter(d => d.company_id === editForm.company_id) : departments).map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                    </select>
                </div>
                <div>
                    <label className="detail-label">{t('employee.position')}</label>
                    <input className="input-field" list="edit-positions-list" value={editForm.position} onChange={e => patchForm({ position: e.target.value })} placeholder={zh ? '輸入或選擇職位' : 'Enter or select position'} />
                    <datalist id="edit-positions-list">
                        {Array.from(new Set(employees.map(e => e.position).filter(Boolean))).map(p => (
                            <option key={p as string} value={p as string} />
                        ))}
                    </datalist>
                </div>
                <div>
                    <label className="detail-label">{zh ? '直屬主管' : 'Reporting To'}</label>
                    <select className="input-field" value={editForm.reporting_to} onChange={e => patchForm({ reporting_to: e.target.value })}>
                        <option value="">{zh ? '— 未指派 —' : '— None —'}</option>
                        {employees.filter(e => e.id !== selected?.id && (e.is_manager || e.is_line_manager)).map(e => <option key={e.id} value={e.id}>{e.name}{e.position ? ` (${e.position})` : ''}</option>)}
                        {employees.filter(e => e.id !== selected?.id && !e.is_manager && !e.is_line_manager).length > 0 && (
                            <optgroup label={zh ? '其他員工' : 'Other employees'}>
                                {employees.filter(e => e.id !== selected?.id && !e.is_manager && !e.is_line_manager).map(e => <option key={e.id} value={e.id}>{e.name}{e.position ? ` (${e.position})` : ''}</option>)}
                            </optgroup>
                        )}
                    </select>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div>
                        <label className="detail-label">{t('employee.wage')} (NT$)</label>
                        <input className="input-field" type="number" value={editForm.hourly_wage} onChange={e => patchForm({ hourly_wage: e.target.value })} />
                    </div>
                    <div>
                        <label className="detail-label">{t('employee.max_hours')}</label>
                        <input className="input-field" type="number" value={editForm.max_hours_per_week} onChange={e => patchForm({ max_hours_per_week: e.target.value })} />
                    </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div>
                        <label className="detail-label">{t('employee.phone')}</label>
                        <input className="input-field" value={editForm.phone} onChange={e => patchForm({ phone: e.target.value })} />
                    </div>
                    <div>
                        <label className="detail-label">{t('employee.hire_date')}</label>
                        <input className="input-field" type="date" value={editForm.hire_date} onChange={e => patchForm({ hire_date: e.target.value })} />
                    </div>
                </div>
                <div>
                    <label className="detail-label">{zh ? '狀態' : 'Status'}</label>
                    <select className="input-field" value={editForm.status} onChange={e => patchForm({ status: e.target.value })}>
                        <option value="active">{zh ? '在職' : 'Active'}</option>
                        <option value="inactive">{zh ? '離職' : 'Inactive'}</option>
                    </select>
                </div>
                {/* ── Names ── */}
                <div style={{ borderTop: '1px solid var(--outline-variant)', paddingTop: '12px' }}>
                    <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>👤 {zh ? '姓名' : 'Names'}</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                        <div><label className="detail-label">{zh ? '姓' : 'Last Name'}</label><input className="input-field" value={editForm.last_name} onChange={e => patchForm({ last_name: e.target.value })} /></div>
                        <div><label className="detail-label">{zh ? '名' : 'First Name'}</label><input className="input-field" value={editForm.first_name} onChange={e => patchForm({ first_name: e.target.value })} /></div>
                        <div><label className="detail-label">{zh ? '英文名' : 'English Name'}</label><input className="input-field" value={editForm.english_name} onChange={e => patchForm({ english_name: e.target.value })} /></div>
                        <div><label className="detail-label">{zh ? '職等' : 'Job Grade'}</label><input className="input-field" value={editForm.job_grade} onChange={e => patchForm({ job_grade: e.target.value })} placeholder="M1 / S3" /></div>
                    </div>
                </div>
                {/* ── Personal ── */}
                <div style={{ borderTop: '1px solid var(--outline-variant)', paddingTop: '12px' }}>
                    <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>📋 {zh ? '個人資料' : 'Personal Info'}</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                        <div><label className="detail-label">{zh ? '出生日期' : 'Birth Date'}</label><input className="input-field" type="date" value={editForm.birth_date} onChange={e => patchForm({ birth_date: e.target.value })} /></div>
                        <div><label className="detail-label">{zh ? '性別' : 'Gender'}</label>
                            <select className="input-field" value={editForm.gender} onChange={e => patchForm({ gender: e.target.value })}>
                                <option value="">{zh ? '— 請選擇 —' : '— Select —'}</option>
                                <option value="male">{zh ? '男' : 'Male'}</option>
                                <option value="female">{zh ? '女' : 'Female'}</option>
                                <option value="other">{zh ? '其他' : 'Other'}</option>
                            </select>
                        </div>
                        <div><label className="detail-label">{zh ? '國籍' : 'Nationality'}</label><input className="input-field" value={editForm.nationality} onChange={e => patchForm({ nationality: e.target.value })} /></div>
                        <div><label className="detail-label">{zh ? '身分證字號' : 'ID Number'}</label><input className="input-field" value={editForm.id_number} onChange={e => patchForm({ id_number: e.target.value })} /></div>
                        <div style={{ gridColumn: '1/-1' }}><label className="detail-label">{zh ? '地址' : 'Address'}</label><input className="input-field" value={editForm.address} onChange={e => patchForm({ address: e.target.value })} /></div>
                        <div><label className="detail-label">{zh ? '試用期結束' : 'Probation End'}</label><input className="input-field" type="date" value={editForm.probation_end_date} onChange={e => patchForm({ probation_end_date: e.target.value })} /></div>
                        <div><label className="detail-label">{zh ? '離職日期' : 'Resign Date'}</label><input className="input-field" type="date" value={editForm.resign_date} onChange={e => patchForm({ resign_date: e.target.value })} /></div>
                        <div style={{ gridColumn: '1/-1' }}><label className="detail-label">{zh ? '離職原因' : 'Termination Reason'}</label><input className="input-field" value={editForm.termination_reason} onChange={e => patchForm({ termination_reason: e.target.value })} /></div>
                    </div>
                </div>
                {/* ── Emergency Contact ── */}
                <div style={{ borderTop: '1px solid var(--outline-variant)', paddingTop: '12px' }}>
                    <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>🚨 {zh ? '緊急聯絡人' : 'Emergency Contact'}</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                        <div><label className="detail-label">{zh ? '姓名' : 'Name'}</label><input className="input-field" value={editForm.emergency_contact_name} onChange={e => patchForm({ emergency_contact_name: e.target.value })} /></div>
                        <div><label className="detail-label">{zh ? '電話' : 'Phone'}</label><input className="input-field" value={editForm.emergency_contact_phone} onChange={e => patchForm({ emergency_contact_phone: e.target.value })} /></div>
                    </div>
                </div>
                {/* ── Banking ── */}
                <div style={{ borderTop: '1px solid var(--outline-variant)', paddingTop: '12px' }}>
                    <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>🏦 {zh ? '銀行帳戶' : 'Bank Account'}</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '10px' }}>
                        <div><label className="detail-label">{zh ? '銀行代碼' : 'Bank Code'}</label><input className="input-field" value={editForm.bank_code} onChange={e => patchForm({ bank_code: e.target.value })} placeholder="004" /></div>
                        <div><label className="detail-label">{zh ? '帳號' : 'Account No.'}</label><input className="input-field" value={editForm.bank_account} onChange={e => patchForm({ bank_account: e.target.value })} /></div>
                    </div>
                </div>
                {/* ── Foreign Worker / Work Permit ── */}
                {selected.nationality && selected.nationality !== 'TW' && (
                <div style={{ borderTop: '1px solid var(--outline-variant)', paddingTop: '12px' }}>
                    <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>🛂 {zh ? '工作證資訊' : 'Work Permit'}</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                        <div><label className="detail-label">{zh ? '工作證號碼' : 'Permit Number'}</label><input className="input-field" value={(editForm as any).work_permit_number || ''} onChange={e => patchForm({ work_permit_number: e.target.value } as any)} /></div>
                        <div><label className="detail-label">{zh ? '到期日' : 'Permit Expiry'}</label><input className="input-field" type="date" value={(editForm as any).work_permit_expiry || ''} onChange={e => patchForm({ work_permit_expiry: e.target.value } as any)} /></div>
                    </div>
                </div>
                )}
                {/* ── Insurance ── */}
                <div style={{ borderTop: '1px solid var(--outline-variant)', paddingTop: '12px' }}>
                    <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>🏥 {zh ? '勞健保' : 'Insurance'}</div>
                    <div style={{ display: 'grid', gap: '10px' }}>
                        {/* 勞保 */}
                        <div style={{ padding: '10px', background: 'var(--bg-secondary)', borderRadius: '8px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                                <span style={{ fontSize: '13px', fontWeight: 600 }}>{zh ? '勞工保險' : 'Labor Insurance'}</span>
                                <button onClick={() => patchForm({ labor_ins_enrolled: !editForm.labor_ins_enrolled })} style={{ width: '40px', height: '22px', borderRadius: '11px', border: 'none', cursor: 'pointer', background: editForm.labor_ins_enrolled ? 'var(--accent-primary)' : 'var(--border-color)', position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}>
                                    <span style={{ position: 'absolute', top: '2px', left: editForm.labor_ins_enrolled ? '20px' : '2px', width: '18px', height: '18px', borderRadius: '50%', background: '#fff', transition: 'left 0.2s' }} />
                                </button>
                            </div>
                            {editForm.labor_ins_enrolled && (
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
                                    <div><label className="detail-label">{zh ? '投保級距' : 'Grade'}</label><input className="input-field" type="number" value={editForm.labor_ins_grade} onChange={e => patchForm({ labor_ins_grade: e.target.value })} /></div>
                                    <div><label className="detail-label">{zh ? '加保日期' : 'Enrolled'}</label><input className="input-field" type="date" value={editForm.labor_ins_enrolled_date} onChange={e => patchForm({ labor_ins_enrolled_date: e.target.value })} /></div>
                                    <div><label className="detail-label">{zh ? '退保日期' : 'Withdrawn'}</label><input className="input-field" type="date" value={editForm.labor_ins_withdraw_date} onChange={e => patchForm({ labor_ins_withdraw_date: e.target.value })} /></div>
                                </div>
                            )}
                        </div>
                        {/* 健保 */}
                        <div style={{ padding: '10px', background: 'var(--bg-secondary)', borderRadius: '8px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                                <span style={{ fontSize: '13px', fontWeight: 600 }}>{zh ? '全民健康保險' : 'Health Insurance'}</span>
                                <button onClick={() => patchForm({ health_ins_enrolled: !editForm.health_ins_enrolled })} style={{ width: '40px', height: '22px', borderRadius: '11px', border: 'none', cursor: 'pointer', background: editForm.health_ins_enrolled ? 'var(--accent-primary)' : 'var(--border-color)', position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}>
                                    <span style={{ position: 'absolute', top: '2px', left: editForm.health_ins_enrolled ? '20px' : '2px', width: '18px', height: '18px', borderRadius: '50%', background: '#fff', transition: 'left 0.2s' }} />
                                </button>
                            </div>
                            {editForm.health_ins_enrolled && (
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                                    <div><label className="detail-label">{zh ? '投保級距' : 'Grade'}</label><input className="input-field" type="number" value={editForm.health_ins_grade} onChange={e => patchForm({ health_ins_grade: e.target.value })} /></div>
                                    <div><label className="detail-label">{zh ? '加保日期' : 'Enrolled'}</label><input className="input-field" type="date" value={editForm.health_ins_enrolled_date} onChange={e => patchForm({ health_ins_enrolled_date: e.target.value })} /></div>
                                </div>
                            )}
                        </div>
                        {/* 勞退 */}
                        <div style={{ padding: '10px', background: 'var(--bg-secondary)', borderRadius: '8px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <span style={{ fontSize: '13px', fontWeight: 600 }}>{zh ? '勞工退休金' : 'Labor Pension'}</span>
                                <button onClick={() => patchForm({ labor_pension_enrolled: !editForm.labor_pension_enrolled })} style={{ width: '40px', height: '22px', borderRadius: '11px', border: 'none', cursor: 'pointer', background: editForm.labor_pension_enrolled ? 'var(--accent-primary)' : 'var(--border-color)', position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}>
                                    <span style={{ position: 'absolute', top: '2px', left: editForm.labor_pension_enrolled ? '20px' : '2px', width: '18px', height: '18px', borderRadius: '50%', background: '#fff', transition: 'left 0.2s' }} />
                                </button>
                            </div>
                            {editForm.labor_pension_enrolled && (
                                <div style={{ marginTop: '8px' }}><label className="detail-label">{zh ? '提繳率 (%)' : 'Rate (%)'}</label><input className="input-field" type="number" step="0.5" value={editForm.labor_pension_rate} onChange={e => patchForm({ labor_pension_rate: e.target.value })} /></div>
                            )}
                        </div>
                    </div>
                </div>
                {/* ── Special Employment Identity ── */}
                <div style={{ borderTop: '1px solid var(--outline-variant)', paddingTop: '12px' }}>
                    <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        🏷️ {zh ? '特殊身分類別' : 'Special Identity'}
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                        {SPECIAL_IDENTITY_OPTIONS.map(opt => {
                            const checked = editForm.special_identities.includes(opt.value);
                            return (
                                <label key={opt.value} style={{
                                    display: 'flex', alignItems: 'center', gap: '5px',
                                    padding: '4px 10px', borderRadius: '6px',
                                    border: `1px solid ${checked ? 'var(--accent-primary)' : 'var(--border-color)'}`,
                                    background: checked ? 'var(--accent-primary-dim)' : 'var(--bg-secondary)',
                                    cursor: 'pointer', fontSize: '12px', fontWeight: checked ? 600 : 400,
                                }}>
                                    <input type="checkbox" checked={checked} style={{ accentColor: 'var(--accent-primary)' }}
                                        onChange={() => patchForm({
                                            special_identities: checked
                                                ? editForm.special_identities.filter(v => v !== opt.value)
                                                : [...editForm.special_identities, opt.value]
                                        })} />
                                    {zh ? opt.zh : opt.en}
                                </label>
                            );
                        })}
                    </div>
                    {editForm.special_identities.length > 0 && (
                        <div style={{ marginTop: '6px', fontSize: '11px', color: 'var(--text-secondary)' }}>
                            {zh ? `已選 ${editForm.special_identities.length} 項身分類別` : `${editForm.special_identities.length} identity(ies) selected`}
                        </div>
                    )}
                </div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', paddingTop: '4px', flexWrap: 'wrap' }}>
                    <button className="btn btn-primary" onClick={saveEmployee} disabled={!isDirty} style={{ opacity: isDirty ? 1 : 0.45 }}>
                        {zh ? '更新員工資料' : 'Update Employee'}
                    </button>
                    <button className="btn btn-secondary btn-sm" onClick={() => generateCertificate(selected)}>
                        📄 {zh ? '服務證明' : 'Certificate'}
                    </button>
                    <button className="btn btn-secondary btn-sm" onClick={() => doTransfer(selected)}>
                        🔄 {zh ? '跨店調動' : 'Transfer'}
                    </button>
                    {isDirty && (
                        <span style={{ fontSize: '12px', color: 'var(--accent-warning, #f59e0b)' }}>
                            ● {zh ? '有未儲存的變更' : 'Unsaved changes'}
                        </span>
                    )}
                </div>
            </div>
            )}
        </div>
    );
}

import { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { t, getLocale } from '../../lib/i18n';
import { useOrg } from '../../lib/OrgContext';
import { SPECIAL_IDENTITY_OPTIONS, getTypeLabel, EMPTY_CREATE_FORM } from '../../lib/employeeHelpers';
import type { Employee, Store, Company, Department, CreateForm } from '../../types/employees';

interface EmployeeCreateFormProps {
    stores: Store[];
    companies: Company[];
    departments: Department[];
    employees: Employee[];
    onClose: () => void;
    onCreated: () => Promise<void>;
}

export function EmployeeCreateForm({ stores, companies, departments, employees, onClose, onCreated }: EmployeeCreateFormProps) {
    const zh = getLocale() === 'zh-TW';
    const { orgId } = useOrg();
    const typeLabel = getTypeLabel(zh);

    const [form, setForm] = useState<CreateForm>({ ...EMPTY_CREATE_FORM });
    const [createError, setCreateError] = useState('');

    const createEmployee = async () => {
        // BUG-01 FIX: validate name before insert
        if (!form.name) { setCreateError(zh ? '姓名為必填欄位' : 'Name is required'); return; }
        const primaryStore = form.store_ids[0] || null;
        // Auto-generate employee number
        const { data: maxNum } = await supabase.from('users').select('employee_number').eq('organization_id', orgId).not('employee_number', 'is', null).order('employee_number', { ascending: false }).limit(1);
        const lastNum = maxNum?.[0]?.employee_number?.replace('EMP-', '') || '000';
        const nextNum = 'EMP-' + String(parseInt(lastNum, 10) + 1).padStart(3, '0');
        const { data: newUser } = await supabase.from('users').insert({
            organization_id: orgId,
            name: form.name, email: form.email || null, phone: form.phone || null,
            employee_type: form.employee_type, store_id: primaryStore,
            company_id: form.company_id || null,
            department_id: form.department_id || null,
            department: departments.find(d => d.id === form.department_id)?.name || null,
            position: form.position || null, hourly_wage: form.hourly_wage ? Number(form.hourly_wage) : null,
            max_hours_per_week: Number(form.max_hours_per_week) || 40,
            hire_date: form.hire_date || null,
            first_name: form.first_name || null, last_name: form.last_name || null, english_name: form.english_name || null,
            id_number: form.id_number || null, birth_date: form.birth_date || null,
            gender: form.gender || null, nationality: form.nationality || null, address: form.address || null,
            emergency_contact_name: form.emergency_contact_name || null,
            emergency_contact_phone: form.emergency_contact_phone || null,
            reporting_to: form.reporting_to || null,
            job_grade: form.job_grade || null, probation_end_date: form.probation_end_date || null,
            bank_code: form.bank_code || null, bank_account: form.bank_account || null,
            special_identities: form.special_identities,
            employee_number: nextNum,
        }).select('id').single();
        if (newUser && form.store_ids.length > 0) {
            await supabase.from('user_stores').insert(
                form.store_ids.map((sid, i) => ({ user_id: newUser.id, store_id: sid, is_primary: i === 0 }))
            );
        }
        // OE-2: Auto-create onboarding tasks from template
        if (newUser) {
            const { data: templates } = await supabase.from('onboarding_templates').select('id, items')
                .eq('organization_id', orgId).eq('type', 'onboarding');
            if (templates && templates.length > 0) {
                const hireDate = form.hire_date ? new Date(form.hire_date + 'T00:00:00') : new Date();
                const tasks = templates.flatMap((tmpl: any) =>
                    (tmpl.items as any[]).map((item: any, idx: number) => ({
                        organization_id: orgId, user_id: newUser.id, template_id: tmpl.id,
                        type: 'onboarding', title: item.title, description: item.description || null,
                        due_date: item.due_days ? new Date(hireDate.getTime() + item.due_days * 86400000).toISOString().split('T')[0] : null,
                        sort_order: idx,
                    }))
                );
                if (tasks.length > 0) await supabase.from('onboarding_tasks').insert(tasks);
            }
        }
        setForm({ ...EMPTY_CREATE_FORM });
        setCreateError('');
        onClose();
        await onCreated();
    };

    return (
        <div className="card" style={{ marginBottom: '20px' }}>
            <h3 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '16px' }}>{'\u2795'} {t('employee.create')}</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '12px' }}>
                <div>
                    <label className="detail-label">{t('employee.name')} *</label>
                    <input className="input-field" value={form.name} onChange={e => { setForm({ ...form, name: e.target.value }); setCreateError(''); }} placeholder={zh ? '\u59d3\u540d' : 'Name'} />
                    {createError && <span style={{ color: 'var(--color-error, #ef4444)', fontSize: '12px' }}>{createError}</span>}
                </div>
                <div>
                    <label className="detail-label">Email</label>
                    <input className="input-field" type="email" name="email" autoComplete="email" spellCheck={false} value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="email@example.com" />
                </div>
                <div>
                    <label className="detail-label">{t('employee.phone')}</label>
                    <input className="input-field" type="tel" name="phone" autoComplete="tel" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="0912-345-678" />
                </div>
                <div>
                    <label className="detail-label">{t('employee.type')}</label>
                    <select className="input-field" value={form.employee_type} onChange={e => setForm({ ...form, employee_type: e.target.value })}>
                        <option value="full_time">{typeLabel.full_time}</option>
                        <option value="part_time">{typeLabel.part_time}</option>
                        <option value="contract">{typeLabel.contract}</option>
                    </select>
                </div>
                <div style={{ gridColumn: '1/-1' }}>
                    <label className="detail-label">{t('employee.store')} ({zh ? '可多選' : 'multi-select'})</label>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '4px' }}>
                        {stores.map(s => {
                            const checked = form.store_ids.includes(s.id);
                            return (
                                <label key={s.id} style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '4px 10px', borderRadius: '6px', border: `1px solid ${checked ? 'var(--accent-primary)' : 'var(--border-color)'}`, background: checked ? 'var(--accent-primary-dim)' : 'var(--bg-secondary)', cursor: 'pointer', fontSize: '12px', fontWeight: checked ? 600 : 400 }}>
                                    <input type="checkbox" checked={checked} style={{ accentColor: 'var(--accent-primary)' }}
                                        onChange={() => setForm(f => ({ ...f, store_ids: checked ? f.store_ids.filter(id => id !== s.id) : [...f.store_ids, s.id] }))} />
                                    {s.name}
                                </label>
                            );
                        })}
                        {stores.length === 0 && <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>{zh ? '尚無門市' : 'No stores'}</span>}
                    </div>
                </div>
                <div>
                    <label className="detail-label">{zh ? '公司' : 'Company'}</label>
                    <select className="input-field" value={form.company_id} onChange={e => {
                        const newCid = e.target.value;
                        const deptOk = departments.find(d => d.id === form.department_id && d.company_id === newCid);
                        setForm({ ...form, company_id: newCid, department_id: deptOk ? form.department_id : '' });
                    }}>
                        <option value="">{zh ? '\u672a\u6307\u6d3e' : 'Unassigned'}</option>
                        {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                </div>
                <div>
                    <label className="detail-label">{zh ? '部門' : 'Department'}</label>
                    <select className="input-field" value={form.department_id} onChange={e => setForm({ ...form, department_id: e.target.value })}>
                        <option value="">{zh ? '— 未指派 —' : '— None —'}</option>
                        {(form.company_id ? departments.filter(d => d.company_id === form.company_id) : departments).map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                    </select>
                </div>
                <div>
                    <label className="detail-label">{t('employee.position')}</label>
                    <input className="input-field" list="positions-list" value={form.position} onChange={e => setForm({ ...form, position: e.target.value })} placeholder={zh ? '\u8F38\u5165\u6216\u9078\u64C7\u8077\u4F4D' : 'Enter or select position'} />
                    <datalist id="positions-list">
                        {Array.from(new Set(employees.map(e => e.position).filter(Boolean))).map(p => (
                            <option key={p as string} value={p as string} />
                        ))}
                    </datalist>
                </div>
                <div>
                    <label className="detail-label">{zh ? '直屬主管' : 'Reporting To'}</label>
                    <select className="input-field" value={form.reporting_to} onChange={e => setForm({ ...form, reporting_to: e.target.value })}>
                        <option value="">{zh ? '— 未指派 —' : '— None —'}</option>
                        {employees.filter(e => e.is_manager || e.is_line_manager).map(e => <option key={e.id} value={e.id}>{e.name}{e.position ? ` (${e.position})` : ''}</option>)}
                        {employees.filter(e => !e.is_manager && !e.is_line_manager).length > 0 && (
                            <optgroup label={zh ? '其他員工' : 'Other employees'}>
                                {employees.filter(e => !e.is_manager && !e.is_line_manager).map(e => <option key={e.id} value={e.id}>{e.name}{e.position ? ` (${e.position})` : ''}</option>)}
                            </optgroup>
                        )}
                    </select>
                </div>
                <div>
                    <label className="detail-label">{t('employee.wage')} (NT$)</label>
                    <input className="input-field" type="number" value={form.hourly_wage} onChange={e => setForm({ ...form, hourly_wage: e.target.value })} placeholder="183" />
                </div>
                <div>
                    <label className="detail-label">{t('employee.max_hours')}</label>
                    <input className="input-field" type="number" value={form.max_hours_per_week} onChange={e => setForm({ ...form, max_hours_per_week: e.target.value })} placeholder="40" />
                </div>
                <div>
                    <label className="detail-label">{t('employee.hire_date')}</label>
                    <input className="input-field" type="date" value={form.hire_date} onChange={e => setForm({ ...form, hire_date: e.target.value })} />
                </div>
            </div>

            {/* Name fields */}
            <div style={{ borderTop: '1px solid var(--outline-variant)', marginTop: '14px', paddingTop: '14px' }}>
                <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>👤 {zh ? '姓名欄位' : 'Name Fields'}</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '12px' }}>
                    <div><label className="detail-label">{zh ? '姓' : 'Last Name'}</label><input className="input-field" value={form.last_name} onChange={e => setForm({ ...form, last_name: e.target.value })} placeholder={zh ? '王' : 'Smith'} /></div>
                    <div><label className="detail-label">{zh ? '名' : 'First Name'}</label><input className="input-field" value={form.first_name} onChange={e => setForm({ ...form, first_name: e.target.value })} placeholder={zh ? '小明' : 'John'} /></div>
                    <div><label className="detail-label">{zh ? '英文名' : 'English Name'}</label><input className="input-field" value={form.english_name} onChange={e => setForm({ ...form, english_name: e.target.value })} placeholder="John Smith" /></div>
                    <div><label className="detail-label">{zh ? '職等' : 'Job Grade'}</label><input className="input-field" value={form.job_grade} onChange={e => setForm({ ...form, job_grade: e.target.value })} placeholder="M1 / S3" /></div>
                </div>
            </div>

            {/* Personal info */}
            <div style={{ borderTop: '1px solid var(--outline-variant)', marginTop: '14px', paddingTop: '14px' }}>
                <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>📋 {zh ? '個人資料' : 'Personal Info'}</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '12px' }}>
                    <div><label className="detail-label">{zh ? '出生日期' : 'Birth Date'}</label><input className="input-field" type="date" value={form.birth_date} onChange={e => setForm({ ...form, birth_date: e.target.value })} /></div>
                    <div><label className="detail-label">{zh ? '性別' : 'Gender'}</label>
                        <select className="input-field" value={form.gender} onChange={e => setForm({ ...form, gender: e.target.value })}>
                            <option value="">{zh ? '— 請選擇 —' : '— Select —'}</option>
                            <option value="male">{zh ? '男' : 'Male'}</option>
                            <option value="female">{zh ? '女' : 'Female'}</option>
                            <option value="other">{zh ? '其他' : 'Other'}</option>
                        </select>
                    </div>
                    <div><label className="detail-label">{zh ? '國籍' : 'Nationality'}</label><input className="input-field" value={form.nationality} onChange={e => setForm({ ...form, nationality: e.target.value })} placeholder="TW" /></div>
                    <div><label className="detail-label">{zh ? '身分證字號' : 'ID Number'}</label><input className="input-field" value={form.id_number} onChange={e => setForm({ ...form, id_number: e.target.value })} placeholder="A123456789" /></div>
                    <div style={{ gridColumn: '1/-1' }}><label className="detail-label">{zh ? '地址' : 'Address'}</label><input className="input-field" value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} placeholder={zh ? '縣市 + 鄉鎮市區 + 路街…' : 'Full address'} /></div>
                </div>
            </div>

            {/* Emergency contact */}
            <div style={{ borderTop: '1px solid var(--outline-variant)', marginTop: '14px', paddingTop: '14px' }}>
                <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>🚨 {zh ? '緊急聯絡人' : 'Emergency Contact'}</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div><label className="detail-label">{zh ? '姓名' : 'Name'}</label><input className="input-field" value={form.emergency_contact_name} onChange={e => setForm({ ...form, emergency_contact_name: e.target.value })} placeholder={zh ? '緊急聯絡人姓名' : 'Contact name'} /></div>
                    <div><label className="detail-label">{zh ? '電話' : 'Phone'}</label><input className="input-field" value={form.emergency_contact_phone} onChange={e => setForm({ ...form, emergency_contact_phone: e.target.value })} placeholder="0912-345-678" /></div>
                </div>
            </div>

            {/* Banking */}
            <div style={{ borderTop: '1px solid var(--outline-variant)', marginTop: '14px', paddingTop: '14px' }}>
                <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>🏦 {zh ? '銀行帳戶' : 'Bank Account'}</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '12px' }}>
                    <div><label className="detail-label">{zh ? '銀行代碼' : 'Bank Code'}</label><input className="input-field" value={form.bank_code} onChange={e => setForm({ ...form, bank_code: e.target.value })} placeholder="004" /></div>
                    <div><label className="detail-label">{zh ? '帳號' : 'Account No.'}</label><input className="input-field" value={form.bank_account} onChange={e => setForm({ ...form, bank_account: e.target.value })} placeholder="1234567890123" /></div>
                </div>
            </div>

            {/* Special Employment Identity */}
            <div style={{ borderTop: '1px solid var(--outline-variant)', marginTop: '14px', paddingTop: '14px' }}>
                <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    🏷️ {zh ? '特殊身分類別' : 'Special Employment Identity'}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {SPECIAL_IDENTITY_OPTIONS.map(opt => {
                        const checked = form.special_identities.includes(opt.value);
                        return (
                            <label key={opt.value} style={{
                                display: 'flex', alignItems: 'center', gap: '5px',
                                padding: '4px 10px', borderRadius: '6px',
                                border: `1px solid ${checked ? 'var(--accent-primary)' : 'var(--border-color)'}`,
                                background: checked ? 'var(--accent-primary-dim)' : 'var(--bg-secondary)',
                                cursor: 'pointer', fontSize: '12px', fontWeight: checked ? 600 : 400,
                            }}>
                                <input type="checkbox" checked={checked} style={{ accentColor: 'var(--accent-primary)' }}
                                    onChange={() => setForm(f => ({
                                        ...f,
                                        special_identities: checked
                                            ? f.special_identities.filter(v => v !== opt.value)
                                            : [...f.special_identities, opt.value]
                                    }))} />
                                {zh ? opt.zh : opt.en}
                            </label>
                        );
                    })}
                </div>
                <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '6px' }}>
                    {zh ? '依「就業服務法」及「身心障礙者權益保障法」定義之特殊身分類別（可複選）' : 'Per Employment Services Act & PRPD Act (multi-select)'}
                </div>
            </div>

            <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
                <button className="btn btn-primary" onClick={createEmployee}>{t('common.save')}</button>
                <button className="btn btn-secondary" onClick={() => { onClose(); setCreateError(''); }}>{t('common.cancel')}</button>
            </div>
        </div>
    );
}

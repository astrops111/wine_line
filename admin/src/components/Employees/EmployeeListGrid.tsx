import { getLocale } from '../../lib/i18n';
import { getColor, getInitials, getTypeLabel, TYPE_BADGE_COLORS, SPECIAL_IDENTITY_OPTIONS } from '../../lib/employeeHelpers';
import type { Employee } from '../../types/employees';

interface EmployeeListGridProps {
    employees: Employee[];
    allEmployees: Employee[];
    selected: Employee | null;
    onSelect: (emp: Employee) => void;
}

export function EmployeeListGrid({ employees, allEmployees, selected, onSelect }: EmployeeListGridProps) {
    const zh = getLocale() === 'zh-TW';
    const typeLabel = getTypeLabel(zh);

    return (
        <div style={{ flex: selected ? '0 0 50%' : '1' }}>
            <div style={{ display: 'grid', gridTemplateColumns: selected ? '1fr' : 'repeat(auto-fill, minmax(320px, 1fr))', gap: '12px' }}>
                {employees.map(emp => (
                    <div key={emp.id} className="card" role="button" tabIndex={0} style={{
                        cursor: 'pointer', padding: '16px',
                        borderColor: selected?.id === emp.id ? 'var(--accent-primary)' : undefined,
                        transition: 'border-color 0.2s',
                    }} onClick={() => onSelect(emp)}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(emp); } }}>
                        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                            <div style={{
                                width: '44px', height: '44px', borderRadius: '50%', background: getColor(emp.name),
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontWeight: 700, fontSize: '16px', color: '#fff', flexShrink: 0,
                            }}>{getInitials(emp.name)}</div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                    {emp.employee_number && <span style={{ fontSize: '11px', color: 'var(--accent-primary)', fontWeight: 600, fontFamily: 'monospace' }}>{emp.employee_number}</span>}
                                    <span style={{ fontWeight: 600, fontSize: '14px' }}>{emp.name}</span>
                                    {emp.english_name && <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{emp.english_name}</span>}
                                    <span className="badge" style={{ background: TYPE_BADGE_COLORS[emp.employee_type] || '#666', fontSize: '11px', padding: '1px 8px' }}>
                                        {typeLabel[emp.employee_type] || emp.employee_type}
                                    </span>
                                    <span className="badge" style={{ background: emp.status === 'active' ? '#22c55e55' : '#f43f5e55', color: emp.status === 'active' ? '#22c55e' : '#f43f5e', fontSize: '11px', padding: '1px 8px' }}>
                                        {emp.status === 'active' ? (zh ? '\u5728\u8077' : 'Active') : (zh ? '\u96e2\u8077' : 'Inactive')}
                                    </span>
                                </div>
                                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '3px', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                                    {emp.company && <span>🏛️ {emp.company.name}</span>}
                                    {emp.department && <span>🏢 {emp.department}</span>}
                                    {(emp.position || emp.job_grade) && <span>🏷 {[emp.position, emp.job_grade ? `[${emp.job_grade}]` : null].filter(Boolean).join(' ')}</span>}
                                    {emp.store_names.length > 0 && <span>🏪 {emp.store_names.join(', ')}</span>}
                                    {emp.reporting_to && <span>👆 {allEmployees.find(e => e.id === emp.reporting_to)?.name ?? '—'}</span>}
                                    {emp.hourly_wage && <span>{'\u{1F4B0}'} NT${emp.hourly_wage}/hr</span>}
                                    {emp.max_hours_per_week && <span>{'\u23F1'} {emp.max_hours_per_week}h/{zh ? '\u9031' : 'wk'}</span>}
                                </div>
                                {emp.special_identities && emp.special_identities.length > 0 && (
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '4px' }}>
                                        {emp.special_identities.map(v => {
                                            const opt = SPECIAL_IDENTITY_OPTIONS.find(o => o.value === v);
                                            return (
                                                <span key={v} style={{ fontSize: '10px', padding: '1px 6px', borderRadius: '4px', background: 'var(--accent-primary-dim)', color: 'var(--accent-primary)', fontWeight: 500 }}>
                                                    {opt ? (zh ? opt.zh : opt.en) : v}
                                                </span>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

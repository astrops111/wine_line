import { getLocale } from '../../lib/i18n';
import {
    getColor, getInitials, getTypeLabel,
} from '../../lib/employeeHelpers';
import type { Employee, EditForm } from '../../types/employees';

interface EmployeeEditCardProps {
    selected: Employee;
    editForm: EditForm | null;
    isDirty: boolean;
    saveEmployee: () => Promise<void>;
    onClose: () => void;
}

export function EmployeeEditCard({
    selected, editForm, isDirty, saveEmployee, onClose,
}: EmployeeEditCardProps) {
    const zh = getLocale() === 'zh-TW';
    const typeLabel = getTypeLabel(zh);

    return (
        <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '16px 20px', borderBottom: '1px solid var(--outline-variant)',
            position: 'sticky', top: 0, background: 'var(--bg-primary)', zIndex: 10,
            borderRadius: 'var(--radius-lg) var(--radius-lg) 0 0',
        }}>
            <div style={{ display: 'flex', gap: '14px', alignItems: 'center' }}>
                <div style={{
                    width: '48px', height: '48px', borderRadius: '50%', background: getColor(selected.name),
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontWeight: 700, fontSize: '20px', color: '#fff',
                }}>{getInitials(selected.name)}</div>
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <h3 style={{ fontSize: '17px', fontWeight: 600, margin: 0 }}>{selected.name}</h3>
                        {selected.employee_number && (
                            <span style={{ fontSize: '11px', color: 'var(--accent-primary)', fontWeight: 600, fontFamily: 'monospace', background: 'var(--accent-primary-dim)', padding: '1px 8px', borderRadius: '4px' }}>
                                {selected.employee_number}
                            </span>
                        )}
                    </div>
                    <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                        {selected.position || (zh ? '未設定職位' : 'No position')} · {typeLabel[selected.employee_type]}
                    </div>
                </div>
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                {isDirty && (
                    <span style={{ fontSize: '12px', color: 'var(--accent-warning, #f59e0b)' }}>
                        ● {zh ? '未儲存' : 'Unsaved'}
                    </span>
                )}
                <button className="btn btn-primary btn-sm" onClick={saveEmployee} disabled={!isDirty} style={{ opacity: isDirty ? 1 : 0.45 }}>
                    {zh ? '更新' : 'Update'}
                </button>
                <button className="btn btn-sm btn-secondary" onClick={onClose} style={{ fontSize: '16px', padding: '4px 10px' }}>✕</button>
            </div>
        </div>
    );
}

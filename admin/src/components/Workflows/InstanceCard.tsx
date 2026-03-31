import { t, getLocale } from '../../lib/i18n';
import { getStatusLabels } from '../../lib/workflowHelpers';
import type { WorkflowInstance, Employee, LineGroup } from '../../types/workflows';

interface InstanceCardProps {
    inst: WorkflowInstance;
    showArchive: boolean;
    selected: boolean;
    employees: Employee[];
    lineGroups: LineGroup[];
    loadInstanceTasks: (inst: WorkflowInstance) => Promise<void>;
    archiveInstance: (instId: string) => Promise<void>;
    deleteInstance: (instId: string, instName: string) => void;
    editingInstAssign: string | null;
    setEditingInstAssign: React.Dispatch<React.SetStateAction<string | null>>;
    editInstUser: string;
    setEditInstUser: React.Dispatch<React.SetStateAction<string>>;
    editInstGroups: string[];
    setEditInstGroups: React.Dispatch<React.SetStateAction<string[]>>;
    saveInstanceAssignment: (instId: string) => Promise<void>;
}

export function InstanceCard({
    inst, showArchive, selected,
    employees, lineGroups,
    loadInstanceTasks,
    archiveInstance, deleteInstance,
    editingInstAssign, setEditingInstAssign,
    editInstUser, setEditInstUser,
    editInstGroups, setEditInstGroups,
    saveInstanceAssignment,
}: InstanceCardProps) {
    const zh = getLocale() === 'zh-TW';
    const statusLabel = getStatusLabels(zh);
    const progress = inst.taskSummary.total > 0
        ? Math.round((inst.taskSummary.completed / inst.taskSummary.total) * 100) : 0;
    const isEditingAssign = editingInstAssign === inst.id;

    return (
        <div className="card" style={{
            marginBottom: '10px', cursor: 'pointer',
            borderColor: selected ? 'var(--accent-primary)' : undefined,
        }} onClick={() => !isEditingAssign && loadInstanceTasks(inst)}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: '14px' }}>{inst.name}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                        {inst.workflow?.name || '—'} · {new Date(inst.started_at).toLocaleDateString('zh-TW')}
                    </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0, marginLeft: '8px' }}>
                    <span style={{ fontSize: '12px' }}>{statusLabel[inst.status] || inst.status}</span>
                    <button className="btn btn-sm btn-secondary" style={{ fontSize: '11px' }}
                        onClick={e => {
                            e.stopPropagation();
                            if (isEditingAssign) { setEditingInstAssign(null); return; }
                            setEditInstUser(inst.assigned_user_id || '');
                            setEditInstGroups(inst.assigned_groups || []);
                            setEditingInstAssign(inst.id);
                        }}>
                        {isEditingAssign ? '✕' : '👤'}
                    </button>
                    {showArchive && inst.status === 'running' && (
                        <button className="btn btn-sm btn-secondary" style={{ fontSize: '11px' }}
                            onClick={e => { e.stopPropagation(); archiveInstance(inst.id); }}>
                            📦
                        </button>
                    )}
                    <button className="btn btn-sm" style={{ color: 'var(--accent-red)', background: 'var(--accent-red-dim)', padding: '2px 8px' }}
                        onClick={e => { e.stopPropagation(); deleteInstance(inst.id, inst.name || inst.workflow?.name || ''); }}>
                        🗑️
                    </button>
                </div>
            </div>

            {/* Assignment badges (read mode) */}
            {!isEditingAssign && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '8px', alignItems: 'center' }}>
                    {inst.assigned_user_id ? (
                        <span style={{ fontSize: '11px', background: 'var(--accent-blue-dim, #dbeafe)', color: 'var(--accent-blue)', borderRadius: '8px', padding: '2px 7px' }}>
                            👤 {employees.find(e => e.id === inst.assigned_user_id)?.name || inst.assigned_user_id}
                        </span>
                    ) : (
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)', opacity: 0.6 }}>👤 {zh ? '未指定負責人' : 'No user assigned'}</span>
                    )}
                    {(inst.assigned_groups || []).length > 0
                        ? (inst.assigned_groups || []).map(gid => {
                            const g = lineGroups.find(lg => lg.id === gid);
                            return (
                                <span key={gid} style={{ fontSize: '11px', background: 'var(--accent-green-dim, #dcfce7)', color: 'var(--accent-green, #16a34a)', borderRadius: '8px', padding: '2px 7px' }}>
                                    👥 {g?.group_name || gid}
                                </span>
                            );
                        })
                        : <span style={{ fontSize: '11px', color: 'var(--text-muted)', opacity: 0.6 }}>👥 {zh ? '未指定群組' : 'No groups'}</span>
                    }
                </div>
            )}

            {/* Inline assignment editor */}
            {isEditingAssign && (
                <div style={{ background: 'var(--bg-primary)', borderRadius: 'var(--radius-sm)', padding: '10px', marginBottom: '10px', border: '1px solid var(--outline-variant)' }}
                    onClick={e => e.stopPropagation()}>
                    <div style={{ marginBottom: '8px' }}>
                        <label className="detail-label">👤 {zh ? '指定負責人' : 'Assigned User'}</label>
                        <select className="select" style={{ width: '100%', fontSize: '12px' }}
                            value={editInstUser} onChange={e => setEditInstUser(e.target.value)}>
                            <option value="">{zh ? '— 不指定 —' : '— None —'}</option>
                            {employees.map(emp => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
                        </select>
                    </div>
                    <div style={{ marginBottom: '8px' }}>
                        <label className="detail-label">👥 {zh ? '指定群組（可多選）' : 'Assigned Groups'}</label>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '4px' }}>
                            {editInstGroups.map(gid => {
                                const g = lineGroups.find(lg => lg.id === gid);
                                return (
                                    <span key={gid} style={{ background: 'var(--bg-secondary)', border: '1px solid var(--outline-variant)', borderRadius: '10px', padding: '2px 7px', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '3px' }}>
                                        {g?.group_name || gid}
                                        <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '0', lineHeight: 1 }}
                                            onClick={() => setEditInstGroups(p => p.filter(id => id !== gid))}>✕</button>
                                    </span>
                                );
                            })}
                        </div>
                        <select className="select" style={{ width: '100%', fontSize: '12px' }} value=""
                            onChange={e => {
                                const val = e.target.value;
                                if (val && !editInstGroups.includes(val)) setEditInstGroups(p => [...p, val]);
                                e.currentTarget.value = '';
                            }}>
                            <option value="">➕ {zh ? '新增群組…' : 'Add group…'}</option>
                            {lineGroups.filter(g => !editInstGroups.includes(g.id)).map(g =>
                                <option key={g.id} value={g.id}>{g.group_name}</option>
                            )}
                        </select>
                    </div>
                    <div style={{ display: 'flex', gap: '6px' }}>
                        <button className="btn btn-sm btn-primary" onClick={() => saveInstanceAssignment(inst.id)}>{t('common.save')}</button>
                        <button className="btn btn-sm btn-secondary" onClick={() => setEditingInstAssign(null)}>{t('common.cancel')}</button>
                    </div>
                </div>
            )}

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                <div className="progress-bar" style={{ flex: 1 }}>
                    <div className="progress-bar-fill" style={{ width: `${progress}%` }} />
                </div>
                <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--accent-primary)', minWidth: '36px', textAlign: 'right' }}>
                    {progress}%
                </span>
            </div>
            <div style={{ display: 'flex', gap: '12px', fontSize: '11px', color: 'var(--text-secondary)' }}>
                <span>⬜ {inst.taskSummary.pending}</span>
                <span>🔄 {inst.taskSummary.in_progress}</span>
                <span>✅ {inst.taskSummary.completed}</span>
                <span>🚫 {inst.taskSummary.blocked}</span>
                <span style={{ marginLeft: 'auto', color: 'var(--text-muted)' }}>{zh ? '共' : 'Total'} {inst.taskSummary.total}</span>
            </div>
        </div>
    );
}

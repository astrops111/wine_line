import { getLocale } from '../../lib/i18n';
import type { WorkflowInstance, Employee, LineGroup } from '../../types/workflows';
import { InstanceCard } from './InstanceCard';

interface ArchiveTabProps {
    filteredArchived: WorkflowInstance[];
    employees: Employee[];
    lineGroups: LineGroup[];
    instanceSearch: string;
    setInstanceSearch: React.Dispatch<React.SetStateAction<string>>;
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

export function ArchiveTab({
    filteredArchived, employees, lineGroups,
    instanceSearch, setInstanceSearch,
    loadInstanceTasks, archiveInstance, deleteInstance,
    editingInstAssign, setEditingInstAssign,
    editInstUser, setEditInstUser,
    editInstGroups, setEditInstGroups,
    saveInstanceAssignment,
}: ArchiveTabProps) {
    const zh = getLocale() === 'zh-TW';

    if (filteredArchived.length === 0 && !instanceSearch) {
        return (
            <div className="card" style={{ textAlign: 'center', padding: '60px', color: 'var(--text-muted)' }}>
                <div style={{ fontSize: '36px', marginBottom: '12px' }}>📦</div>
                <p>{zh ? '尚無封存的流程。' : 'No archived workflows yet.'}</p>
            </div>
        );
    }

    return (
        <>
            <input className="input-field" style={{ marginBottom: '12px', maxWidth: '400px' }} value={instanceSearch}
                onChange={e => setInstanceSearch(e.target.value)}
                placeholder={zh ? '搜尋流程…' : 'Search workflows…'} />
            {filteredArchived.map(inst => (
                <InstanceCard key={inst.id} inst={inst} showArchive={false} selected={false}
                    employees={employees} lineGroups={lineGroups}
                    loadInstanceTasks={loadInstanceTasks}
                    archiveInstance={archiveInstance} deleteInstance={deleteInstance}
                    editingInstAssign={editingInstAssign} setEditingInstAssign={setEditingInstAssign}
                    editInstUser={editInstUser} setEditInstUser={setEditInstUser}
                    editInstGroups={editInstGroups} setEditInstGroups={setEditInstGroups}
                    saveInstanceAssignment={saveInstanceAssignment}
                />
            ))}
        </>
    );
}

import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { getLocale } from '../lib/i18n';
import { useOrg } from '../lib/OrgContext';

interface ChecklistItem {
    id: string; checklist_id: string; category: string; name: string;
    quantity: string | null; is_purchased: boolean; sort_order: number;
}
interface Checklist {
    id: string; name: string; description: string | null;
    organization_id: string | null; status: string; created_at: string;
    department_id: string | null; store_id: string | null;
    workflow_instance_id: string | null;
    items: ChecklistItem[];
    owner_ids: string[];
    owner_names: string[];
}
interface Employee { id: string; name: string; }
interface Department { id: string; name: string; }
interface Store { id: string; name: string; }
interface WorkflowInstance { id: string; name: string; }
interface Task {
    id: string; title: string; status: string;
    workflow_instance?: { name: string } | null;
}

// Inline item row for the create form (before save)
interface NewItem { tempId: number; name: string; category: string; quantity: string; }

type DetailTab = 'items' | 'owners' | 'tasks';

export function Checklists() {
    const zh = getLocale() === 'zh-TW';
    const { orgId } = useOrg();

    const [checklists, setChecklists] = useState<Checklist[]>([]);
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [departments, setDepartments] = useState<Department[]>([]);
    const [stores, setStores] = useState<Store[]>([]);
    const [workflowInstances, setWorkflowInstances] = useState<WorkflowInstance[]>([]);
    const [allTasks, setAllTasks] = useState<Task[]>([]);
    const [linkedTasks, setLinkedTasks] = useState<Task[]>([]);
    const [loading, setLoading] = useState(true);
    const [selected, setSelected] = useState<Checklist | null>(null);
    const [detailTab, setDetailTab] = useState<DetailTab>('items');

    // ── Create form ──
    const [showCreate, setShowCreate] = useState(false);
    const [createForm, setCreateForm] = useState({
        name: '',
        description: '',
        department_id: '',
        store_id: '',
        workflow_instance_id: '',
        owner_ids: [] as string[],
        task_ids: [] as string[],
        newItems: [] as NewItem[],
    });
    const [nextTempId, setNextTempId] = useState(1);

    // Edit header inline
    const [editingHeader, setEditingHeader] = useState(false);
    const [headerForm, setHeaderForm] = useState({ name: '', description: '' });

    // Item form (detail panel)
    const [showItemForm, setShowItemForm] = useState(false);
    const [itemForm, setItemForm] = useState({ name: '', category: '', quantity: '' });

    // Owners (detail panel)
    const [ownerIds, setOwnerIds] = useState<string[]>([]);
    const [ownersDirty, setOwnersDirty] = useState(false);

    // Task linking (detail panel)
    const [showLinkTask, setShowLinkTask] = useState(false);

    useEffect(() => {
        Promise.all([
            loadChecklists(),
            supabase.from('users').select('id, name').order('name').then(r => setEmployees(r.data || [])),
            supabase.from('departments').select('id, name').order('name').then(r => setDepartments(r.data || [])),
            supabase.from('stores').select('id, name').order('name').then(r => setStores(r.data || [])),
            supabase.from('workflow_instances').select('id, name').order('created_at', { ascending: false }).then(r => setWorkflowInstances(r.data || [])),
            supabase.from('tasks').select('id, title, status, workflow_instance:workflow_instances(name)')
                .order('created_at', { ascending: false }).then(r => setAllTasks(r.data as any || [])),
        ]).then(() => setLoading(false));
    }, [orgId]);

    useEffect(() => {
        if (selected) {
            setOwnerIds(selected.owner_ids);
            setOwnersDirty(false);
            loadLinkedTasks(selected.id);
            setDetailTab('items');
        }
    }, [selected?.id]);

    async function loadChecklists() {
        const { data } = await supabase.from('checklists')
            .select('id, name, description, organization_id, status, created_at, department_id, store_id, workflow_instance_id, items:checklist_items(id, checklist_id, category, name, quantity, is_purchased, sort_order)')
            .order('created_at', { ascending: true });
        if (!data) { setChecklists([]); return; }

        const ids = data.map((c: any) => c.id);
        const { data: ownersData } = ids.length > 0
            ? await supabase.from('checklist_owners').select('checklist_id, user_id, user:users(name)').in('checklist_id', ids)
            : { data: [] };

        const ownerMap: Record<string, string[]> = {};
        const ownerNameMap: Record<string, string[]> = {};
        (ownersData || []).forEach((r: any) => {
            ownerMap[r.checklist_id] = ownerMap[r.checklist_id] || [];
            ownerMap[r.checklist_id].push(r.user_id);
            ownerNameMap[r.checklist_id] = ownerNameMap[r.checklist_id] || [];
            ownerNameMap[r.checklist_id].push(r.user?.name || r.user_id);
        });

        const result = data.map((c: any) => ({
            ...c,
            items: (c.items || []).sort((a: any, b: any) => a.sort_order - b.sort_order),
            owner_ids: ownerMap[c.id] || [],
            owner_names: ownerNameMap[c.id] || [],
        }));
        setChecklists(result);

        if (selected) {
            const refreshed = result.find((c: Checklist) => c.id === selected.id);
            if (refreshed) setSelected(refreshed);
        }
    }

    async function loadLinkedTasks(checklistId: string) {
        const { data } = await supabase.from('task_checklists')
            .select('task:tasks(id, title, status, workflow_instance:workflow_instances(name))')
            .eq('checklist_id', checklistId);
        setLinkedTasks((data || []).map((r: any) => r.task).filter(Boolean));
    }

    function patchCreate(patch: Partial<typeof createForm>) {
        setCreateForm(f => ({ ...f, ...patch }));
    }

    function toggleCreateOwner(uid: string) {
        setCreateForm(f => ({
            ...f,
            owner_ids: f.owner_ids.includes(uid) ? f.owner_ids.filter(i => i !== uid) : [...f.owner_ids, uid],
        }));
    }

    function toggleCreateTask(tid: string) {
        setCreateForm(f => ({
            ...f,
            task_ids: f.task_ids.includes(tid) ? f.task_ids.filter(i => i !== tid) : [...f.task_ids, tid],
        }));
    }

    function addNewItemRow() {
        const tid = nextTempId;
        setNextTempId(n => n + 1);
        setCreateForm(f => ({
            ...f,
            newItems: [...f.newItems, { tempId: tid, name: '', category: '', quantity: '' }],
        }));
    }

    function updateNewItem(tempId: number, patch: Partial<Omit<NewItem, 'tempId'>>) {
        setCreateForm(f => ({
            ...f,
            newItems: f.newItems.map(item => item.tempId === tempId ? { ...item, ...patch } : item),
        }));
    }

    function removeNewItem(tempId: number) {
        setCreateForm(f => ({ ...f, newItems: f.newItems.filter(i => i.tempId !== tempId) }));
    }

    function resetCreateForm() {
        setCreateForm({ name: '', description: '', department_id: '', store_id: '', workflow_instance_id: '', owner_ids: [], task_ids: [], newItems: [] });
        setShowCreate(false);
    }

    async function createChecklist() {
        if (!createForm.name.trim()) return;

        // Insert checklist
        const { data: newCl, error } = await supabase.from('checklists').insert({
            organization_id: orgId,
            name: createForm.name.trim(),
            description: createForm.description.trim() || null,
            status: 'active',
            department_id: createForm.department_id || null,
            store_id: createForm.store_id || null,
            workflow_instance_id: createForm.workflow_instance_id || null,
        }).select('id').single();

        if (error || !newCl) return;
        const clId = newCl.id;

        // Owners
        if (createForm.owner_ids.length > 0) {
            await supabase.from('checklist_owners').insert(
                createForm.owner_ids.map(uid => ({ checklist_id: clId, user_id: uid }))
            );
        }

        // Task links
        if (createForm.task_ids.length > 0) {
            await supabase.from('task_checklists').insert(
                createForm.task_ids.map(tid => ({ checklist_id: clId, task_id: tid }))
            );
        }

        // Inline items
        const validItems = createForm.newItems.filter(i => i.name.trim());
        if (validItems.length > 0) {
            await supabase.from('checklist_items').insert(
                validItems.map((item, idx) => ({
                    checklist_id: clId,
                    name: item.name.trim(),
                    category: item.category.trim() || (zh ? '一般' : 'General'),
                    quantity: item.quantity.trim() || null,
                    is_purchased: false,
                    sort_order: idx + 1,
                }))
            );
        }

        resetCreateForm();
        await loadChecklists();
    }

    async function deleteChecklist(id: string) {
        if (!confirm(zh ? '確定刪除此清單？' : 'Delete this checklist?')) return;
        await supabase.from('checklists').delete().eq('id', id);
        if (selected?.id === id) setSelected(null);
        await loadChecklists();
    }

    async function saveHeader() {
        if (!selected || !headerForm.name.trim()) return;
        await supabase.from('checklists').update({
            name: headerForm.name.trim(),
            description: headerForm.description.trim() || null,
        }).eq('id', selected.id);
        setEditingHeader(false);
        await loadChecklists();
    }

    async function addItem() {
        if (!selected || !itemForm.name.trim()) return;
        const maxOrder = Math.max(0, ...selected.items.map(i => i.sort_order));
        await supabase.from('checklist_items').insert({
            checklist_id: selected.id,
            name: itemForm.name.trim(),
            category: itemForm.category.trim() || (zh ? '一般' : 'General'),
            quantity: itemForm.quantity.trim() || null,
            is_purchased: false,
            sort_order: maxOrder + 1,
        });
        setItemForm({ name: '', category: '', quantity: '' });
        setShowItemForm(false);
        await loadChecklists();
    }

    async function deleteItem(itemId: string) {
        await supabase.from('checklist_items').delete().eq('id', itemId);
        await loadChecklists();
    }

    async function toggleItem(itemId: string, current: boolean) {
        await supabase.from('checklist_items').update({ is_purchased: !current }).eq('id', itemId);
        await loadChecklists();
    }

    async function saveOwners() {
        if (!selected) return;
        await supabase.from('checklist_owners').delete().eq('checklist_id', selected.id);
        if (ownerIds.length > 0) {
            await supabase.from('checklist_owners').insert(
                ownerIds.map(uid => ({ checklist_id: selected.id, user_id: uid }))
            );
        }
        setOwnersDirty(false);
        await loadChecklists();
    }

    async function linkTask(taskId: string) {
        await supabase.from('task_checklists').upsert({ task_id: taskId, checklist_id: selected!.id });
        setShowLinkTask(false);
        await loadLinkedTasks(selected!.id);
    }

    async function unlinkTask(taskId: string) {
        await supabase.from('task_checklists').delete().eq('task_id', taskId).eq('checklist_id', selected!.id);
        await loadLinkedTasks(selected!.id);
    }

    const taskStatusColor: Record<string, { bg: string; color: string }> = {
        pending:     { bg: '#6b728020', color: '#9ca3af' },
        in_progress: { bg: '#3b82f620', color: '#3b82f6' },
        completed:   { bg: '#22c55e20', color: '#22c55e' },
        blocked:     { bg: '#ef444420', color: '#ef4444' },
    };

    const unlinkedTasks = allTasks.filter(t => !linkedTasks.some(lt => lt.id === t.id));

    // ── Pill toggle helper ──
    function pillStyle(active: boolean) {
        return {
            display: 'flex', alignItems: 'center', gap: '5px',
            padding: '5px 11px', borderRadius: '6px', cursor: 'pointer',
            border: `1px solid ${active ? 'var(--accent-primary)' : 'var(--border-color)'}`,
            background: active ? 'var(--accent-primary-dim)' : 'var(--bg-secondary)',
            fontSize: '12px', fontWeight: active ? 600 : 400,
        } as React.CSSProperties;
    }

    return (
        <div className="fade-in">
            <div className="page-header">
                <h2>✅ {zh ? '清單管理' : 'Checklists'}</h2>
                <p>{zh ? '建立查核清單，指派負責人，並連結至任務' : 'Create checklists, assign owners, and link to tasks'}</p>
                <button className="btn btn-primary" onClick={() => { if (showCreate) resetCreateForm(); else setShowCreate(true); }}>
                    {showCreate ? (zh ? '取消' : 'Cancel') : `+ ${zh ? '新增清單' : 'New Checklist'}`}
                </button>
            </div>

            <div className="page-body">

                {/* ── Create form ── */}
                {showCreate && (
                    <div className="card" style={{ marginBottom: '16px', padding: '18px' }}>
                        <div style={{ fontWeight: 700, fontSize: '14px', marginBottom: '14px', color: 'var(--accent-primary)' }}>
                            ✅ {zh ? '新增清單' : 'New Checklist'}
                        </div>

                        {/* Row 1: Name + Description */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '12px', marginBottom: '12px' }}>
                            <div>
                                <label className="detail-label">{zh ? '清單名稱' : 'Name'} *</label>
                                <input className="input-field" value={createForm.name}
                                    onChange={e => patchCreate({ name: e.target.value })}
                                    placeholder={zh ? '例如：開店前準備' : 'e.g. Opening Prep'} />
                            </div>
                            <div>
                                <label className="detail-label">{zh ? '說明' : 'Description'}</label>
                                <input className="input-field" value={createForm.description}
                                    onChange={e => patchCreate({ description: e.target.value })}
                                    placeholder={zh ? '選填' : 'Optional'} />
                            </div>
                        </div>

                        {/* Row 2: Department + Location + Workflow */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                            <div>
                                <label className="detail-label">{zh ? '部門' : 'Department'}</label>
                                <select className="input-field" value={createForm.department_id}
                                    onChange={e => patchCreate({ department_id: e.target.value })}>
                                    <option value="">{zh ? '— 選擇部門 —' : '— Select dept —'}</option>
                                    {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="detail-label">{zh ? '門市/地點' : 'Location'}</label>
                                <select className="input-field" value={createForm.store_id}
                                    onChange={e => patchCreate({ store_id: e.target.value })}>
                                    <option value="">{zh ? '— 選擇門市 —' : '— Select store —'}</option>
                                    {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="detail-label">{zh ? '流程' : 'Workflow'}</label>
                                <select className="input-field" value={createForm.workflow_instance_id}
                                    onChange={e => patchCreate({ workflow_instance_id: e.target.value })}>
                                    <option value="">{zh ? '— 選擇流程 —' : '— Select workflow —'}</option>
                                    {workflowInstances.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                                </select>
                            </div>
                        </div>

                        {/* Row 3: Owners */}
                        <div style={{ marginBottom: '12px' }}>
                            <label className="detail-label">👤 {zh ? '負責人' : 'Owners'}</label>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '6px' }}>
                                {employees.map(emp => {
                                    const active = createForm.owner_ids.includes(emp.id);
                                    return (
                                        <label key={emp.id} style={pillStyle(active)}>
                                            <input type="checkbox" checked={active} style={{ accentColor: 'var(--accent-primary)' }}
                                                onChange={() => toggleCreateOwner(emp.id)} />
                                            {emp.name}
                                        </label>
                                    );
                                })}
                                {employees.length === 0 && <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{zh ? '無員工資料' : 'No employees'}</span>}
                            </div>
                        </div>

                        {/* Row 4: Tasks to link */}
                        <div style={{ marginBottom: '14px' }}>
                            <label className="detail-label">🔗 {zh ? '連結任務' : 'Link Tasks'}</label>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '6px', maxHeight: '120px', overflowY: 'auto', padding: '4px 0' }}>
                                {allTasks.map(task => {
                                    const active = createForm.task_ids.includes(task.id);
                                    return (
                                        <label key={task.id} style={pillStyle(active)}>
                                            <input type="checkbox" checked={active} style={{ accentColor: 'var(--accent-primary)' }}
                                                onChange={() => toggleCreateTask(task.id)} />
                                            <span>{task.title}</span>
                                            {task.workflow_instance && (
                                                <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>({task.workflow_instance.name})</span>
                                            )}
                                        </label>
                                    );
                                })}
                                {allTasks.length === 0 && <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{zh ? '無任務資料' : 'No tasks'}</span>}
                            </div>
                        </div>

                        {/* Row 5: Inline items */}
                        <div style={{ marginBottom: '14px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                <label className="detail-label">📋 {zh ? '清單項目' : 'Items'}</label>
                                <button className="btn btn-sm btn-secondary" onClick={addNewItemRow}>
                                    + {zh ? '加入項目' : 'Add Item'}
                                </button>
                            </div>
                            {createForm.newItems.length === 0 ? (
                                <div style={{ fontSize: '12px', color: 'var(--text-muted)', padding: '10px 12px', background: 'var(--bg-secondary)', borderRadius: '8px', textAlign: 'center' }}>
                                    {zh ? '點擊「加入項目」新增清單項目' : 'Click "Add Item" to add items to the checklist'}
                                </div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                    {/* Header row */}
                                    <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr auto', gap: '8px', padding: '0 4px' }}>
                                        <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{zh ? '項目名稱' : 'Item Name'}</span>
                                        <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{zh ? '類別' : 'Category'}</span>
                                        <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{zh ? '數量/備註' : 'Qty/Note'}</span>
                                        <span />
                                    </div>
                                    {createForm.newItems.map(item => (
                                        <div key={item.tempId} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr auto', gap: '8px', alignItems: 'center' }}>
                                            <input className="input-field" style={{ fontSize: '12px', padding: '6px 10px' }}
                                                value={item.name}
                                                onChange={e => updateNewItem(item.tempId, { name: e.target.value })}
                                                placeholder={zh ? '項目名稱 *' : 'Item name *'} />
                                            <input className="input-field" style={{ fontSize: '12px', padding: '6px 10px' }}
                                                value={item.category}
                                                onChange={e => updateNewItem(item.tempId, { category: e.target.value })}
                                                placeholder={zh ? '類別' : 'Category'} />
                                            <input className="input-field" style={{ fontSize: '12px', padding: '6px 10px' }}
                                                value={item.quantity}
                                                onChange={e => updateNewItem(item.tempId, { quantity: e.target.value })}
                                                placeholder={zh ? '選填' : 'Optional'} />
                                            <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '14px', padding: '4px 6px' }}
                                                onClick={() => removeNewItem(item.tempId)}>✕</button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Actions */}
                        <div style={{ display: 'flex', gap: '8px', paddingTop: '4px', borderTop: '1px solid var(--border-color)' }}>
                            <button className="btn btn-primary" onClick={createChecklist} disabled={!createForm.name.trim()}>
                                ✅ {zh ? '建立清單' : 'Create Checklist'}
                            </button>
                            <button className="btn btn-secondary" onClick={resetCreateForm}>{zh ? '取消' : 'Cancel'}</button>
                        </div>
                    </div>
                )}

                {loading ? (
                    <p className="loading-pulse">{zh ? '載入中...' : 'Loading...'}</p>
                ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: selected ? '320px 1fr' : '1fr', gap: '16px' }}>

                        {/* ── Checklist List ── */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            {checklists.length === 0 ? (
                                <div className="card" style={{ textAlign: 'center', padding: '60px' }}>
                                    <p style={{ color: 'var(--text-muted)' }}>{zh ? '尚無清單，點擊「新增清單」開始' : 'No checklists yet'}</p>
                                </div>
                            ) : checklists.map(cl => {
                                const done = cl.items.filter(i => i.is_purchased).length;
                                const total = cl.items.length;
                                const pct = total > 0 ? Math.round(done / total * 100) : 0;
                                const isActive = selected?.id === cl.id;
                                const dept = departments.find(d => d.id === cl.department_id);
                                const store = stores.find(s => s.id === cl.store_id);
                                return (
                                    <div key={cl.id}
                                        onClick={() => setSelected(isActive ? null : cl)}
                                        style={{
                                            padding: '14px 16px', borderRadius: 'var(--radius-md)', cursor: 'pointer',
                                            background: isActive ? 'var(--accent-primary-dim)' : 'var(--bg-card)',
                                            border: `1px solid ${isActive ? 'var(--accent-primary)' : 'var(--border-color)'}`,
                                            borderLeft: `3px solid ${isActive ? 'var(--accent-primary)' : 'transparent'}`,
                                            transition: 'all 0.15s ease',
                                        }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
                                            <div style={{ fontWeight: 600, fontSize: '13px' }}>{cl.name}</div>
                                            <button
                                                className="btn btn-sm btn-secondary"
                                                style={{ padding: '2px 7px', fontSize: '11px', color: 'var(--accent-red, #ef4444)' }}
                                                onClick={e => { e.stopPropagation(); deleteChecklist(cl.id); }}>
                                                🗑
                                            </button>
                                        </div>
                                        {cl.description && (
                                            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '5px' }}>{cl.description}</div>
                                        )}
                                        {/* Dept / Store tags */}
                                        {(dept || store) && (
                                            <div style={{ display: 'flex', gap: '5px', marginBottom: '6px', flexWrap: 'wrap' }}>
                                                {dept && <span style={{ fontSize: '10px', padding: '1px 7px', borderRadius: '4px', background: 'var(--bg-secondary)', color: 'var(--text-secondary)', border: '1px solid var(--border-color)' }}>🏢 {dept.name}</span>}
                                                {store && <span style={{ fontSize: '10px', padding: '1px 7px', borderRadius: '4px', background: 'var(--bg-secondary)', color: 'var(--text-secondary)', border: '1px solid var(--border-color)' }}>📍 {store.name}</span>}
                                            </div>
                                        )}
                                        {/* Progress */}
                                        <div style={{ marginBottom: '6px' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-muted)', marginBottom: '3px' }}>
                                                <span>{total > 0 ? `${done}/${total} ${zh ? '項目' : 'items'}` : (zh ? '無項目' : 'No items')}</span>
                                                <span style={{ fontWeight: 600, color: pct === 100 ? 'var(--accent-primary)' : 'var(--text-secondary)' }}>{pct}%</span>
                                            </div>
                                            <div style={{ height: '4px', background: 'var(--bg-primary)', borderRadius: '2px', overflow: 'hidden' }}>
                                                <div style={{ height: '100%', width: `${pct}%`, background: pct === 100 ? 'var(--accent-primary)' : 'var(--accent-blue)', borderRadius: '2px', transition: 'width 0.3s ease' }} />
                                            </div>
                                        </div>
                                        {/* Owners */}
                                        {cl.owner_names.length > 0 && (
                                            <div style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }}>
                                                <span>👤</span>
                                                {cl.owner_names.map((n, i) => (
                                                    <span key={i} style={{ background: 'var(--bg-secondary)', padding: '1px 6px', borderRadius: '4px', fontSize: '10px' }}>{n}</span>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>

                        {/* ── Detail Panel ── */}
                        {selected && (
                            <div className="card" style={{ padding: 0, alignSelf: 'start' }}>
                                {/* Header */}
                                <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border-color)' }}>
                                    {editingHeader ? (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                            <input className="input-field" value={headerForm.name}
                                                onChange={e => setHeaderForm(f => ({ ...f, name: e.target.value }))}
                                                style={{ fontWeight: 600, fontSize: '14px' }} />
                                            <input className="input-field" value={headerForm.description}
                                                onChange={e => setHeaderForm(f => ({ ...f, description: e.target.value }))}
                                                placeholder={zh ? '說明（選填）' : 'Description (optional)'}
                                                style={{ fontSize: '12px' }} />
                                            <div style={{ display: 'flex', gap: '6px' }}>
                                                <button className="btn btn-sm btn-primary" onClick={saveHeader}>💾 {zh ? '儲存' : 'Save'}</button>
                                                <button className="btn btn-sm btn-secondary" onClick={() => setEditingHeader(false)}>{zh ? '取消' : 'Cancel'}</button>
                                            </div>
                                        </div>
                                    ) : (
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                            <div>
                                                <div style={{ fontWeight: 700, fontSize: '15px' }}>{selected.name}</div>
                                                {selected.description && <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>{selected.description}</div>}
                                                {/* Dept/Store/Workflow tags in detail */}
                                                {(selected.department_id || selected.store_id || selected.workflow_instance_id) && (
                                                    <div style={{ display: 'flex', gap: '5px', marginTop: '6px', flexWrap: 'wrap' }}>
                                                        {selected.department_id && departments.find(d => d.id === selected.department_id) && (
                                                            <span style={{ fontSize: '10px', padding: '1px 7px', borderRadius: '4px', background: 'var(--bg-secondary)', color: 'var(--text-secondary)', border: '1px solid var(--border-color)' }}>
                                                                🏢 {departments.find(d => d.id === selected.department_id)!.name}
                                                            </span>
                                                        )}
                                                        {selected.store_id && stores.find(s => s.id === selected.store_id) && (
                                                            <span style={{ fontSize: '10px', padding: '1px 7px', borderRadius: '4px', background: 'var(--bg-secondary)', color: 'var(--text-secondary)', border: '1px solid var(--border-color)' }}>
                                                                📍 {stores.find(s => s.id === selected.store_id)!.name}
                                                            </span>
                                                        )}
                                                        {selected.workflow_instance_id && workflowInstances.find(w => w.id === selected.workflow_instance_id) && (
                                                            <span style={{ fontSize: '10px', padding: '1px 7px', borderRadius: '4px', background: 'var(--bg-secondary)', color: 'var(--text-secondary)', border: '1px solid var(--border-color)' }}>
                                                                🔄 {workflowInstances.find(w => w.id === selected.workflow_instance_id)!.name}
                                                            </span>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                            <button className="btn btn-sm btn-secondary" onClick={() => { setHeaderForm({ name: selected.name, description: selected.description || '' }); setEditingHeader(true); }}>
                                                ✏️ {zh ? '編輯' : 'Edit'}
                                            </button>
                                        </div>
                                    )}
                                </div>

                                {/* Sub-tabs */}
                                <div className="tab-bar" style={{ padding: '0 18px', borderBottom: '1px solid var(--border-color)', margin: 0 }}>
                                    {([
                                        { key: 'items',  label: `${zh ? '項目' : 'Items'} (${selected.items.length})` },
                                        { key: 'owners', label: `${zh ? '負責人' : 'Owners'} (${selected.owner_ids.length})` },
                                        { key: 'tasks',  label: `${zh ? '關聯任務' : 'Tasks'} (${linkedTasks.length})` },
                                    ] as { key: DetailTab; label: string }[]).map(t => (
                                        <button key={t.key} className={`tab-item ${detailTab === t.key ? 'active' : ''}`}
                                            style={{ fontSize: '12px', padding: '8px 12px' }}
                                            onClick={() => setDetailTab(t.key)}>
                                            {t.label}
                                        </button>
                                    ))}
                                </div>

                                <div style={{ padding: '14px 18px' }}>

                                    {/* ── ITEMS tab ── */}
                                    {detailTab === 'items' && (
                                        <div>
                                            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '12px' }}>
                                                <button className="btn btn-sm btn-primary" onClick={() => setShowItemForm(s => !s)}>
                                                    {showItemForm ? (zh ? '取消' : 'Cancel') : `+ ${zh ? '新增項目' : 'Add Item'}`}
                                                </button>
                                            </div>

                                            {showItemForm && (
                                                <div style={{ padding: '12px', borderRadius: '8px', background: 'var(--bg-secondary)', marginBottom: '12px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                                                    <div style={{ gridColumn: '1/-1' }}>
                                                        <label className="detail-label">{zh ? '項目名稱' : 'Item Name'} *</label>
                                                        <input className="input-field" value={itemForm.name}
                                                            onChange={e => setItemForm(f => ({ ...f, name: e.target.value }))}
                                                            placeholder={zh ? '例如：清潔廁所' : 'e.g. Clean restroom'} />
                                                    </div>
                                                    <div>
                                                        <label className="detail-label">{zh ? '類別' : 'Category'}</label>
                                                        <input className="input-field" value={itemForm.category}
                                                            onChange={e => setItemForm(f => ({ ...f, category: e.target.value }))}
                                                            placeholder={zh ? '例如：清潔' : 'e.g. Cleaning'} />
                                                    </div>
                                                    <div>
                                                        <label className="detail-label">{zh ? '數量/備註' : 'Qty/Note'}</label>
                                                        <input className="input-field" value={itemForm.quantity}
                                                            onChange={e => setItemForm(f => ({ ...f, quantity: e.target.value }))}
                                                            placeholder={zh ? '選填' : 'Optional'} />
                                                    </div>
                                                    <div style={{ gridColumn: '1/-1' }}>
                                                        <button className="btn btn-sm btn-primary" onClick={addItem}>✅ {zh ? '加入' : 'Add'}</button>
                                                    </div>
                                                </div>
                                            )}

                                            {selected.items.length === 0 ? (
                                                <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '24px', fontSize: '13px' }}>
                                                    {zh ? '尚無項目' : 'No items yet'}
                                                </p>
                                            ) : (() => {
                                                const categories = [...new Set(selected.items.map(i => i.category))];
                                                const done = selected.items.filter(i => i.is_purchased).length;
                                                const pct = Math.round(done / selected.items.length * 100);
                                                return (
                                                    <>
                                                        <div style={{ marginBottom: '12px' }}>
                                                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>
                                                                <span>{done}/{selected.items.length} {zh ? '完成' : 'done'}</span>
                                                                <span style={{ fontWeight: 600, color: pct === 100 ? 'var(--accent-primary)' : undefined }}>{pct}%</span>
                                                            </div>
                                                            <div style={{ height: '4px', background: 'var(--bg-primary)', borderRadius: '2px', overflow: 'hidden' }}>
                                                                <div style={{ height: '100%', width: `${pct}%`, background: pct === 100 ? 'var(--accent-primary)' : '#3b82f6', borderRadius: '2px', transition: 'width 0.3s' }} />
                                                            </div>
                                                        </div>
                                                        {categories.map(cat => (
                                                            <div key={cat} style={{ marginBottom: '12px' }}>
                                                                <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--accent-blue)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '5px' }}>{cat}</div>
                                                                {selected.items.filter(i => i.category === cat).map(item => (
                                                                    <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '7px 10px', borderRadius: '6px', marginBottom: '2px', background: item.is_purchased ? 'var(--accent-primary-dim)' : 'transparent', opacity: item.is_purchased ? 0.75 : 1 }}>
                                                                        <span style={{ cursor: 'pointer', fontSize: '15px', flexShrink: 0 }} onClick={() => toggleItem(item.id, item.is_purchased)}>
                                                                            {item.is_purchased ? '✅' : '⬜'}
                                                                        </span>
                                                                        <span style={{ flex: 1, fontSize: '13px', textDecoration: item.is_purchased ? 'line-through' : 'none', color: item.is_purchased ? 'var(--text-muted)' : 'var(--text-primary)' }}>
                                                                            {item.name}
                                                                        </span>
                                                                        {item.quantity && <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{item.quantity}</span>}
                                                                        <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '12px', padding: '2px 4px' }}
                                                                            onClick={() => deleteItem(item.id)}>✕</button>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        ))}
                                                    </>
                                                );
                                            })()}
                                        </div>
                                    )}

                                    {/* ── OWNERS tab ── */}
                                    {detailTab === 'owners' && (
                                        <div>
                                            <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '12px' }}>
                                                {zh ? '選擇此清單的負責人員' : 'Select who is responsible for this checklist'}
                                            </p>
                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '7px', marginBottom: '14px' }}>
                                                {employees.map(emp => {
                                                    const checked = ownerIds.includes(emp.id);
                                                    return (
                                                        <label key={emp.id} style={pillStyle(checked)}>
                                                            <input type="checkbox" checked={checked} style={{ accentColor: 'var(--accent-primary)' }}
                                                                onChange={() => { setOwnerIds(ids => checked ? ids.filter(i => i !== emp.id) : [...ids, emp.id]); setOwnersDirty(true); }} />
                                                            {emp.name}
                                                        </label>
                                                    );
                                                })}
                                            </div>
                                            {ownersDirty && (
                                                <button className="btn btn-primary" onClick={saveOwners}>💾 {zh ? '儲存負責人' : 'Save Owners'}</button>
                                            )}
                                            {!ownersDirty && ownerIds.length === 0 && (
                                                <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{zh ? '尚未指派負責人' : 'No owners assigned'}</p>
                                            )}
                                        </div>
                                    )}

                                    {/* ── TASKS tab ── */}
                                    {detailTab === 'tasks' && (
                                        <div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                                                <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0 }}>
                                                    {zh ? '此清單已連結的任務' : 'Tasks linked to this checklist'}
                                                </p>
                                                <button className="btn btn-sm btn-primary" onClick={() => setShowLinkTask(s => !s)}>
                                                    {showLinkTask ? (zh ? '取消' : 'Cancel') : `+ ${zh ? '連結任務' : 'Link Task'}`}
                                                </button>
                                            </div>

                                            {showLinkTask && (
                                                <div style={{ padding: '10px', borderRadius: '8px', background: 'var(--bg-secondary)', marginBottom: '12px', maxHeight: '200px', overflowY: 'auto' }}>
                                                    {unlinkedTasks.length === 0
                                                        ? <p style={{ fontSize: '12px', color: 'var(--text-muted)', textAlign: 'center', padding: '12px' }}>{zh ? '無可連結的任務' : 'No tasks to link'}</p>
                                                        : unlinkedTasks.map(task => (
                                                            <div key={task.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 10px', borderRadius: '6px', marginBottom: '3px', background: 'var(--bg-card)' }}>
                                                                <div>
                                                                    <div style={{ fontSize: '12px', fontWeight: 500 }}>{task.title}</div>
                                                                    {task.workflow_instance && <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{task.workflow_instance.name}</div>}
                                                                </div>
                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                                    <span style={{ fontSize: '10px', padding: '1px 6px', borderRadius: '4px', fontWeight: 600, background: taskStatusColor[task.status]?.bg, color: taskStatusColor[task.status]?.color }}>{task.status}</span>
                                                                    <button className="btn btn-sm btn-primary" style={{ padding: '2px 10px', fontSize: '11px' }} onClick={() => linkTask(task.id)}>
                                                                        {zh ? '連結' : 'Link'}
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        ))
                                                    }
                                                </div>
                                            )}

                                            {linkedTasks.length === 0 ? (
                                                <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '24px', fontSize: '13px' }}>
                                                    {zh ? '尚未連結任何任務' : 'Not linked to any tasks'}
                                                </p>
                                            ) : linkedTasks.map(task => (
                                                <div key={task.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 12px', borderRadius: '8px', marginBottom: '5px', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
                                                    <div>
                                                        <div style={{ fontSize: '13px', fontWeight: 500 }}>{task.title}</div>
                                                        {task.workflow_instance && <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>🔄 {task.workflow_instance.name}</div>}
                                                    </div>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                        <span style={{ fontSize: '10px', padding: '2px 7px', borderRadius: '4px', fontWeight: 600, background: taskStatusColor[task.status]?.bg, color: taskStatusColor[task.status]?.color }}>{task.status}</span>
                                                        <button className="btn btn-sm btn-secondary" style={{ padding: '2px 8px', fontSize: '11px', color: 'var(--accent-red, #ef4444)' }}
                                                            onClick={() => unlinkTask(task.id)}>
                                                            {zh ? '移除' : 'Unlink'}
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

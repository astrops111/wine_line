import type { Employee } from '../../types/orgManagement';

interface OrgChartTabProps {
    zh: boolean;
    employees: Employee[];
}

function getColor(name: string): string {
    const colors = ['#6366f1', '#f43f5e', '#22c55e', '#f59e0b', '#06b6d4', '#8b5cf6', '#ec4899', '#14b8a6'];
    let h = 0;
    for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
    return colors[Math.abs(h) % colors.length];
}

export function OrgChartTab({ zh, employees }: OrgChartTabProps) {
    const managers = employees.filter(e => e.is_manager && !e.reporting_to && e.status === 'active');
    const getChildren = (parentId: string): typeof employees => employees.filter(e => e.reporting_to === parentId && e.status === 'active');
    const unassigned = employees.filter(e => !e.reporting_to && !e.is_manager && e.status === 'active');

    const renderNode = (emp: Employee, level: number): any => {
        const children = getChildren(emp.id);
        return (
            <div key={emp.id} style={{ position: 'relative' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', background: 'var(--bg-primary)', border: '1px solid var(--outline-variant)', borderRadius: '10px', marginBottom: '8px', marginLeft: level * 40 }}>
                    <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: getColor(emp.name), display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '14px', color: '#fff', flexShrink: 0 }}>
                        {emp.name.slice(0, 2)}
                    </div>
                    <div>
                        <div style={{ fontSize: '13px', fontWeight: 600 }}>
                            {emp.name}
                            {emp.is_manager && <span style={{ fontSize: '10px', marginLeft: '6px', color: '#f59e0b' }}>★ {zh ? '主管' : 'Manager'}</span>}
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                            {[emp.position, emp.department, emp.store?.name].filter(Boolean).join(' · ')}
                        </div>
                    </div>
                </div>
                {children.map(child => renderNode(child, level + 1))}
            </div>
        );
    };

    if (managers.length === 0 && unassigned.length === 0) {
        return (
            <div>
                <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '16px' }}>🏛 {zh ? '組織圖' : 'Organization Chart'}</h3>
                <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                    {zh ? '尚無組織結構資料（請先設定主管與回報對象）' : 'No org structure data yet. Set managers and reporting relationships first.'}
                </div>
            </div>
        );
    }

    // If no reporting_to structure, show flat department-grouped view
    if (managers.length === 0) {
        const deptGroups: Record<string, typeof employees> = {};
        employees.filter(e => e.status === 'active').forEach(e => {
            const dept = e.department || (zh ? '未分配' : 'Unassigned');
            if (!deptGroups[dept]) deptGroups[dept] = [];
            deptGroups[dept].push(e);
        });
        return (
            <div>
                <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '16px' }}>🏛 {zh ? '組織圖' : 'Organization Chart'}</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '12px' }}>
                    {Object.entries(deptGroups).map(([dept, members]) => (
                        <div key={dept} className="card" style={{ padding: '14px' }}>
                            <h4 style={{ fontSize: '13px', fontWeight: 600, marginBottom: '10px', color: 'var(--accent-primary)' }}>🏢 {dept}</h4>
                            {members.map(m => (
                                <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 0' }}>
                                    <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: getColor(m.name), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 700, color: '#fff' }}>{m.name[0]}</div>
                                    <span style={{ fontSize: '12px' }}>{m.name}</span>
                                    {m.is_manager && <span style={{ fontSize: '10px', color: '#f59e0b' }}>★</span>}
                                </div>
                            ))}
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    return (
        <div>
            <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '16px' }}>🏛 {zh ? '組織圖' : 'Organization Chart'}</h3>
            <div>
                {managers.map(m => renderNode(m, 0))}
                {unassigned.length > 0 && (
                    <div style={{ marginTop: '20px' }}>
                        <h4 style={{ fontSize: '13px', fontWeight: 600, marginBottom: '10px', color: 'var(--text-muted)' }}>
                            {zh ? '未指派回報對象' : 'Unassigned'}
                        </h4>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                            {unassigned.map(e => (
                                <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', background: 'var(--bg-secondary)', borderRadius: '8px' }}>
                                    <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: getColor(e.name), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 700, color: '#fff' }}>{e.name[0]}</div>
                                    <span style={{ fontSize: '12px' }}>{e.name}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

/* ── Delayed Tasks Section ── */

export interface DelayedTask {
    id: string;
    title: string;
    storeName: string;
    assignee: string;
    priority: string;
    daysOverdue: number;
}

interface DelayedTasksSectionProps {
    delayedTasks: DelayedTask[];
}

const priorityIcon: Record<string, string> = { low: '🔽', medium: '➡️', high: '🔼', urgent: '🔥' };

export function DelayedTasksSection({ delayedTasks }: DelayedTasksSectionProps) {
    return (
        <div className="glass-section">
            <div className="section-head">
                <span className="section-title" style={{ color: delayedTasks.length > 0 ? '#f87171' : undefined }}>
                    ⚠️ 延遲任務
                </span>
                {delayedTasks.length > 0 && (
                    <span className="count-badge red">{delayedTasks.length}</span>
                )}
            </div>
            <div className="section-body">
                {delayedTasks.length === 0 ? (
                    <div className="empty-state success">✅ 目前沒有延遲任務！</div>
                ) : delayedTasks.map(dt => (
                    <div key={dt.id} className={`delay-card ${dt.priority === 'urgent' ? 'urgent' : ''}`}>
                        <div className="delay-title">{priorityIcon[dt.priority]} {dt.title}</div>
                        <div className="delay-meta">
                            <span>🏪 {dt.storeName}</span>
                            <span>👤 {dt.assignee}</span>
                            {dt.daysOverdue > 0 && (
                                <span className="delay-overdue">⏰ 延遲 {dt.daysOverdue} 天</span>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

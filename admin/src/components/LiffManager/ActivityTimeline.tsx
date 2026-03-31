/* ── Activity Timeline ── */

export interface ActivityItem {
    id: string;
    time: string;
    title: string;
    storeName: string;
    type: 'completed' | 'updated' | 'created' | 'blocked';
}

interface ActivityTimelineProps {
    activity: ActivityItem[];
}

const dotClass: Record<string, string> = { completed: 'green', updated: 'amber', created: 'indigo', blocked: 'red' };
const typeIcon: Record<string, string> = { completed: '✅', updated: '🔄', created: '🆕', blocked: '🚫' };

export function ActivityTimeline({ activity }: ActivityTimelineProps) {
    return (
        <div className="glass-section">
            <div className="section-head">
                <span className="section-title">📋 今日更新</span>
                <span className="section-meta">
                    {new Date().toLocaleDateString('zh-TW', { month: 'short', day: 'numeric' })}
                </span>
            </div>
            <div className="section-body">
                {activity.length === 0 ? (
                    <div className="empty-state">今日尚無更新</div>
                ) : activity.map((a, i) => (
                    <div key={a.id + i} className="tl-item">
                        <div className={`tl-dot ${dotClass[a.type]}`} />
                        <div className="tl-body">
                            <div className="tl-time">{a.time}</div>
                            <div className="tl-title">{typeIcon[a.type]} {a.title}</div>
                            {a.storeName && <div className="tl-store">🏪 {a.storeName}</div>}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

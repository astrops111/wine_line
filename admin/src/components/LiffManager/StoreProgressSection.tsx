/* ── Store Progress Section ── */

export interface StoreProgress {
    name: string;
    total: number;
    completed: number;
    percent: number;
    blocked: number;
    inProgress: number;
    pending: number;
}

interface StoreProgressSectionProps {
    storeProgress: StoreProgress[];
}

const pctClass = (p: number) => p >= 70 ? 'green' : p >= 40 ? 'amber' : 'red';

export function StoreProgressSection({ storeProgress }: StoreProgressSectionProps) {
    return (
        <div className="glass-section">
            <div className="section-head">
                <span className="section-title">🏪 門市任務進度</span>
                <span className="section-meta">{storeProgress.length} 個門市</span>
            </div>
            <div className="section-body">
                {storeProgress.length === 0 ? (
                    <div className="empty-state">尚無門市任務資料</div>
                ) : storeProgress.map(sp => (
                    <div key={sp.name} className="store-row">
                        <div className="store-label">
                            <span className="store-name">{sp.name}</span>
                            <span className="store-stats">
                                <span className="store-frac">{sp.completed}/{sp.total}</span>
                                <span className={`store-pct ${pctClass(sp.percent)}`}>{sp.percent}%</span>
                            </span>
                        </div>
                        <div className="progress-track">
                            <div className={`progress-fill ${pctClass(sp.percent)}`} style={{ width: `${sp.percent}%` }} />
                        </div>
                        <div className="store-tags">
                            {sp.inProgress > 0 && <span>🔄 {sp.inProgress} 進行中</span>}
                            {sp.pending > 0 && <span>⏳ {sp.pending} 待處理</span>}
                            {sp.blocked > 0 && <span className="blocked-tag">🚫 {sp.blocked} 受阻</span>}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

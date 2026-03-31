import { useState } from 'react';
import { getLocale } from '../../lib/i18n';
import { getBucket } from '../../lib/taskHelpers';
import type { Task } from '../../types/tasks';

interface BucketManagementModalProps {
    displayBuckets: string[];
    buckets: string[];
    setBuckets: React.Dispatch<React.SetStateAction<string[]>>;
    tasks: Task[];
    filterBucket: string;
    setFilterBucket: (val: string) => void;
    updateTaskMetadata: (taskId: string, metadata: Record<string, unknown>) => Promise<void>;
    onClose: () => void;
}

export function BucketManagementModal({
    displayBuckets,
    buckets,
    setBuckets,
    tasks,
    filterBucket,
    setFilterBucket,
    updateTaskMetadata,
    onClose,
}: BucketManagementModalProps) {
    const zh = getLocale() === 'zh-TW';
    const [newBucketName, setNewBucketName] = useState('');
    const [bucketEdits, setBucketEdits] = useState<Record<string, string>>({});

    const isProtected = (b: string) => b === 'General' || b === 'Personal' || b === 'Workflow';

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content" onClick={e => e.stopPropagation()}>
                <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '12px' }}>
                    {zh ? '管理任務分類' : 'Manage Task Buckets'}
                </h3>
                <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                    <input
                        className="input-field"
                        value={newBucketName}
                        onChange={e => setNewBucketName(e.target.value)}
                        placeholder={zh ? '新分類名稱…' : 'New bucket name…'}
                    />
                    <button
                        className="btn btn-primary"
                        onClick={() => {
                            const name = newBucketName.trim();
                            if (!name || buckets.includes(name)) return;
                            setBuckets(prev => [...prev, name]);
                            setNewBucketName('');
                        }}
                    >
                        {zh ? '新增' : 'Add'}
                    </button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {displayBuckets.map(b => (
                        <div key={b} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                            <input
                                className="input-field"
                                value={bucketEdits[b] ?? b}
                                onChange={e => setBucketEdits(prev => ({ ...prev, [b]: e.target.value }))}
                                disabled={isProtected(b)}
                            />
                            <button
                                className="btn btn-secondary"
                                onClick={async () => {
                                    const nextName = (bucketEdits[b] ?? b).trim();
                                    if (!nextName || nextName === b || buckets.includes(nextName)) return;
                                    const affected = tasks.filter(t => getBucket(t) === b);
                                    await Promise.all(affected.map(t => updateTaskMetadata(t.id, { ...(t.metadata || {}), bucket: nextName })));
                                    setBuckets(prev => prev.map(x => (x === b ? nextName : x)));
                                }}
                                disabled={isProtected(b)}
                            >
                                {zh ? '重命名' : 'Rename'}
                            </button>
                            <button
                                className="btn btn-secondary"
                                onClick={async () => {
                                    if (isProtected(b)) return;
                                    const reassigned = tasks.filter(t => getBucket(t) === b);
                                    await Promise.all(reassigned.map(t => updateTaskMetadata(t.id, { ...(t.metadata || {}), bucket: 'General' })));
                                    setBuckets(prev => prev.filter(x => x !== b));
                                    if (filterBucket === b) setFilterBucket('all');
                                }}
                                disabled={isProtected(b)}
                                style={{ color: 'var(--accent-red)' }}
                            >
                                {zh ? '刪除' : 'Delete'}
                            </button>
                        </div>
                    ))}
                </div>

                <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '16px' }}>
                    <button className="btn btn-secondary" onClick={onClose}>
                        {zh ? '關閉' : 'Close'}
                    </button>
                </div>
            </div>
        </div>
    );
}

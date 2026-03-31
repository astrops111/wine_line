import React, { useState } from 'react';
import { ERROR_TYPE_COLORS, SOURCE_BADGE, Badge, formatDate } from '../../lib/lineLogsConstants';
import type { ErrorLog, LineGroup } from '../../types/lineLogs';

// ── Props ────────────────────────────────────────────────────────────────────

interface ErrorsTabProps {
  zh: boolean;
  loading: boolean;
  errors: ErrorLog[];
  search: string;
  groups: LineGroup[];
}

// ── Component ────────────────────────────────────────────────────────────────

export function ErrorsTab({ zh, loading, errors, search, groups }: ErrorsTabProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const s = search.toLowerCase();

  const filteredErrors = errors.filter(e =>
    !s || (e.error_message ?? '').toLowerCase().includes(s) || (e.error_type ?? '').includes(s)
  );

  const groupName = (groupId: string | null) => {
    if (!groupId) return null;
    const g = groups.find(g => g.line_group_id === groupId);
    return g?.group_name ?? groupId.slice(0, 8) + '…';
  };

  return (
    <div className="card" style={{ overflow: 'hidden' }}>
      {loading ? (
        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>{zh ? '載入中…' : 'Loading…'}</div>
      ) : filteredErrors.length === 0 ? (
        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
          <div style={{ fontSize: '36px', marginBottom: '8px' }}>✅</div>
          {zh ? '無錯誤記錄' : 'No errors found'}
        </div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface-2)' }}>
              {[zh ? '時間' : 'Time', zh ? '類型' : 'Type', zh ? '用戶' : 'User', zh ? '錯誤訊息' : 'Message', zh ? '來源' : 'Source', ''].map((h, i) => (
                <th key={i} style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, fontSize: '12px', color: 'var(--text-muted)' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredErrors.map(e => {
              const etc = ERROR_TYPE_COLORS[e.error_type] ?? { bg: '#f3f4f6', color: '#374151' };
              return (
                <React.Fragment key={e.id}>
                  <tr
                    style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer' }}
                    onClick={() => setExpandedId(expandedId === e.id ? null : e.id)}
                  >
                    <td style={{ padding: '10px 12px', color: 'var(--text-muted)', whiteSpace: 'nowrap', fontFamily: 'monospace', fontSize: '11.5px' }}>
                      {formatDate(e.created_at, zh)}
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      <Badge bg={etc.bg} color={etc.color}>{e.error_type}</Badge>
                    </td>
                    <td style={{ padding: '10px 12px', fontWeight: 500 }}>{e.line_user_id?.slice(0, 8) ?? '—'}</td>
                    <td style={{ padding: '10px 12px', maxWidth: '360px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {e.error_message}
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      {e.source_type ? <Badge bg={(SOURCE_BADGE[e.source_type] ?? SOURCE_BADGE.user).bg} color={(SOURCE_BADGE[e.source_type] ?? SOURCE_BADGE.user).color}>{e.source_type}</Badge> : '—'}
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                        {expandedId === e.id ? '▲' : '▼'}
                      </span>
                    </td>
                  </tr>
                  {expandedId === e.id && (
                    <tr style={{ background: 'var(--surface-2)' }}>
                      <td colSpan={6} style={{ padding: '12px 16px' }}>
                        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '8px' }}>
                          {e.group_id && <span>{zh ? '群組' : 'Group'}: {groupName(e.group_id)}</span>}
                          {e.line_user_id && <span>User ID: <code style={{ fontSize: '11px' }}>{e.line_user_id.slice(0, 12)}</code></span>}
                        </div>
                        {e.error_stack && (
                          <div>
                            <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '4px' }}>
                              Stack Trace
                            </div>
                            <pre style={{ fontSize: '11px', background: '#fee2e2', padding: '8px', borderRadius: '6px', overflow: 'auto', maxHeight: '200px', margin: 0 }}>
                              {e.error_stack}
                            </pre>
                          </div>
                        )}
                        {e.context && (
                          <div style={{ marginTop: '8px' }}>
                            <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '4px' }}>
                              Context
                            </div>
                            <pre style={{ fontSize: '11px', background: 'var(--bg-root)', padding: '8px', borderRadius: '6px', overflow: 'auto', maxHeight: '200px', margin: 0 }}>
                              {JSON.stringify(e.context, null, 2)}
                            </pre>
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

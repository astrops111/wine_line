import React, { useState } from 'react';
import { COMMAND_LABELS, Badge, formatDate } from '../../lib/lineLogsConstants';
import type { CommandLog, LineGroup } from '../../types/lineLogs';

// ── Props ────────────────────────────────────────────────────────────────────

interface CommandsTabProps {
  zh: boolean;
  loading: boolean;
  commands: CommandLog[];
  search: string;
  groups: LineGroup[];
}

// ── Component ────────────────────────────────────────────────────────────────

export function CommandsTab({ zh, loading, commands, search, groups }: CommandsTabProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const s = search.toLowerCase();

  const filteredCommands = commands.filter(c =>
    !s || (c.display_name ?? '').toLowerCase().includes(s) || c.raw_input.toLowerCase().includes(s) || c.command_matched.includes(s)
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
      ) : filteredCommands.length === 0 ? (
        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
          <div style={{ fontSize: '36px', marginBottom: '8px' }}>📭</div>
          {zh ? '無指令記錄' : 'No command logs found'}
        </div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface-2)' }}>
              {[zh ? '時間' : 'Time', zh ? '指令' : 'Command', zh ? '用戶' : 'User', zh ? '輸入' : 'Input', zh ? '狀態' : 'Status', zh ? '耗時' : 'Duration', ''].map((h, i) => (
                <th key={i} style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, fontSize: '12px', color: 'var(--text-muted)' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredCommands.map(c => (
              <React.Fragment key={c.id}>
                <tr
                  style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer' }}
                  onClick={() => setExpandedId(expandedId === c.id ? null : c.id)}
                >
                  <td style={{ padding: '10px 12px', color: 'var(--text-muted)', whiteSpace: 'nowrap', fontFamily: 'monospace', fontSize: '11.5px' }}>
                    {formatDate(c.created_at, zh)}
                  </td>
                  <td style={{ padding: '10px 12px' }}>
                    <Badge bg="#e0e7ff" color="#4338ca">
                      {zh ? (COMMAND_LABELS[c.command_matched] ?? c.command_matched) : c.command_matched}
                    </Badge>
                  </td>
                  <td style={{ padding: '10px 12px', fontWeight: 500 }}>{c.display_name ?? '—'}</td>
                  <td style={{ padding: '10px 12px', maxWidth: '240px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {c.raw_input}
                  </td>
                  <td style={{ padding: '10px 12px' }}>
                    {c.success
                      ? <Badge bg="#dcfce7" color="#15803d">✓</Badge>
                      : <Badge bg="#fee2e2" color="#b91c1c">✗</Badge>
                    }
                  </td>
                  <td style={{ padding: '10px 12px', fontFamily: 'monospace', fontSize: '11.5px', color: 'var(--text-muted)' }}>
                    {c.execution_ms != null ? `${c.execution_ms}ms` : '—'}
                  </td>
                  <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                      {expandedId === c.id ? '▲' : '▼'}
                    </span>
                  </td>
                </tr>
                {expandedId === c.id && (
                  <tr style={{ background: 'var(--surface-2)' }}>
                    <td colSpan={7} style={{ padding: '12px 16px' }}>
                      <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', fontSize: '12px', color: 'var(--text-muted)' }}>
                        {c.group_id && <span>{zh ? '群組' : 'Group'}: {groupName(c.group_id)}</span>}
                        {c.source_type && <span>{zh ? '來源' : 'Source'}: {c.source_type}</span>}
                        {c.created_entity_type && <span>{zh ? '建立' : 'Created'}: {c.created_entity_type}</span>}
                        {c.created_entity_id && <span>ID: <code style={{ fontSize: '11px' }}>{c.created_entity_id.slice(0, 8)}</code></span>}
                      </div>
                      {c.error_message && (
                        <div style={{ marginTop: '8px', padding: '8px', background: '#fee2e2', borderRadius: '6px', fontSize: '12px', color: '#b91c1c' }}>
                          {c.error_message}
                        </div>
                      )}
                      {c.metadata && (
                        <pre style={{ marginTop: '8px', fontSize: '11px', background: 'var(--bg-root)', padding: '8px', borderRadius: '6px', overflow: 'auto', maxHeight: '200px' }}>
                          {JSON.stringify(c.metadata, null, 2)}
                        </pre>
                      )}
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

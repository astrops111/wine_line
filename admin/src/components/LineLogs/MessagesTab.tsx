import { DIRECTION_BADGE, SOURCE_BADGE, Badge, formatDate } from '../../lib/lineLogsConstants';
import type { LineMessage, LineGroup } from '../../types/lineLogs';

// ── Props ────────────────────────────────────────────────────────────────────

interface MessagesTabProps {
  zh: boolean;
  loading: boolean;
  messages: LineMessage[];
  search: string;
  groups: LineGroup[];
}

// ── Component ────────────────────────────────────────────────────────────────

export function MessagesTab({ zh, loading, messages, search, groups }: MessagesTabProps) {
  const s = search.toLowerCase();

  const filteredMessages = messages.filter(m =>
    !s || (m.display_name ?? '').toLowerCase().includes(s) || m.message_text.toLowerCase().includes(s)
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
      ) : filteredMessages.length === 0 ? (
        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
          <div style={{ fontSize: '36px', marginBottom: '8px' }}>📭</div>
          {zh ? '無訊息記錄' : 'No messages found'}
        </div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface-2)' }}>
              {[zh ? '時間' : 'Time', zh ? '方向' : 'Dir', zh ? '用戶' : 'User', zh ? '訊息' : 'Message', zh ? '來源' : 'Source', zh ? '群組' : 'Group'].map((h, i) => (
                <th key={i} style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, fontSize: '12px', color: 'var(--text-muted)' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredMessages.map(m => {
              const dir = DIRECTION_BADGE[m.direction] ?? DIRECTION_BADGE.incoming;
              const src = SOURCE_BADGE[m.source_type] ?? SOURCE_BADGE.user;
              return (
                <tr key={m.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '10px 12px', color: 'var(--text-muted)', whiteSpace: 'nowrap', fontFamily: 'monospace', fontSize: '11.5px' }}>
                    {formatDate(m.created_at, zh)}
                  </td>
                  <td style={{ padding: '10px 12px' }}>
                    <Badge bg={dir.bg} color={dir.color}>{zh ? dir.zh : dir.en}</Badge>
                  </td>
                  <td style={{ padding: '10px 12px', fontWeight: 500 }}>{m.display_name ?? '—'}</td>
                  <td style={{ padding: '10px 12px', maxWidth: '320px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {m.message_text}
                  </td>
                  <td style={{ padding: '10px 12px' }}>
                    <Badge bg={src.bg} color={src.color}>{m.source_type}</Badge>
                  </td>
                  <td style={{ padding: '10px 12px', fontSize: '12px', color: 'var(--text-muted)' }}>
                    {groupName(m.group_id) ?? '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

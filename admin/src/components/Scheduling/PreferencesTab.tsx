import type { Employee, Availability } from '../../types/scheduling';

export interface PreferencesTabProps {
  zh: boolean;
  employees: Employee[];
  availability: Availability[];
  dayNames: string[];
  onSetAvailability: (userId: string, dow: number, val: string) => void;
}

export function PreferencesTab(props: PreferencesTabProps) {
  const { zh, employees, availability, dayNames, onSetAvailability } = props;

  return (
    <div className="card" style={{ overflowX: 'auto', padding: '0' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
        <thead>
          <tr style={{ background: 'var(--bg-primary)' }}>
            <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, borderBottom: 'none' }}>{zh ? '員工' : 'Employee'}</th>
            {dayNames.map((d, i) => (
              <th key={i} style={{ padding: '10px', textAlign: 'center', fontWeight: 600, borderBottom: 'none' }}>{d}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {employees.length === 0 ? (
            <tr><td colSpan={8} style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
              {zh ? '此門市尚無員工' : 'No employees for this store'}
            </td></tr>
          ) : employees.map(emp => (
            <tr key={emp.id} style={{ borderBottom: 'none' }}>
              <td style={{ padding: '8px 14px', fontWeight: 600 }}>{emp.name}</td>
              {[1, 2, 3, 4, 5, 6, 0].map(dow => {
                const av = availability.find(a => a.user_id === emp.id && a.day_of_week === dow);
                const val = av?.availability || 'available';
                const icon = val === 'available' ? '✅' : val === 'preferred' ? '⭐' : '❌';
                const nextVal = val === 'available' ? 'preferred' : val === 'preferred' ? 'unavailable' : 'available';
                return (
                  <td key={dow} style={{ padding: '6px', textAlign: 'center' }}>
                    <button style={{
                      background: 'none', border: '1px solid var(--outline-variant)', borderRadius: '6px',
                      padding: '6px 12px', cursor: 'pointer', fontSize: '16px',
                      opacity: val === 'unavailable' ? 0.4 : 1,
                    }} onClick={() => onSetAvailability(emp.id, dow, nextVal)} title={val}>
                      {icon}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ padding: '12px 14px', fontSize: '12px', color: 'var(--text-muted)', display: 'flex', gap: '16px' }}>
        <span>✅ {zh ? '可上班' : 'Available'}</span>
        <span>⭐ {zh ? '偏好' : 'Preferred'}</span>
        <span>❌ {zh ? '不可上班' : 'Unavailable'}</span>
        <span style={{ marginLeft: 'auto' }}>{zh ? '點擊切換' : 'Click to toggle'}</span>
      </div>
    </div>
  );
}

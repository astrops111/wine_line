import type {
  Employee, ShiftAssignment, Schedule, ShiftSwapRequest, SwapForm, OpenShiftForm,
} from '../../types/scheduling';

export interface ShiftSwapsTabProps {
  zh: boolean;
  employees: Employee[];
  assignments: ShiftAssignment[];
  schedule: Schedule | null;
  swapRequests: ShiftSwapRequest[];
  swapLoading: boolean;
  swapSaving: boolean;
  showCreateSwap: boolean;
  showOpenShiftForm: boolean;
  swapForm: SwapForm;
  openShiftForm: OpenShiftForm;
  currentUserId: string | undefined;
  // Callbacks
  onSetShowCreateSwap: (v: boolean) => void;
  onSetShowOpenShiftForm: (v: boolean) => void;
  onSetSwapForm: (updater: (prev: SwapForm) => SwapForm) => void;
  onSetOpenShiftForm: (updater: (prev: OpenShiftForm) => OpenShiftForm) => void;
  onCreateSwap: () => void;
  onCreateOpenShift: () => void;
  onClaimOpenShift: (swapId: string, shiftId: string) => void;
  onUpdateSwapStatus: (id: string, status: string, note?: string) => void;
}

export function ShiftSwapsTab(props: ShiftSwapsTabProps) {
  const {
    zh, employees, assignments, schedule, swapRequests, swapLoading, swapSaving,
    showCreateSwap, showOpenShiftForm, swapForm, openShiftForm,
    onSetShowCreateSwap, onSetShowOpenShiftForm, onSetSwapForm, onSetOpenShiftForm,
    onCreateSwap, onCreateOpenShift, onClaimOpenShift, onUpdateSwapStatus,
  } = props;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <span style={{ fontSize: '14px', fontWeight: 600 }}>🔄 {zh ? '換班 / 讓班 / 開放班次' : 'Swaps / Give-away / Open Shifts'}</span>
        <div style={{ display: 'flex', gap: '8px' }}>
          {schedule && (
            <button className="btn btn-sm" style={{ background: 'var(--accent-indigo)', color: '#fff', border: 'none' }}
              onClick={() => onSetShowOpenShiftForm(true)}>
              📢 {zh ? '張貼開放班次' : 'Post Open Shift'}
            </button>
          )}
          <button className="btn btn-primary btn-sm" onClick={() => onSetShowCreateSwap(true)}>
            + {zh ? '新增申請' : 'New Request'}
          </button>
        </div>
      </div>

      {/* Open Shifts Section */}
      {(() => {
        const openShifts = swapRequests.filter(sr => sr.swap_type === 'open_shift');
        if (openShifts.length === 0) return null;
        return (
          <div style={{ marginBottom: '20px' }}>
            <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '8px', color: 'var(--accent-indigo)' }}>
              📢 {zh ? '開放班次' : 'Open Shifts'} ({openShifts.length})
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {openShifts.map(sr => {
                const reqShift = assignments.find(a => a.id === sr.requester_shift_id);
                const bidder = sr.bid_user_id ? employees.find(e => e.id === sr.bid_user_id) : null;
                return (
                  <div key={sr.id} className="card" style={{ padding: '12px', borderLeft: '3px solid var(--accent-indigo)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                      <div>
                        {reqShift && (
                          <div style={{ fontWeight: 600, fontSize: '13px' }}>
                            📅 {reqShift.date} · {reqShift.start_time?.slice(0, 5)}–{reqShift.end_time?.slice(0, 5)}
                          </div>
                        )}
                        {sr.reason && <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>{sr.reason}</div>}
                        {bidder && (
                          <div style={{ fontSize: '12px', color: '#1d4ed8', marginTop: '4px' }}>
                            🙋 {zh ? '已認領' : 'Claimed'}: {bidder.name}
                          </div>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                        {sr.status === 'pending' && !sr.bid_user_id && (
                          <button className="btn btn-sm" style={{ background: 'var(--accent-indigo)', color: '#fff', border: 'none', fontSize: '11px' }}
                            onClick={() => onClaimOpenShift(sr.id, sr.requester_shift_id)}>
                            🙋 {zh ? '認領' : 'Claim'}
                          </button>
                        )}
                        {sr.status === 'target_accepted' && (
                          <div style={{ display: 'flex', gap: '4px' }}>
                            <button className="btn btn-sm" style={{ fontSize: '11px', padding: '2px 8px', background: '#dcfce7', color: '#15803d', border: 'none' }}
                              onClick={() => onUpdateSwapStatus(sr.id, 'approved')}>
                              ✓ {zh ? '核准' : 'Approve'}
                            </button>
                            <button className="btn btn-sm" style={{ fontSize: '11px', padding: '2px 8px', background: '#fee2e2', color: '#b91c1c', border: 'none' }}
                              onClick={() => onUpdateSwapStatus(sr.id, 'rejected')}>
                              ✕ {zh ? '駁回' : 'Reject'}
                            </button>
                          </div>
                        )}
                        <span style={{
                          fontSize: '11px', padding: '2px 8px', borderRadius: '10px', fontWeight: 600,
                          background: sr.status === 'approved' ? '#dcfce7' : sr.status === 'target_accepted' ? '#dbeafe' : '#fef9c3',
                          color: sr.status === 'approved' ? '#15803d' : sr.status === 'target_accepted' ? '#1d4ed8' : '#a16207',
                        }}>
                          {sr.status === 'approved' ? (zh ? '已指派' : 'Assigned') : sr.status === 'target_accepted' ? (zh ? '待核准' : 'Pending') : (zh ? '開放中' : 'Open')}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {swapLoading ? (
        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>{zh ? '載入中…' : 'Loading…'}</div>
      ) : swapRequests.length === 0 ? (
        <div className="card" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
          <div style={{ fontSize: '36px', marginBottom: '8px' }}>🔄</div>
          {zh ? '目前無換班申請' : 'No shift swap requests'}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {swapRequests.map(sr => {
            const requester = employees.find(e => e.id === sr.requester_id);
            const target = sr.target_id ? employees.find(e => e.id === sr.target_id) : null;
            const reqShift = assignments.find(a => a.id === sr.requester_shift_id);
            const statusColors: Record<string, { bg: string; color: string }> = {
              pending:         { bg: '#fef9c3', color: '#a16207' },
              target_accepted: { bg: '#dbeafe', color: '#1d4ed8' },
              approved:        { bg: '#dcfce7', color: '#15803d' },
              rejected:        { bg: '#fee2e2', color: '#b91c1c' },
              cancelled:       { bg: '#f3f4f6', color: '#6b7280' },
            };
            const statusLabels: Record<string, { zh: string; en: string }> = {
              pending:         { zh: '待處理', en: 'Pending' },
              target_accepted: { zh: '對方已接受', en: 'Accepted' },
              approved:        { zh: '已核准', en: 'Approved' },
              rejected:        { zh: '已駁回', en: 'Rejected' },
              cancelled:       { zh: '已取消', en: 'Cancelled' },
            };
            const sc = statusColors[sr.status] ?? statusColors.pending;
            const sl = statusLabels[sr.status] ?? statusLabels.pending;

            return (
              <div key={sr.id} className="card" style={{ padding: '14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                      <span style={{ fontWeight: 600 }}>{requester?.name ?? sr.requester_id.slice(0, 8)}</span>
                      <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                        {sr.swap_type === 'swap' ? (zh ? '↔ 換班' : '↔ Swap') : sr.swap_type === 'open_shift' ? (zh ? '📢 開放班' : '📢 Open') : (zh ? '→ 讓班' : '→ Give away')}
                      </span>
                      {target && <span style={{ fontWeight: 600 }}>→ {target.name}</span>}
                      {!target && sr.swap_type === 'give_away' && <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>({zh ? '開放認領' : 'Open'})</span>}
                    </div>
                    {reqShift && (
                      <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                        📅 {reqShift.date} · {reqShift.start_time?.slice(0, 5)}–{reqShift.end_time?.slice(0, 5)}
                      </div>
                    )}
                    {sr.reason && <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>{zh ? '原因' : 'Reason'}: {sr.reason}</div>}
                    {sr.manager_note && <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>{zh ? '主管備註' : 'Manager note'}: {sr.manager_note}</div>}
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                      {new Date(sr.created_at).toLocaleString(zh ? 'zh-TW' : 'en-US', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '6px' }}>
                    <span style={{ background: sc.bg, color: sc.color, padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: 600 }}>
                      {zh ? sl.zh : sl.en}
                    </span>
                    {(sr.status === 'pending' || sr.status === 'target_accepted') && (
                      <div style={{ display: 'flex', gap: '4px' }}>
                        <button className="btn btn-sm" style={{ fontSize: '11px', padding: '2px 8px', background: '#dcfce7', color: '#15803d', border: 'none' }}
                          onClick={() => onUpdateSwapStatus(sr.id, 'approved')}>
                          ✓ {zh ? '核准' : 'Approve'}
                        </button>
                        <button className="btn btn-sm" style={{ fontSize: '11px', padding: '2px 8px', background: '#fee2e2', color: '#b91c1c', border: 'none' }}
                          onClick={() => onUpdateSwapStatus(sr.id, 'rejected')}>
                          ✕ {zh ? '駁回' : 'Reject'}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create Swap Modal */}
      {showCreateSwap && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', overscrollBehavior: 'contain' }}
          onClick={e => { if (e.target === e.currentTarget) onSetShowCreateSwap(false); }}>
          <div className="card" style={{ padding: '24px', width: '100%', maxWidth: '480px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: 600, margin: '0 0 16px' }}>{zh ? '新增換班申請' : 'New Shift Swap Request'}</h3>
            <div style={{ display: 'grid', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '3px', textTransform: 'uppercase' }}>
                  {zh ? '申請人 *' : 'Requester *'}
                </label>
                <select className="input-field" value={swapForm.requester_id} onChange={e => onSetSwapForm(f => ({ ...f, requester_id: e.target.value }))}>
                  <option value="">{zh ? '選擇員工' : 'Select'}</option>
                  {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '3px', textTransform: 'uppercase' }}>
                  {zh ? '要換的班次 *' : 'Shift to swap *'}
                </label>
                <select className="input-field" value={swapForm.requester_shift_id} onChange={e => onSetSwapForm(f => ({ ...f, requester_shift_id: e.target.value }))}>
                  <option value="">{zh ? '選擇班次' : 'Select shift'}</option>
                  {assignments.filter(a => a.user_id === swapForm.requester_id).map(a => (
                    <option key={a.id} value={a.id}>{a.date} {a.start_time?.slice(0, 5)}–{a.end_time?.slice(0, 5)}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '3px', textTransform: 'uppercase' }}>
                  {zh ? '類型' : 'Type'}
                </label>
                <select className="input-field" value={swapForm.swap_type} onChange={e => onSetSwapForm(f => ({ ...f, swap_type: e.target.value as 'swap' | 'give_away' }))}>
                  <option value="swap">{zh ? '換班 (與他人交換)' : 'Swap (exchange with someone)'}</option>
                  <option value="give_away">{zh ? '讓班 (放棄此班)' : 'Give away (release shift)'}</option>
                </select>
              </div>
              {swapForm.swap_type === 'swap' && (
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '3px', textTransform: 'uppercase' }}>
                    {zh ? '換班對象' : 'Swap with'}
                  </label>
                  <select className="input-field" value={swapForm.target_id} onChange={e => onSetSwapForm(f => ({ ...f, target_id: e.target.value }))}>
                    <option value="">{zh ? '選擇員工 (可留空)' : 'Select (optional)'}</option>
                    {employees.filter(e => e.id !== swapForm.requester_id).map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                  </select>
                </div>
              )}
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '3px', textTransform: 'uppercase' }}>
                  {zh ? '原因' : 'Reason'}
                </label>
                <textarea className="input-field" rows={2} value={swapForm.reason} onChange={e => onSetSwapForm(f => ({ ...f, reason: e.target.value }))} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '16px' }}>
              <button className="btn btn-secondary" onClick={() => onSetShowCreateSwap(false)}>{zh ? '取消' : 'Cancel'}</button>
              <button className="btn btn-primary" onClick={onCreateSwap} disabled={swapSaving || !swapForm.requester_id || !swapForm.requester_shift_id}>
                {swapSaving ? '…' : (zh ? '送出' : 'Submit')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Open Shift Form Modal */}
      {showOpenShiftForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', overscrollBehavior: 'contain' }}
          onClick={e => { if (e.target === e.currentTarget) onSetShowOpenShiftForm(false); }}>
          <div className="card" style={{ padding: '24px', width: '100%', maxWidth: '420px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: 600, margin: '0 0 16px' }}>📢 {zh ? '張貼開放班次' : 'Post Open Shift'}</h3>
            <div style={{ display: 'grid', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '3px', textTransform: 'uppercase' }}>
                  {zh ? '日期 *' : 'Date *'}
                </label>
                <input type="date" className="input-field" value={openShiftForm.date} onChange={e => onSetOpenShiftForm(f => ({ ...f, date: e.target.value }))} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '3px', textTransform: 'uppercase' }}>
                    {zh ? '開始時間' : 'Start'}
                  </label>
                  <input type="time" className="input-field" value={openShiftForm.start_time} onChange={e => onSetOpenShiftForm(f => ({ ...f, start_time: e.target.value }))} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '3px', textTransform: 'uppercase' }}>
                    {zh ? '結束時間' : 'End'}
                  </label>
                  <input type="time" className="input-field" value={openShiftForm.end_time} onChange={e => onSetOpenShiftForm(f => ({ ...f, end_time: e.target.value }))} />
                </div>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '3px', textTransform: 'uppercase' }}>
                  {zh ? '說明' : 'Notes'}
                </label>
                <textarea className="input-field" rows={2} value={openShiftForm.reason} onChange={e => onSetOpenShiftForm(f => ({ ...f, reason: e.target.value }))} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '16px' }}>
              <button className="btn btn-secondary" onClick={() => onSetShowOpenShiftForm(false)}>{zh ? '取消' : 'Cancel'}</button>
              <button className="btn btn-primary" onClick={onCreateOpenShift} disabled={swapSaving || !openShiftForm.date}>
                {swapSaving ? '…' : (zh ? '張貼' : 'Post')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

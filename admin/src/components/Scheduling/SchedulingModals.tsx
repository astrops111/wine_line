import type { LaborViolation, ShiftAssignment } from '../../types/scheduling';

export interface SaveTemplateModalProps {
  zh: boolean;
  assignmentCount: number;
  templateName: string;
  templateDesc: string;
  onSetTemplateName: (v: string) => void;
  onSetTemplateDesc: (v: string) => void;
  onSave: () => void;
  onClose: () => void;
}

export function SaveTemplateModal(props: SaveTemplateModalProps) {
  const { zh, assignmentCount, templateName, templateDesc, onSetTemplateName, onSetTemplateDesc, onSave, onClose } = props;
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', overscrollBehavior: 'contain' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="card" style={{ padding: '24px', width: '100%', maxWidth: '420px' }}>
        <h3 style={{ fontSize: '16px', fontWeight: 600, margin: '0 0 16px' }}>💾 {zh ? '儲存為班表範本' : 'Save as Schedule Template'}</h3>
        <div style={{ display: 'grid', gap: '12px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '3px', textTransform: 'uppercase' }}>
              {zh ? '範本名稱 *' : 'Template Name *'}
            </label>
            <input className="input-field" value={templateName} onChange={e => onSetTemplateName(e.target.value)}
              placeholder={zh ? '例如：平日標準班表' : 'e.g. Weekday Standard'} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '3px', textTransform: 'uppercase' }}>
              {zh ? '說明' : 'Description'}
            </label>
            <textarea className="input-field" rows={2} value={templateDesc} onChange={e => onSetTemplateDesc(e.target.value)} />
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            {zh ? `將目前 ${assignmentCount} 個班次儲存為可重複使用的範本。` : `Save current ${assignmentCount} assignments as a reusable template.`}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '16px' }}>
          <button className="btn btn-secondary" onClick={onClose}>{zh ? '取消' : 'Cancel'}</button>
          <button className="btn btn-primary" onClick={onSave} disabled={!templateName.trim()}>
            {zh ? '儲存' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

export interface ViolationModalProps {
  zh: boolean;
  violations: LaborViolation[];
  fixLoading: boolean;
  aiLoading: boolean;
  violationAcknowledged: boolean;
  pendingPublishId: string | null;
  onSetViolationAcknowledged: (v: boolean) => void;
  onAutoFix: () => void;
  onRegenerate: () => void;
  onForcePublish: (id: string) => void;
  onClose: () => void;
}

export function ViolationModal(props: ViolationModalProps) {
  const {
    zh, violations, fixLoading, aiLoading, violationAcknowledged, pendingPublishId,
    onSetViolationAcknowledged, onAutoFix, onRegenerate, onForcePublish, onClose,
  } = props;

  const errorCount = violations.filter(v => v.severity === 'error').length;
  const warnCount = violations.filter(v => v.severity === 'warning').length;

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', overscrollBehavior: 'contain' }}>
      <div className="card" style={{ maxWidth: '600px', width: '90%', padding: '28px', maxHeight: '80vh', overflowY: 'auto' }}>
        <h3 style={{ marginBottom: '16px', color: errorCount > 0 ? '#f43f5e' : '#f59e0b' }}>
          {errorCount > 0 ? '🚫' : '⚠️'} {zh ? '排班檢查結果' : 'Schedule Check Results'}
        </h3>
        <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '12px' }}>
          {errorCount > 0
            ? (zh ? `發現 ${errorCount} 項違規、${warnCount} 項警告。違規班次需要修正才能發布。` : `Found ${errorCount} error(s) and ${warnCount} warning(s). Errors must be resolved before publishing.`)
            : (zh ? `發現 ${warnCount} 項警告，無嚴重違規。` : `Found ${warnCount} warning(s), no errors.`)}
        </p>
        {errorCount > 0 && (
          <div style={{ marginBottom: '12px' }}>
            <div style={{ fontSize: '12px', fontWeight: 600, color: '#f43f5e', marginBottom: '6px', textTransform: 'uppercase' }}>
              {zh ? `🚫 違規 (${errorCount})` : `🚫 Errors (${errorCount})`}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {violations.filter(v => v.severity === 'error').map((v, i) => (
                <div key={`e-${i}`} style={{ padding: '8px 12px', borderRadius: '6px', fontSize: '13px', background: 'rgba(244,63,94,0.08)', borderLeft: '3px solid #f43f5e' }}>
                  {v.message}
                </div>
              ))}
            </div>
          </div>
        )}
        {warnCount > 0 && (
          <div style={{ marginBottom: '16px' }}>
            <div style={{ fontSize: '12px', fontWeight: 600, color: '#f59e0b', marginBottom: '6px', textTransform: 'uppercase' }}>
              {zh ? `⚠️ 警告 (${warnCount})` : `⚠️ Warnings (${warnCount})`}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {violations.filter(v => v.severity === 'warning').map((v, i) => (
                <div key={`w-${i}`} style={{ padding: '8px 12px', borderRadius: '6px', fontSize: '13px', background: 'rgba(245,158,11,0.08)', borderLeft: '3px solid #f59e0b' }}>
                  {v.message}
                </div>
              ))}
            </div>
          </div>
        )}
        {errorCount > 0 ? (
          <div>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '14px' }}>
              {zh
                ? '「自動修復」會移除違規班次並請 AI 找替代人員。若無法替補，可重新產生完整班表。'
                : '"Auto-fix" removes violating shifts and asks AI for replacements. If unavailable, you can regenerate the full schedule.'}
            </p>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              <button className="btn btn-primary" onClick={onAutoFix} disabled={fixLoading}>
                {fixLoading ? '⏳ …' : (zh ? '🔧 自動修復' : '🔧 Auto-fix')}
              </button>
              <button className="btn btn-secondary" onClick={onRegenerate} disabled={fixLoading || aiLoading}>
                {zh ? '🔄 重新排班' : '🔄 Regenerate'}
              </button>
              <div style={{ flex: 1 }} />
              <button className="btn" style={{ background: 'transparent', color: 'var(--text-muted)', fontSize: '13px' }}
                disabled={fixLoading} onClick={onClose}>
                {zh ? '取消' : 'Cancel'}
              </button>
            </div>
            <details style={{ marginTop: '16px' }}>
              <summary style={{ fontSize: '12px', color: 'var(--text-muted)', cursor: 'pointer' }}>
                {zh ? '進階：強制發布（忽略違規）' : 'Advanced: Force publish (ignore errors)'}
              </summary>
              <div style={{ marginTop: '8px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', cursor: 'pointer' }}>
                  <input type="checkbox" checked={violationAcknowledged} onChange={e => onSetViolationAcknowledged(e.target.checked)} />
                  {zh ? '我了解上述違規風險，仍要發布' : 'I acknowledge the risks and want to publish anyway'}
                </label>
                <button className="btn btn-sm" disabled={!violationAcknowledged || fixLoading}
                  style={{ marginTop: '8px', background: '#f43f5e', color: '#fff', border: 'none' }}
                  onClick={() => { if (pendingPublishId) onForcePublish(pendingPublishId); }}>
                  {zh ? '⚠️ 強制發布' : '⚠️ Force Publish'}
                </button>
              </div>
            </details>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: '10px' }}>
            <button className="btn btn-primary" onClick={() => { if (pendingPublishId) onForcePublish(pendingPublishId); }}>
              {zh ? '✅ 確認發布' : '✅ Confirm Publish'}
            </button>
            <button className="btn btn-secondary" onClick={onClose}>
              {zh ? '取消' : 'Cancel'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

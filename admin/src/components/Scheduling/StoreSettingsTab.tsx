import { useState } from 'react';
import { supabase } from '../../lib/supabase';
import type { Store, ShiftTemplate } from '../../types/scheduling';

export interface StoreSettingsTabProps {
  zh: boolean;
  stores: Store[];
  selectedStore: string;
  shiftTemplates: ShiftTemplate[];
  dayNames: string[];
  onSetStores: (updater: (prev: Store[]) => Store[]) => void;
  onSetShiftTemplates: (templates: ShiftTemplate[]) => void;
}

export function StoreSettingsTab(props: StoreSettingsTabProps) {
  const { zh, stores, selectedStore, shiftTemplates, dayNames, onSetStores, onSetShiftTemplates } = props;

  const [newShift, setNewShift] = useState({ name: '', start_time: '09:00', end_time: '17:00', break_minutes: '60', color: '#6366f1' });
  const [newNeed, setNewNeed] = useState<Record<string, { skill: string; count: string }>>({});

  const addShiftTemplate = async () => {
    if (!newShift.name) return;
    await supabase.from('shift_templates').insert({
      store_id: selectedStore, name: newShift.name, start_time: newShift.start_time,
      end_time: newShift.end_time, break_minutes: Number(newShift.break_minutes), color: newShift.color,
    });
    setNewShift({ name: '', start_time: '09:00', end_time: '17:00', break_minutes: '60', color: '#6366f1' });
    const { data } = await supabase.from('shift_templates').select('*').eq('store_id', selectedStore).order('start_time');
    onSetShiftTemplates(data || []);
  };

  const updateStaffingNeeds = async (templateId: string, needs: { skill: string; count: number }[]) => {
    await supabase.from('shift_templates').update({ staffing_needs: needs }).eq('id', templateId);
    onSetShiftTemplates(shiftTemplates.map(t => t.id === templateId ? { ...t, staffing_needs: needs } : t));
  };

  return (
    <div style={{ display: 'grid', gap: '20px' }}>
      {/* Shift templates */}
      <div className="card">
        <h3 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '14px' }}>
          🕐 {zh ? '班別設定' : 'Shift Templates'}
        </h3>
        {shiftTemplates.map(s => {
          const needs = s.staffing_needs || [];
          const needForm = newNeed[s.id] || { skill: '', count: '1' };
          return (
            <div key={s.id} style={{
              padding: '10px 12px', background: 'var(--bg-primary)', borderRadius: 'var(--radius-sm)',
              marginBottom: '8px', border: '1px solid var(--outline-variant)',
            }}>
              {/* Row 1: basic shift info */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: s.color, flexShrink: 0 }} />
                <span style={{ fontWeight: 600, minWidth: '60px' }}>{s.name}</span>
                <span style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>{s.start_time?.slice(0, 5)} – {s.end_time?.slice(0, 5)}</span>
                <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>{zh ? '休息' : 'Break'}: {s.break_minutes}{zh ? '分' : 'min'}</span>
                {/* Required skills tags */}
                {(s.required_skills || []).map(sk => (
                  <span key={sk} style={{ fontSize: '10px', padding: '1px 6px', borderRadius: '8px', background: '#6366f1', color: '#fff', display: 'inline-flex', alignItems: 'center', gap: '2px' }}>
                    {sk}
                    <button style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', padding: 0, fontSize: '10px' }}
                      onClick={async () => {
                        const updated = (s.required_skills || []).filter(x => x !== sk);
                        await supabase.from('shift_templates').update({ required_skills: updated }).eq('id', s.id);
                        onSetShiftTemplates(shiftTemplates.map(t => t.id === s.id ? { ...t, required_skills: updated } : t));
                      }}>✕</button>
                  </span>
                ))}
                <input className="input-field" style={{ width: '90px', fontSize: '10px', padding: '2px 6px' }}
                  placeholder={zh ? '+技能' : '+skill'}
                  onKeyDown={async (e) => {
                    if (e.key === 'Enter') {
                      const val = (e.target as HTMLInputElement).value.trim();
                      if (!val) return;
                      const updated = [...(s.required_skills || []), val];
                      await supabase.from('shift_templates').update({ required_skills: updated }).eq('id', s.id);
                      onSetShiftTemplates(shiftTemplates.map(t => t.id === s.id ? { ...t, required_skills: updated } : t));
                      (e.target as HTMLInputElement).value = '';
                    }
                  }} />
                <button className="btn btn-sm" style={{ marginLeft: 'auto', padding: '2px 6px', color: 'var(--accent-red)' }}
                  onClick={async () => { await supabase.from('shift_templates').delete().eq('id', s.id); const { data } = await supabase.from('shift_templates').select('*').eq('store_id', selectedStore).order('start_time'); onSetShiftTemplates(data || []); }}>✕</button>
              </div>

              {/* Row 2: Staffing needs (skill + count) */}
              <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px dashed var(--outline-variant)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                  <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>
                    👥 {zh ? '人力需求' : 'Staffing Needs'}
                  </span>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '6px' }}>
                  {needs.map((n, i) => (
                    <span key={i} style={{
                      display: 'inline-flex', alignItems: 'center', gap: '4px',
                      background: '#3b82f6', color: '#fff', padding: '3px 10px',
                      borderRadius: '12px', fontSize: '12px', fontWeight: 500,
                    }}>
                      {n.skill} ×{n.count}
                      <button style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', padding: 0, fontSize: '12px' }}
                        onClick={() => {
                          const updated = needs.filter((_, idx) => idx !== i);
                          updateStaffingNeeds(s.id, updated);
                        }}>✕</button>
                    </span>
                  ))}
                  {needs.length === 0 && (
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                      {zh ? '尚未設定（例如：廚房 ×2, 外場 ×1）' : 'Not set (e.g. kitchen ×2, waiter ×1)'}
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                  <input className="input-field" style={{ flex: 1, fontSize: '12px', maxWidth: '140px' }}
                    value={needForm.skill}
                    onChange={e => setNewNeed({ ...newNeed, [s.id]: { ...needForm, skill: e.target.value } })}
                    placeholder={zh ? '技能/角色 (如: 廚房)' : 'Skill/role (e.g. kitchen)'}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        const skill = needForm.skill.trim();
                        const count = parseInt(needForm.count) || 1;
                        if (!skill) return;
                        const updated = [...needs, { skill, count }];
                        updateStaffingNeeds(s.id, updated);
                        setNewNeed({ ...newNeed, [s.id]: { skill: '', count: '1' } });
                      }
                    }} />
                  <input className="input-field" type="number" min="1" style={{ width: '55px', fontSize: '12px', textAlign: 'center' }}
                    value={needForm.count}
                    onChange={e => setNewNeed({ ...newNeed, [s.id]: { ...needForm, count: e.target.value } })} />
                  <button className="btn btn-sm btn-primary" style={{ fontSize: '11px', padding: '3px 8px' }}
                    onClick={() => {
                      const skill = needForm.skill.trim();
                      const count = parseInt(needForm.count) || 1;
                      if (!skill) return;
                      const updated = [...needs, { skill, count }];
                      updateStaffingNeeds(s.id, updated);
                      setNewNeed({ ...newNeed, [s.id]: { skill: '', count: '1' } });
                    }}>+</button>
                </div>
              </div>
            </div>
          );
        })}
        <div style={{ display: 'flex', gap: '8px', marginTop: '12px', flexWrap: 'wrap' }}>
          <input className="input-field" value={newShift.name} onChange={e => setNewShift({ ...newShift, name: e.target.value })} placeholder={zh ? '班別名稱' : 'Shift name'} style={{ width: '100px' }} />
          <input className="input-field" type="time" value={newShift.start_time} onChange={e => setNewShift({ ...newShift, start_time: e.target.value })} style={{ width: '100px' }} />
          <input className="input-field" type="time" value={newShift.end_time} onChange={e => setNewShift({ ...newShift, end_time: e.target.value })} style={{ width: '100px' }} />
          <input className="input-field" type="number" value={newShift.break_minutes} onChange={e => setNewShift({ ...newShift, break_minutes: e.target.value })} style={{ width: '70px' }} placeholder={zh ? '休息' : 'Break'} />
          <input className="input-field" type="color" value={newShift.color} onChange={e => setNewShift({ ...newShift, color: e.target.value })} style={{ width: '42px', padding: '2px' }} />
          <button className="btn btn-primary btn-sm" aria-label={zh ? '新增班次' : 'Add shift'} onClick={addShiftTemplate}>➕</button>
        </div>
      </div>

      {/* Operating hours */}
      <div className="card">
        <h3 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '14px' }}>🏪 {zh ? '營業時間' : 'Operating Hours'}</h3>
        {(() => {
          const store = stores.find(s => s.id === selectedStore);
          const hours = store?.operating_hours || {};
          const dayKeys = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
          return dayKeys.map((dk, i) => (
            <div key={dk} style={{ display: 'flex', gap: '12px', alignItems: 'center', padding: '6px 0', borderBottom: 'none' }}>
              <span style={{ fontWeight: 600, width: '36px', textAlign: 'center' }}>{dayNames[i]}</span>
              <span style={{ fontSize: '13px', color: hours[dk]?.open === 'closed' ? 'var(--text-muted)' : 'var(--text-primary)' }}>
                {hours[dk]?.open === 'closed' ? (zh ? '休息日' : 'Closed') : `${hours[dk]?.open || '—'} – ${hours[dk]?.close || '—'}`}
              </span>
            </div>
          ));
        })()}
      </div>

      {/* Variable Working Hours */}
      <div className="card">
        <h3 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '14px' }}>⏰ {zh ? '變形工時制度' : 'Variable Working Hours'}</h3>
        {(() => {
          const store = stores.find(s => s.id === selectedStore);
          const whType = store?.working_hour_type || 'standard';
          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '4px' }}>
                  {zh ? '工時制度' : 'Working Hour Type'}
                </label>
                <select className="input-field" style={{ maxWidth: '300px' }} value={whType}
                  onChange={async (e) => {
                    const val = e.target.value;
                    await supabase.from('stores').update({ working_hour_type: val }).eq('id', selectedStore);
                    onSetStores(prev => prev.map(s => s.id === selectedStore ? { ...s, working_hour_type: val } : s));
                  }}>
                  <option value="standard">{zh ? '標準工時 (每週40h)' : 'Standard (40h/week)'}</option>
                  <option value="2week">{zh ? '二週變形 (每日上限10h, 雙週84h)' : '2-Week Variable (10h/day, 84h/2wk)'}</option>
                  <option value="4week">{zh ? '四週變形 (每日上限10h, 四週168h)' : '4-Week Variable (10h/day, 168h/4wk)'}</option>
                  <option value="8week">{zh ? '八週變形 (每日上限8h, 八週320h)' : '8-Week Variable (8h/day, 320h/8wk)'}</option>
                </select>
              </div>
              {whType !== 'standard' && (
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '4px' }}>
                    {zh ? '變形工時起算日' : 'Period Start Date'}
                  </label>
                  <input type="date" className="input-field" style={{ maxWidth: '200px' }}
                    value={store?.variable_period_start || ''}
                    onChange={async (e) => {
                      await supabase.from('stores').update({ variable_period_start: e.target.value }).eq('id', selectedStore);
                      onSetStores(prev => prev.map(s => s.id === selectedStore ? { ...s, variable_period_start: e.target.value } : s));
                    }} />
                </div>
              )}
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                {whType === 'standard' && (zh ? '標準每週40小時，每日不超過8小時（勞基法§30-1）' : 'Standard 40h/week, max 8h/day (§30-1)')}
                {whType === '2week' && (zh ? '二週內不超過84小時，每日不超過10小時（§30-2）' : '84h per 2 weeks, max 10h/day (§30-2)')}
                {whType === '4week' && (zh ? '四週內不超過168小時，每日不超過10小時（§30-3）' : '168h per 4 weeks, max 10h/day (§30-3)')}
                {whType === '8week' && (zh ? '八週內不超過320小時，每日不超過8小時（§30-4）' : '320h per 8 weeks, max 8h/day (§30-4)')}
              </div>
            </div>
          );
        })()}
      </div>

      {/* GAP-6: Labor Cost Budget */}
      <div className="card">
        <h3 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '14px' }}>💰 {zh ? '人力成本預算' : 'Labor Cost Budget'}</h3>
        {(() => {
          const store = stores.find(s => s.id === selectedStore);
          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '4px' }}>
                    {zh ? '每週預算 (NT$)' : 'Weekly Budget (NT$)'}
                  </label>
                  <input type="number" className="input-field" style={{ maxWidth: '180px' }}
                    value={store?.default_labor_budget || ''}
                    placeholder={zh ? '例如 50000' : 'e.g. 50000'}
                    onChange={async (e) => {
                      const val = e.target.value ? Number(e.target.value) : null;
                      await supabase.from('stores').update({ default_labor_budget: val }).eq('id', selectedStore);
                      onSetStores(prev => prev.map(s => s.id === selectedStore ? { ...s, default_labor_budget: val ?? undefined } : s));
                    }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '4px' }}>
                    {zh ? '預設時薪 (NT$)' : 'Default Hourly Rate (NT$)'}
                  </label>
                  <input type="number" className="input-field" style={{ maxWidth: '140px' }}
                    value={store?.hourly_rate_default || 183}
                    onChange={async (e) => {
                      const val = Number(e.target.value) || 183;
                      await supabase.from('stores').update({ hourly_rate_default: val }).eq('id', selectedStore);
                      onSetStores(prev => prev.map(s => s.id === selectedStore ? { ...s, hourly_rate_default: val } : s));
                    }} />
                </div>
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                {zh ? '設定每週人力成本預算，超過 90% 會顯示警告，超過 100% 會標記為違規。2026 年基本工資：NT$183/h。' : 'Set weekly labor cost budget. Warnings at 90%, violations at 100%. 2026 minimum wage: NT$183/h.'}
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );
}

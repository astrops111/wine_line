import { useState, useEffect } from 'react';
import { format, parseISO } from 'date-fns';
import { supabase } from '../../lib/supabase';
import { getCurrentPosition } from '../../lib/geo';
import type { StoreGpsConfig, CorrectionData, ClockInStatus } from '../../types/liffApp';

interface ClockInPanelProps {
  employeeId: string;
  userStoreId: string | null;
  storeGpsConfig: StoreGpsConfig | null;
  timeRecords: any[];
  onTimeRecordsRefresh: () => Promise<void>;
  /** When set, auto-opens the correction form for this record ID */
  pendingCorrectionRecordId?: string | null;
  onCorrectionHandled?: () => void;
}

export function ClockInPanel({
  employeeId,
  userStoreId,
  storeGpsConfig,
  timeRecords,
  onTimeRecordsRefresh,
  pendingCorrectionRecordId,
  onCorrectionHandled,
}: ClockInPanelProps) {
  const [clockInStatus, setClockInStatus] = useState<ClockInStatus>('idle');
  const [clockInMessage, setClockInMessage] = useState('');
  const [showCorrectionForm, setShowCorrectionForm] = useState<string | null>(null);
  const [correctionData, setCorrectionData] = useState<CorrectionData>({
    requested_clock_in: '',
    requested_clock_out: '',
    reason: '',
    correction_type: 'both',
  });
  const [correctionSubmitting, setCorrectionSubmitting] = useState(false);

  // Auto-open correction form when navigating from HoursPanel
  useEffect(() => {
    if (pendingCorrectionRecordId) {
      const record = timeRecords.find((r: any) => r.id === pendingCorrectionRecordId);
      setShowCorrectionForm(pendingCorrectionRecordId);
      setCorrectionData({
        requested_clock_in: record?.clock_in ? record.clock_in.slice(0, 16) : '',
        requested_clock_out: record?.clock_out ? record.clock_out.slice(0, 16) : '',
        reason: '',
        correction_type: 'both',
      });
      onCorrectionHandled?.();
    }
  }, [pendingCorrectionRecordId]);

  const handleGpsClockIn = async () => {
    setClockInStatus('locating');
    setClockInMessage('');

    try {
      // Step 1: Collect GPS client-side (browser API must run here)
      let userLat: number | null = null;
      let userLng: number | null = null;
      const method = storeGpsConfig?.clock_in_method ?? 'open';
      const needsGps = method === 'gps_required' || method === 'gps_or_wifi';

      try {
        const position = await getCurrentPosition();
        userLat = position.coords.latitude;
        userLng = position.coords.longitude;
      } catch (gpsErr: any) {
        if (needsGps) {
          setClockInStatus('error');
          setClockInMessage(
            gpsErr.code === 1
              ? '\u4F4D\u7F6E\u5B58\u53D6\u88AB\u62D2\u7D55\uFF0C\u8ACB\u5141\u8A31\u5B9A\u4F4D\u6B0A\u9650\u3002'
              : `\u5B9A\u4F4D\u5931\u6557\uFF1A${gpsErr.message}`,
          );
          return;
        }
        // For 'open'/'any'/'wifi', GPS failure is non-fatal
      }

      // Step 2: Call edge function for server-side validation & DB write
      const { data, error } = await supabase.functions.invoke('clock-in', {
        body: {
          user_id: employeeId,
          store_id: userStoreId,
          user_lat: userLat,
          user_lng: userLng,
        },
      });

      if (error) throw error;

      if (data.success) {
        setClockInStatus('success');
        setClockInMessage(`\u2705 ${data.message}`);
        await onTimeRecordsRefresh();
        setTimeout(() => setClockInStatus('idle'), 3000);
      } else if (data.code === 'OUT_OF_RANGE') {
        setClockInStatus('out_of_range');
        setClockInMessage(data.message);
      } else if (data.code === 'WIFI_NOT_CONNECTED') {
        setClockInStatus('out_of_range');
        setClockInMessage(data.message);
      } else if (data.code === 'GPS_REQUIRED') {
        setClockInStatus('error');
        setClockInMessage(data.message);
      } else {
        setClockInStatus('error');
        setClockInMessage(data.message || '\u6253\u5361\u5931\u6557');
      }
    } catch (err: any) {
      setClockInStatus('error');
      setClockInMessage(`\u6253\u5361\u5931\u6557\uFF1A${err.message}`);
    }
  };

  const submitCorrection = async (timeRecordId: string | null) => {
    if (!correctionData.reason) return;
    setCorrectionSubmitting(true);
    try {
      const record = timeRecordId ? timeRecords.find((r: any) => r.id === timeRecordId) : null;
      await supabase.from('punch_corrections').insert({
        user_id: employeeId,
        store_id: userStoreId,
        time_record_id: timeRecordId,
        correction_type: correctionData.correction_type,
        original_clock_in: record?.clock_in || null,
        original_clock_out: record?.clock_out || null,
        requested_clock_in: correctionData.requested_clock_in || null,
        requested_clock_out: correctionData.requested_clock_out || null,
        reason: correctionData.reason,
        status: 'pending',
      });
      setShowCorrectionForm(null);
      setCorrectionData({ requested_clock_in: '', requested_clock_out: '', reason: '', correction_type: 'both' });
      alert('\u66F4\u6B63\u7533\u8ACB\u5DF2\u63D0\u4EA4\uFF0C\u5F85\u4E3B\u7BA1\u5BE9\u6838\u3002');
    } catch (err: any) {
      alert(`\u63D0\u4EA4\u5931\u6557\uFF1A${err.message}`);
    } finally {
      setCorrectionSubmitting(false);
    }
  };

  return (
    <div className="p-4 space-y-4">
      <h2 className="text-lg font-bold text-gray-800 mb-2">GPS \u6253\u5361</h2>

      {storeGpsConfig && (
        <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-600 border border-gray-200">
          <div className="font-medium text-gray-800">{storeGpsConfig.name}</div>
          {storeGpsConfig.gps_lat && (
            <div className="mt-1 text-xs text-gray-500">
              \u5141\u8A31\u7BC4\u570D\uFF1A{storeGpsConfig.gps_radius_m || 200}m
            </div>
          )}
          {!storeGpsConfig.gps_lat && (
            <div className="text-xs text-amber-600 mt-1">\u26A0\uFE0F \u6B64\u9580\u5E02\u5C1A\u672A\u8A2D\u5B9A GPS \u5EA7\u6A19\uFF08\u624B\u52D5\u6253\u5361\u6A21\u5F0F\uFF09</div>
          )}
        </div>
      )}

      <button
        onClick={handleGpsClockIn}
        disabled={clockInStatus === 'locating'}
        className={`w-full py-6 rounded-2xl text-white text-xl font-bold shadow-lg transition-colors ${
          clockInStatus === 'locating'
            ? 'bg-gray-400 cursor-not-allowed'
            : clockInStatus === 'success'
            ? 'bg-green-500'
            : clockInStatus === 'error' || clockInStatus === 'out_of_range'
            ? 'bg-red-500'
            : 'bg-indigo-600 active:scale-95'
        }`}
      >
        {clockInStatus === 'locating' ? '\u5B9A\u4F4D\u4E2D\u2026' :
         clockInStatus === 'success' ? '\u6253\u5361\u5B8C\u6210 \u2713' :
         clockInStatus === 'error' ? '\u6253\u5361\u5931\u6557' :
         clockInStatus === 'out_of_range' ? (storeGpsConfig?.clock_in_method === 'wifi' ? '\u672A\u9023\u63A5 WiFi' : '\u8D85\u51FA\u7BC4\u570D') :
         '\u6253\u5361'}
      </button>

      {clockInMessage && (
        <div className={`rounded-lg p-3 text-sm text-center font-medium ${
          clockInStatus === 'success' ? 'bg-green-50 text-green-700'
          : clockInStatus === 'out_of_range' ? 'bg-amber-50 text-amber-700'
          : 'bg-red-50 text-red-700'
        }`}>
          {clockInMessage}
        </div>
      )}

      {clockInStatus === 'out_of_range' && (
        <button
          className="w-full py-3 border border-gray-300 rounded-xl text-sm text-gray-600"
          onClick={() => {
            setShowCorrectionForm('new');
            setCorrectionData({ ...correctionData, correction_type: 'missing', requested_clock_in: new Date().toISOString().slice(0, 16) });
          }}
        >
          \uD83D\uDCDD \u63D0\u4EA4\u4EBA\u5DE5\u88DC\u6253\u7533\u8ACB
        </button>
      )}

      {/* Break Tracking */}
      {(() => {
        const activeRecord = timeRecords.find((r: any) => r.clock_in && !r.clock_out);
        if (!activeRecord) return null;
        const onBreak = activeRecord.break_start && !activeRecord.break_end;
        return (
          <div className="bg-amber-50 rounded-xl p-3 border border-amber-200">
            <div className="text-sm font-semibold text-amber-800 mb-2">{'\u2615'} {'\u4F11\u606F\u6642\u9593'}</div>
            {onBreak ? (
              <button
                className="w-full py-3 rounded-xl bg-amber-500 text-white font-bold text-base"
                onClick={async () => {
                  const breakEnd = new Date().toISOString();
                  const breakStartTime = new Date(activeRecord.break_start).getTime();
                  const breakMins = Math.round((new Date(breakEnd).getTime() - breakStartTime) / 60000);
                  await supabase.from('time_records').update({
                    break_end: breakEnd,
                    break_minutes: (activeRecord.break_minutes || 0) + breakMins,
                  }).eq('id', activeRecord.id);
                  await onTimeRecordsRefresh();
                }}
              >
                {'\u7D50\u675F\u4F11\u606F'} ({Math.round((Date.now() - new Date(activeRecord.break_start).getTime()) / 60000)} {'\u5206\u9418'})
              </button>
            ) : (
              <button
                className="w-full py-3 rounded-xl border-2 border-amber-400 text-amber-700 font-bold text-base"
                onClick={async () => {
                  await supabase.from('time_records').update({
                    break_start: new Date().toISOString(),
                    break_end: null,
                  }).eq('id', activeRecord.id);
                  await onTimeRecordsRefresh();
                }}
              >
                {'\u958B\u59CB\u4F11\u606F'}
              </button>
            )}
          </div>
        );
      })()}

      {/* Today's Records Summary */}
      <div>
        <h3 className="text-sm font-semibold text-gray-600 mb-2">\u4ECA\u65E5\u6253\u5361\u8A18\u9304</h3>
        {timeRecords.slice(0, 3).map((record: any) => (
          <div key={record.id} className="bg-white rounded-lg p-3 shadow-sm mb-2 flex justify-between items-center">
            <div>
              <div className="text-sm font-medium">
                {record.clock_in ? format(parseISO(record.clock_in), 'HH:mm') : '--:--'}
                {' \u2192 '}
                {record.clock_out ? format(parseISO(record.clock_out), 'HH:mm') : '\u9032\u884C\u4E2D'}
              </div>
              <div className="text-xs text-gray-500">{record.stores?.name}</div>
            </div>
            <span className={`text-xs px-2 py-1 rounded-full ${record.is_late ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
              {record.is_late ? '\u9072\u5230' : '\u6B63\u5E38'}
            </span>
          </div>
        ))}
      </div>

      {/* Punch Correction Form */}
      {showCorrectionForm && (
        <div className="bg-white rounded-xl shadow p-4 border border-indigo-200">
          <h3 className="font-bold text-gray-800 mb-3">\uD83D\uDCDD \u6253\u5361\u66F4\u6B63\u7533\u8ACB</h3>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-gray-500">\u7533\u8ACB\u985E\u578B</label>
              <select
                className="w-full mt-1 border rounded-lg p-2 text-sm"
                value={correctionData.correction_type}
                onChange={e => setCorrectionData({ ...correctionData, correction_type: e.target.value })}
              >
                <option value="both">\u4E0A\u4E0B\u73ED\u5747\u66F4\u6B63</option>
                <option value="clock_in">\u50C5\u66F4\u6B63\u4E0A\u73ED\u6642\u9593</option>
                <option value="clock_out">\u50C5\u66F4\u6B63\u4E0B\u73ED\u6642\u9593</option>
                <option value="missing">\u88DC\u767B\u6253\u5361</option>
              </select>
            </div>
            {(correctionData.correction_type === 'clock_in' || correctionData.correction_type === 'both' || correctionData.correction_type === 'missing') && (
              <div>
                <label className="text-xs text-gray-500">\u7533\u8ACB\u4E0A\u73ED\u6642\u9593</label>
                <input type="datetime-local" className="w-full mt-1 border rounded-lg p-2 text-sm"
                  value={correctionData.requested_clock_in}
                  onChange={e => setCorrectionData({ ...correctionData, requested_clock_in: e.target.value })} />
              </div>
            )}
            {(correctionData.correction_type === 'clock_out' || correctionData.correction_type === 'both' || correctionData.correction_type === 'missing') && (
              <div>
                <label className="text-xs text-gray-500">\u7533\u8ACB\u4E0B\u73ED\u6642\u9593</label>
                <input type="datetime-local" className="w-full mt-1 border rounded-lg p-2 text-sm"
                  value={correctionData.requested_clock_out}
                  onChange={e => setCorrectionData({ ...correctionData, requested_clock_out: e.target.value })} />
              </div>
            )}
            <div>
              <label className="text-xs text-gray-500">\u539F\u56E0\u8AAA\u660E *</label>
              <textarea className="w-full mt-1 border rounded-lg p-2 text-sm" rows={3} placeholder="\u8ACB\u8AAA\u660E\u66F4\u6B63\u539F\u56E0\u2026"
                value={correctionData.reason}
                onChange={e => setCorrectionData({ ...correctionData, reason: e.target.value })} />
            </div>
            <div className="flex gap-2">
              <button
                className="flex-1 bg-indigo-600 text-white py-2 rounded-lg text-sm font-medium disabled:opacity-50"
                disabled={correctionSubmitting || !correctionData.reason}
                onClick={() => submitCorrection(showCorrectionForm === 'new' ? null : showCorrectionForm)}
              >
                {correctionSubmitting ? '\u63D0\u4EA4\u4E2D\u2026' : '\u63D0\u4EA4\u7533\u8ACB'}
              </button>
              <button className="px-4 border rounded-lg text-sm text-gray-600"
                onClick={() => { setShowCorrectionForm(null); setCorrectionData({ requested_clock_in: '', requested_clock_out: '', reason: '', correction_type: 'both' }); }}>
                \u53D6\u6D88
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

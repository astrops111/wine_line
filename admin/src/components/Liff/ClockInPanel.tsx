import { useState, useEffect } from 'react';
import { format, parseISO } from 'date-fns';
import { supabase } from '../../lib/supabase';
import { getCurrentPosition, haversineDistance } from '../../lib/geo';
import type { StoreGpsConfig, CorrectionData, ClockInStatus } from '../../types/liffApp';
import { getClientIp } from '../../types/liffApp';

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

    const method = storeGpsConfig?.clock_in_method ?? 'open';
    const wifiAllowedIps = storeGpsConfig?.wifi_allowed_ips ?? [];

    const doClockRecord = async (
      userLat: number | null,
      userLng: number | null,
      distanceM: number | null,
      clockInMethod: string,
    ) => {
      const today = new Date().toISOString().split('T')[0];
      const { data: existing } = await supabase
        .from('time_records')
        .select('id, clock_in, clock_out')
        .eq('user_id', employeeId)
        .gte('clock_in', today)
        .is('clock_out', null)
        .maybeSingle();

      if (existing) {
        const { error } = await supabase.from('time_records').update({
          clock_out: new Date().toISOString(),
          clock_in_lat: userLat,
          clock_in_lng: userLng,
          clock_in_distance_m: distanceM,
          clock_in_method: clockInMethod,
        }).eq('id', existing.id);
        if (error) throw error;
        setClockInStatus('success');
        setClockInMessage('\u2705 \u6253\u5361\u9000\u51FA\u6210\u529F\uFF01');
      } else {
        const { error } = await supabase.from('time_records').insert({
          user_id: employeeId,
          store_id: userStoreId,
          clock_in: new Date().toISOString(),
          is_late: false,
          clock_in_lat: userLat,
          clock_in_lng: userLng,
          clock_in_distance_m: distanceM,
          clock_in_method: clockInMethod,
        });
        if (error) throw error;
        setClockInStatus('success');
        if (clockInMethod === 'wifi') {
          setClockInMessage('\u2705 \u6253\u5361\u6210\u529F\uFF01\uFF08WiFi \u9A57\u8B49\uFF09');
        } else if (clockInMethod === 'gps') {
          setClockInMessage(`\u2705 \u6253\u5361\u6210\u529F\uFF01\u8DDD\u9580\u5E02 ${distanceM ?? '?'}m`);
        } else {
          setClockInMessage('\u2705 \u6253\u5361\u6210\u529F\uFF01');
        }
      }
      await onTimeRecordsRefresh();
      setTimeout(() => setClockInStatus('idle'), 3000);
    };

    try {
      if (method === 'wifi') {
        const ip = await getClientIp();
        if (!ip || !wifiAllowedIps.includes(ip)) {
          setClockInStatus('out_of_range');
          setClockInMessage('\u672A\u9023\u63A5\u9580\u5E02 WiFi \u7DB2\u8DEF');
          return;
        }
        await doClockRecord(null, null, null, 'wifi');
      } else if (method === 'gps_required') {
        const position = await getCurrentPosition();
        const { latitude: userLat, longitude: userLng } = position.coords;
        let distanceM: number | null = null;
        let withinRange = true;
        if (storeGpsConfig?.gps_lat && storeGpsConfig?.gps_lng) {
          distanceM = Math.round(haversineDistance(userLat, userLng, storeGpsConfig.gps_lat, storeGpsConfig.gps_lng));
          withinRange = distanceM <= (storeGpsConfig.gps_radius_m || 200);
        }
        if (!withinRange) {
          setClockInStatus('out_of_range');
          setClockInMessage(`\u8DDD\u96E2\u9580\u5E02 ${distanceM}m\uFF0C\u8D85\u51FA\u5141\u8A31\u7BC4\u570D ${storeGpsConfig?.gps_radius_m || 200}m`);
          return;
        }
        await doClockRecord(userLat, userLng, distanceM, 'gps');
      } else if (method === 'gps_or_wifi') {
        const position = await getCurrentPosition();
        const { latitude: userLat, longitude: userLng } = position.coords;
        let distanceM: number | null = null;
        let withinRange = true;
        if (storeGpsConfig?.gps_lat && storeGpsConfig?.gps_lng) {
          distanceM = Math.round(haversineDistance(userLat, userLng, storeGpsConfig.gps_lat, storeGpsConfig.gps_lng));
          withinRange = distanceM <= (storeGpsConfig.gps_radius_m || 200);
        }
        if (withinRange) {
          await doClockRecord(userLat, userLng, distanceM, 'gps');
        } else {
          const ip = await getClientIp();
          if (ip && wifiAllowedIps.includes(ip)) {
            await doClockRecord(userLat, userLng, distanceM, 'wifi');
          } else {
            setClockInStatus('out_of_range');
            setClockInMessage(`\u8DDD\u96E2\u9580\u5E02 ${distanceM}m\uFF0C\u4E14\u672A\u9023\u63A5\u9580\u5E02 WiFi`);
          }
        }
      } else {
        const position = await getCurrentPosition().catch(() => null);
        const userLat = position?.coords.latitude ?? null;
        const userLng = position?.coords.longitude ?? null;
        let distanceM: number | null = null;
        if (userLat !== null && userLng !== null && storeGpsConfig?.gps_lat && storeGpsConfig?.gps_lng) {
          distanceM = Math.round(haversineDistance(userLat, userLng, storeGpsConfig.gps_lat, storeGpsConfig.gps_lng));
        }
        await doClockRecord(userLat, userLng, distanceM, 'manual');
      }
    } catch (err: any) {
      setClockInStatus('error');
      setClockInMessage(
        err.code === 1
          ? '\u4F4D\u7F6E\u5B58\u53D6\u88AB\u62D2\u7D55\uFF0C\u8ACB\u5141\u8A31\u5B9A\u4F4D\u6B0A\u9650\u3002'
          : `\u5B9A\u4F4D\u5931\u6557\uFF1A${err.message}`,
      );
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

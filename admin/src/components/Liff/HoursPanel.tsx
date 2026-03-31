import { format, parseISO } from 'date-fns';
import { zhTW } from 'date-fns/locale';

interface HoursPanelProps {
  timeRecords: any[];
  onCorrectionRequest: (recordId: string) => void;
}

export function HoursPanel({ timeRecords, onCorrectionRequest }: HoursPanelProps) {
  const totalHours = timeRecords.reduce((sum: number, r: any) => sum + (r.total_hours || 0), 0);

  return (
    <div className="p-4 space-y-4">
      <div className="bg-indigo-600 rounded-xl p-6 text-white shadow-md">
        <h2 className="text-indigo-100 font-medium mb-1">{'\u672C\u9031\u7D2F\u7A4D\u5DE5\u6642'}</h2>
        <div className="text-4xl font-bold">{totalHours.toFixed(1)} <span className="text-lg font-normal">{'\u5C0F\u6642'}</span></div>
      </div>

      <h3 className="text-lg font-bold text-gray-800 mt-6 mb-4">{'\u6253\u5361\u7D00\u9304'}</h3>
      {timeRecords.length === 0 ? (
        <div className="text-center bg-white rounded-lg shadow p-6 text-gray-500">
          <p>{'\u672C\u9031\u5C1A\u7121\u6253\u5361\u7D00\u9304'}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {timeRecords.map((record: any) => (
            <div key={record.id} className="bg-white rounded-lg shadow p-4">
              <div className="flex justify-between items-start mb-2">
                <div className="font-medium text-gray-800">
                  {format(parseISO(record.clock_in), 'MM/dd (E)', { locale: zhTW })}
                </div>
                <div className="text-right">
                  <div className="font-bold text-indigo-600">{record.total_hours?.toFixed(1) || 0} hr</div>
                </div>
              </div>
              <div className="text-sm text-gray-600 flex items-center justify-between">
                <span>
                  {format(parseISO(record.clock_in), 'HH:mm')} -
                  {record.clock_out ? format(parseISO(record.clock_out), 'HH:mm') : ' \u9032\u884C\u4E2D'}
                </span>
                {record.is_late && (
                  <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded">{'\u9072\u5230'}</span>
                )}
              </div>
              <button
                className="text-xs text-indigo-500 mt-1 underline"
                onClick={() => onCorrectionRequest(record.id)}
              >
                {'\u66F4\u6B63\u7533\u8ACB'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

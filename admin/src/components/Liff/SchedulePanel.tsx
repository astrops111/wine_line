import { Calendar, MapPin } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { zhTW } from 'date-fns/locale';

interface SchedulePanelProps {
  shifts: any[];
  loadingData: boolean;
}

export function SchedulePanel({ shifts, loadingData }: SchedulePanelProps) {
  return (
    <div className="p-4 space-y-4">
      <h2 className="text-lg font-bold text-gray-800 mb-4">{'\u8FD1\u671F\u73ED\u8868'}</h2>
      {loadingData ? (
        <div className="text-center text-gray-500 py-8">{'\u8F09\u5165\u4E2D...'}</div>
      ) : shifts.length === 0 ? (
        <div className="text-center bg-white rounded-lg shadow p-6 text-gray-500">
          <Calendar className="mx-auto h-12 w-12 text-gray-300 mb-2" aria-hidden="true" />
          <p>{'\u76EE\u524D\u6C92\u6709\u8FD1\u671F\u6392\u73ED'}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {shifts.map((shift: any) => (
            <div key={shift.id} className="bg-white rounded-lg shadow p-4 border-l-4 border-indigo-500">
              <div className="flex justify-between items-start mb-2">
                <div>
                  <div className="font-bold text-gray-800 text-lg">
                    {format(parseISO(shift.date), 'MM/dd (E)', { locale: zhTW })}
                  </div>
                  <div className="text-sm font-medium text-indigo-600 mt-1">
                    {shift.start_time.substring(0, 5)} - {shift.end_time.substring(0, 5)}
                  </div>
                </div>
                <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-green-100 text-green-800">
                  {shift.status === 'published' ? '\u5DF2\u767C\u5E03' : '\u5DF2\u78BA\u8A8D'}
                </span>
              </div>
              <div className="flex items-center text-sm text-gray-500 mt-2">
                <MapPin size={14} className="mr-1" aria-hidden="true" />
                {shift.stores?.name}
                {shift.shift_templates?.name && (
                  <span className="ml-2 px-1.5 py-0.5 bg-gray-100 rounded text-xs">
                    {shift.shift_templates.name}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

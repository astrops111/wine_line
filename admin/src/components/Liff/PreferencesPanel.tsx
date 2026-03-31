import { Clock, Settings } from 'lucide-react';
import { DAYS_OF_WEEK, availLabel, availColor } from '../../types/liffApp';

interface PreferencesPanelProps {
  availabilities: any[];
  shiftTemplates: any[];
}

export function PreferencesPanel({ availabilities, shiftTemplates }: PreferencesPanelProps) {
  return (
    <div className="p-4 space-y-4">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-bold text-gray-800">{'\u6392\u73ED\u504F\u597D\u8A2D\u5B9A'}</h2>
        <button className="bg-indigo-600 text-white px-3 py-1.5 rounded text-sm disabled:opacity-50">
          {'\u65B0\u589E\u504F\u597D'}
        </button>
      </div>

      <p className="text-sm text-gray-500 bg-blue-50 p-3 rounded-lg border border-blue-100">
        {'\u60A8\u53EF\u4EE5\u5728\u6B64\u8A2D\u5B9A\u6BCF\u9031\u56FA\u5B9A\u7684\u6392\u73ED\u504F\u597D\u3002\u7CFB\u7D71\u8207\u5E97\u9577\u6392\u73ED\u6642\u5C07\u6703\u53C3\u8003\u9019\u4E9B\u8A2D\u5B9A\u3002'}
      </p>

      {availabilities.length === 0 ? (
        <div className="text-center bg-white rounded-lg shadow p-6 text-gray-500">
          <Settings className="mx-auto h-12 w-12 text-gray-300 mb-2" aria-hidden="true" />
          <p>{'\u5C1A\u672A\u8A2D\u5B9A\u4EFB\u4F55\u6392\u73ED\u504F\u597D'}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {availabilities.map((avail: any) => {
            const day = DAYS_OF_WEEK.find(d => d.id === avail.day_of_week);
            const template = shiftTemplates.find((t: any) => t.id === avail.preferred_shift_id);

            return (
              <div
                key={avail.id}
                className={`bg-white rounded-lg shadow p-4 border-l-4 ${
                  avail.availability === 'available' ? 'border-green-500' :
                  avail.availability === 'preferred' ? 'border-indigo-500' : 'border-red-500'
                }`}
              >
                <div className="flex justify-between items-center mb-2">
                  <div className="font-bold text-gray-800 text-lg">
                    {day?.zh}
                  </div>
                  <div className={`px-2 py-1 rounded text-xs font-medium border ${availColor(avail.availability)}`}>
                    {availLabel(avail.availability)}
                  </div>
                </div>

                {template && (
                  <div className="text-sm text-gray-600 mt-2 flex items-center">
                    <Clock size={14} className="mr-1" aria-hidden="true" />
                    {'\u671F\u671B\u73ED\u5225: '}<span className="font-medium ml-1">{template.name} ({template.start_time.substring(0, 5)} - {template.end_time.substring(0, 5)})</span>
                  </div>
                )}

                {avail.notes && (
                  <div className="text-sm text-gray-500 mt-2 bg-gray-50 p-2 rounded">
                    {'\u5099\u8A3B: '}{avail.notes}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

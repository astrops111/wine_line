import { useState, useEffect } from 'react';
import { format, parseISO } from 'date-fns';
import { supabase } from '../../lib/supabase';
import type { ProfileForm } from '../../types/liffApp';

interface ProfilePanelProps {
  employeeId: string;
}

export function ProfilePanel({ employeeId }: ProfilePanelProps) {
  const [profileData, setProfileData] = useState<any>(null);
  const [profileForm, setProfileForm] = useState<ProfileForm>({
    phone: '',
    address: '',
    emergency_contact_name: '',
    emergency_contact_phone: '',
    bank_code: '',
    bank_account: '',
  });
  const [profileSaving, setProfileSaving] = useState(false);

  useEffect(() => {
    loadProfile();
  }, [employeeId]);

  const loadProfile = async () => {
    const { data } = await supabase
      .from('users')
      .select('name, employee_id, phone, address, emergency_contact_name, emergency_contact_phone, bank_code, bank_account, hire_date, position, nationality')
      .eq('id', employeeId)
      .single();
    if (data) {
      setProfileData(data);
      setProfileForm({
        phone: data.phone || '',
        address: data.address || '',
        emergency_contact_name: data.emergency_contact_name || '',
        emergency_contact_phone: data.emergency_contact_phone || '',
        bank_code: data.bank_code || '',
        bank_account: data.bank_account || '',
      });
    }
  };

  const saveProfile = async () => {
    setProfileSaving(true);
    await supabase.from('users').update({
      phone: profileForm.phone || null,
      address: profileForm.address || null,
      emergency_contact_name: profileForm.emergency_contact_name || null,
      emergency_contact_phone: profileForm.emergency_contact_phone || null,
      bank_code: profileForm.bank_code || null,
      bank_account: profileForm.bank_account || null,
    }).eq('id', employeeId);
    setProfileSaving(false);
    alert('\u5DF2\u5132\u5B58');
  };

  if (!profileData) {
    return <div className="p-4 text-center text-gray-500">{'\u8F09\u5165\u4E2D\u2026'}</div>;
  }

  const readOnlyFields = [
    { label: '\u59D3\u540D', value: profileData.name },
    { label: '\u54E1\u5DE5\u7DE8\u865F', value: profileData.employee_id || '\u2014' },
    { label: '\u5230\u8077\u65E5', value: profileData.hire_date ? format(parseISO(profileData.hire_date), 'yyyy-MM-dd') : '\u2014' },
    { label: '\u8077\u4F4D', value: profileData.position || '\u2014' },
    { label: '\u570B\u7C4D', value: profileData.nationality || '\u2014' },
  ];

  const editFields: { key: keyof ProfileForm; label: string }[] = [
    { key: 'phone', label: '\u96FB\u8A71' },
    { key: 'address', label: '\u5730\u5740' },
    { key: 'emergency_contact_name', label: '\u7DCA\u6025\u806F\u7D61\u4EBA' },
    { key: 'emergency_contact_phone', label: '\u7DCA\u6025\u806F\u7D61\u96FB\u8A71' },
    { key: 'bank_code', label: '\u9280\u884C\u4EE3\u78BC' },
    { key: 'bank_account', label: '\u9280\u884C\u5E33\u865F' },
  ];

  return (
    <div className="p-4 space-y-4">
      <div className="bg-white rounded-xl shadow-sm p-4">
        <h3 className="text-sm font-semibold text-gray-500 mb-3">{'\u57FA\u672C\u8CC7\u8A0A\uFF08\u552F\u8B80\uFF09'}</h3>
        <div className="space-y-2">
          {readOnlyFields.map(f => (
            <div key={f.label} className="flex justify-between py-1 border-b border-gray-100">
              <span className="text-sm text-gray-500">{f.label}</span>
              <span className="text-sm font-medium">{f.value}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="bg-white rounded-xl shadow-sm p-4">
        <h3 className="text-sm font-semibold text-gray-500 mb-3">{'\u53EF\u7DE8\u8F2F\u8CC7\u8A0A'}</h3>
        <div className="space-y-3">
          {editFields.map(f => (
            <div key={f.key}>
              <label className="block text-xs text-gray-500 mb-1">{f.label}</label>
              <input
                type="text"
                className="w-full px-3 py-2 border rounded-lg text-sm"
                value={profileForm[f.key]}
                onChange={e => setProfileForm({ ...profileForm, [f.key]: e.target.value })}
              />
            </div>
          ))}
        </div>
        <button
          onClick={saveProfile}
          disabled={profileSaving}
          className="mt-4 w-full py-2 bg-green-600 text-white rounded-lg text-sm font-medium disabled:opacity-50"
        >
          {profileSaving ? '\u5132\u5B58\u4E2D\u2026' : '\u5132\u5B58\u8B8A\u66F4'}
        </button>
      </div>
    </div>
  );
}

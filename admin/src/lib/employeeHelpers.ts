// ─── Employee Helpers & Constants ─────────────────────────────────────────────

import { supabase } from './supabase';

// ── Avatar utilities ──

export const getInitials = (name: string) => name.slice(0, 2);

export const getColor = (name: string) => {
    const colors = ['#6366f1', '#8b5cf6', '#ec4899', '#f43f5e', '#f97316', '#22c55e', '#06b6d4', '#3b82f6'];
    return colors[name.charCodeAt(0) % colors.length];
};

// ── Label maps (locale-aware) ──

export const getTypeLabel = (zh: boolean): Record<string, string> => ({
    full_time: zh ? '\u5168\u8077' : 'Full-time',
    part_time: zh ? '\u517c\u8077' : 'Part-time',
    contract: zh ? '\u7d04\u8058' : 'Contract',
});

export const TYPE_BADGE_COLORS: Record<string, string> = {
    full_time: '#22c55e', part_time: '#f59e0b', contract: '#6366f1',
};

export const getLeaveTypeLabel = (zh: boolean): Record<string, string> => ({
    annual: zh ? '\u7279\u4f11' : 'Annual', personal: zh ? '\u4e8b\u5047' : 'Personal', sick: zh ? '\u75c5\u5047' : 'Sick',
    maternity: zh ? '\u7522\u5047' : 'Maternity', bereavement: zh ? '\u55aa\u5047' : 'Bereavement',
    unpaid: zh ? '\u7121\u85aa\u5047' : 'Unpaid', block_off: zh ? '\u6392\u9664\u65e5' : 'Block Off', other: zh ? '\u5176\u4ed6' : 'Other',
});

export const LEAVE_STATUS_COLOR: Record<string, string> = {
    pending: '#f59e0b', approved: '#22c55e', rejected: '#f43f5e', cancelled: '#666',
};

export const getAvailLabel = (zh: boolean): Record<string, string> => ({
    available: zh ? '可排班' : 'Available', preferred: zh ? '偏好排班' : 'Preferred', unavailable: zh ? '不可排班' : 'Unavailable',
});

export const AVAIL_COLOR: Record<string, string> = {
    available: '#22c55e', preferred: '#3b82f6', unavailable: '#f43f5e',
};

export const getDaysOfWeek = (zh: boolean) =>
    zh ? ['週日', '週一', '週二', '週三', '週四', '週五', '週六'] : ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export const SPECIAL_IDENTITY_OPTIONS = [
    { value: 'disability', zh: '身心障礙者', en: 'Person with disability' },
    { value: 'low_income', zh: '中低收入戶', en: 'Low-middle income household' },
    { value: 'indigenous', zh: '原住民', en: 'Indigenous people' },
    { value: 'middle_aged', zh: '中高齡者 (45+)', en: 'Middle-aged/elderly (45+)' },
    { value: 'long_term_unemployed', zh: '長期失業者', en: 'Long-term unemployed' },
    { value: 'ex_offender', zh: '更生人', en: 'Ex-offender/rehabilitated' },
    { value: 'sole_breadwinner', zh: '獨力負擔家計者', en: 'Sole breadwinner' },
    { value: 'dv_victim', zh: '家庭暴力被害人', en: 'Domestic violence victim' },
    { value: 'reentry_woman', zh: '二度就業婦女', en: 'Women re-entering workforce' },
];

// ── Default form values ──

export const EMPTY_CREATE_FORM = {
    name: '', email: '', phone: '', employee_type: 'full_time', store_ids: [] as string[],
    company_id: '', department_id: '', position: '', hourly_wage: '', max_hours_per_week: '40', hire_date: '', reporting_to: '',
    first_name: '', last_name: '', english_name: '',
    id_number: '', birth_date: '', gender: '', nationality: 'TW', address: '',
    emergency_contact_name: '', emergency_contact_phone: '',
    job_grade: '', probation_end_date: '',
    bank_code: '', bank_account: '',
    special_identities: [] as string[],
};

export const EMPTY_DEPT_FORM = { name: '', description: '', manager_user_id: '', company_id: '', line_group_ids: [] as string[] };

// ── CSV Import handler ──

export const handleCsvImport = async (
    e: React.ChangeEvent<HTMLInputElement>,
    orgId: string,
    zh: boolean,
    loadEmployees: () => Promise<void>,
) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
        try {
            const text = event.target?.result as string;
            if (!text) return;
            const rows = text.split('\n').filter(r => r.trim() !== '').map(row => row.split(',').map(c => c.trim().replace(/^"|"$/g, '')));
            if (rows.length < 2) return alert(zh ? '無效的 CSV 檔案' : 'Invalid CSV file');
            const headers = rows[0];
            const insertData = [];
            for (let i = 1; i < rows.length; i++) {
                const row = rows[i];
                if (row.length < headers.length) continue;
                const obj: Record<string, any> = { organization_id: orgId };
                headers.forEach((h, idx) => {
                    const val = row[idx];
                    if (h && val) {
                        if (h === 'hourly_wage' || h === 'max_hours_per_week' || h === 'labor_ins_grade' || h === 'health_ins_grade' || h === 'labor_pension_rate') obj[h] = Number(val);
                        else obj[h] = val;
                    }
                });
                if (obj.name) {
                    if (!obj.employee_type) obj.employee_type = 'full_time';
                    insertData.push(obj);
                }
            }
            if (insertData.length > 0) {
                const { data, error } = await supabase.from('users').insert(insertData).select('id, store_id');
                if (error) throw error;
                if (data) {
                    const storeLinks = data.filter(u => u.store_id).map(u => ({ user_id: u.id, store_id: u.store_id, is_primary: true }));
                    if (storeLinks.length > 0) {
                        await supabase.from('user_stores').insert(storeLinks);
                    }
                }
                alert(zh ? `成功匯入 ${insertData.length} 筆資料` : `Successfully imported ${insertData.length} employees`);
                loadEmployees();
            } else {
                alert(zh ? '沒有發現有效的員工記錄' : 'No valid employee records found');
            }
        } catch (err: any) {
            console.error(err);
            alert((zh ? '匯入失敗: ' : 'Import failed: ') + err.message);
        }
    };
    reader.readAsText(file);
    e.target.value = '';
};

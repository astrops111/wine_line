export type Tab = 'dashboard' | 'orgs' | 'companies' | 'locations' | 'departments' | 'employees' | 'line' | 'billing' | 'orgchart' | 'templates' | 'announcements';

export interface Org {
    id: string; name: string; slug: string; tax_id: string | null;
    contact_person: string | null; phone: string | null; address: string | null;
    logo_url: string | null; status: string; plan: string; settings: any; created_at: string;
}

export interface Subscription {
    id: string; organization_id: string; plan: string; status: string;
    current_period_start: string | null; current_period_end: string | null;
    price_monthly: number; max_users: number; max_stores: number; notes: string | null; created_at: string;
}

export interface Payment {
    id: string; organization_id: string; subscription_id: string | null;
    amount: number; currency: string; status: string; payment_method: string | null;
    invoice_number: string | null; paid_at: string | null; notes: string | null; created_at: string;
}

export interface Company {
    id: string; organization_id: string; name: string; status: string; created_at: string;
}

export interface Store {
    id: string; name: string; store_code: string; address: string | null; phone: string | null;
    city: string | null; store_type: string; is_active: boolean; company_id: string | null;
    company?: { name: string } | null;
    gps_lat: number | null; gps_lng: number | null; gps_radius_m: number | null;
    clock_in_method: string | null;
}

export interface Department {
    id: string; name: string; description: string | null; manager_user_id: string | null;
    company_id: string | null;
    line_group_ids: string[];
}

export interface Employee {
    id: string; name: string; employee_type: string; store_id: string | null;
    company_id: string | null; department: string | null; department_id: string | null;
    position: string | null; status: string; is_manager: boolean;
    store?: { name: string } | null; company?: { name: string } | null;
    store_ids: string[]; store_names: string[];
    reporting_to?: string | null;
    organization_id?: string;
}

export interface LineGroup {
    id: string; group_name: string;
}

export interface ObTemplate {
    id: string; name: string; type: string; items: any[]; created_at: string;
}

export interface Announcement {
    id: string; title: string; content: string; priority: string;
    target_type: string; is_pinned: boolean; published_at: string; expires_at: string | null;
}

// Color maps used across tabs
export const statusColors: Record<string, { bg: string; color: string }> = {
    active: { bg: '#22c55e20', color: '#22c55e' },
    suspended: { bg: '#f59e0b20', color: '#f59e0b' },
    archived: { bg: '#6b728020', color: '#6b7280' },
};

export const planColors: Record<string, { bg: string; color: string; label_zh: string; label_en: string }> = {
    free:       { bg: '#6b728020', color: '#6b7280', label_zh: '免費版', label_en: 'Free' },
    starter:    { bg: '#3b82f620', color: '#3b82f6', label_zh: '入門版', label_en: 'Starter' },
    pro:        { bg: '#8b5cf620', color: '#8b5cf6', label_zh: '專業版', label_en: 'Pro' },
    enterprise: { bg: '#f59e0b20', color: '#f59e0b', label_zh: '企業版', label_en: 'Enterprise' },
};

export const payStatusColors: Record<string, { bg: string; color: string }> = {
    paid:     { bg: '#22c55e20', color: '#22c55e' },
    pending:  { bg: '#f59e0b20', color: '#f59e0b' },
    failed:   { bg: '#ef444420', color: '#ef4444' },
    refunded: { bg: '#6366f120', color: '#6366f1' },
};

export function getPlanLabel(plan: string, zh: boolean): string {
    const p = planColors[plan];
    return p ? (zh ? p.label_zh : p.label_en) : plan;
}

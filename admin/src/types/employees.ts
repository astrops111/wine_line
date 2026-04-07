// ─── Employee Type Definitions ────────────────────────────────────────────────

export interface Employee {
    id: string; name: string; email: string | null; status: string;
    employee_type: string; store_id: string | null; hourly_wage: number | null;
    max_hours_per_week: number; phone: string | null; hire_date: string | null;
    position: string | null; avatar_url: string | null;
    department: string | null; department_id: string | null;
    company_id: string | null; line_group_id: string | null;
    is_line_manager: boolean; is_manager: boolean; reporting_to: string | null;
    employee_number: string | null;
    store?: { name: string } | null;
    company?: { name: string } | null;
    roles?: { role_name: string }[];
    store_ids: string[];
    store_names: string[];
    // Name fields
    first_name: string | null; last_name: string | null; english_name: string | null;
    // Personal identity
    id_number: string | null; birth_date: string | null; gender: string | null;
    nationality: string | null; address: string | null;
    // Emergency contact
    emergency_contact_name: string | null; emergency_contact_phone: string | null;
    // Employment
    resign_date: string | null; termination_reason: string | null;
    job_grade: string | null; probation_end_date: string | null;
    // Banking
    bank_code: string | null; bank_account: string | null;
    // 勞保 Labor Insurance
    labor_ins_enrolled: boolean; labor_ins_grade: number | null;
    labor_ins_enrolled_date: string | null; labor_ins_withdraw_date: string | null;
    // 健保 Health Insurance
    health_ins_enrolled: boolean; health_ins_grade: number | null;
    health_ins_enrolled_date: string | null;
    // 勞退 Labor Pension
    labor_pension_enrolled: boolean; labor_pension_rate: number | null;
    // 特殊身分 Special Employment Identity
    special_identities: string[];
    // Shift capabilities
    can_open: boolean;
    can_close: boolean;
}

export interface EmployeeDependent {
    id: string; relationship: string; name: string; id_number: string | null;
    birth_date: string | null; health_ins_enrolled: boolean; notes: string | null;
}

export interface PositionHistory {
    id: string; change_type: string; effective_date: string;
    title: string | null; job_grade: string | null;
    department_name: string | null; store_name: string | null;
    employee_type: string | null; salary_type: string | null;
    base_salary: number | null; hourly_wage: number | null;
    role_allowance: number | null; meal_allowance: number | null; transport_allowance: number | null;
    reason: string | null; notes: string | null; created_at: string;
}

export interface Company { id: string; name: string; }

export interface LineUser { id: string; display_name: string; is_verified: boolean; user_id: string | null; }

export interface LineGroup { id: string; group_name: string; }

export interface Department {
    id: string;
    name: string;
    description: string | null;
    manager_user_id: string | null;
    company_id: string | null;
    line_group_ids: string[];
}

export interface Store { id: string; name: string; store_code: string; }

export interface LeaveRequest {
    id: string; user_id: string; start_date: string; end_date: string;
    leave_type: string; reason: string | null; status: string;
    total_days: number; is_paid: boolean;
}

export interface PerformanceReview {
    id: string; user_id: string; reviewer_id: string | null;
    points: number; comment: string | null; review_date: string;
}

export interface ShiftTemplate {
    id: string; store_id: string | null; name: string; start_time: string; end_time: string;
}

export interface EmployeeAvailability {
    id: string; day_of_week: number; availability: string; preferred_shift_id: string | null; notes: string | null;
    shift_template?: ShiftTemplate;
}

export interface OnboardingTask {
    id: string; type: string; title: string; description: string | null;
    due_date: string | null; status: string; completed_at: string | null; sort_order: number;
}

export interface EmployeeSkill {
    id: string; skill_name: string; proficiency: string; certified_at: string | null; expires_at: string | null;
}

export type EditForm = {
    employee_type: string; store_ids: string[]; company_id: string;
    department: string; department_id: string; position: string; hourly_wage: string;
    max_hours_per_week: string; phone: string; hire_date: string; status: string;
    line_group_ids: string[]; is_manager: boolean; reporting_to: string;
    // Name fields
    first_name: string; last_name: string; english_name: string;
    // Personal
    id_number: string; birth_date: string; gender: string; nationality: string; address: string;
    emergency_contact_name: string; emergency_contact_phone: string;
    resign_date: string; termination_reason: string; job_grade: string; probation_end_date: string;
    // Banking
    bank_code: string; bank_account: string;
    // Insurance
    labor_ins_enrolled: boolean; labor_ins_grade: string;
    labor_ins_enrolled_date: string; labor_ins_withdraw_date: string;
    health_ins_enrolled: boolean; health_ins_grade: string; health_ins_enrolled_date: string;
    labor_pension_enrolled: boolean; labor_pension_rate: string;
    special_identities: string[];
};

export type CreateForm = {
    name: string; email: string; phone: string; employee_type: string; store_ids: string[];
    company_id: string; department_id: string; position: string; hourly_wage: string;
    max_hours_per_week: string; hire_date: string; reporting_to: string;
    first_name: string; last_name: string; english_name: string;
    id_number: string; birth_date: string; gender: string; nationality: string; address: string;
    emergency_contact_name: string; emergency_contact_phone: string;
    job_grade: string; probation_end_date: string;
    bank_code: string; bank_account: string;
    special_identities: string[];
};

export type DeptForm = {
    name: string; description: string; manager_user_id: string;
    company_id: string; line_group_ids: string[];
};

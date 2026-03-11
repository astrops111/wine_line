// Bilingual translation system
export type Locale = 'zh-TW' | 'en';

const translations: Record<string, Record<Locale, string>> = {
    // Navigation
    'nav.dashboard': { 'zh-TW': '儀表板', en: 'Dashboard' },
    'nav.tasks': { 'zh-TW': '任務管理', en: 'Tasks' },
    'nav.workflows': { 'zh-TW': '流程管理', en: 'Workflows' },
    'nav.triggers': { 'zh-TW': '觸發器', en: 'Triggers' },
    'nav.notifications': { 'zh-TW': '通知管理', en: 'Notifications' },
    'nav.line': { 'zh-TW': 'LINE 管理', en: 'LINE Management' },
    'nav.users': { 'zh-TW': '使用者管理', en: 'Users' },
    'nav.settings': { 'zh-TW': '系統設定', en: 'Settings' },
    'nav.checklists': { 'zh-TW': '清單管理', en: 'Checklists' },

    // Dashboard
    'dashboard.title': { 'zh-TW': '營運儀表板', en: 'Operations Dashboard' },
    'dashboard.total_tasks': { 'zh-TW': '總任務數', en: 'Total Tasks' },
    'dashboard.pending': { 'zh-TW': '未開始', en: 'Pending' },
    'dashboard.in_progress': { 'zh-TW': '進行中', en: 'In Progress' },
    'dashboard.completed': { 'zh-TW': '已完成', en: 'Completed' },
    'dashboard.blocked': { 'zh-TW': '已阻擋', en: 'Blocked' },
    'dashboard.active_workflows': { 'zh-TW': '進行中流程', en: 'Active Workflows' },
    'dashboard.recent_tasks': { 'zh-TW': '最近任務', en: 'Recent Tasks' },

    // Tasks
    'task.title': { 'zh-TW': '任務管理', en: 'Task Management' },
    'task.create': { 'zh-TW': '新增任務', en: 'Create Task' },
    'task.status': { 'zh-TW': '狀態', en: 'Status' },
    'task.priority': { 'zh-TW': '優先度', en: 'Priority' },
    'task.assigned_to': { 'zh-TW': '負責人', en: 'Assigned To' },
    'task.due_date': { 'zh-TW': '到期日', en: 'Due Date' },
    'task.description': { 'zh-TW': '說明', en: 'Description' },
    'task.comments': { 'zh-TW': '備註', en: 'Comments' },

    // Status
    'status.pending': { 'zh-TW': '未開始', en: 'Pending' },
    'status.in_progress': { 'zh-TW': '進行中', en: 'In Progress' },
    'status.completed': { 'zh-TW': '已完成', en: 'Completed' },
    'status.blocked': { 'zh-TW': '已阻擋', en: 'Blocked' },
    'status.cancelled': { 'zh-TW': '已取消', en: 'Cancelled' },

    // Priority
    'priority.low': { 'zh-TW': '低', en: 'Low' },
    'priority.medium': { 'zh-TW': '中', en: 'Medium' },
    'priority.high': { 'zh-TW': '高', en: 'High' },
    'priority.urgent': { 'zh-TW': '緊急', en: 'Urgent' },

    // Workflows
    'workflow.title': { 'zh-TW': '流程管理', en: 'Workflow Management' },
    'workflow.instances': { 'zh-TW': '流程實例', en: 'Workflow Instances' },
    'workflow.progress': { 'zh-TW': '進度', en: 'Progress' },
    'workflow.steps': { 'zh-TW': '步驟', en: 'Steps' },

    // Common
    'common.save': { 'zh-TW': '儲存', en: 'Save' },
    'common.cancel': { 'zh-TW': '取消', en: 'Cancel' },
    'common.delete': { 'zh-TW': '刪除', en: 'Delete' },
    'common.edit': { 'zh-TW': '編輯', en: 'Edit' },
    'common.search': { 'zh-TW': '搜尋', en: 'Search' },
    'common.filter': { 'zh-TW': '篩選', en: 'Filter' },
    'common.loading': { 'zh-TW': '載入中...', en: 'Loading...' },
    'common.no_data': { 'zh-TW': '暫無資料', en: 'No data' },
    'common.actions': { 'zh-TW': '操作', en: 'Actions' },

    // Employees
    'nav.employees': { 'zh-TW': '員工管理', en: 'Employees' },
    'employee.title': { 'zh-TW': '員工管理', en: 'Employee Management' },
    'employee.subtitle': { 'zh-TW': '管理員工資料、職位與工時設定', en: 'Manage employee profiles, positions, and hours' },
    'employee.create': { 'zh-TW': '新增員工', en: 'Add Employee' },
    'employee.name': { 'zh-TW': '姓名', en: 'Name' },
    'employee.type': { 'zh-TW': '類型', en: 'Type' },
    'employee.full_time': { 'zh-TW': '全職', en: 'Full-time' },
    'employee.part_time': { 'zh-TW': '兼職', en: 'Part-time' },
    'employee.contract': { 'zh-TW': '約聘', en: 'Contract' },
    'employee.store': { 'zh-TW': '門市', en: 'Store' },
    'employee.position': { 'zh-TW': '職位', en: 'Position' },
    'employee.wage': { 'zh-TW': '時薪', en: 'Hourly Wage' },
    'employee.max_hours': { 'zh-TW': '每週上限', en: 'Max Hrs/Week' },
    'employee.hire_date': { 'zh-TW': '入職日期', en: 'Hire Date' },
    'employee.phone': { 'zh-TW': '電話', en: 'Phone' },

    // Scheduling
    'nav.scheduling': { 'zh-TW': '排班管理', en: 'Scheduling' },
    'schedule.title': { 'zh-TW': '排班管理', en: 'Shift Scheduling' },
    'schedule.subtitle': { 'zh-TW': '管理班表、排班偏好與AI自動排班', en: 'Manage shifts, preferences, and AI scheduling' },
    'schedule.calendar': { 'zh-TW': '班表總覽', en: 'Schedule' },
    'schedule.store_settings': { 'zh-TW': '門市設定', en: 'Store Settings' },
    'schedule.preferences': { 'zh-TW': '排班偏好', en: 'Preferences' },
    'schedule.ai_generate': { 'zh-TW': 'AI 自動排班', en: 'AI Auto-Schedule' },
    'schedule.publish': { 'zh-TW': '發佈班表', en: 'Publish Schedule' },
    'schedule.draft': { 'zh-TW': '草稿', en: 'Draft' },
    'schedule.published': { 'zh-TW': '已發佈', en: 'Published' },

    // Holidays
    'nav.holidays': { 'zh-TW': '假日管理', en: 'Holidays' },
    'holiday.title': { 'zh-TW': '假日管理', en: 'Holiday Management' },
    'holiday.subtitle': { 'zh-TW': '管理國定假日與自訂假日', en: 'Manage national and custom holidays' },
    'holiday.national': { 'zh-TW': '國定假日', en: 'National' },
    'holiday.company': { 'zh-TW': '公司假日', en: 'Company' },
    'holiday.custom': { 'zh-TW': '自訂假日', en: 'Custom' },
    'holiday.add': { 'zh-TW': '新增假日', en: 'Add Holiday' },
    'holiday.pay_multiplier': { 'zh-TW': '薪資倍率', en: 'Pay Multiplier' },
};

let currentLocale: Locale = 'zh-TW';

export function setLocale(locale: Locale) {
    currentLocale = locale;
    localStorage.setItem('locale', locale);
}

export function getLocale(): Locale {
    return (localStorage.getItem('locale') as Locale) || currentLocale;
}

export function t(key: string): string {
    const locale = getLocale();
    return translations[key]?.[locale] || key;
}

export function initLocale() {
    const saved = localStorage.getItem('locale') as Locale;
    if (saved) currentLocale = saved;
}

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

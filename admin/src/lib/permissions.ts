// ============================================================
// permissions.ts — Role-based access control helpers
// ============================================================

export type AppRole = 'super_admin' | 'admin' | 'manager' | 'staff' | 'operations';
export type AccessLevel = 'full' | 'read';

export interface ModuleAccess {
    id: string;
    module_key: string;
    module_name_zh: string;
    module_name_en: string;
    icon: string;
    is_enabled: boolean;
    required_role: string;
    sort_order: number;
    access_level: AccessLevel;
}

/**
 * ROLE_ACCESS[requiredRole] = set of roles that satisfy this requirement.
 *
 * Hierarchy (not strictly linear — manager and operations are peer roles):
 *   'all'         → everyone (all 5 roles)
 *   'staff'       → all 5 roles (staff is the lowest gate)
 *   'manager'     → super_admin, admin, manager, operations
 *   'operations'  → super_admin, admin, operations
 *   'admin'       → super_admin, admin
 *   'super_admin' → super_admin only
 */
export const ROLE_ACCESS: Record<string, AppRole[]> = {
    all:         ['super_admin', 'admin', 'manager', 'staff', 'operations'],
    staff:       ['super_admin', 'admin', 'manager', 'staff', 'operations'],
    manager:     ['super_admin', 'admin', 'manager', 'operations'],
    operations:  ['super_admin', 'admin', 'operations'],
    admin:       ['super_admin', 'admin'],
    super_admin: ['super_admin'],
};

/**
 * Returns true if any of userRoles satisfies the requiredRole gate.
 * Empty userRoles = no access (production-safe).
 */
export function canAccess(requiredRole: string, userRoles: string[]): boolean {
    if (userRoles.length === 0) return false;
    const allowed = ROLE_ACCESS[requiredRole] ?? ROLE_ACCESS['all'];
    return userRoles.some(r => allowed.includes(r as AppRole));
}

/**
 * Returns true if user has write (full) access to a module.
 */
export function canWrite(moduleKey: string, modules: ModuleAccess[], userRoles: string[]): boolean {
    const mod = modules.find(m => m.module_key === moduleKey);
    if (!mod || !mod.is_enabled) return false;
    if (!canAccess(mod.required_role, userRoles)) return false;
    return mod.access_level === 'full';
}

/**
 * Module key → route path mapping (from App.tsx <Routes>).
 */
export const MODULE_ROUTE_MAP: Record<string, string> = {
    'dashboard':           '/',
    'manager-dashboard':   '/manager-dashboard',
    'hr-dashboard':        '/hr-dashboard',
    'time-tracker':        '/time-tracker',
    'leave-management':    '/leave-management',
    'overtime-requests':   '/overtime-requests',
    'payroll':             '/payroll',
    'scheduling':          '/scheduling',
    'holidays':            '/holidays',
    'shift-rules':         '/shift-rules',
    'workflow-management': '/workflow-management',
    'org-management':      '/org-management',
    'triggers':            '/triggers',
    'notifications':       '/notifications',
    'users':               '/users',
    'admin':               '/admin',
    'help-center':         '/help-center',
    'agent-console':       '/agent-console',
    'line':                '/line',
    'audit-logs':          '/audit-logs',
    'line-logs':           '/line-logs',
    'performance':         '/performance',
    'documents':           '/documents',
    'recruitment':         '/recruitment',
    'onboarding':          '/onboarding',
    'announcements':       '/announcements',
    'training':            '/training',
    'disciplinary':        '/disciplinary',
    'business-trips':      '/business-trips',
    'expense-claims':      '/expense-claims',
    'jobs':                '/jobs',
    'operations-analytics': '/operations-analytics',
    'vendors':             '/vendors',
    'inventory':           '/inventory',
};

/**
 * Route path → module key (reverse of MODULE_ROUTE_MAP).
 */
export const ROUTE_MODULE_MAP: Record<string, string> = Object.fromEntries(
    Object.entries(MODULE_ROUTE_MAP).map(([key, path]) => [path, key])
);

/**
 * Sub-routes that inherit permissions from a parent module.
 */
export const SUB_ROUTE_PARENT_MAP: Record<string, string> = {
    '/tasks':      'workflow-management',
    '/workflows':  'workflow-management',
    '/checklists': 'workflow-management',
    '/employees':  'org-management',
};

/**
 * Given the current pathname and the org's module list,
 * returns the matching ModuleAccess entry (or undefined if route is uncontrolled).
 */
export function getModuleForPath(
    pathname: string,
    modules: ModuleAccess[]
): ModuleAccess | undefined {
    const moduleKey = ROUTE_MODULE_MAP[pathname];
    if (moduleKey) {
        return modules.find(m => m.module_key === moduleKey);
    }
    const parentKey = SUB_ROUTE_PARENT_MAP[pathname];
    if (parentKey) {
        return modules.find(m => m.module_key === parentKey);
    }
    return undefined;
}

// ============================================================
// permissions.ts — Role-based access control helpers
// ============================================================

export type AppRole = 'admin' | 'manager' | 'staff' | 'operations';

export interface ModuleAccess {
    id: string;
    module_key: string;
    module_name_zh: string;
    module_name_en: string;
    icon: string;
    is_enabled: boolean;
    required_role: string;
    sort_order: number;
}

/**
 * ROLE_ACCESS[requiredRole] = set of roles that satisfy this requirement.
 *
 * Hierarchy (not strictly linear — manager and operations are peer roles):
 *   'all'        → everyone (all 4 roles)
 *   'staff'      → all 4 roles (staff is the lowest gate)
 *   'manager'    → admin, manager, operations
 *   'operations' → admin, operations
 *   'admin'      → admin only
 */
export const ROLE_ACCESS: Record<string, AppRole[]> = {
    all:        ['admin', 'manager', 'staff', 'operations'],
    staff:      ['admin', 'manager', 'staff', 'operations'],
    manager:    ['admin', 'manager', 'operations'],
    operations: ['admin', 'operations'],
    admin:      ['admin'],
};

/**
 * Returns true if any of userRoles satisfies the requiredRole gate.
 * Dev mode (empty userRoles array): always returns true.
 */
export function canAccess(requiredRole: string, userRoles: string[]): boolean {
    if (userRoles.length === 0) return true;
    const allowed = ROLE_ACCESS[requiredRole] ?? ROLE_ACCESS['all'];
    return userRoles.some(r => allowed.includes(r as AppRole));
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
};

/**
 * Route path → module key (reverse of MODULE_ROUTE_MAP).
 */
export const ROUTE_MODULE_MAP: Record<string, string> = Object.fromEntries(
    Object.entries(MODULE_ROUTE_MAP).map(([key, path]) => [path, key])
);

/**
 * Given the current pathname and the org's module list,
 * returns the matching ModuleAccess entry (or undefined if route is uncontrolled).
 */
export function getModuleForPath(
    pathname: string,
    modules: ModuleAccess[]
): ModuleAccess | undefined {
    const moduleKey = ROUTE_MODULE_MAP[pathname];
    if (!moduleKey) return undefined;
    return modules.find(m => m.module_key === moduleKey);
}

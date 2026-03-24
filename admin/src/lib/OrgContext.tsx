import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { supabase } from './supabase';
import type { ModuleAccess } from './permissions';

export type { ModuleAccess };

interface OrgUser {
    id: string;
    name: string;
    email: string | null;
    organization_id: string;
    store_id: string | null;
    roles: string[];
}

interface OrgContextValue {
    orgId: string;
    orgName: string;
    currentUser: OrgUser | null;
    userRoles: string[];
    modules: ModuleAccess[];
    loading: boolean;
}

const OrgContext = createContext<OrgContextValue>({
    orgId: '',
    orgName: '',
    currentUser: null,
    userRoles: [],
    modules: [],
    loading: true,
});

export function useOrg() {
    return useContext(OrgContext);
}

export function OrgProvider({ children }: { children: ReactNode }) {
    const [orgId, setOrgId] = useState('');
    const [orgName, setOrgName] = useState('');
    const [currentUser, setCurrentUser] = useState<OrgUser | null>(null);
    const [userRoles, setUserRoles] = useState<string[]>([]);
    const [modules, setModules] = useState<ModuleAccess[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        resolveOrg();
    }, []);

    async function fetchModules(oid: string): Promise<ModuleAccess[]> {
        const { data } = await supabase
            .from('module_access')
            .select('id, module_key, module_name_zh, module_name_en, icon, is_enabled, required_role, sort_order')
            .eq('organization_id', oid)
            .order('sort_order');
        return data ?? [];
    }

    async function resolveOrg() {
        try {
            const { data: { user: authUser } } = await supabase.auth.getUser();

            if (authUser) {
                const { data: appUser } = await supabase
                    .from('users')
                    .select(`
                        id, name, email, organization_id, store_id,
                        user_roles(
                            roles(role_name)
                        )
                    `)
                    .eq('auth_user_id', authUser.id)
                    .single();

                if (appUser?.organization_id) {
                    const roles: string[] = ((appUser as any).user_roles ?? [])
                        .map((ur: any) => ur.roles?.role_name)
                        .filter(Boolean);

                    const [org, mods] = await Promise.all([
                        supabase
                            .from('organizations')
                            .select('id, name')
                            .eq('id', appUser.organization_id)
                            .single()
                            .then(r => r.data),
                        fetchModules(appUser.organization_id),
                    ]);

                    setOrgId(appUser.organization_id);
                    setOrgName(org?.name ?? '');
                    setCurrentUser({
                        id: appUser.id,
                        name: appUser.name,
                        email: appUser.email,
                        organization_id: appUser.organization_id,
                        store_id: appUser.store_id,
                        roles,
                    });
                    setUserRoles(roles);
                    setModules(mods);
                    setLoading(false);
                    return;
                }
            }

            // Dev / anon fallback: pick first active org, grant admin role
            const { data: orgs } = await supabase
                .from('organizations')
                .select('id, name')
                .eq('status', 'active')
                .order('created_at')
                .limit(1);

            if (orgs && orgs.length > 0) {
                const devOrgId = orgs[0].id;
                const mods = await fetchModules(devOrgId);
                setOrgId(devOrgId);
                setOrgName(orgs[0].name);
                setModules(mods);
            }

            // Dev mode: grant admin so all routes are accessible
            setUserRoles(['admin']);
        } catch (err) {
            console.error('OrgContext resolve error:', err);
            setOrgId('00000000-0000-0000-0000-000000000001');
            setUserRoles(['admin']);
        } finally {
            setLoading(false);
        }
    }

    return (
        <OrgContext.Provider value={{ orgId, orgName, currentUser, userRoles, modules, loading }}>
            {children}
        </OrgContext.Provider>
    );
}

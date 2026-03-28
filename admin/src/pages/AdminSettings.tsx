import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { getLocale } from '../lib/i18n';
import { useOrg } from '../lib/OrgContext';

interface ModuleAccess {
    id: string; module_key: string; module_name_zh: string; module_name_en: string;
    icon: string; is_enabled: boolean; required_role: string; sort_order: number;
}

export function AdminSettings() {
    const zh = getLocale() === 'zh-TW';
    const { orgId } = useOrg();
    const [modules, setModules] = useState<ModuleAccess[]>([]);
    const [loading, setLoading] = useState(true);

    const loadModules = async () => {
        const { data } = await supabase.from('module_access').select('*')
            .eq('organization_id', orgId)
            .order('sort_order');
        setModules(data || []);
    };

    useEffect(() => { loadModules().then(() => setLoading(false)); }, []);

    const toggleModule = async (id: string, enabled: boolean) => {
        await supabase.from('module_access').update({ is_enabled: enabled }).eq('id', id);
        setModules(prev => prev.map(m => m.id === id ? { ...m, is_enabled: enabled } : m));
    };

    const updateRole = async (id: string, role: string) => {
        await supabase.from('module_access').update({ required_role: role }).eq('id', id);
        setModules(prev => prev.map(m => m.id === id ? { ...m, required_role: role } : m));
    };

    const enabledCount = modules.filter(m => m.is_enabled).length;

    return (
        <div className="fade-in">
            <div className="page-header">
                <h1>⚙️ {zh ? '系統設定' : 'Admin Settings'}</h1>
                <p className="page-subtitle">{zh ? '管理模組存取權限與系統設定' : 'Manage module access and system settings'}</p>
            </div>

            {/* Stats */}
            <div style={{ display: 'flex', gap: '16px', marginBottom: '20px' }}>
                <div className="card" style={{ flex: 1, padding: '16px', textAlign: 'center' }}>
                    <div style={{ fontSize: '28px', fontWeight: 700, color: 'var(--accent-primary)', fontVariantNumeric: 'tabular-nums' }}>{enabledCount}</div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>{zh ? '已啟用模組' : 'Enabled Modules'}</div>
                </div>
                <div className="card" style={{ flex: 1, padding: '16px', textAlign: 'center' }}>
                    <div style={{ fontSize: '28px', fontWeight: 700, color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>{modules.length - enabledCount}</div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>{zh ? '已停用模組' : 'Disabled Modules'}</div>
                </div>
                <div className="card" style={{ flex: 1, padding: '16px', textAlign: 'center' }}>
                    <div style={{ fontSize: '28px', fontWeight: 700, color: 'var(--accent-secondary)', fontVariantNumeric: 'tabular-nums' }}>{modules.length}</div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>{zh ? '總模組數' : 'Total Modules'}</div>
                </div>
            </div>

            {/* Module list */}
            <div className="card" style={{ padding: '0' }}>
                <div style={{ padding: '14px 18px', borderBottom: 'none', fontWeight: 600, fontSize: '14px' }}>
                    🧩 {zh ? '模組存取控制' : 'Module Access Control'}
                </div>
                {loading ? (
                    <div style={{ padding: '40px', textAlign: 'center' }} className="loading-pulse">{zh ? '載入中\u2026' : 'Loading\u2026'}</div>
                ) : (
                    <div>
                        {modules.map((mod, i) => (
                            <div key={mod.id} style={{
                                display: 'flex', alignItems: 'center', gap: '14px', padding: '12px 18px',
                                borderBottom: i < modules.length - 1 ? '1px solid var(--outline-variant)' : 'none',
                                opacity: mod.is_enabled ? 1 : 0.5,
                                transition: 'opacity 0.2s',
                            }}>
                                <span style={{ fontSize: '20px', width: '28px', textAlign: 'center' }}>{mod.icon}</span>
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontWeight: 600, fontSize: '14px' }}>{zh ? mod.module_name_zh : mod.module_name_en}</div>
                                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>/{mod.module_key}</div>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                    <select
                                        className="input-field"
                                        aria-label={zh ? '選擇角色' : 'Select role'}
                                        name="requiredRole"
                                        style={{ width: '100px', fontSize: '12px', padding: '4px 8px' }}
                                        value={mod.required_role}
                                        onChange={e => updateRole(mod.id, e.target.value)}
                                    >
                                        <option value="admin">{zh ? '管理員' : 'Admin'}</option>
                                        <option value="manager">{zh ? '經理' : 'Manager'}</option>
                                        <option value="staff">{zh ? '員工' : 'Staff'}</option>
                                        <option value="all">{zh ? '所有人' : 'Everyone'}</option>
                                    </select>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <button
                                            type="button"
                                            role="switch"
                                            aria-checked={mod.is_enabled}
                                            aria-label={zh ? '切換模組' : 'Toggle module'}
                                            onClick={() => toggleModule(mod.id, !mod.is_enabled)}
                                            style={{
                                                width: '44px', height: '24px', borderRadius: '12px',
                                                background: mod.is_enabled ? 'var(--accent-primary)' : '#555',
                                                position: 'relative', cursor: 'pointer', transition: 'background-color 0.2s',
                                                border: 'none', padding: 0,
                                            }}
                                        >
                                            <div style={{
                                                width: '20px', height: '20px', borderRadius: '50%', background: '#fff',
                                                position: 'absolute', top: '2px', left: '2px',
                                                transform: mod.is_enabled ? 'translateX(20px)' : 'translateX(0)',
                                                transition: 'transform 0.2s',
                                            }} />
                                        </button>
                                        <span style={{ fontSize: '12px', minWidth: '36px', color: mod.is_enabled ? '#22c55e' : 'var(--text-muted)' }}>
                                            {mod.is_enabled ? (zh ? '啟用' : 'ON') : (zh ? '停用' : 'OFF')}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Info note */}
            <div className="card" style={{ marginTop: '16px', borderLeft: '4px solid var(--accent-primary)', padding: '14px 18px', fontSize: '13px', color: 'var(--text-secondary)' }}>
                💡 {zh
                    ? '停用的模組將從側邊欄隱藏，所有使用者將無法存取。「必要角色」控制哪些角色可以看到該模組。'
                    : 'Disabled modules are hidden from the sidebar and inaccessible. "Required Role" controls which roles can see the module.'}
            </div>
        </div>
    );
}

import { supabase } from './supabase';

interface AuditLogEntry {
    organization_id: string;
    user_id?: string | null;
    user_name?: string | null;
    action: 'create' | 'update' | 'delete' | 'approve' | 'reject';
    module: string;
    table_name?: string;
    record_id?: string;
    record_label?: string;
    old_values?: Record<string, unknown> | null;
    new_values?: Record<string, unknown> | null;
}

export async function writeAuditLog(entry: AuditLogEntry): Promise<void> {
    try {
        await supabase.from('audit_logs').insert({
            organization_id: entry.organization_id,
            user_id: entry.user_id ?? null,
            user_name: entry.user_name ?? null,
            action: entry.action,
            module: entry.module,
            table_name: entry.table_name ?? null,
            record_id: entry.record_id ?? null,
            record_label: entry.record_label ?? null,
            old_values: entry.old_values ?? null,
            new_values: entry.new_values ?? null,
            ip_address: null,
        });
    } catch (err) {
        console.warn('Audit log write failed (non-critical):', err);
    }
}

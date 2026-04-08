-- Restrict agent-console to super_admin only
UPDATE module_access SET required_role = 'super_admin' WHERE module_key = 'agent-console';

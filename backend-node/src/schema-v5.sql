-- v5: role renames
-- Rename admin → super_admin first, then finance → admin (order matters to avoid conflict)
ALTER TYPE user_role RENAME VALUE 'admin'   TO 'super_admin';
ALTER TYPE user_role RENAME VALUE 'finance' TO 'admin';

-- Member roles: viewer → cc_owner
ALTER TYPE member_role RENAME VALUE 'viewer' TO 'cc_owner';
-- Migrate any existing 'owner' records to 'cc_owner'
UPDATE cost_center_members SET role = 'cc_owner' WHERE role = 'owner';

-- ============================================================
-- FULL INSTANCE PURGE by user email (schema-aligned)
-- 1) Set v_email below
-- 2) Run entire script in pgAdmin (Execute/F5)
-- If a previous run failed: run ROLLBACK; first, then this file.
-- ============================================================

BEGIN;

DO $$
DECLARE
  v_email TEXT := 'USER_EMAIL_HERE@example.com';  -- <<< CHANGE THIS
  v_user_id TEXT;
  v_org_id TEXT;
  v_instance_id TEXT;
BEGIN
  SELECT id, organization_id
    INTO v_user_id, v_org_id
  FROM users
  WHERE lower(email) = lower(v_email);

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'No user found for email %', v_email;
  END IF;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'User % has no organization_id — refusing full instance purge', v_email;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM organizations
    WHERE id = v_org_id AND owner_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'User % is not organizations.owner_id for org % — refusing', v_email, v_org_id;
  END IF;

  SELECT id INTO v_instance_id
  FROM instance_subscriptions
  WHERE organization_id = v_org_id;

  RAISE NOTICE 'Purging user=% org=% instance=%', v_user_id, v_org_id, v_instance_id;

  DROP TABLE IF EXISTS _purge_target;
  CREATE TEMP TABLE _purge_target (
    user_id TEXT,
    org_id TEXT,
    instance_id TEXT
  ) ON COMMIT DROP;

  INSERT INTO _purge_target VALUES (v_user_id, v_org_id, v_instance_id);
END $$;

-- Sessions for every user in this org
DELETE FROM sessions s
USING users u, _purge_target t
WHERE u.organization_id = t.org_id
  AND s.sess::text ILIKE '%' || u.id || '%';

-- ============================================================
-- BILLING / INSTANCE
-- ============================================================

DELETE FROM credit_notes
WHERE organization_id = (SELECT org_id FROM _purge_target);

DELETE FROM invoices
WHERE organization_id = (SELECT org_id FROM _purge_target)
   OR instance_subscription_id = (SELECT instance_id FROM _purge_target);

DELETE FROM pricing_override_history
WHERE instance_id = (SELECT instance_id FROM _purge_target);

DELETE FROM instance_module_overrides
WHERE instance_id = (SELECT instance_id FROM _purge_target);

DELETE FROM instance_addon_purchases
WHERE instance_id = (SELECT instance_id FROM _purge_target);

DELETE FROM instance_bundles
WHERE instance_id = (SELECT instance_id FROM _purge_target);

DELETE FROM instance_modules
WHERE instance_id = (SELECT instance_id FROM _purge_target);

DELETE FROM quotation_activity_log
WHERE quotation_request_id IN (
  SELECT id FROM quotation_requests
  WHERE organization_id = (SELECT org_id FROM _purge_target)
);

DELETE FROM quotations
WHERE quotation_request_id IN (
  SELECT id FROM quotation_requests
  WHERE organization_id = (SELECT org_id FROM _purge_target)
);

DELETE FROM quotation_requests
WHERE organization_id = (SELECT org_id FROM _purge_target);

DELETE FROM instance_subscriptions
WHERE organization_id = (SELECT org_id FROM _purge_target);

DELETE FROM topup_orders WHERE organization_id = (SELECT org_id FROM _purge_target);
DELETE FROM credit_ledger WHERE organization_id = (SELECT org_id FROM _purge_target);
DELETE FROM credit_batches WHERE organization_id = (SELECT org_id FROM _purge_target);
DELETE FROM credit_transactions WHERE organization_id = (SELECT org_id FROM _purge_target);
DELETE FROM subscriptions WHERE organization_id = (SELECT org_id FROM _purge_target);

-- ============================================================
-- COMMUNITY
-- ============================================================

DELETE FROM community_post_flags
WHERE post_id IN (
  SELECT p.id FROM community_posts p
  JOIN community_threads th ON th.id = p.thread_id
  JOIN community_groups g ON g.id = th.group_id
  WHERE g.organization_id = (SELECT org_id FROM _purge_target)
)
OR thread_id IN (
  SELECT th.id FROM community_threads th
  JOIN community_groups g ON g.id = th.group_id
  WHERE g.organization_id = (SELECT org_id FROM _purge_target)
);

DELETE FROM community_attachments
WHERE post_id IN (
  SELECT p.id FROM community_posts p
  JOIN community_threads th ON th.id = p.thread_id
  JOIN community_groups g ON g.id = th.group_id
  WHERE g.organization_id = (SELECT org_id FROM _purge_target)
)
OR thread_id IN (
  SELECT th.id FROM community_threads th
  JOIN community_groups g ON g.id = th.group_id
  WHERE g.organization_id = (SELECT org_id FROM _purge_target)
);

DELETE FROM community_posts
WHERE thread_id IN (
  SELECT th.id FROM community_threads th
  JOIN community_groups g ON g.id = th.group_id
  WHERE g.organization_id = (SELECT org_id FROM _purge_target)
);

DELETE FROM community_threads
WHERE group_id IN (
  SELECT id FROM community_groups
  WHERE organization_id = (SELECT org_id FROM _purge_target)
);

DELETE FROM community_group_members
WHERE group_id IN (
  SELECT id FROM community_groups
  WHERE organization_id = (SELECT org_id FROM _purge_target)
);

DELETE FROM community_groups WHERE organization_id = (SELECT org_id FROM _purge_target);
DELETE FROM community_moderation_log WHERE organization_id = (SELECT org_id FROM _purge_target);
DELETE FROM community_tenant_blocks WHERE organization_id = (SELECT org_id FROM _purge_target);
DELETE FROM community_rule_acceptances WHERE organization_id = (SELECT org_id FROM _purge_target);
DELETE FROM community_rules WHERE organization_id = (SELECT org_id FROM _purge_target);

-- ============================================================
-- CHAT / IVY
-- ============================================================

DELETE FROM chat_messages
WHERE conversation_id IN (
  SELECT id FROM chat_conversations
  WHERE organization_id = (SELECT org_id FROM _purge_target)
);
DELETE FROM chat_conversations WHERE organization_id = (SELECT org_id FROM _purge_target);

DELETE FROM tenant_maintenance_chat_messages
WHERE chat_id IN (
  SELECT id FROM tenant_maintenance_chats
  WHERE organization_id = (SELECT org_id FROM _purge_target)
);
DELETE FROM tenant_maintenance_chats WHERE organization_id = (SELECT org_id FROM _purge_target);

-- ============================================================
-- COMPARISONS  (column is comparison_report_id, NOT report_id)
-- ============================================================

DELETE FROM comparison_comments
WHERE comparison_report_id IN (
  SELECT id FROM comparison_reports
  WHERE organization_id = (SELECT org_id FROM _purge_target)
);

DELETE FROM comparison_report_items
WHERE comparison_report_id IN (
  SELECT id FROM comparison_reports
  WHERE organization_id = (SELECT org_id FROM _purge_target)
);

DELETE FROM comparison_reports
WHERE organization_id = (SELECT org_id FROM _purge_target);

-- ============================================================
-- INSPECTIONS
-- ============================================================

DELETE FROM ai_image_analyses
WHERE inspection_id IN (
  SELECT id FROM inspections WHERE organization_id = (SELECT org_id FROM _purge_target)
)
OR inspection_entry_id IN (
  SELECT e.id
  FROM inspection_entries e
  JOIN inspections i ON i.id = e.inspection_id
  WHERE i.organization_id = (SELECT org_id FROM _purge_target)
);

DELETE FROM inspection_entries
WHERE inspection_id IN (
  SELECT id FROM inspections WHERE organization_id = (SELECT org_id FROM _purge_target)
);

DELETE FROM inspection_responses
WHERE inspection_id IN (
  SELECT id FROM inspections WHERE organization_id = (SELECT org_id FROM _purge_target)
);

DELETE FROM inspection_items
WHERE inspection_id IN (
  SELECT id FROM inspections WHERE organization_id = (SELECT org_id FROM _purge_target)
);

DELETE FROM inspections WHERE organization_id = (SELECT org_id FROM _purge_target);

DELETE FROM inspection_template_points
WHERE template_id IN (
  SELECT id FROM inspection_templates WHERE organization_id = (SELECT org_id FROM _purge_target)
);

DELETE FROM template_inventory_links
WHERE template_id IN (
  SELECT id FROM inspection_templates WHERE organization_id = (SELECT org_id FROM _purge_target)
);

DELETE FROM inspection_templates WHERE organization_id = (SELECT org_id FROM _purge_target);
DELETE FROM template_categories WHERE organization_id = (SELECT org_id FROM _purge_target);
DELETE FROM inspection_categories WHERE organization_id = (SELECT org_id FROM _purge_target);

-- ============================================================
-- INVENTORY / WORK / ASSETS / MAINTENANCE / COMPLIANCE
-- ============================================================

DELETE FROM inventory_items
WHERE inventory_id IN (
  SELECT id FROM inventories WHERE organization_id = (SELECT org_id FROM _purge_target)
);
DELETE FROM inventories WHERE organization_id = (SELECT org_id FROM _purge_target);
DELETE FROM inventory_templates WHERE organization_id = (SELECT org_id FROM _purge_target);

DELETE FROM work_logs
WHERE work_order_id IN (
  SELECT id FROM work_orders WHERE organization_id = (SELECT org_id FROM _purge_target)
);
DELETE FROM work_orders WHERE organization_id = (SELECT org_id FROM _purge_target);

DELETE FROM asset_inventory_tags
WHERE asset_inventory_id IN (
  SELECT id FROM asset_inventory WHERE organization_id = (SELECT org_id FROM _purge_target)
);
DELETE FROM asset_inventory WHERE organization_id = (SELECT org_id FROM _purge_target);

DELETE FROM maintenance_request_tags
WHERE maintenance_request_id IN (
  SELECT id FROM maintenance_requests WHERE organization_id = (SELECT org_id FROM _purge_target)
);
DELETE FROM maintenance_requests WHERE organization_id = (SELECT org_id FROM _purge_target);

DELETE FROM compliance_document_tags
WHERE compliance_document_id IN (
  SELECT id FROM compliance_documents WHERE organization_id = (SELECT org_id FROM _purge_target)
);
DELETE FROM compliance_documents WHERE organization_id = (SELECT org_id FROM _purge_target);
DELETE FROM compliance_document_types WHERE organization_id = (SELECT org_id FROM _purge_target);

-- ============================================================
-- TEAMS / TAGS / TENANCY / FIXFLO / ROOT ORG DATA
-- ============================================================

DELETE FROM team_categories
WHERE team_id IN (SELECT id FROM teams WHERE organization_id = (SELECT org_id FROM _purge_target));
DELETE FROM team_members
WHERE team_id IN (SELECT id FROM teams WHERE organization_id = (SELECT org_id FROM _purge_target));
DELETE FROM teams WHERE organization_id = (SELECT org_id FROM _purge_target);

DELETE FROM block_tags
WHERE block_id IN (SELECT id FROM blocks WHERE organization_id = (SELECT org_id FROM _purge_target));
DELETE FROM property_tags
WHERE property_id IN (SELECT id FROM properties WHERE organization_id = (SELECT org_id FROM _purge_target));
DELETE FROM contact_tags
WHERE contact_id IN (SELECT id FROM contacts WHERE organization_id = (SELECT org_id FROM _purge_target));
DELETE FROM user_tags
WHERE user_id IN (SELECT id FROM users WHERE organization_id = (SELECT org_id FROM _purge_target));
DELETE FROM tenant_assignment_tags
WHERE tenant_assignment_id IN (
  SELECT id FROM tenant_assignments WHERE organization_id = (SELECT org_id FROM _purge_target)
);
DELETE FROM tags WHERE organization_id = (SELECT org_id FROM _purge_target);

DELETE FROM tenancy_attachments WHERE organization_id = (SELECT org_id FROM _purge_target);
DELETE FROM tenant_assignments WHERE organization_id = (SELECT org_id FROM _purge_target);

DELETE FROM fixflo_webhook_logs WHERE organization_id = (SELECT org_id FROM _purge_target);
DELETE FROM fixflo_sync_state WHERE organization_id = (SELECT org_id FROM _purge_target);
DELETE FROM fixflo_config WHERE organization_id = (SELECT org_id FROM _purge_target);

DELETE FROM organization_trademarks WHERE organization_id = (SELECT org_id FROM _purge_target);
DELETE FROM user_documents WHERE organization_id = (SELECT org_id FROM _purge_target);
DELETE FROM contacts WHERE organization_id = (SELECT org_id FROM _purge_target);
DELETE FROM message_templates WHERE organization_id = (SELECT org_id FROM _purge_target);
DELETE FROM notifications WHERE organization_id = (SELECT org_id FROM _purge_target);
DELETE FROM feedback_submissions WHERE organization_id = (SELECT org_id FROM _purge_target);

DELETE FROM dashboard_preferences
WHERE user_id IN (SELECT id FROM users WHERE organization_id = (SELECT org_id FROM _purge_target));

DELETE FROM properties WHERE organization_id = (SELECT org_id FROM _purge_target);
DELETE FROM blocks WHERE organization_id = (SELECT org_id FROM _purge_target);

-- ============================================================
-- USERS + ORGANIZATION
-- ============================================================

DELETE FROM users WHERE organization_id = (SELECT org_id FROM _purge_target);
DELETE FROM organizations WHERE id = (SELECT org_id FROM _purge_target);

COMMIT;

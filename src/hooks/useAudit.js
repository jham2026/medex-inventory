import { supabase } from '../lib/supabase';

/**
 * useAudit - shared audit logging utility
 *
 * Usage:
 *   import { logAudit } from '../hooks/useAudit';
 *   await logAudit(profile, 'USER_LOGIN', 'auth', { target_name: profile.full_name });
 *
 * Categories: auth | import | export | user | account | count | catalog | referral
 *
 * Actions:
 *   auth:     USER_LOGIN, USER_LOGOUT, SESSION_TIMEOUT
 *   import:   IMPORT_ACCOUNTS, IMPORT_USERS, IMPORT_CLAIMSOFT_CATALOG,
 *             IMPORT_EDGE_CATALOG, IMPORT_REFERRAL_SOURCES
 *   export:   EXPORT_ACCOUNTS, EXPORT_USERS, EXPORT_CATALOG, EXPORT_COUNT_HISTORY
 *   user:     USER_CREATED, USER_UPDATED, USER_DEACTIVATED, USER_ACTIVATED,
 *             USER_PASSWORD_RESET
 *   account:  ACCOUNT_REP_ADDED, ACCOUNT_REP_REMOVED, ACCOUNT_CATALOG_CHANGED,
 *             ACCOUNT_DEACTIVATED, ACCOUNT_ACTIVATED, ACCOUNT_CLOSURE_FLAGGED,
 *             ACCOUNT_CLOSURE_APPROVED, ACCOUNT_REACTIVATED
 *   count:    COUNT_SUBMITTED, COUNT_APPROVED, COUNT_REJECTED,
 *             COUNT_EDIT_REQUESTED, COUNT_EDIT_APPROVED, COUNT_EDIT_DENIED
 *   catalog:  CATALOG_ITEM_ADDED, CATALOG_ITEM_UPDATED
 */
export async function logAudit(profile, action, category, options = {}) {
  try {
    const { target_type, target_name, details } = options;
    await supabase.from('audit_logs').insert({
      user_id:     profile?.id   || null,
      user_name:   profile?.full_name || 'Unknown',
      user_role:   profile?.role || 'unknown',
      action,
      category,
      target_type: target_type || null,
      target_name: target_name || null,
      details:     details     || null,
    });
  } catch (err) {
    // Never let audit logging break the main action
    console.warn('Audit log failed:', err);
  }
}

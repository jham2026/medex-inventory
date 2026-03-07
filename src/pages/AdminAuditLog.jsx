import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useToast } from '../components/ToastContext';

const CATEGORY_OPTIONS = [
  { value: '',        label: 'All Categories' },
  { value: 'auth',    label: 'Auth (Login/Logout)' },
  { value: 'import',  label: 'Imports' },
  { value: 'export',  label: 'Exports' },
  { value: 'user',    label: 'User Management' },
  { value: 'account', label: 'Account Changes' },
  { value: 'count',   label: 'Count Activity' },
  { value: 'catalog', label: 'Catalog Changes' },
];

const ACTION_LABELS = {
  USER_LOGIN:                'Logged In',
  USER_LOGOUT:               'Logged Out',
  SESSION_TIMEOUT:           'Session Timed Out',
  IMPORT_ACCOUNTS:           'Imported Accounts',
  IMPORT_USERS:              'Imported Users',
  IMPORT_CLAIMSOFT_CATALOG:  'Imported Claimsoft Catalog',
  IMPORT_EDGE_CATALOG:       'Imported Account Edge Catalog',
  IMPORT_REFERRAL_SOURCES:   'Imported Claimsoft Referral',
  EXPORT_ACCOUNTS:           'Exported Accounts',
  EXPORT_USERS:              'Exported Users',
  EXPORT_CATALOG:            'Exported Item Catalog',
  EXPORT_COUNT_HISTORY:      'Exported Count History',
  USER_CREATED:              'Created User',
  USER_UPDATED:              'Updated User',
  USER_DEACTIVATED:          'Deactivated User',
  USER_ACTIVATED:            'Activated User',
  USER_PASSWORD_RESET:       'Reset Password',
  ACCOUNT_REP_ADDED:         'Rep Added to Account',
  ACCOUNT_REP_REMOVED:       'Rep Removed from Account',
  ACCOUNT_CATALOG_CHANGED:   'Account Catalog Changed',
  ACCOUNT_DEACTIVATED:       'Account Deactivated',
  ACCOUNT_ACTIVATED:         'Account Activated',
  ACCOUNT_CLOSURE_FLAGGED:   'Account Flagged for Closure',
  ACCOUNT_CLOSURE_APPROVED:  'Account Closure Approved',
  ACCOUNT_REACTIVATED:       'Account Reactivated',
  COUNT_SUBMITTED:           'Count Submitted',
  COUNT_APPROVED:            'Count Approved',
  COUNT_REJECTED:            'Count Rejected',
  COUNT_EDIT_REQUESTED:      'Edit Requested',
  COUNT_EDIT_APPROVED:       'Edit Request Approved',
  COUNT_EDIT_DENIED:         'Edit Request Denied',
  CATALOG_ITEM_ADDED:        'Catalog Item Added',
  CATALOG_ITEM_UPDATED:      'Catalog Item Updated',
};

const CATEGORY_COLORS = {
  auth:    { bg: '#EFF6FF', color: '#1D4ED8', border: '#BFDBFE' },
  import:  { bg: '#F0FDF4', color: '#15803D', border: '#BBF7D0' },
  export:  { bg: '#FFF7ED', color: '#C2410C', border: '#FED7AA' },
  user:    { bg: '#FAF5FF', color: '#7E22CE', border: '#E9D5FF' },
  account: { bg: '#FFFBEB', color: '#92400E', border: '#FDE68A' },
  count:   { bg: '#F0F9FF', color: '#0369A1', border: '#BAE6FD' },
  catalog: { bg: '#FFF1F2', color: '#BE123C', border: '#FECDD3' },
};

function CategoryBadge({ category }) {
  const style = CATEGORY_COLORS[category] || { bg: '#F1F5F9', color: '#475569', border: '#E2E8F0' };
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 6,
      background: style.bg, color: style.color, border: '1px solid ' + style.border,
      textTransform: 'uppercase', letterSpacing: 0.5, whiteSpace: 'nowrap',
    }}>
      {category}
    </span>
  );
}

function RoleBadge({ role }) {
  const colors = { admin: '#0076BB', manager: '#7E22CE', rep: '#15803D' };
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 6,
      background: '#F1F5F9', color: colors[role] || '#475569',
      border: '1px solid #E2E8F0', whiteSpace: 'nowrap',
    }}>
      {role || 'unknown'}
    </span>
  );
}

function DetailModal({ log, onClose }) {
  if (!log) return null;
  const details = log.details || {};
  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 520 }}>
        <div className="modal-head-blue">
          <div className="modal-head-title">{ACTION_LABELS[log.action] || log.action}</div>
          <div className="modal-head-sub">{new Date(log.created_at).toLocaleString()}</div>
        </div>
        <div className="modal-body">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
            <div style={{ background: 'var(--bg)', borderRadius: 8, padding: 12 }}>
              <div className="form-lbl" style={{ marginTop: 0 }}>User</div>
              <div style={{ fontWeight: 700 }}>{log.user_name || '--'}</div>
            </div>
            <div style={{ background: 'var(--bg)', borderRadius: 8, padding: 12 }}>
              <div className="form-lbl" style={{ marginTop: 0 }}>Role</div>
              <div style={{ fontWeight: 700 }}>{log.user_role || '--'}</div>
            </div>
            <div style={{ background: 'var(--bg)', borderRadius: 8, padding: 12 }}>
              <div className="form-lbl" style={{ marginTop: 0 }}>Category</div>
              <div style={{ fontWeight: 700 }}>{log.category}</div>
            </div>
            <div style={{ background: 'var(--bg)', borderRadius: 8, padding: 12 }}>
              <div className="form-lbl" style={{ marginTop: 0 }}>Action</div>
              <div style={{ fontWeight: 700, fontSize: 12 }}>{log.action}</div>
            </div>
          </div>
          {log.target_name && (
            <div style={{ background: 'var(--bg)', borderRadius: 8, padding: 12, marginBottom: 10 }}>
              <div className="form-lbl" style={{ marginTop: 0 }}>Target</div>
              <div style={{ fontWeight: 700 }}>{log.target_name}</div>
            </div>
          )}
          {Object.keys(details).length > 0 && (
            <div style={{ background: 'var(--bg)', borderRadius: 8, padding: 12 }}>
              <div className="form-lbl" style={{ marginTop: 0 }}>Details</div>
              {Object.entries(details).map(([k, v]) => (
                <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginTop: 6 }}>
                  <span style={{ color: 'var(--text-dim)', textTransform: 'capitalize' }}>{k.replace(/_/g, ' ')}</span>
                  <span style={{ fontWeight: 600 }}>{typeof v === 'object' ? JSON.stringify(v) : String(v ?? '--')}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="modal-actions">
          <button className="btn btn-primary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

export default function AdminAuditLog() {
  const toast = useToast();

  const [logs, setLogs]               = useState([]);
  const [users, setUsers]             = useState([]);
  const [loading, setLoading]         = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore]         = useState(false);
  const [selectedLog, setSelectedLog] = useState(null);
  const [total, setTotal]             = useState(0);

  const PAGE_SIZE = 50;

  // Filters
  const [filterCategory, setFilterCategory] = useState('');
  const [filterUser, setFilterUser]         = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo]     = useState('');
  const [search, setSearch]                 = useState('');

  useEffect(() => {
    supabase.from('profiles').select('id, full_name').order('full_name')
      .then(({ data }) => setUsers(data || []));
  }, []);

  const loadLogs = useCallback(async (reset = true) => {
    if (reset) setLoading(true); else setLoadingMore(true);

    let query = supabase
      .from('audit_logs')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .limit(PAGE_SIZE);

    if (reset) query = query.range(0, PAGE_SIZE - 1);
    else       query = query.range(logs.length, logs.length + PAGE_SIZE - 1);

    if (filterCategory) query = query.eq('category', filterCategory);
    if (filterUser)     query = query.eq('user_id', filterUser);
    if (filterDateFrom) query = query.gte('created_at', filterDateFrom + 'T00:00:00');
    if (filterDateTo)   query = query.lte('created_at', filterDateTo + 'T23:59:59');
    if (search)         query = query.or('action.ilike.%' + search + '%,user_name.ilike.%' + search + '%,target_name.ilike.%' + search + '%');

    const { data, error, count } = await query;

    if (error) { toast.error('Failed to load audit log'); }
    else {
      setLogs(reset ? (data || []) : [...logs, ...(data || [])]);
      setTotal(count || 0);
      setHasMore((reset ? (data || []).length : logs.length + (data || []).length) < (count || 0));
    }

    if (reset) setLoading(false); else setLoadingMore(false);
  }, [filterCategory, filterUser, filterDateFrom, filterDateTo, search, logs]);

  useEffect(() => { loadLogs(true); }, [filterCategory, filterUser, filterDateFrom, filterDateTo]);

  function handleSearch(e) {
    if (e.key === 'Enter') loadLogs(true);
  }

  function clearFilters() {
    setFilterCategory(''); setFilterUser('');
    setFilterDateFrom(''); setFilterDateTo('');
    setSearch('');
  }

  const hasFilters = filterCategory || filterUser || filterDateFrom || filterDateTo || search;

  return (
    <div>
      {selectedLog && <DetailModal log={selectedLog} onClose={() => setSelectedLog(null)} />}

      {/* Filter bar */}
      <div className="card" style={{ marginBottom: 16, padding: '14px 16px' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>

          <select className="filter-select" value={filterCategory} onChange={e => setFilterCategory(e.target.value)}>
            {CATEGORY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>

          <select className="filter-select" value={filterUser} onChange={e => setFilterUser(e.target.value)}>
            <option value="">All Users</option>
            {users.map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}
          </select>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span className="filter-label">From:</span>
            <input type="date" className="filter-select" value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)} style={{ width: 140 }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span className="filter-label">To:</span>
            <input type="date" className="filter-select" value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)} style={{ width: 140 }} />
          </div>

          <input
            className="search-input"
            placeholder="Search action, user, target... (Enter)"
            value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={handleSearch}
            style={{ minWidth: 220 }}
          />

          {hasFilters && (
            <button className="btn btn-outline" onClick={clearFilters} style={{ whiteSpace: 'nowrap' }}>
              Clear Filters
            </button>
          )}

          <span className="count-lbl ml-auto" style={{ whiteSpace: 'nowrap' }}>
            {loading ? 'Loading...' : total.toLocaleString() + ' events'}
          </span>
        </div>
      </div>

      {/* Log table */}
      <div className="card">
        {loading ? (
          <div className="loading-center" style={{ padding: 48 }}><div className="spinner" /></div>
        ) : logs.length === 0 ? (
          <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-dim)', fontStyle: 'italic' }}>
            No audit events found.
          </div>
        ) : (
          <>
            <table>
              <thead>
                <tr>
                  <th style={{ width: 160 }}>Timestamp</th>
                  <th style={{ width: 140 }}>User</th>
                  <th style={{ width: 80 }}>Role</th>
                  <th style={{ width: 100 }}>Category</th>
                  <th>Action</th>
                  <th>Target</th>
                  <th style={{ width: 60 }}></th>
                </tr>
              </thead>
              <tbody>
                {logs.map(log => (
                  <tr key={log.id} style={{ cursor: 'pointer' }} onClick={() => setSelectedLog(log)}>
                    <td style={{ fontSize: 11, color: 'var(--text-dim)', whiteSpace: 'nowrap' }}>
                      {new Date(log.created_at).toLocaleDateString()}{' '}
                      <span style={{ color: 'var(--text-mid)' }}>
                        {new Date(log.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </td>
                    <td style={{ fontWeight: 600, fontSize: 13 }}>{log.user_name || '--'}</td>
                    <td><RoleBadge role={log.user_role} /></td>
                    <td><CategoryBadge category={log.category} /></td>
                    <td style={{ fontSize: 13 }}>{ACTION_LABELS[log.action] || log.action}</td>
                    <td style={{ fontSize: 12, color: 'var(--text-mid)' }}>{log.target_name || '--'}</td>
                    <td>
                      <button className="tbl-btn-sm" onClick={e => { e.stopPropagation(); setSelectedLog(log); }}>
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Load more */}
            {hasMore && (
              <div style={{ padding: '16px', textAlign: 'center', borderTop: '1px solid var(--border)' }}>
                <button
                  className="btn btn-outline"
                  onClick={() => loadLogs(false)}
                  disabled={loadingMore}
                >
                  {loadingMore ? 'Loading...' : 'Load More (' + (total - logs.length).toLocaleString() + ' remaining)'}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useToast } from '../components/ToastContext';

export default function AdminAccounts() {
  const toast = useToast();
  const [accounts, setAccounts] = useState([]);
  const [reps, setReps]         = useState([]);
  const [regions, setRegions]   = useState([]);
  const [loading, setLoading]   = useState(true);
  const [search, setSearch]     = useState('');
  const [filterRegion, setFilterRegion] = useState('');
  const [filterAssigned, setFilterAssigned] = useState('all');
  const [saving, setSaving]     = useState(null);

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    const [{ data: accts }, { data: repData }, { data: regData }] = await Promise.all([
      supabase.from('accounts')
        .select('id, name, rep_name_raw, is_active, assigned_rep_id, region:regions(id, name)')
        .order('name'),
      supabase.from('profiles')
        .select('id, full_name, role')
        .in('role', ['rep', 'manager', 'admin'])
        .eq('is_active', true)
        .order('full_name'),
      supabase.from('regions').select('*').order('name'),
    ]);
    setAccounts(accts || []);
    setReps(repData || []);
    setRegions(regData || []);
    setLoading(false);
  }

  async function assignRep(accountId, repId) {
    setSaving(accountId);
    const { error } = await supabase.from('accounts')
      .update({ assigned_rep_id: repId || null })
      .eq('id', accountId);
    if (error) {
      toast.error('Failed to update: ' + error.message);
    } else {
      setAccounts(prev => prev.map(a =>
        a.id === accountId ? { ...a, assigned_rep_id: repId || null } : a
      ));
      toast.success('Rep assigned!');
      if (repId) {
        const acct = accounts.find(a => a.id === accountId);
        if (acct) {
          await supabase.from('alerts')
            .update({ is_read: true })
            .eq('alert_type', 'unassigned_account')
            .ilike('message', `%${acct.name}%`);
        }
      }
    }
    setSaving(null);
  }

  async function toggleActive(account) {
    await supabase.from('accounts')
      .update({ is_active: !account.is_active })
      .eq('id', account.id);
    setAccounts(prev => prev.map(a =>
      a.id === account.id ? { ...a, is_active: !a.is_active } : a
    ));
    toast.success(`${account.name} ${account.is_active ? 'deactivated' : 'activated'}`);
  }

  const filtered = accounts
    .filter(a => !filterRegion || a.region?.name === filterRegion)
    .filter(a => {
      if (filterAssigned === 'unassigned') return !a.assigned_rep_id;
      if (filterAssigned === 'assigned')   return !!a.assigned_rep_id;
      return true;
    })
    .filter(a => !search || a.name.toLowerCase().includes(search.toLowerCase()));

  const unassignedCount = accounts.filter(a => !a.assigned_rep_id).length;

  if (loading) return <div className="loading-center"><div className="spinner" /></div>;

  return (
    <div>
      <div className="stat-grid" style={{ marginBottom: 16 }}>
        <div className="stat-card">
          <div className="stat-val">{accounts.length}</div>
          <div className="stat-label">Total Accounts</div>
        </div>
        <div className="stat-card" style={{ borderTop: unassignedCount > 0 ? '3px solid var(--error)' : '3px solid var(--success)' }}>
          <div className="stat-val" style={{ color: unassignedCount > 0 ? 'var(--error)' : 'var(--success)' }}>
            {unassignedCount}
          </div>
          <div className="stat-label">Unassigned</div>
        </div>
        <div className="stat-card green">
          <div className="stat-val">{accounts.filter(a => a.assigned_rep_id).length}</div>
          <div className="stat-label">Assigned</div>
        </div>
        <div className="stat-card">
          <div className="stat-val">{accounts.filter(a => !a.is_active).length}</div>
          <div className="stat-label">Inactive</div>
        </div>
      </div>

      {unassignedCount > 0 && (
        <div className="alert-banner warning" style={{ marginBottom: 14 }}>
          ⚠ {unassignedCount} accounts have no rep assigned.
          <button className="btn btn-sm btn-utility" style={{ marginLeft: 12 }}
            onClick={() => setFilterAssigned('unassigned')}>
            Show Unassigned Only
          </button>
        </div>
      )}

      <div className="filter-bar">
        <label>Region:</label>
        <select className="select" value={filterRegion} onChange={e => setFilterRegion(e.target.value)}>
          <option value="">All Regions</option>
          {regions.map(r => <option key={r.id} value={r.name}>{r.name}</option>)}
        </select>
        <label>Assignment:</label>
        <select className="select" value={filterAssigned} onChange={e => setFilterAssigned(e.target.value)}>
          <option value="all">All Accounts</option>
          <option value="unassigned">Unassigned Only</option>
          <option value="assigned">Assigned Only</option>
        </select>
        <label>Search:</label>
        <input className="input" placeholder="Search accounts..."
          value={search} onChange={e => setSearch(e.target.value)} />
        <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--gray-dark)' }}>
          {filtered.length} of {accounts.length} accounts
        </span>
      </div>

      <div className="card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Account Name</th>
                <th>Region</th>
                <th>Original Rep Name</th>
                <th>Assigned Rep</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={6} className="table-empty">No accounts match your filter.</td></tr>
              ) : filtered.map(acct => (
                <tr key={acct.id}
                  style={{ background: !acct.assigned_rep_id ? '#fff8ec' : undefined }}>
                  <td><strong>{acct.name}</strong></td>
                  <td>{acct.region?.name}</td>
                  <td style={{ fontSize: 12, color: 'var(--gray-dark)' }}>
                    {acct.rep_name_raw || '—'}
                  </td>
                  <td>
                    <select
                      className="select"
                      style={{ minWidth: 180 }}
                      value={acct.assigned_rep_id || ''}
                      onChange={e => assignRep(acct.id, e.target.value)}
                      disabled={saving === acct.id}
                    >
                      <option value="">— Unassigned —</option>
                      {reps.map(r => (
                        <option key={r.id} value={r.id}>{r.full_name} ({r.role})</option>
                      ))}
                    </select>
                    {saving === acct.id && (
                      <span style={{ fontSize: 11, color: 'var(--gray-dark)', marginLeft: 6 }}>Saving...</span>
                    )}
                  </td>
                  <td>
                    <span className={`badge ${acct.is_active ? 'badge-approved' : 'badge-closed'}`}>
                      {acct.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td>
                    <button
                      className={`btn btn-sm ${acct.is_active ? 'btn-utility' : 'btn-secondary'}`}
                      onClick={() => toggleActive(acct)}
                    >
                      {acct.is_active ? 'Deactivate' : 'Activate'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

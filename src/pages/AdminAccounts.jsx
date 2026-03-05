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
  const [activeCard, setActiveCard] = useState('all'); // 'all','unassigned','assigned','closed'
  const [saving, setSaving]     = useState(null);

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    const [{ data: accts }, { data: repData }, { data: regData }] = await Promise.all([
      supabase.from('accounts')
        .select('id, name, rep_name_raw, is_active, assigned_rep_id, flagged_closed, closed_date, closed_notes, closed_at, region:regions(id, name)')
        .order('name'),
      supabase.from('profiles').select('id, full_name, role').in('role', ['rep','manager','admin']).eq('is_active', true).order('full_name'),
      supabase.from('regions').select('*').order('name'),
    ]);
    setAccounts(accts || []);
    setReps(repData || []);
    setRegions(regData || []);
    setLoading(false);
  }

  async function assignRep(accountId, repId) {
    setSaving(accountId);
    const { error } = await supabase.from('accounts').update({ assigned_rep_id: repId || null }).eq('id', accountId);
    if (error) { toast.error('Failed to update: ' + error.message); }
    else {
      setAccounts(prev => prev.map(a => a.id === accountId ? { ...a, assigned_rep_id: repId || null } : a));
      toast.success('Rep assigned!');
      if (repId) {
        const acct = accounts.find(a => a.id === accountId);
        if (acct) await supabase.from('alerts').update({ is_read: true }).eq('alert_type', 'unassigned_account').ilike('message', `%${acct.name}%`);
      }
    }
    setSaving(null);
  }

  async function toggleActive(account) {
    await supabase.from('accounts').update({ is_active: !account.is_active }).eq('id', account.id);
    setAccounts(prev => prev.map(a => a.id === account.id ? { ...a, is_active: !a.is_active } : a));
    toast.success(`${account.name} ${account.is_active ? 'deactivated' : 'activated'}`);
  }

  async function reactivateClosed(account) {
    if (!window.confirm(`Reactivate "${account.name}"? This will remove the closed flag and add it back to future count cycles.`)) return;
    await supabase.from('accounts').update({
      flagged_closed: false, closed_date: null, closed_notes: null,
      closed_by: null, closed_at: null, is_active: true,
    }).eq('id', account.id);
    setAccounts(prev => prev.map(a => a.id === account.id ? {
      ...a, flagged_closed: false, closed_date: null, closed_notes: null, is_active: true
    } : a));
    toast.success(`${account.name} reactivated!`);
  }

  const activeCount     = accounts.filter(a => !a.flagged_closed).length;
  const unassignedCount = accounts.filter(a => !a.assigned_rep_id && !a.flagged_closed).length;
  const assignedCount   = accounts.filter(a => !!a.assigned_rep_id && !a.flagged_closed).length;
  const closedCount     = accounts.filter(a => a.flagged_closed).length;

  function handleCardClick(card) {
    setActiveCard(prev => prev === card ? 'all' : card);
    setSearch('');
    setFilterRegion('');
  }

  const filtered = accounts
    .filter(a => {
      if (activeCard === 'closed')     return a.flagged_closed;
      if (activeCard === 'unassigned') return !a.assigned_rep_id && !a.flagged_closed;
      if (activeCard === 'assigned')   return !!a.assigned_rep_id && !a.flagged_closed;
      return !a.flagged_closed; // 'all'
    })
    .filter(a => !filterRegion || a.region?.name === filterRegion)
    .filter(a => !search || a.name.toLowerCase().includes(search.toLowerCase()));

  const isClosedView = activeCard === 'closed';

  if (loading) return <div className="loading-center"><div className="spinner" /></div>;

  const cardStyle = (card, color) => ({
    borderTop: `3px solid ${activeCard === card ? color : 'var(--gray-mid)'}`,
    cursor: 'pointer',
    outline: activeCard === card ? `2px solid ${color}` : 'none',
    transition: 'outline 0.15s',
  });

  return (
    <div>
      {/* Clickable stat cards */}
      <div className="stat-grid" style={{ marginBottom: 16 }}>
        <div className="stat-card" style={cardStyle('all', 'var(--teal)')}
          onClick={() => handleCardClick('all')}>
          <div className="stat-val" style={{ color: 'var(--teal)' }}>{activeCount}</div>
          <div className="stat-label">Active Accounts</div>
          {activeCard === 'all' && <div style={{ fontSize: 11, color: 'var(--teal)', marginTop: 2 }}>* click to clear</div>}
        </div>
        <div className="stat-card" style={cardStyle('unassigned', unassignedCount > 0 ? 'var(--error)' : 'var(--success)')}
          onClick={() => handleCardClick('unassigned')}>
          <div className="stat-val" style={{ color: unassignedCount > 0 ? 'var(--error)' : 'var(--success)' }}>{unassignedCount}</div>
          <div className="stat-label">Unassigned</div>
          {activeCard === 'unassigned' && <div style={{ fontSize: 11, color: 'var(--error)', marginTop: 2 }}>* click to clear</div>}
        </div>
        <div className="stat-card" style={cardStyle('assigned', 'var(--success)')}
          onClick={() => handleCardClick('assigned')}>
          <div className="stat-val" style={{ color: 'var(--success)' }}>{assignedCount}</div>
          <div className="stat-label">Assigned</div>
          {activeCard === 'assigned' && <div style={{ fontSize: 11, color: 'var(--success)', marginTop: 2 }}>* click to clear</div>}
        </div>
        <div className="stat-card" style={cardStyle('closed', 'var(--error)')}
          onClick={() => handleCardClick('closed')}>
          <div className="stat-val" style={{ color: closedCount > 0 ? 'var(--error)' : undefined }}>{closedCount}</div>
          <div className="stat-label">Flagged Closed</div>
          {activeCard === 'closed' && <div style={{ fontSize: 11, color: 'var(--error)', marginTop: 2 }}>* click to clear</div>}
          {closedCount > 0 && activeCard !== 'closed' && (
            <div style={{ fontSize: 11, color: 'var(--error)', marginTop: 2 }}>! Needs review</div>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="filter-bar" style={{ marginBottom: 14 }}>
        {!isClosedView && <>
          <label>Region:</label>
          <select className="select" value={filterRegion} onChange={e => setFilterRegion(e.target.value)}>
            <option value="">All Regions</option>
            {regions.map(r => <option key={r.id} value={r.name}>{r.name}</option>)}
          </select>
        </>}
        <label>Search:</label>
        <input className="input" placeholder="Search accounts..." value={search} onChange={e => setSearch(e.target.value)} />
        {(search || filterRegion) && (
          <button className="btn btn-utility btn-sm" onClick={() => { setSearch(''); setFilterRegion(''); }}>Clear</button>
        )}
        <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--gray-dark)' }}>
          {filtered.length} accounts
          {activeCard !== 'all' && (
            <button className="btn btn-utility btn-sm" style={{ marginLeft: 8 }}
              onClick={() => handleCardClick('all')}>Clear Filter</button>
          )}
        </span>
      </div>

      {/* Table */}
      <div className="card">
        <div className="card-header">
          <span style={{ fontWeight: 'bold' }}>
            {activeCard === 'all'        && 'All Active Accounts'}
            {activeCard === 'unassigned' && 'Unassigned Accounts'}
            {activeCard === 'assigned'   && 'Assigned Accounts'}
            {activeCard === 'closed'     && 'Flagged Closed Accounts'}
          </span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              {!isClosedView ? (
                <tr><th>Account Name</th><th>Region</th><th>Original Rep</th><th>Assigned Rep</th><th>Status</th><th>Actions</th></tr>
              ) : (
                <tr><th>Account Name</th><th>Region</th><th>Closed Date</th><th>Reason / Notes</th><th>Actions</th></tr>
              )}
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={6} className="table-empty">No accounts match your filter.</td></tr>
              ) : !isClosedView ? filtered.map(acct => (
                <tr key={acct.id} style={{ background: !acct.assigned_rep_id ? '#fff8ec' : undefined }}>
                  <td><strong>{acct.name}</strong></td>
                  <td>{acct.region?.name}</td>
                  <td style={{ fontSize: 12, color: 'var(--gray-dark)' }}>{acct.rep_name_raw || '--'}</td>
                  <td>
                    <select className="select" style={{ minWidth: 180 }}
                      value={acct.assigned_rep_id || ''}
                      onChange={e => assignRep(acct.id, e.target.value)}
                      disabled={saving === acct.id}>
                      <option value="">-- Unassigned --</option>
                      {reps.map(r => <option key={r.id} value={r.id}>{r.full_name} ({r.role})</option>)}
                    </select>
                    {saving === acct.id && <span style={{ fontSize: 11, color: 'var(--gray-dark)', marginLeft: 6 }}>Saving...</span>}
                  </td>
                  <td>
                    <span className={`badge ${acct.is_active ? 'badge-approved' : 'badge-closed'}`}>
                      {acct.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td>
                    <button className={`btn btn-sm ${acct.is_active ? 'btn-utility' : 'btn-secondary'}`}
                      onClick={() => toggleActive(acct)}>
                      {acct.is_active ? 'Deactivate' : 'Activate'}
                    </button>
                  </td>
                </tr>
              )) : filtered.map(acct => (
                <tr key={acct.id} style={{ background: '#fff3f3' }}>
                  <td><strong>{acct.name}</strong></td>
                  <td>{acct.region?.name}</td>
                  <td style={{ fontSize: 12 }}>{acct.closed_date || '--'}</td>
                  <td style={{ fontSize: 12, color: 'var(--gray-dark)', maxWidth: 300 }}>{acct.closed_notes || '--'}</td>
                  <td>
                    <button className="btn btn-secondary btn-sm" onClick={() => reactivateClosed(acct)}>
                      <- Reactivate
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

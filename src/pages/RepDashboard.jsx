import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../components/AuthContext';
import { COUNT_STATUS } from '../lib/supabase';
import NavBar from '../components/NavBar';

export default function RepDashboard() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [counts, setCounts]     = useState([]);
  const [cycle, setCycle]       = useState(null);
  const [loading, setLoading]   = useState(true);
  const [filter, setFilter]     = useState('all');
  const [search, setSearch]     = useState('');
  const [sortBy, setSortBy]     = useState('account_name');
  const [sortDir, setSortDir]   = useState('asc');
  const [requesting, setRequesting] = useState({});
  const [requested, setRequested]   = useState({});

  useEffect(() => { loadData(); }, [profile]);

  async function loadData() {
    setLoading(true);
    const { data: cycleData } = await supabase
      .from('count_cycles').select('*').eq('status', 'open').single();
    setCycle(cycleData);

    if (!cycleData) { setLoading(false); return; }

    const { data } = await supabase
      .from('inventory_counts')
      .select(`
        id, status, started_at, submitted_at, approved_at,
        account:accounts(id, name, region:regions(name))
      `)
      .eq('cycle_id', cycleData.id)
      .eq('rep_id', profile.id);

    setCounts(data || []);

    // Check which counts already have a pending edit request
    if (data?.length) {
      const countIds = data.map(c => c.id);
      const { data: todos } = await supabase
        .from('todos')
        .select('id, title, is_complete')
        .eq('is_complete', false)
        .ilike('title', '%edit request%');

      const pendingMap = {};
      for (const t of todos || []) {
        for (const c of data) {
          if (t.title.includes(c.account?.name)) {
            pendingMap[c.id] = true;
          }
        }
      }
      setRequested(pendingMap);
    }

    setLoading(false);
  }

  async function requestEdit(count) {
    setRequesting(prev => ({ ...prev, [count.id]: true }));

    await supabase.from('todos').insert({
      title: `Edit request: ${count.account?.name}`,
      description: `${profile.full_name} is requesting permission to edit their submitted count for ${count.account?.name} (${cycle?.name}). Submitted on ${new Date(count.submitted_at).toLocaleDateString()}.`,
      priority: 'high',
      is_complete: false,
      count_id: count.id,
    });

    await supabase.from('alerts').insert({
      alert_type: 'edit_request',
      message: `${profile.full_name} requested edit access for ${count.account?.name} - ${cycle?.name}`,
      is_read: false,
    });

    setRequested(prev => ({ ...prev, [count.id]: true }));
    setRequesting(prev => ({ ...prev, [count.id]: false }));
  }

  function handleRowClick(c) {
    if (!cycle) return;
    if (c.status === 'submitted' || c.status === 'approved') return;
    navigate(`/count/${c.id}`);
  }

  const filtered = (counts || [])
    .filter(c => filter === 'all' || c.status === filter)
    .filter(c => !search || c.account?.name?.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      let av = sortBy === 'account_name' ? a.account?.name : a.status;
      let bv = sortBy === 'account_name' ? b.account?.name : b.status;
      return sortDir === 'asc' ? av?.localeCompare(bv) : bv?.localeCompare(av);
    });

  const stats = {
    not_started: counts.filter(c => c.status === 'not_started').length,
    in_progress:  counts.filter(c => c.status === 'in_progress').length,
    submitted:    counts.filter(c => c.status === 'submitted').length,
    approved:     counts.filter(c => c.status === 'approved').length,
  };

  function toggleSort(col) {
    if (sortBy === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortBy(col); setSortDir('asc'); }
  }

  if (loading) return (
    <>
      <NavBar />
      <div className="page"><div className="loading-center"><div className="spinner" /><span>Loading your counts...</span></div></div>
    </>
  );

  return (
    <>
      <NavBar />
      <div className="page">
        <div className="page-inner">
          <div className="page-header">
            <div>
              <div className="page-title">My Inventory Counts</div>
              <div className="page-sub">
                {cycle ? `${cycle.name} - Count Cycle Open` : 'No active count cycle'}
              </div>
            </div>
            <button className="btn btn-ghost btn-sm" onClick={() => navigate('/request-account')}>
              + Request Account
            </button>
          </div>

          {!cycle && (
            <div className="alert-banner warning">
              No count cycle is currently open. Contact your administrator to begin counting.
            </div>
          )}

          {/* Stats */}
          <div className="stat-grid">
            {Object.entries(stats).map(([status, count]) => (
              <div key={status} className="stat-card"
                style={{ cursor: 'pointer', borderTop: `3px solid ${COUNT_STATUS[status].color}` }}
                onClick={() => setFilter(filter === status ? 'all' : status)}>
                <div className="stat-val" style={{ color: COUNT_STATUS[status].color }}>{count}</div>
                <div className="stat-label">{COUNT_STATUS[status].label}</div>
              </div>
            ))}
          </div>

          {/* Filters */}
          <div className="filter-bar">
            <label>Status:</label>
            <select className="select" value={filter} onChange={e => setFilter(e.target.value)}>
              <option value="all">All Counts</option>
              {Object.entries(COUNT_STATUS).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
            <label>Search:</label>
            <input className="input" placeholder="Search accounts..."
              value={search} onChange={e => setSearch(e.target.value)} />
            <span style={{ marginLeft: 'auto', fontSize: '12px', color: 'var(--gray-dark)' }}>
              {filtered.length} of {counts.length} accounts
            </span>
          </div>

          {/* Table */}
          <div className="card">
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th className="sortable" onClick={() => toggleSort('account_name')}>
                      Account / Location {sortBy === 'account_name' ? (sortDir === 'asc' ? 'asc' : 'desc') : ''}
                    </th>
                    <th>Region</th>
                    <th className="sortable" onClick={() => toggleSort('status')}>
                      Status {sortBy === 'status' ? (sortDir === 'asc' ? 'asc' : 'desc') : ''}
                    </th>
                    <th>Started</th>
                    <th>Submitted</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr><td colSpan={6} className="table-empty">
                      {counts.length === 0 ? 'No counts assigned to you for this cycle.' : 'No results match your filter.'}
                    </td></tr>
                  ) : filtered.map(c => {
                    const isLocked = c.status === 'submitted' || c.status === 'approved';
                    const hasPendingRequest = requested[c.id];
                    const isRequesting = requesting[c.id];
                    return (
                      <tr key={c.id}
                        onClick={() => handleRowClick(c)}
                        style={{ cursor: isLocked ? 'default' : 'pointer' }}>
                        <td><strong>{c.account?.name}</strong></td>
                        <td>{c.account?.region?.name}</td>
                        <td>
                          <span className={`badge badge-${c.status}`}>
                            {COUNT_STATUS[c.status]?.label}
                          </span>
                        </td>
                        <td>{c.started_at ? new Date(c.started_at).toLocaleDateString() : '-'}</td>
                        <td>{c.submitted_at ? new Date(c.submitted_at).toLocaleDateString() : '-'}</td>
                        <td>
                          {c.status === 'submitted' && (
                            hasPendingRequest ? (
                              <span style={{ fontSize: 12, color: 'var(--gray-dark)', fontStyle: 'italic' }}>
                                Edit request pending...
                              </span>
                            ) : (
                              <button
                                className="btn btn-utility btn-sm"
                                onClick={e => { e.stopPropagation(); requestEdit(c); }}
                                disabled={isRequesting}>
                                {isRequesting ? 'Sending...' : 'Request Edit'}
                              </button>
                            )
                          )}
                          {c.status === 'approved' && (
                            <span style={{ fontSize: 12, color: 'var(--gray-dark)', fontStyle: 'italic' }}>
                              Approved - locked
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

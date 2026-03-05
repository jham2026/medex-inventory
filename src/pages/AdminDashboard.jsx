import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useToast } from '../components/ToastContext';
import { COUNT_STATUS } from '../lib/supabase';
import NavBar from '../components/NavBar';
import AdminUsers from './AdminUsers';
import AdminDataManagement from './AdminDataManagement';
import AdminAccounts from './AdminAccounts';

export default function AdminDashboard() {
  const toast = useToast();
  const [tab, setTab]             = useState('overview');
  const [cycle, setCycle]         = useState(null);
  const [progress, setProgress]   = useState([]);
  const [alerts, setAlerts]       = useState([]);
  const [todos, setTodos]         = useState([]);
  const [loading, setLoading]     = useState(true);
  const [progressFilter, setProgressFilter] = useState('all');
  const [cycleForm, setCycleForm] = useState({ name: '', quarter: 'Q1', year: new Date().getFullYear() });

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    const [{ data: cycleData }, { data: alertData }, { data: todoData }] = await Promise.all([
      supabase.from('count_cycles').select('*').eq('status', 'open').single(),
      supabase.from('alerts').select('*').eq('is_read', false).order('created_at', { ascending: false }).limit(50),
      supabase.from('todos').select('*').eq('is_complete', false).order('created_at', { ascending: false }),
    ]);
    setCycle(cycleData);
    setAlerts(alertData || []);
    setTodos(todoData || []);

    if (cycleData) {
      const { data: counts } = await supabase
        .from('inventory_counts')
        .select('id, status, submitted_at, approved_at, rep_id, account:accounts(name, region:regions(name))')
        .eq('cycle_id', cycleData.id)
        .order('status')
        .limit(500);

      const { data: reps } = await supabase.from('profiles').select('id, full_name');
      const repMap = {};
      for (const r of reps || []) repMap[r.id] = r;
      setProgress((counts || []).map(c => ({ ...c, rep: c.rep_id ? repMap[c.rep_id] : null })));
    }
    setLoading(false);
  }

  async function openCycle() {
    if (!cycleForm.name) { toast.error('Enter a cycle name'); return; }
    const { data: newCycle, error } = await supabase.from('count_cycles').insert({
      name: cycleForm.name, quarter: cycleForm.quarter, year: cycleForm.year,
      status: 'open', opened_at: new Date().toISOString(),
    }).select().single();
    if (error) { toast.error('Error: ' + error.message); return; }
    toast.info(`Cycle "${cycleForm.name}" created - populating counts...`);

    const { data: accounts } = await supabase.from('accounts').select('id, name, assigned_rep_id').eq('is_active', true);
    if (!accounts?.length) { toast.warning('No active accounts found.'); loadData(); return; }

    const { data: histItems } = await supabase.from('historical_counts')
      .select('account_name, item_number, quantity')
      .eq('quarter', cycleForm.quarter === 'Q1' ? 'Q3' : 'Q1')
      .eq('year', cycleForm.quarter === 'Q1' ? cycleForm.year - 1 : cycleForm.year);

    const acctNameMap = {};
    for (const a of accounts) acctNameMap[a.name.trim().toUpperCase()] = a.id;
    const histQtyMap = {};
    for (const h of histItems || []) {
      const acctId = acctNameMap[h.account_name?.trim().toUpperCase()];
      if (acctId && h.item_number) histQtyMap[`${acctId}_${h.item_number}`] = h.quantity;
    }

    let totalCreated = 0;
    for (let i = 0; i < accounts.length; i += 100) {
      const batch = accounts.slice(i, i + 100).map(a => ({
        cycle_id: newCycle.id, account_id: a.id, rep_id: a.assigned_rep_id || null, status: 'not_started',
      }));
      const { data: created, error: batchError } = await supabase.from('inventory_counts').insert(batch).select('id, account_id');
      if (batchError) { toast.error('Error: ' + batchError.message); continue; }
      totalCreated += created?.length || 0;

      for (const countRecord of created || []) {
        const histKeys = Object.keys(histQtyMap).filter(k => k.startsWith(countRecord.account_id + '_'));
        if (!histKeys.length) continue;
        const lineItems = histKeys.map(key => ({
          inventory_count_id: countRecord.id,
          item_number_raw: key.replace(countRecord.account_id + '_', ''),
          description_raw: key.replace(countRecord.account_id + '_', ''),
          quantity: 0, previous_quantity: histQtyMap[key],
          is_new_item: false, not_in_catalog: false,
        }));
        const itemNumbers = [...new Set(lineItems.map(l => l.item_number_raw))];
        const { data: catalogItems } = await supabase.from('item_catalog')
          .select('item_number, description, primary_vendor').in('item_number', itemNumbers.slice(0, 100));
        const catalogMap = {};
        for (const c of catalogItems || []) catalogMap[c.item_number] = c;
        const enriched = lineItems.map(l => ({
          ...l,
          description_raw: catalogMap[l.item_number_raw]?.description || l.item_number_raw,
          vendor_raw: catalogMap[l.item_number_raw]?.primary_vendor || null,
        }));
        for (let j = 0; j < enriched.length; j += 100) {
          await supabase.from('count_line_items').insert(enriched.slice(j, j + 100));
        }
      }
    }
    toast.success('Cycle "' + cycleForm.name + '" opened! ' + totalCreated + ' counts created.');
    loadData();
  }

  async function closeCycle() {
    if (!window.confirm(`Close cycle "${cycle?.name}"? Reps will no longer be able to submit counts.`)) return;
    await supabase.from('count_cycles').update({ status: 'closed', closed_at: new Date().toISOString() }).eq('id', cycle.id);
    toast.success('Count cycle closed.');
    setCycle(null); setProgress([]); loadData();
  }

  async function approveCount(countId) {
    await supabase.from('inventory_counts').update({ status: 'approved', approved_at: new Date().toISOString() }).eq('id', countId);
    setProgress(prev => prev.map(p => p.id === countId ? { ...p, status: 'approved' } : p));
    toast.success('Count approved!');
  }

  async function dismissAlert(alertId) {
    await supabase.from('alerts').update({ is_read: true }).eq('id', alertId);
    setAlerts(prev => prev.filter(a => a.id !== alertId));
  }

  async function dismissAllAlerts() {
    if (!window.confirm('Mark all alerts as read?')) return;
    await supabase.from('alerts').update({ is_read: true }).eq('is_read', false);
    setAlerts([]);
    toast.success('All alerts cleared.');
  }

  async function completeTodo(todoId) {
    await supabase.from('todos').update({ is_complete: true, completed_at: new Date().toISOString() }).eq('id', todoId);
    setTodos(prev => prev.filter(t => t.id !== todoId));
    toast.success('Task marked complete!');
  }

  async function approveEditRequest(todo) {
    if (todo.count_id) {
      await supabase.from('inventory_counts')
        .update({ status: 'in_progress' })
        .eq('id', todo.count_id);
    }
    await supabase.from('todos').update({ is_complete: true, completed_at: new Date().toISOString() }).eq('id', todo.id);
    await supabase.from('alerts').insert({
      alert_type: 'edit_approved',
      message: `Edit request approved: ${todo.title.replace('Edit request: ', '')}`,
      is_read: false,
    });
    setTodos(prev => prev.filter(t => t.id !== todo.id));
    toast.success('Edit request approved - count unlocked!');
    loadData();
  }

  async function denyEditRequest(todo) {
    await supabase.from('todos').update({ is_complete: true, completed_at: new Date().toISOString() }).eq('id', todo.id);
    await supabase.from('alerts').insert({
      alert_type: 'edit_denied',
      message: `Edit request denied: ${todo.title.replace('Edit request: ', '')}`,
      is_read: false,
    });
    setTodos(prev => prev.filter(t => t.id !== todo.id));
    toast.info('Edit request denied.');
  }

  const stats = {
    not_started: progress.filter(p => p.status === 'not_started').length,
    in_progress:  progress.filter(p => p.status === 'in_progress').length,
    submitted:    progress.filter(p => p.status === 'submitted').length,
    approved:     progress.filter(p => p.status === 'approved').length,
  };

  const filteredProgress = progressFilter === 'all' ? progress : progress.filter(p => p.status === progressFilter);

  if (loading) return (<><NavBar /><div className="page"><div className="loading-center"><div className="spinner" /></div></div></>);

  return (
    <>
      <NavBar />
      <div className="page">
        <div className="page-inner">
          <div className="page-header">
            <div>
              <div className="page-title">Admin Dashboard</div>
              <div className="page-sub">Manage count cycles, users, and exports</div>
            </div>
          </div>

          <div className="tab-bar">
            {[
              ['overview', 'Overview'],
              ['todos', `To Do${todos.length > 0 ? ` (${todos.length})` : ''}`],
              ['accounts', 'Accounts'],
              ['users', 'Users'],
              ['data', 'Data Management'],
            ].map(([k, v]) => (
              <button key={k} className={`tab ${tab === k ? 'active' : ''}`} onClick={() => setTab(k)}
                style={k === 'todos' && todos.length > 0 ? { color: 'var(--error)', fontWeight: 'bold' } : {}}>
                {v}
              </button>
            ))}
          </div>

          {tab === 'overview' && (
            <>
              {alerts.length > 0 && (
                <div className="card" style={{ marginBottom: 20 }}>
                  <div className="card-header">
                    <span style={{ fontWeight: 'bold' }}>Alerts ({alerts.length})</span>
                    <button className="btn btn-utility btn-sm" onClick={dismissAllAlerts}>Clear All</button>
                  </div>
                  <div className="card-body" style={{ padding: 0 }}>
                    {alerts.map(a => (
                      <div key={a.id} style={{ padding: '10px 16px', borderBottom: '1px solid var(--gray-mid)', display: 'flex', alignItems: 'center', gap: 10, fontSize: 13 }}>
                        <span style={{ flex: 1 }}>{a.message}</span>
                        <span style={{ color: 'var(--gray-dark)', fontSize: 11 }}>{new Date(a.created_at).toLocaleDateString()}</span>
                        <button className="btn btn-utility btn-sm" onClick={() => dismissAlert(a.id)}>Dismiss</button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="card" style={{ marginBottom: 20 }}>
                <div className="card-header">
                  <span style={{ fontWeight: 'bold' }}>Count Cycle</span>
                  {cycle && <span className="badge badge-open">{cycle.name} - Open</span>}
                </div>
                <div className="card-body">
                  {!cycle ? (
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                      <div className="input-group" style={{ marginBottom: 0 }}>
                        <label className="input-label">Cycle Name</label>
                        <input className="input" value={cycleForm.name} onChange={e => setCycleForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Q1 2026" style={{ width: 160 }} />
                      </div>
                      <div className="input-group" style={{ marginBottom: 0 }}>
                        <label className="input-label">Quarter</label>
                        <select className="select" style={{ width: 100 }} value={cycleForm.quarter} onChange={e => setCycleForm(p => ({ ...p, quarter: e.target.value }))}>
                          <option>Q1</option><option>Q3</option>
                        </select>
                      </div>
                      <div className="input-group" style={{ marginBottom: 0 }}>
                        <label className="input-label">Year</label>
                        <input className="input" type="number" style={{ width: 100 }} value={cycleForm.year} onChange={e => setCycleForm(p => ({ ...p, year: parseInt(e.target.value) }))} />
                      </div>
                      <button className="btn btn-primary" onClick={openCycle}>Open Cycle</button>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                      <div>
                        <div style={{ fontWeight: 'bold' }}>{cycle.name}</div>
                        <div style={{ fontSize: 12, color: 'var(--gray-dark)' }}>Opened {new Date(cycle.opened_at).toLocaleDateString()}</div>
                      </div>
                      <button className="btn btn-danger" onClick={closeCycle}>Close Cycle</button>
                    </div>
                  )}
                </div>
              </div>

              {cycle && (
                <>
                  <div className="stat-grid">
                    {Object.entries(stats).map(([status, count]) => (
                      <div key={status} className="stat-card"
                        onClick={() => setProgressFilter(f => f === status ? 'all' : status)}
                        style={{
                          borderTop: `3px solid ${COUNT_STATUS[status].color}`,
                          cursor: 'pointer',
                          outline: progressFilter === status ? `2px solid ${COUNT_STATUS[status].color}` : 'none',
                        }}>
                        <div className="stat-val" style={{ color: COUNT_STATUS[status].color }}>{count}</div>
                        <div className="stat-label">{COUNT_STATUS[status].label}</div>
                        {progressFilter === status && <div style={{ fontSize: 11, color: COUNT_STATUS[status].color, marginTop: 2 }}>click to clear</div>}
                      </div>
                    ))}
                  </div>

                  <div className="card">
                    <div className="card-header">
                      <span style={{ fontWeight: 'bold' }}>
                        Count Progress - {cycle.name}
                        {progressFilter !== 'all' && <span style={{ color: COUNT_STATUS[progressFilter]?.color, marginLeft: 8 }}>({COUNT_STATUS[progressFilter]?.label})</span>}
                      </span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ fontSize: 12, color: 'var(--gray-dark)' }}>{filteredProgress.length} of {progress.length} accounts</span>
                        {progressFilter !== 'all' && <button className="btn btn-utility btn-sm" onClick={() => setProgressFilter('all')}>Clear Filter</button>}
                      </div>
                    </div>
                    <div className="table-wrap">
                      <table>
                        <thead>
                          <tr><th>Account</th><th>Region</th><th>Rep</th><th>Status</th><th>Submitted</th><th>Action</th></tr>
                        </thead>
                        <tbody>
                          {filteredProgress.length === 0 ? (
                            <tr><td colSpan={6} className="table-empty">No counts match this filter.</td></tr>
                          ) : filteredProgress.map(p => (
                            <tr key={p.id} style={{
                              background:
                                p.status === 'submitted' ? '#f0f8ff' :
                                p.status === 'approved'  ? '#f0fff4' :
                                p.status === 'in_progress' ? '#fffdf0' : undefined
                            }}>
                              <td><strong>{p.account?.name}</strong></td>
                              <td>{p.account?.region?.name}</td>
                              <td>{p.rep?.full_name || <span style={{ color: 'var(--error)' }}>Unassigned</span>}</td>
                              <td><span className={`badge badge-${p.status}`}>{COUNT_STATUS[p.status]?.label}</span></td>
                              <td>{p.submitted_at ? new Date(p.submitted_at).toLocaleDateString() : '--'}</td>
                              <td>{p.status === 'submitted' && <button className="btn btn-secondary btn-sm" onClick={() => approveCount(p.id)}>Approve</button>}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              )}
            </>
          )}

          {tab === 'todos' && (
            <div>
              <div className="card">
                <div className="card-header">
                  <span style={{ fontWeight: 'bold' }}>
                    Pending Tasks {todos.length > 0 && <span style={{ color: 'var(--error)' }}>({todos.length} outstanding)</span>}
                  </span>
                </div>
                {todos.length === 0 ? (
                  <div className="table-empty" style={{ padding: 40, textAlign: 'center', color: 'var(--gray-dark)' }}>
                    All caught up! No pending tasks.
                  </div>
                ) : (
                  <div className="card-body" style={{ padding: 0 }}>
                    {todos.map(t => {
                      const isEditRequest = t.title?.startsWith('Edit request:');
                      return (
                        <div key={t.id} style={{ padding: '14px 16px', borderBottom: '1px solid var(--gray-mid)', display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                          <div style={{ flex: 1 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                              <span className={`badge badge-${t.priority === 'high' ? 'error' : 'warning'}`} style={{ fontSize: 11 }}>
                                {t.priority === 'high' ? 'High Priority' : 'Normal'}
                              </span>
                              {isEditRequest && (
                                <span className="badge" style={{ fontSize: 11, background: '#e8f4fb', color: 'var(--teal-dark)', border: '1px solid var(--teal)' }}>
                                  Edit Request
                                </span>
                              )}
                              <span style={{ fontSize: 11, color: 'var(--gray-dark)' }}>{new Date(t.created_at).toLocaleDateString()}</span>
                            </div>
                            <div style={{ fontWeight: 'bold', fontSize: 14, marginBottom: 4 }}>{t.title}</div>
                            {t.description && <div style={{ fontSize: 13, color: 'var(--gray-dark)' }}>{t.description}</div>}
                          </div>
                          {isEditRequest ? (
                            <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                              <button className="btn btn-primary btn-sm" onClick={() => approveEditRequest(t)}>Approve</button>
                              <button className="btn btn-danger btn-sm" onClick={() => denyEditRequest(t)}>Deny</button>
                            </div>
                          ) : (
                            <button className="btn btn-secondary btn-sm" onClick={() => completeTodo(t.id)}>
                              Mark Complete
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {tab === 'accounts' && <AdminAccounts />}
          {tab === 'users'    && <AdminUsers />}
          {tab === 'data'     && <AdminDataManagement cycle={cycle} />}
        </div>
      </div>
    </>
  );
}

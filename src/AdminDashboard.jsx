import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useToast } from '../components/ToastContext';
import { COUNT_STATUS } from '../lib/supabase';
import NavBar from '../components/NavBar';
import AdminUsers from './AdminUsers';
import AdminExport from './AdminExport';
import AdminAccounts from './AdminAccounts';

export default function AdminDashboard() {
  const toast = useToast();
  const [tab, setTab]       = useState('overview');
  const [cycle, setCycle]   = useState(null);
  const [progress, setProgress] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [cycleForm, setCycleForm] = useState({ name: '', quarter: 'Q1', year: new Date().getFullYear() });

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    const [{ data: cycleData }, { data: alertData }] = await Promise.all([
      supabase.from('count_cycles').select('*').eq('status', 'open').single(),
      supabase.from('alerts').select('*').eq('is_read', false).order('created_at', { ascending: false }).limit(50),
    ]);
    setCycle(cycleData);
    setAlerts(alertData || []);

    if (cycleData) {
      const { data: prog } = await supabase
        .from('inventory_counts')
        .select(`
          id, status, submitted_at, approved_at,
          rep:profiles(full_name),
          account:accounts(name, region:regions(name))
        `)
        .eq('cycle_id', cycleData.id)
        .order('status');
      setProgress(prog || []);
    }
    setLoading(false);
  }

  async function openCycle() {
    if (!cycleForm.name) { toast.error('Enter a cycle name'); return; }
    const { error } = await supabase.from('count_cycles').insert({
      name: cycleForm.name,
      quarter: cycleForm.quarter,
      year: cycleForm.year,
      status: 'open',
      opened_at: new Date().toISOString(),
    });
    if (error) { toast.error('Error: ' + error.message); return; }
    toast.success(`Count cycle "${cycleForm.name}" opened!`);
    loadData();
  }

  async function closeCycle() {
    if (!window.confirm(`Close cycle "${cycle?.name}"? Reps will no longer be able to submit counts.`)) return;
    await supabase.from('count_cycles')
      .update({ status: 'closed', closed_at: new Date().toISOString() })
      .eq('id', cycle.id);
    toast.success('Count cycle closed.');
    setCycle(null);
    loadData();
  }

  async function reopenCycle(cycleId) {
    await supabase.from('count_cycles').update({ status: 'open', closed_at: null }).eq('id', cycleId);
    toast.success('Cycle reopened.');
    loadData();
  }

  async function approveCount(countId) {
    await supabase.from('inventory_counts')
      .update({ status: 'approved', approved_at: new Date().toISOString() })
      .eq('id', countId);
    setProgress(prev => prev.map(p =>
      p.id === countId ? { ...p, status: 'approved', approved_at: new Date().toISOString() } : p
    ));
    toast.success('Count approved!');
  }

  async function dismissAlert(alertId) {
    await supabase.from('alerts').update({ is_read: true }).eq('id', alertId);
    setAlerts(prev => prev.filter(a => a.id !== alertId));
  }

  const stats = {
    not_started: progress.filter(p => p.status === 'not_started').length,
    in_progress:  progress.filter(p => p.status === 'in_progress').length,
    submitted:    progress.filter(p => p.status === 'submitted').length,
    approved:     progress.filter(p => p.status === 'approved').length,
  };

  if (loading) return (
    <>
      <NavBar />
      <div className="page"><div className="loading-center"><div className="spinner" /></div></div>
    </>
  );

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
            {[['overview','Overview'],['accounts','Accounts'],['users','Users'],['export','Export Data']].map(([k,v]) => (
              <button key={k} className={`tab ${tab===k?'active':''}`} onClick={() => setTab(k)}>{v}</button>
            ))}
          </div>

          {/* ── OVERVIEW TAB ── */}
          {tab === 'overview' && (
            <>
              {/* Alerts */}
              {alerts.length > 0 && (
                <div className="card" style={{ marginBottom: 20 }}>
                  <div className="card-header">
                    <span style={{ fontWeight: 'bold' }}>🔔 Alerts ({alerts.length})</span>
                  </div>
                  <div className="card-body" style={{ padding: 0 }}>
                    {alerts.slice(0, 10).map(a => (
                      <div key={a.id} style={{
                        padding: '10px 16px', borderBottom: '1px solid var(--gray-mid)',
                        display: 'flex', alignItems: 'center', gap: 10, fontSize: 13
                      }}>
                        <span style={{ flex: 1 }}>
                          {a.alert_type === 'not_started' && '⏰ '}
                          {a.alert_type === 'high_variance' && '📊 '}
                          {a.alert_type === 'item_not_in_catalog' && '⚠ '}
                          {a.alert_type === 'count_edited_after_submit' && '✏️ '}
                          {a.message}
                        </span>
                        <span style={{ color: 'var(--gray-dark)', fontSize: 11 }}>
                          {new Date(a.created_at).toLocaleDateString()}
                        </span>
                        <button className="btn btn-utility btn-sm" onClick={() => dismissAlert(a.id)}>Dismiss</button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Cycle controls */}
              <div className="card" style={{ marginBottom: 20 }}>
                <div className="card-header">
                  <span style={{ fontWeight: 'bold' }}>Count Cycle</span>
                  {cycle && (
                    <span className="badge badge-open">{cycle.name} — Open</span>
                  )}
                </div>
                <div className="card-body">
                  {!cycle ? (
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                      <div className="input-group" style={{ marginBottom: 0 }}>
                        <label className="input-label">Cycle Name</label>
                        <input className="input" value={cycleForm.name}
                          onChange={e => setCycleForm(p => ({ ...p, name: e.target.value }))}
                          placeholder="e.g. Q1 2026" style={{ width: 160 }} />
                      </div>
                      <div className="input-group" style={{ marginBottom: 0 }}>
                        <label className="input-label">Quarter</label>
                        <select className="select" style={{ width: 100 }}
                          value={cycleForm.quarter}
                          onChange={e => setCycleForm(p => ({ ...p, quarter: e.target.value }))}>
                          <option>Q1</option>
                          <option>Q3</option>
                        </select>
                      </div>
                      <div className="input-group" style={{ marginBottom: 0 }}>
                        <label className="input-label">Year</label>
                        <input className="input" type="number" style={{ width: 100 }}
                          value={cycleForm.year}
                          onChange={e => setCycleForm(p => ({ ...p, year: parseInt(e.target.value) }))} />
                      </div>
                      <button className="btn btn-primary" onClick={openCycle}>▶ Open Cycle</button>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                      <div>
                        <div style={{ fontWeight: 'bold' }}>{cycle.name}</div>
                        <div style={{ fontSize: 12, color: 'var(--gray-dark)' }}>
                          Opened {new Date(cycle.opened_at).toLocaleDateString()}
                        </div>
                      </div>
                      <button className="btn btn-danger" onClick={closeCycle}>■ Close Cycle</button>
                    </div>
                  )}
                </div>
              </div>

              {/* Progress stats */}
              {cycle && (
                <>
                  <div className="stat-grid">
                    {Object.entries(stats).map(([status, count]) => (
                      <div key={status} className="stat-card"
                        style={{ borderTop: `3px solid ${COUNT_STATUS[status].color}` }}>
                        <div className="stat-val" style={{ color: COUNT_STATUS[status].color }}>{count}</div>
                        <div className="stat-label">{COUNT_STATUS[status].label}</div>
                      </div>
                    ))}
                  </div>

                  {/* Progress table */}
                  <div className="card">
                    <div className="card-header">
                      <span style={{ fontWeight: 'bold' }}>Count Progress — {cycle.name}</span>
                      <span style={{ fontSize: 12, color: 'var(--gray-dark)' }}>
                        {progress.length} accounts
                      </span>
                    </div>
                    <div className="table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>Account</th>
                            <th>Region</th>
                            <th>Rep</th>
                            <th>Status</th>
                            <th>Submitted</th>
                            <th>Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {progress.map(p => (
                            <tr key={p.id}>
                              <td><strong>{p.account?.name}</strong></td>
                              <td>{p.account?.region?.name}</td>
                              <td>{p.rep?.full_name || '—'}</td>
                              <td><span className={`badge badge-${p.status}`}>
                                {COUNT_STATUS[p.status]?.label}
                              </span></td>
                              <td>{p.submitted_at ? new Date(p.submitted_at).toLocaleDateString() : '—'}</td>
                              <td>
                                {p.status === 'submitted' && (
                                  <button className="btn btn-secondary btn-sm"
                                    onClick={() => approveCount(p.id)}>Approve</button>
                                )}
                              </td>
                            </tr>
                          ))}
                          {progress.length === 0 && (
                            <tr><td colSpan={6} className="table-empty">No counts yet for this cycle.</td></tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              )}
            </>
          )}

          {tab === 'accounts' && <AdminAccounts />}
          {tab === 'users'  && <AdminUsers />}
          {tab === 'export' && <AdminExport cycle={cycle} />}
        </div>
      </div>
    </>
  );
}

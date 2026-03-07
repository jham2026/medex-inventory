import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../components/AuthContext';
import { useToast } from '../components/ToastContext';
import { COUNT_STATUS } from '../lib/supabase';
import AdminUsers from './AdminUsers';
import AdminDataManagement from './AdminDataManagement';
import AdminAccounts from './AdminAccounts';

const NAV = [
  { section: 'MAIN' },
  { key: 'overview', label: 'Count Cycle Details' },
  { key: 'todos',    label: 'To Do' },
  { section: 'SETTINGS' },
  { key: 'accounts', label: 'Accounts' },
  { key: 'users',    label: 'Users' },
  { section: 'REPORTS' },
  { key: 'data',     label: 'Import / Export' },
];

const STAT_CARDS = [
  { key: 'not_started', label: 'Not Started', cls: 'sc-red',  tc: 'c-red'  },
  { key: 'in_progress', label: 'In Progress',  cls: 'sc-gold', tc: 'c-gold' },
  { key: 'submitted',   label: 'Submitted',    cls: 'sc-blue', tc: 'c-blue' },
  { key: 'approved',    label: 'Approved',     cls: 'sc-green',tc: 'c-green'},
];

function Pill({ status }) {
  const map = { not_started: 'pill-ns', in_progress: 'pill-ip', submitted: 'pill-sub', approved: 'pill-app' };
  const labels = { not_started: 'Not Started', in_progress: 'In Progress', submitted: 'Submitted', approved: 'Approved' };
  return <span className={'pill ' + (map[status] || 'pill-ns')}>{labels[status] || status}</span>;
}

function TodoSection({ todos, onComplete, onApproveEdit, onDenyEdit, onApproveCount }) {
  const [denyModal, setDenyModal] = useState(null);
  const [denyReason, setDenyReason] = useState('');
  const [expanded, setExpanded] = useState({});

  const editRequests   = todos.filter(t => t.todo_type === 'edit_request');
  const countApprovals = todos.filter(t => t.todo_type === 'count_approval');
  const closureFlags   = todos.filter(t => t.todo_type === 'account_closure');
  const general        = todos.filter(t => !t.todo_type || t.todo_type === 'general');

  function parseMeta(t) {
    try { return JSON.parse(t.metadata || '{}'); } catch { return {}; }
  }

  function TodoCard({ title, count, children, emptyMsg }) {
    return (
      <div className="todo-section">
        <div className="todo-head">
          <div className="todo-head-title">{title}</div>
          <div className="todo-badge">{count}</div>
        </div>
        {count === 0
          ? <div className="todo-empty">{emptyMsg || 'No items pending.'}</div>
          : children
        }
      </div>
    );
  }

  return (
    <div>
      <TodoCard title="Count Edit Requests" count={editRequests.length} emptyMsg="No edit requests pending.">
        {editRequests.map(t => {
          const meta = parseMeta(t);
          const isExpanded = expanded[t.id];
          return (
            <div key={t.id} style={{ borderBottom: '1px solid var(--border)' }}>
              <div style={{ padding: '14px 20px', display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)', marginBottom: 2 }}>{meta.account_name || t.title}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>{meta.rep_name} Â· {meta.region}</div>
                  {meta.reason && <div style={{ fontSize: 12, color: 'var(--text-mid)', marginTop: 4 }}>Reason: <strong>{meta.reason.replace(/_/g,' ')}</strong></div>}
                </div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  <button className="tbl-btn" onClick={() => onApproveEdit(t)}>Approve</button>
                  <button className="tbl-btn-danger" onClick={() => setDenyModal(t)}>Deny</button>
                  <button className="tbl-btn-sm" onClick={() => setExpanded(p => ({ ...p, [t.id]: !p[t.id] }))}>
                    {isExpanded ? 'Less' : 'Details'}
                  </button>
                </div>
              </div>
              {isExpanded && meta.details && (
                <div style={{ padding: '0 20px 16px', background: 'var(--bg)' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 6 }}>Rep's Explanation</div>
                  <div style={{ fontSize: 13, color: 'var(--text-mid)', lineHeight: 1.6, background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px' }}>{meta.details}</div>
                </div>
              )}
            </div>
          );
        })}
      </TodoCard>

      <TodoCard title="Counts to Approve" count={countApprovals.length} emptyMsg="No counts awaiting approval.">
        {countApprovals.map(t => {
          const meta = parseMeta(t);
          return (
            <div key={t.id} style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>{t.title?.replace('Count to approve: ', '')}</div>
                <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 2 }}>{t.description}</div>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button className="tbl-btn" onClick={() => onApproveCount(t.count_id)}>Approve Count</button>
                <button className="tbl-btn-sm" onClick={() => onComplete(t.id)}>Dismiss</button>
              </div>
            </div>
          );
        })}
      </TodoCard>

      <TodoCard title="Accounts Flagged for Closure" count={closureFlags.length} emptyMsg="No accounts flagged for closure.">
        {closureFlags.map(t => {
          const meta = parseMeta(t);
          return (
            <div key={t.id} style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>{meta.account_name || t.title}</div>
                <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 2 }}>Rep: {meta.rep_name} Â· Reason: {meta.reason?.replace(/_/g,' ')}</div>
                {meta.notes && <div style={{ fontSize: 12, color: 'var(--text-mid)', marginTop: 3 }}>{meta.notes}</div>}
              </div>
              <button className="tbl-btn-sm" onClick={() => onComplete(t.id)}>Mark Reviewed</button>
            </div>
          );
        })}
      </TodoCard>

      <TodoCard title="General Tasks" count={general.length} emptyMsg="No general tasks pending.">
        {general.map(t => (
          <div key={t.id} style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>{t.title}</div>
              {t.description && <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 2 }}>{t.description}</div>}
            </div>
            <button className="tbl-btn-sm" onClick={() => onComplete(t.id)}>Mark Complete</button>
          </div>
        ))}
      </TodoCard>

      {denyModal && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-head-red">
              <div className="modal-head-title">Deny Edit Request</div>
              <div className="modal-head-sub">{parseMeta(denyModal).account_name}</div>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: 14, color: 'var(--text-mid)', lineHeight: 1.6, marginBottom: 12 }}>
                Please provide a reason for denying this request. The rep will be notified.
              </p>
              <textarea className="form-ta" value={denyReason} onChange={e => setDenyReason(e.target.value)}
                placeholder="Explain why the edit request is being denied..." />
            </div>
            <div className="modal-actions">
              <button className="btn btn-outline" onClick={() => { setDenyModal(null); setDenyReason(''); }}>Cancel</button>
              <button className="btn btn-danger" onClick={() => { onDenyEdit(denyModal, denyReason); setDenyModal(null); setDenyReason(''); }}>Deny Request</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AdminDashboard() {
  const { profile } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [myCounts, setMyCounts] = useState([]);
  const [tab, setTab]           = useState('overview');
  const [cycle, setCycle]       = useState(null);
  const [progress, setProgress] = useState([]);
  const [alerts, setAlerts]     = useState([]);
  const [todos, setTodos]       = useState([]);
  const [loading, setLoading]   = useState(true);
  const [progressFilter, setProgressFilter] = useState('all');
  const [cycleForm, setCycleForm] = useState({ name: '', quarter: 'Q1', year: new Date().getFullYear() });

  useEffect(() => { loadData(); }, []);

  async function signOut() {
    await supabase.auth.signOut();
    navigate('/login');
  }

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
        .select('id, status, submitted_at, approved_at, rep_id, account:accounts(id, name, region:regions(name))')
        .eq('cycle_id', cycleData.id)
        .order('status').limit(500);
      const { data: reps } = await supabase.from('profiles').select('id, full_name');
      const { data: acctReps } = await supabase.from('account_reps').select('account_id, rep_id');
      const repMap = {};
      for (const r of reps || []) repMap[r.id] = r;
      const acctRepsMap = {};
      for (const ar of acctReps || []) {
        if (!acctRepsMap[ar.account_id]) acctRepsMap[ar.account_id] = [];
        acctRepsMap[ar.account_id].push(repMap[ar.rep_id]);
      }
      setProgress((counts || []).map(c => ({
        ...c,
        rep: c.rep_id ? repMap[c.rep_id] : null,
        allReps: acctRepsMap[c.account?.id] || [],
      })));
    }
    if (cycleData && profile?.id) {
      const { data: myCountData } = await supabase
        .from('inventory_counts')
        .select('id, status, account:accounts(name)')
        .eq('cycle_id', cycleData.id)
        .eq('rep_id', profile.id)
        .in('status', ['not_started', 'in_progress']);
      setMyCounts(myCountData || []);
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
    toast.info('Cycle "' + cycleForm.name + '" created â€” populating counts...');
    const { data: accounts } = await supabase.from('accounts').select('id, name, assigned_rep_id').eq('is_active', true);
    if (!accounts?.length) { toast.warning('No active accounts found.'); loadData(); return; }
    for (let i = 0; i < accounts.length; i += 100) {
      const batch = accounts.slice(i, i + 100).map(a => ({
        cycle_id: newCycle.id, account_id: a.id, rep_id: a.assigned_rep_id || null, status: 'not_started',
      }));
      await supabase.from('inventory_counts').insert(batch);
    }
    toast.success('Cycle "' + cycleForm.name + '" opened!');
    loadData();
  }

  async function closeCycle() {
    if (!window.confirm('Close cycle "' + cycle?.name + '"? Reps will no longer be able to submit.')) return;
    await supabase.from('count_cycles').update({ status: 'closed', closed_at: new Date().toISOString() }).eq('id', cycle.id);
    toast.success('Count cycle closed.');
    setCycle(null); setProgress([]); loadData();
  }

  async function approveCount(countId) {
    const { data: countData } = await supabase.from('inventory_counts').select('rep_id, account:accounts(name)').eq('id', countId).single();
    await supabase.from('inventory_counts').update({ status: 'approved', approved_at: new Date().toISOString() }).eq('id', countId);
    setProgress(prev => prev.map(p => p.id === countId ? { ...p, status: 'approved' } : p));
    if (countData?.rep_id) {
      await supabase.from('alerts').insert({
        alert_type: 'count_approved', title: 'Count Approved',
        message: 'Your count for ' + (countData.account?.name || '') + ' has been approved!',
        is_read: false, rep_id: countData.rep_id, inventory_count_id: countId,
      });
    }
    toast.success('Count approved!');
  }

  async function dismissAlert(alertId) {
    await supabase.from('alerts').update({ is_read: true }).eq('id', alertId);
    setAlerts(prev => prev.filter(a => a.id !== alertId));
  }

  async function completeTodo(todoId) {
    await supabase.from('todos').update({ is_complete: true, completed_at: new Date().toISOString() }).eq('id', todoId);
    setTodos(prev => prev.filter(t => t.id !== todoId));
    toast.success('Task marked complete!');
  }

  async function approveEditRequest(todo) {
    let meta = {};
    try { meta = JSON.parse(todo.metadata || '{}'); } catch {}
    if (todo.count_id) await supabase.from('inventory_counts').update({ status: 'in_progress' }).eq('id', todo.count_id);
    await supabase.from('todos').update({ is_complete: true, completed_at: new Date().toISOString() }).eq('id', todo.id);
    const { data: countData } = await supabase.from('inventory_counts').select('rep_id').eq('id', todo.count_id).single();
    await supabase.from('alerts').insert({
      alert_type: 'edit_approved', title: 'Edit Request Approved',
      message: 'Your request to reopen ' + (meta.account_name || '') + ' has been approved.',
      is_read: false, rep_id: countData?.rep_id, inventory_count_id: todo.count_id,
    });
    setTodos(prev => prev.filter(t => t.id !== todo.id));
    toast.success('Edit request approved â€” count unlocked!');
    loadData();
  }

  async function denyEditRequest(todo, reason) {
    let meta = {};
    try { meta = JSON.parse(todo.metadata || '{}'); } catch {}
    await supabase.from('todos').update({ is_complete: true, completed_at: new Date().toISOString() }).eq('id', todo.id);
    const { data: countData } = await supabase.from('inventory_counts').select('rep_id').eq('id', todo.count_id).single();
    await supabase.from('alerts').insert({
      alert_type: 'edit_denied', title: 'Edit Request Denied',
      message: 'Your request to reopen ' + (meta.account_name || '') + ' was denied.' + (reason ? ' Reason: ' + reason : ''),
      is_read: false, rep_id: countData?.rep_id, inventory_count_id: todo.count_id,
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
  const total = progress.length;
  const pct = total > 0 ? Math.round((stats.submitted + stats.approved) / total * 100) : 0;
  const initials = profile?.full_name?.split(' ').map(w => w[0]).join('').toUpperCase().slice(0,2) || 'AD';

  const filteredProgress = progressFilter === 'all' ? progress : progress.filter(p => p.status === progressFilter);

  // Build region map from filtered progress
  const regionMap = {};
  filteredProgress.forEach(p => {
    const rName = p.account?.region?.name || 'Unassigned';
    if (!regionMap[rName]) regionMap[rName] = [];
    regionMap[rName].push(p);
  });

  if (loading) return (
    <div className="app-shell">
      <div className="sidebar" />
      <div className="main-col" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="loading-center"><div className="spinner" /><span>Loading...</span></div>
      </div>
    </div>
  );

  return (
    <div className="app-shell">

      {/* â”€â”€ SIDEBAR â”€â”€ */}
      <nav className="sidebar">
        <div className="sidebar-logo">
          <div className="logo-text"><span>Med</span><span>Ex</span></div>
          <div className="logo-sub">Inventory Count System</div>
        </div>

        {NAV.map((item, i) => {
          if (item.section) return (
            <div key={i} className="nav-section">
              <div className="nav-section-label">{item.section}</div>
            </div>
          );
          return (
            <div key={item.key} style={{ padding: '0 12px 2px' }}>
              <div className={'nav-item' + (tab === item.key ? ' active' : '')} onClick={() => setTab(item.key)}>
                <div className="nav-dot" />
                <span style={{ flex: 1 }}>{item.label}</span>
                {item.key === 'todos' && todos.length > 0 && (
                  <span style={{ background: '#EF4444', color: 'white', fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 10 }}>{todos.length}</span>
                )}
              </div>
            </div>
          );
        })}

        <div className="sidebar-bottom">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div className="user-name">{profile?.full_name}</div>
              <div className="user-role">Administrator</div>
            </div>
            <button onClick={signOut} style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.55)', fontSize: 11, fontWeight: 600, padding: '5px 12px', borderRadius: 7, cursor: 'pointer', fontFamily: 'inherit' }}>
              Sign Out
            </button>
          </div>
        </div>
        <div className="sidebar-accent-bar" />
      </nav>

      {/* â”€â”€ MAIN â”€â”€ */}
      <div className="main-col">
        <div className="topbar">
          <div>
            <h1>{NAV.find(n => n.key === tab)?.label || 'Dashboard'}</h1>
            <p>
              {tab === 'overview' && (cycle ? cycle.name + ' â€” ' + total + ' accounts' : 'No active cycle')}
              {tab === 'todos'    && todos.length + ' pending task' + (todos.length !== 1 ? 's' : '')}
              {tab === 'accounts' && 'Manage account assignments'}
              {tab === 'users'    && 'Manage rep accounts'}
              {tab === 'data'     && 'Import and export data'}
            </p>
          </div>
          {tab === 'overview' && cycle && (
            <button className="btn btn-danger" onClick={closeCycle}>Close Cycle</button>
          )}
        </div>

        <div className="content-area">

          {/* â”€â”€ OVERVIEW â”€â”€ */}
          {tab === 'overview' && (
            <>
              {!cycle ? (
                <div className="card" style={{ maxWidth: 560 }}>
                  <div className="card-head">
                    <div>
                      <div className="card-head-title">Open a Count Cycle</div>
                      <div className="card-head-sub">No active cycle â€” create one to begin</div>
                    </div>
                  </div>
                  <div className="card-body">
                    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                      <div>
                        <label className="input-label">Cycle Name</label>
                        <input className="input" style={{ width: 180 }} value={cycleForm.name}
                          onChange={e => setCycleForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Q1 2026" />
                      </div>
                      <div>
                        <label className="input-label">Quarter</label>
                        <select className="select" value={cycleForm.quarter} onChange={e => setCycleForm(p => ({ ...p, quarter: e.target.value }))}>
                          <option>Q1</option><option>Q2</option><option>Q3</option><option>Q4</option>
                        </select>
                      </div>
                      <div>
                        <label className="input-label">Year</label>
                        <input className="input" type="number" style={{ width: 100 }} value={cycleForm.year}
                          onChange={e => setCycleForm(p => ({ ...p, year: parseInt(e.target.value) }))} />
                      </div>
                      <button className="btn btn-primary" onClick={openCycle}>Open Cycle</button>
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  {/* Hero card */}
                  <div className="cycle-hero">
                    <div className="hero-top">
                      <div>
                        <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: '#7A9ABE', marginBottom: 6 }}>Company Wide</div>
                        <div className="hero-title">{cycle.name} Count Cycle</div>
                        <div className="hero-meta">Opened {new Date(cycle.opened_at).toLocaleDateString()} Â· {total} accounts total</div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div className="hero-pct">{pct}%</div>
                        <div className="hero-pct-lbl">COMPLETE</div>
                      </div>
                    </div>
                    <div className="progress-bar">
                      <div className="progress-fill" style={{ width: pct + '%' }} />
                    </div>
                    <div className="hero-stats">
                      {STAT_CARDS.map(s => (
                        <div key={s.key}
                          className={'stat-card hero-stat-card ' + s.cls}
                          style={{ outline: progressFilter === s.key ? '2.5px solid white' : 'none', outlineOffset: 2 }}
                          onClick={() => setProgressFilter(f => f === s.key ? 'all' : s.key)}>
                          <div className={'sc-num ' + s.tc}>{stats[s.key]}</div>
                          <div className={'sc-lbl ' + s.tc}>{s.label}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Region blocks */}
                  {Object.keys(regionMap).sort().map(rName => {
                    const counts = regionMap[rName];
                    const allForRegion = progress.filter(p => (p.account?.region?.name || 'Unassigned') === rName);
                    const rTotal = allForRegion.length;
                    const rApproved = allForRegion.filter(p => p.status === 'approved').length;
                    const rSubmitted = allForRegion.filter(p => p.status === 'submitted').length;
                    const rPct = rTotal > 0 ? Math.round((rApproved + rSubmitted) / rTotal * 100) : 0;
                    const progColor = rPct === 100 ? '#16A34A' : '#1565C0';

                    const rStats = {
                      not_started: allForRegion.filter(p => p.status === 'not_started').length,
                      in_progress:  allForRegion.filter(p => p.status === 'in_progress').length,
                      submitted:    allForRegion.filter(p => p.status === 'submitted').length,
                      approved:     allForRegion.filter(p => p.status === 'approved').length,
                    };

                    return (
                      <div key={rName} className="region-block">
                        <div className="region-header">
                          <div className="region-header-top">
                            <div>
                              <div className="region-eyebrow">Region</div>
                              <div className="region-name">{rName}</div>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                              <div style={{ textAlign: 'right' }}>
                                <div className="region-pct-num">{rPct}%</div>
                                <div className="region-pct-lbl">Complete</div>
                              </div>
                            </div>
                          </div>
                          <div className="region-progress">
                            <div className="region-progress-fill" style={{ width: rPct + '%', background: progColor }} />
                          </div>
                          <div className="region-mini-stats">
                            {STAT_CARDS.map(s => (
                              <div key={s.key} className={'stat-card hero-stat-card ' + s.cls} style={{ padding: '8px 10px' }}>
                                <div className={'sc-num ' + s.tc} style={{ fontSize: 20 }}>{rStats[s.key]}</div>
                                <div className={'sc-lbl ' + s.tc} style={{ fontSize: 8 }}>{s.label}</div>
                              </div>
                            ))}
                          </div>
                        </div>
                        <div className="region-detail">
                          <table>
                            <thead>
                              <tr>
                                <th>Account</th><th>Rep(s)</th><th>Status</th><th>Submitted</th><th>Actions</th>
                              </tr>
                            </thead>
                            <tbody>
                              {counts.map(p => (
                                <tr key={p.id}>
                                  <td style={{ fontWeight: 700 }}>{p.account?.name}</td>
                                  <td>
                                    {p.allReps?.length > 0
                                      ? p.allReps.filter(Boolean).map(r => <span key={r.id} className="rep-tag">{r.full_name}</span>)
                                      : <span style={{ color: 'var(--red)', fontSize: 12 }}>Unassigned</span>
                                    }
                                  </td>
                                  <td><Pill status={p.status} /></td>
                                  <td style={{ color: 'var(--text-dim)' }}>{p.submitted_at ? new Date(p.submitted_at).toLocaleDateString() : 'â€”'}</td>
                                  <td>
                                    {p.status === 'submitted' && <button className="tbl-btn" onClick={() => approveCount(p.id)}>Approve</button>}
                                    {(p.status === 'not_started' || p.status === 'in_progress') && (
                                      <button className="tbl-btn" onClick={() => navigate('/count/' + p.id)}>Enter Count</button>
                                    )}
                                    {p.status === 'approved' && <button className="tbl-btn" onClick={() => navigate('/count/' + p.id)}>View Count</button>}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    );
                  })}

                  {progressFilter !== 'all' && (
                    <div style={{ textAlign: 'center', marginTop: 12 }}>
                      <button className="btn btn-outline" onClick={() => setProgressFilter('all')}>Clear Filter â€” Show All</button>
                    </div>
                  )}
                </>
              )}
            </>
          )}

          {/* â”€â”€ TO DO â”€â”€ */}
          {tab === 'todos' && (
            <TodoSection
              todos={todos}
              onComplete={completeTodo}
              onApproveEdit={approveEditRequest}
              onDenyEdit={denyEditRequest}
              onApproveCount={approveCount}
            />
          )}

          {tab === 'accounts' && <AdminAccounts />}
          {tab === 'users'    && <AdminUsers />}
          {tab === 'data'     && <AdminDataManagement cycle={cycle} />}

        </div>
      </div>
    </div>
  );
}

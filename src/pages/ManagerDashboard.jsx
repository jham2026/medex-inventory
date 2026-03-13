import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../components/AuthContext';
import { useToast } from '../components/ToastContext';
import { logAudit } from '../hooks/useAudit';
import AdminItemCatalog from './AdminItemCatalog';

const NAV = [
  { section: 'DASHBOARD' },
  { key: 'overview',  label: 'Count Cycle Details' },
  { key: 'mycounts',  label: 'My Counts' },
  { section: 'SETTINGS' },
  { key: 'accounts',  label: 'Accounts' },
  { key: 'catalog',   label: 'Item Catalog' },
];

const STAT_CARDS = [
  { key: 'not_started', label: 'Not Started', cls: 'sc-red',   tc: 'c-red'   },
  { key: 'in_progress', label: 'In Progress',  cls: 'sc-gold',  tc: 'c-gold'  },
  { key: 'submitted',   label: 'Submitted',    cls: 'sc-blue',  tc: 'c-blue'  },
  { key: 'approved',    label: 'Approved',     cls: 'sc-green', tc: 'c-green' },
];

const CATALOGS = [
  { value: 'claimsoft', label: 'Claimsoft' },
  { value: 'edge',      label: 'Account Edge' },
];

function Pill({ status }) {
  const map    = { not_started: 'pill-ns', in_progress: 'pill-ip', submitted: 'pill-sub', approved: 'pill-app' };
  const labels = { not_started: 'Not Started', in_progress: 'In Progress', submitted: 'Submitted', approved: 'Approved' };
  return <span className={'pill ' + (map[status] || 'pill-ns')}>{labels[status] || status}</span>;
}

function StatusPill({ account }) {
  if (account.flagged_closed) return <span className="pill pill-ns">Flagged Closed</span>;
  if (account.is_active)      return <span className="pill pill-app">Active</span>;
  return <span className="pill pill-ns">Inactive</span>;
}

function CheckboxList({ items, selected, onChange }) {
  return (
    <div style={{ border: '1.5px solid var(--border)', borderRadius: 8, overflow: 'hidden', maxHeight: 160, overflowY: 'auto' }}>
      {items.map((item, i) => {
        const checked = selected.includes(item.value);
        return (
          <label key={item.value} style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '9px 12px',
            background: checked ? 'var(--blue-light)' : 'var(--white)',
            borderBottom: i < items.length - 1 ? '1px solid var(--border)' : 'none',
            cursor: 'pointer',
          }}>
            <input type="checkbox" checked={checked}
              onChange={() => onChange(checked ? selected.filter(v => v !== item.value) : [...selected, item.value])}
              style={{ width: 16, height: 16, accentColor: '#1565C0' }} />
            <span style={{ fontSize: 14, fontWeight: checked ? 600 : 400, color: checked ? 'var(--blue)' : 'var(--text)' }}>{item.label}</span>
          </label>
        );
      })}
    </div>
  );
}

function SelectedPills({ items, selected, emptyText = 'None selected' }) {
  const sel = items.filter(i => selected.includes(i.value));
  if (!sel.length) return <span style={{ fontSize: 12, color: 'var(--text-dim)', fontStyle: 'italic' }}>{emptyText}</span>;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
      {sel.map(i => <span key={i.value} className="rep-tag">{i.label}</span>)}
    </div>
  );
}

// My Counts tab
function MyCounts({ cycle, profile, navigate }) {
  const [counts, setCounts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!cycle || !profile?.id) { setLoading(false); return; }
    supabase
      .from('inventory_counts')
      .select('id, status, account:accounts(id, name, region:regions(name))')
      .eq('cycle_id', cycle.id)
      .eq('rep_id', profile.id)
      .then(({ data }) => { setCounts(data || []); setLoading(false); });
  }, [cycle, profile]);

  if (loading) return <div className="loading-center"><div className="spinner" /></div>;

  const total = counts.length;
  const stats = {
    not_started: counts.filter(c => c.status === 'not_started').length,
    in_progress:  counts.filter(c => c.status === 'in_progress').length,
    submitted:    counts.filter(c => c.status === 'submitted').length,
    approved:     counts.filter(c => c.status === 'approved').length,
  };
  const pct = total > 0 ? Math.round((stats.submitted + stats.approved) / total * 100) : 0;
  const firstName = profile?.full_name?.split(' ')[0] || 'there';
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const needAttention = counts.filter(c => c.status === 'not_started' || c.status === 'in_progress').length;
  const statusColor = { not_started: 'var(--red)', in_progress: 'var(--amber)', submitted: 'var(--blue)', approved: 'var(--green)' };
  const statusLabel = { not_started: 'Not Started', in_progress: 'In Progress', submitted: 'Submitted', approved: 'Approved' };

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 26, fontWeight: 800, color: 'var(--text)', marginBottom: 4 }}>{greeting}, {firstName}</div>
        <div style={{ fontSize: 14, color: 'var(--text-dim)' }}>
          {needAttention > 0
            ? needAttention + ' account' + (needAttention !== 1 ? 's' : '') + ' still need your attention'
            : 'All counts are up to date!'}
        </div>
      </div>

      {cycle ? (
        <div className="cycle-hero" style={{ marginBottom: 24 }}>
          <div className="hero-top">
            <div><div className="hero-title">{cycle.name}</div></div>
            <div style={{ textAlign: 'right' }}>
              <div className="hero-pct">{pct}%</div>
              <div className="hero-pct-lbl">COMPLETE</div>
            </div>
          </div>
          <div className="hero-stats">
            {STAT_CARDS.map(s => (
              <div key={s.key} className={'stat-card hero-stat-card ' + s.cls}>
                <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', position: 'relative', zIndex: 1 }}>
                  <div>
                    <div className={'sc-num ' + s.tc}>{stats[s.key]}</div>
                    <div className={'sc-lbl ' + s.tc}>{s.label}</div>
                  </div>
                  <div className={'sc-sub ' + s.tc} style={{ fontSize: 22, fontWeight: 800, lineHeight: 1, opacity: 0.85 }}>
                    {total > 0 ? Math.round(stats[s.key] / total * 100) : 0}%
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="card" style={{ padding: 24, marginBottom: 24, color: 'var(--text-dim)', fontStyle: 'italic' }}>No active count cycle.</div>
      )}

      <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)', marginBottom: 14 }}>Your Accounts</div>
      {counts.length === 0 ? (
        <div className="card" style={{ padding: 32, textAlign: 'center', color: 'var(--text-dim)' }}>No accounts assigned to you for this cycle.</div>
      ) : counts.map(c => (
        <div key={c.id} className="card" style={{ marginBottom: 10, padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderLeft: '4px solid ' + (statusColor[c.status] || 'var(--border)') }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text)' }}>{c.account?.name}</div>
            <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 2 }}>{c.account?.region?.name}</div>
            <div style={{ fontSize: 12, fontWeight: 700, color: statusColor[c.status], marginTop: 3 }}>{statusLabel[c.status]}</div>
          </div>
          {(c.status === 'not_started' || c.status === 'in_progress') && (
            <button className="btn btn-primary" onClick={() => navigate('/count/' + c.id)}>Enter Count</button>
          )}
          {(c.status === 'submitted' || c.status === 'approved') && (
            <button className="btn btn-outline" onClick={() => navigate('/count/' + c.id)}>View Count</button>
          )}
        </div>
      ))}
    </div>
  );
}

// Accounts tab
function ManagerAccounts({ profile, cycle, onRegisterAdd }) {
  const toast = useToast();
  const [accounts, setAccounts]           = useState([]);
  const [reps, setReps]                   = useState([]);
  const [regions, setRegions]             = useState([]);
  const [accountReps, setAccountReps]     = useState({});
  const [cycleProgress, setCycleProgress] = useState([]);
  const [loading, setLoading]             = useState(true);
  const [saving, setSaving]               = useState(false);
  const [search, setSearch]               = useState('');
  const [showAddModal, setShowAddModal]   = useState(false);
  const [newName, setNewName]             = useState('');
  const [newRegionIds, setNewRegionIds]   = useState([]);
  const [newCatalogs, setNewCatalogs]     = useState([]);
  const [newRepIds, setNewRepIds]         = useState([]);

  const managerRegions = (profile?.region || '')
    .split(',').map(r => r.trim()).filter(Boolean);

  useEffect(() => { loadData(); }, []);
  useEffect(() => { if (onRegisterAdd) onRegisterAdd(() => setShowAddModal(true)); }, [onRegisterAdd]);

  async function loadData() {
    setLoading(true);
    const queries = [
      supabase.from('accounts').select('id, name, is_active, flagged_closed, catalog_source, region:regions(id, name)').order('name'),
      supabase.from('profiles').select('id, full_name, role').in('role', ['rep', 'manager']).eq('is_active', true).order('full_name'),
      supabase.from('regions').select('*').order('name'),
      supabase.from('account_reps').select('account_id, rep_id'),
    ];
    const [{ data: accts }, { data: repData }, { data: regData }, { data: arData }] = await Promise.all(queries);

    let progressData = [];
    if (cycle?.id) {
      const { data } = await supabase.from('inventory_counts').select('id, status, account_id').eq('cycle_id', cycle.id);
      progressData = data || [];
    }

    const scopedAccounts = (accts || []).filter(a =>
      managerRegions.length === 0 || managerRegions.includes(a.region?.name)
    );

    setAccounts(scopedAccounts);
    setReps(repData || []);
    setRegions((regData || []).filter(r => managerRegions.includes(r.name)));
    setCycleProgress(progressData);

    const arMap = {};
    for (const ar of arData || []) {
      if (!arMap[ar.account_id]) arMap[ar.account_id] = [];
      arMap[ar.account_id].push(ar.rep_id);
    }
    setAccountReps(arMap);
    setLoading(false);
  }

  async function saveNewAccount() {
    if (!newName.trim()) { toast.error('Account name is required.'); return; }
    setSaving(true);

    // 1. Create the account
    const { data: inserted, error } = await supabase.from('accounts').insert({
      name:           newName.trim(),
      region_id:      newRegionIds[0] || null,
      catalog_source: newCatalogs.join(',') || null,
      is_active:      true,
      flagged_closed: false,
    }).select('id').single();

    if (error) { toast.error('Failed: ' + error.message); setSaving(false); return; }

    // 2. Assign reps
    if (newRepIds.length > 0 && inserted?.id) {
      await supabase.from('account_reps').insert(
        newRepIds.map(rid => ({ account_id: inserted.id, rep_id: rid }))
      );
      await supabase.from('accounts').update({ assigned_rep_id: newRepIds[0] }).eq('id', inserted.id);
    }

    // 3. Add to active cycle + create admin review task
    if (cycle?.id && inserted?.id) {
      await supabase.from('inventory_counts').insert({
        cycle_id:   cycle.id,
        account_id: inserted.id,
        rep_id:     newRepIds[0] || null,
        status:     'not_started',
      });

      await supabase.from('todos').insert({
        title:       'Review new account: ' + newName.trim(),
        description: 'Manager ' + (profile?.full_name || '') + ' added a new account (' + newName.trim() + ') to the active cycle "' + cycle.name + '". Please review and confirm before cycle close.',
        priority:    'normal',
        todo_type:   'general',
        account_id:  inserted.id,
        rep_id:      profile?.id || null,
        is_complete: false,
      });
    }

    await logAudit(profile, 'ACCOUNT_CREATED', 'account', { target_name: newName.trim() });
    toast.success(newName.trim() + ' created and added to the active cycle. Admin has been notified.');
    setShowAddModal(false);
    setNewName(''); setNewRegionIds([]); setNewCatalogs([]); setNewRepIds([]);
    await loadData();
    setSaving(false);
  }

  const repItems    = reps.map(r => ({ value: r.id, label: r.full_name }));
  const regionItems = regions.map(r => ({ value: r.id, label: r.name }));

  const filtered = accounts
    .filter(a => !a.flagged_closed)
    .filter(a => !search || a.name.toLowerCase().includes(search.toLowerCase()));

  const activeCount = accounts.filter(a => !a.flagged_closed).length;
  const closedCount = accounts.filter(a => a.flagged_closed).length;

  const myAccountIds = new Set(accounts.map(a => a.id));
  const myProgress   = cycleProgress.filter(p => myAccountIds.has(p.account_id));
  const countStats   = {
    not_started: myProgress.filter(p => p.status === 'not_started').length,
    in_progress:  myProgress.filter(p => p.status === 'in_progress').length,
    submitted:    myProgress.filter(p => p.status === 'submitted').length,
    approved:     myProgress.filter(p => p.status === 'approved').length,
  };

  if (loading) return <div className="loading-center"><div className="spinner" /></div>;

  return (
    <div>
      {/* ADD MODAL */}
      {showAddModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowAddModal(false)}>
          <div className="modal" style={{ maxWidth: 520 }}>
            <div className="modal-head-blue">
              <div className="modal-head-title">Add Account</div>
              <div className="modal-head-sub">Create a new account in your region</div>
            </div>
            <div className="modal-body" style={{ overflowY: 'auto', maxHeight: '65vh' }}>

              <div className="form-lbl" style={{ marginTop: 0 }}>Account Name *</div>
              <input className="form-inp" placeholder="e.g. SAT-NORTH" value={newName} onChange={e => setNewName(e.target.value)} />

              <div className="form-lbl">Region</div>
              <CheckboxList items={regionItems} selected={newRegionIds} onChange={setNewRegionIds} />
              <SelectedPills items={regionItems} selected={newRegionIds} emptyText="No region selected" />

              <div className="form-lbl">Item Catalog</div>
              <CheckboxList items={CATALOGS} selected={newCatalogs} onChange={setNewCatalogs} />
              <p style={{ fontSize: 12, color: 'var(--text-dim)', margin: '5px 0 0' }}>
                Reps will only see items from selected catalog(s) during count entry.
              </p>

              <div className="form-lbl">Assigned Reps</div>
              <CheckboxList items={repItems} selected={newRepIds} onChange={setNewRepIds} />
              <SelectedPills items={repItems} selected={newRepIds} emptyText="No reps assigned" />

              {cycle && (
                <div style={{ marginTop: 16, background: 'var(--blue-light)', border: '1px solid #BFDBFE', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: 'var(--blue)' }}>
                  <strong>Active cycle:</strong> This account will be added to <strong>{cycle.name}</strong> and flagged for admin review before cycle close.
                </div>
              )}
            </div>
            <div className="modal-actions">
              <button className="btn btn-outline" onClick={() => setShowAddModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={saveNewAccount} disabled={saving || !newName.trim()}>
                {saving ? 'Creating...' : 'Create Account'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 6 STAT CARDS */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 14, marginBottom: 20 }}>
        <div className="stat-card sc-blue">
          <div className="sc-num c-blue">{activeCount}</div>
          <div className="sc-lbl c-blue">Active Accounts</div>
        </div>
        <div className="stat-card sc-red">
          <div className="sc-num c-red">{closedCount}</div>
          <div className="sc-lbl c-red">Closed Accounts</div>
        </div>
        {cycle ? (
          <>
            <div className="stat-card sc-red">
              <div className="sc-num c-red">{countStats.not_started}</div>
              <div className="sc-lbl c-red">Counts Not Started</div>
            </div>
            <div className="stat-card sc-gold">
              <div className="sc-num c-gold">{countStats.in_progress}</div>
              <div className="sc-lbl c-gold">In Progress</div>
            </div>
            <div className="stat-card sc-blue">
              <div className="sc-num c-blue">{countStats.submitted}</div>
              <div className="sc-lbl c-blue">Submitted</div>
            </div>
            <div className="stat-card sc-green">
              <div className="sc-num c-green">{countStats.approved}</div>
              <div className="sc-lbl c-green">Approved</div>
            </div>
          </>
        ) : (
          <div className="stat-card sc-gold" style={{ gridColumn: 'span 4', display: 'flex', alignItems: 'center' }}>
            <div style={{ fontSize: 13, color: '#6B3C00', fontStyle: 'italic' }}>No active cycle - count stats unavailable</div>
          </div>
        )}
      </div>

      {/* FILTER */}
      <div className="filter-row">
        <span className="filter-label">Search:</span>
        <input className="search-input" placeholder="Search accounts..."
          value={search} onChange={e => setSearch(e.target.value)} />
        <span className="count-lbl ml-auto">{filtered.length} accounts</span>
      </div>

      <div className="section-title">
        {'Accounts - ' + (managerRegions.join(', ') || 'Your Regions')}
      </div>

      {/* TABLE */}
      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Account Name</th>
              <th>Region</th>
              <th>Assigned Reps</th>
              <th>Cycle Status</th>
              <th>Account Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-dim)', padding: 32, fontStyle: 'italic' }}>
                  No accounts found in your region.
                </td>
              </tr>
            ) : filtered.map(acct => {
              const countRow = myProgress.find(p => p.account_id === acct.id);
              return (
                <tr key={acct.id}>
                  <td style={{ fontWeight: 700 }}>{acct.name}</td>
                  <td>{acct.region?.name || <span style={{ color: 'var(--text-dim)' }}>--</span>}</td>
                  <td>
                    {(accountReps[acct.id] || []).length > 0
                      ? (accountReps[acct.id] || []).map(rid => {
                          const rep = reps.find(r => r.id === rid);
                          return rep ? <span key={rid} className="rep-tag">{rep.full_name}</span> : null;
                        })
                      : <span style={{ color: 'var(--red)', fontSize: 12 }}>Unassigned</span>}
                  </td>
                  <td>
                    {countRow
                      ? <Pill status={countRow.status} />
                      : <span style={{ color: 'var(--text-dim)', fontSize: 12 }}>No cycle</span>}
                  </td>
                  <td><StatusPill account={acct} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Main component
export default function ManagerDashboard() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [tab, setTabRaw] = useState(() => sessionStorage.getItem('managerTab') || 'overview');
  const accountsAddRef    = useRef(null);
  const catalogActionsRef = useRef({});

  function setTab(t) { sessionStorage.setItem('managerTab', t); setTabRaw(t); }

  const [cycle, setCycle]       = useState(null);
  const [progress, setProgress] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [collapsedRegions, setCollapsedRegions] = useState({});

  const managerRegions = (profile?.region || '')
    .split(',').map(r => r.trim()).filter(Boolean);

  useEffect(() => { loadData(); }, []);

  async function signOut() {
    await supabase.auth.signOut();
    navigate('/login');
  }

  async function loadData() {
    setLoading(true);
    const { data: cycleData } = await supabase
      .from('count_cycles').select('*').eq('status', 'open').single();

    setCycle(cycleData || null);

    if (cycleData) {
      const { data: counts }   = await supabase
        .from('inventory_counts')
        .select('id, status, submitted_at, approved_at, rep_id, account:accounts(id, name, region:regions(name))')
        .eq('cycle_id', cycleData.id).order('status').limit(500);
      const { data: reps }     = await supabase.from('profiles').select('id, full_name');
      const { data: acctReps } = await supabase.from('account_reps').select('account_id, rep_id');

      const repMap = {};
      for (const r of reps || []) repMap[r.id] = r;
      const acctRepsMap = {};
      for (const ar of acctReps || []) {
        if (!acctRepsMap[ar.account_id]) acctRepsMap[ar.account_id] = [];
        acctRepsMap[ar.account_id].push(repMap[ar.rep_id]);
      }

      const scoped = (counts || [])
        .filter(c => managerRegions.length === 0 || managerRegions.includes(c.account?.region?.name))
        .map(c => ({ ...c, rep: c.rep_id ? repMap[c.rep_id] : null, allReps: acctRepsMap[c.account?.id] || [] }));

      setProgress(scoped);
      const regionNames = [...new Set(scoped.map(c => c.account?.region?.name || 'Unassigned'))];
      setCollapsedRegions(Object.fromEntries(regionNames.map(r => [r, true])));
    }
    setLoading(false);
  }

  function toggleRegion(rName) {
    setCollapsedRegions(prev => ({ ...prev, [rName]: !prev[rName] }));
  }

  const stats = {
    not_started: progress.filter(p => p.status === 'not_started').length,
    in_progress:  progress.filter(p => p.status === 'in_progress').length,
    submitted:    progress.filter(p => p.status === 'submitted').length,
    approved:     progress.filter(p => p.status === 'approved').length,
  };
  const total = progress.length;
  const pct   = total > 0 ? Math.round((stats.submitted + stats.approved) / total * 100) : 0;

  const regionMap = {};
  progress.forEach(p => {
    const rName = p.account?.region?.name || 'Unassigned';
    if (!regionMap[rName]) regionMap[rName] = [];
    regionMap[rName].push(p);
  });

  const pageTitle = NAV.find(n => n.key === tab)?.label || 'Dashboard';

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
              </div>
            </div>
          );
        })}

        <div className="sidebar-bottom">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div className="user-name">{profile?.full_name}</div>
              <div className="user-role">Manager</div>
            </div>
            <button onClick={signOut} style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.55)', fontSize: 11, fontWeight: 600, padding: '5px 12px', borderRadius: 7, cursor: 'pointer', fontFamily: 'inherit' }}>
              Sign Out
            </button>
          </div>
        </div>
        <div className="sidebar-accent-bar" />
      </nav>

      <div className="main-col">
        <div className="topbar">
          <div>
            <h1>{pageTitle}</h1>
            <p>
              {tab === 'overview' && (cycle
                ? cycle.name + ' - ' + total + ' account' + (total !== 1 ? 's' : '') + ' in your region'
                : 'No active cycle')}
              {tab === 'mycounts' && 'Your assigned accounts for the active cycle'}
              {tab === 'accounts' && 'Accounts in your region - view and add'}
              {tab === 'catalog'  && 'View inventory items'}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {tab === 'accounts' && (
              <button className="btn btn-primary" onClick={() => { if (accountsAddRef.current) accountsAddRef.current(); }}>
                + Add Account
              </button>
            )}
          </div>
        </div>

        <div className="content-area">

          {tab === 'overview' && (
            <>
              {!cycle ? (
                <div className="card" style={{ maxWidth: 480, padding: 32, textAlign: 'center' }}>
                  <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>No Active Cycle</div>
                  <div style={{ fontSize: 13, color: 'var(--text-dim)' }}>There is no open count cycle at this time. Contact an administrator to open a new cycle.</div>
                </div>
              ) : (
                <>
                  <div className="cycle-hero">
                    <div className="hero-top">
                      <div>
                        <div className="hero-title">{cycle.name} Count Cycle</div>
                        <div className="hero-meta">
                          {'Opened ' + new Date(cycle.opened_at).toLocaleDateString() + ' - ' + total + ' account' + (total !== 1 ? 's' : '') + ' in ' + (managerRegions.join(', ') || 'your region')}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div className="hero-pct">{pct}%</div>
                        <div className="hero-pct-lbl">COMPLETE</div>
                      </div>
                    </div>
                    <div className="hero-stats">
                      {STAT_CARDS.map(s => (
                        <div key={s.key} className={'stat-card hero-stat-card ' + s.cls}>
                          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', position: 'relative', zIndex: 1 }}>
                            <div>
                              <div className={'sc-num ' + s.tc}>{stats[s.key]}</div>
                              <div className={'sc-lbl ' + s.tc}>{s.label}</div>
                            </div>
                            <div className={'sc-sub ' + s.tc} style={{ fontSize: 22, fontWeight: 800, lineHeight: 1, opacity: 0.85 }}>
                              {total > 0 ? Math.round(stats[s.key] / total * 100) : 0}%
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {Object.keys(regionMap).sort().map(rName => {
                    const counts      = regionMap[rName];
                    const rTotal      = counts.length;
                    const rApproved   = counts.filter(p => p.status === 'approved').length;
                    const rSubmitted  = counts.filter(p => p.status === 'submitted').length;
                    const rPct        = rTotal > 0 ? Math.round((rApproved + rSubmitted) / rTotal * 100) : 0;
                    const isCollapsed = collapsedRegions[rName];
                    const rStats = {
                      not_started: counts.filter(p => p.status === 'not_started').length,
                      in_progress:  counts.filter(p => p.status === 'in_progress').length,
                      submitted:    counts.filter(p => p.status === 'submitted').length,
                      approved:     counts.filter(p => p.status === 'approved').length,
                    };

                    return (
                      <div key={rName} className="region-block">
                        <div className="region-header" onClick={() => toggleRegion(rName)} style={{ cursor: 'pointer' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                            <div style={{ minWidth: 140 }}>
                              <div className="region-name" style={{ fontSize: 22 }}>{rName}</div>
                              <div style={{ fontSize: 12, color: '#4a6a8a', marginTop: 3, fontWeight: 500 }}>{rTotal} account{rTotal !== 1 ? 's' : ''}</div>
                            </div>
                            <div style={{ display: 'flex', gap: 8, flex: 1, margin: '0 16px' }}>
                              {STAT_CARDS.map(s => (
                                <div key={s.key} className={'stat-card ' + s.cls} style={{ padding: '8px 10px', flex: '1 1 0', opacity: 0.85 }}>
                                  <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', position: 'relative', zIndex: 1 }}>
                                    <div>
                                      <div className={'sc-num ' + s.tc} style={{ fontSize: 22 }}>{rStats[s.key]}</div>
                                      <div className={'sc-lbl ' + s.tc} style={{ fontSize: 9 }}>{s.label}</div>
                                    </div>
                                    <div className={'sc-sub ' + s.tc} style={{ fontSize: 16, fontWeight: 800, lineHeight: 1, opacity: 0.85 }}>
                                      {rTotal > 0 ? Math.round(rStats[s.key] / rTotal * 100) : 0}%
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 90, justifyContent: 'flex-end' }}>
                              <div style={{ textAlign: 'right' }}>
                                <div className="region-pct-num">{rPct}%</div>
                                <div className="region-pct-lbl">Complete</div>
                              </div>
                              <div style={{ fontSize: 16, color: '#1a3a5c', transition: 'transform 0.2s', transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)' }}>&#9660;</div>
                            </div>
                          </div>
                        </div>

                        {!isCollapsed && (
                          <div className="region-detail">
                            <table>
                              <thead>
                                <tr><th>Account</th><th>Rep(s)</th><th>Status</th><th>Submitted</th><th>Actions</th></tr>
                              </thead>
                              <tbody>
                                {counts.map(p => (
                                  <tr key={p.id}>
                                    <td style={{ fontWeight: 700 }}>{p.account?.name}</td>
                                    <td>
                                      {p.allReps?.length > 0
                                        ? p.allReps.filter(Boolean).map(r => <span key={r.id} className="rep-tag">{r.full_name}</span>)
                                        : <span style={{ color: 'var(--red)', fontSize: 12 }}>Unassigned</span>}
                                    </td>
                                    <td><Pill status={p.status} /></td>
                                    <td style={{ color: 'var(--text-dim)' }}>
                                      {p.submitted_at ? new Date(p.submitted_at).toLocaleDateString() : '--'}
                                    </td>
                                    <td>
                                      {(p.status === 'not_started' || p.status === 'in_progress') && (
                                        <button className="tbl-btn" onClick={e => { e.stopPropagation(); navigate('/count/' + p.id); }}>Enter Count</button>
                                      )}
                                      {(p.status === 'submitted' || p.status === 'approved') && (
                                        <button className="tbl-btn" onClick={e => { e.stopPropagation(); navigate('/count/' + p.id); }}>View Count</button>
                                      )}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </>
              )}
            </>
          )}

          {tab === 'mycounts' && <MyCounts cycle={cycle} profile={profile} navigate={navigate} />}

          {tab === 'accounts' && (
            <ManagerAccounts
              profile={profile}
              cycle={cycle}
              onRegisterAdd={fn => { accountsAddRef.current = fn; }}
            />
          )}

          {tab === 'catalog' && (
            <AdminItemCatalog
              readOnly={true}
              onRegisterActions={actions => { catalogActionsRef.current = actions; }}
            />
          )}

        </div>
      </div>
    </div>
  );
}

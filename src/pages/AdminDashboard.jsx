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
  { key: 'overview', label: 'Overview',        icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' },
  { key: 'todos',    label: 'To Do',            icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4' },
  { section: 'MANAGE' },
  { key: 'accounts', label: 'Accounts',         icon: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-2 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4' },
  { key: 'users',    label: 'Users',            icon: 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z' },
  { section: 'DATA' },
  { key: 'data',     label: 'Import / Export',  icon: 'M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12' },
];

function NavIcon({ path }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d={path} />
    </svg>
  );
}

function TodoSection({ todos, onComplete, onApproveEdit, onDenyEdit }) {
  const [expandedId, setExpandedId] = useState(null);
  const [denyModal, setDenyModal] = useState(null);
  const [denyReason, setDenyReason] = useState('');

  const editRequests   = todos.filter(t => t.todo_type === 'edit_request');
  const countApprovals = todos.filter(t => t.todo_type === 'count_approval');
  const closureFlags   = todos.filter(t => t.todo_type === 'account_closure');
  const general        = todos.filter(t => !t.todo_type || t.todo_type === 'general');

  function parseMeta(t) {
    try { return JSON.parse(t.metadata || '{}'); } catch { return {}; }
  }

  function Section({ title, badge, color, items, renderItem, emptyMsg }) {
    return (
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div className="card-title" style={{ fontSize: 17 }}>{title}</div>
            <span style={{ background: items.length > 0 ? color : '#C5D1DA', color: 'white', fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 10 }}>{items.length}</span>
          </div>
        </div>
        {items.length === 0
          ? <div className="table-empty" style={{ padding: '24px 20px', fontSize: 13 }}>{emptyMsg || 'No items pending.'}</div>
          : items.map(renderItem)
        }
      </div>
    );
  }

  return (
    <div>
      {/* Edit Requests */}
      <Section title="Count Edit Requests" emptyMsg="No edit requests pending." badge={editRequests.length} color="#0076BB" items={editRequests} renderItem={t => {
        const meta = parseMeta(t);
        const expanded = expandedId === t.id;
        return (
          <div key={t.id} style={{ borderBottom: '1px solid #E1E8EE' }}>
            <div style={{ padding: '14px 20px', display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                  <span className={'badge ' + (t.priority === 'high' ? 'b-red' : 'b-blue')} style={{ fontSize: 10 }}>
                    {t.priority === 'high' ? 'Urgent' : 'Normal'}
                  </span>
                  <span style={{ fontSize: 11, color: '#7A909F' }}>{new Date(t.created_at).toLocaleDateString()}</span>
                </div>
                <div style={{ fontWeight: 600, fontSize: 14, color: '#1A2B38', marginBottom: 2 }}>{meta.account_name || t.title}</div>
                <div style={{ fontSize: 12, color: '#7A909F' }}>{meta.rep_name} &middot; {meta.region}</div>
                {meta.reason && <div style={{ fontSize: 12, color: '#3D5466', marginTop: 4 }}>Reason: <strong>{meta.reason.replace(/_/g, ' ')}</strong></div>}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 }}>
                <button className="btn btn-ghost btn-sm" onClick={() => setExpandedId(expanded ? null : t.id)}>
                  {expanded ? 'Hide Details' : 'View Details'}
                </button>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className="btn btn-blue btn-sm" onClick={() => onApproveEdit(t)}>Approve</button>
                  <button className="btn btn-sm" style={{ background: '#EF4444', color: 'white' }} onClick={() => { setDenyModal(t); setDenyReason(''); }}>Deny</button>
                </div>
              </div>
            </div>
            {expanded && (
              <div style={{ padding: '0 20px 16px', background: '#F7F9FB', borderTop: '1px solid #E1E8EE' }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#7A909F', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8, marginTop: 12 }}>Rep's Explanation</div>
                <div style={{ fontSize: 13, color: '#3D5466', lineHeight: 1.6, background: 'white', border: '1px solid #E1E8EE', borderRadius: 8, padding: '10px 14px' }}>
                  {meta.details || 'No details provided.'}
                </div>
                {meta.requested_at && (
                  <div style={{ fontSize: 11, color: '#7A909F', marginTop: 8 }}>
                    Requested: {new Date(meta.requested_at).toLocaleString()}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      }} />

      {/* Counts to Approve */}
      <Section title="Counts to Approve" emptyMsg="No counts awaiting approval." badge={countApprovals.length} color="#c88e0f" items={countApprovals} renderItem={t => {
        const meta = parseMeta(t);
        const expanded = expandedId === t.id;
        return (
          <div key={t.id} style={{ borderBottom: '1px solid #E1E8EE' }}>
            <div style={{ padding: '14px 20px', display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <span className="badge b-gold" style={{ fontSize: 10 }}>Awaiting Approval</span>
                  <span style={{ fontSize: 11, color: '#7A909F' }}>{new Date(t.created_at).toLocaleDateString()}</span>
                </div>
                <div style={{ fontWeight: 600, fontSize: 14, color: '#1A2B38', marginBottom: 2 }}>{t.title?.replace('Count to approve: ', '')}</div>
                <div style={{ fontSize: 12, color: '#7A909F' }}>{t.description}</div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 }}>
                {t.count_id && (
                  <button className="btn btn-ghost btn-sm" onClick={() => setExpandedId(expanded ? null : t.id)}>
                    {expanded ? 'Hide' : 'Review'}
                  </button>
                )}
                <button className="btn btn-blue btn-sm" onClick={() => onComplete(t.id)}>Mark Approved</button>
              </div>
            </div>
          </div>
        );
      }} />

      {/* Account Closures */}
      <Section title="Accounts Flagged for Closure" emptyMsg="No accounts flagged for closure." badge={closureFlags.length} color="#EF4444" items={closureFlags} renderItem={t => {
        const meta = parseMeta(t);
        const expanded = expandedId === t.id;
        return (
          <div key={t.id} style={{ borderBottom: '1px solid #E1E8EE' }}>
            <div style={{ padding: '14px 20px', display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <span className="badge b-red" style={{ fontSize: 10 }}>Closure Requested</span>
                  <span style={{ fontSize: 11, color: '#7A909F' }}>{new Date(t.created_at).toLocaleDateString()}</span>
                </div>
                <div style={{ fontWeight: 600, fontSize: 14, color: '#1A2B38', marginBottom: 2 }}>{t.title?.replace('Account flagged for closure: ', '')}</div>
                <div style={{ fontSize: 12, color: '#7A909F' }}>{meta.rep_name} &middot; Reason: {meta.reason?.replace(/_/g,' ') || 'Not specified'}</div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 }}>
                <button className="btn btn-ghost btn-sm" onClick={() => setExpandedId(expanded ? null : t.id)}>
                  {expanded ? 'Hide' : 'Review'}
                </button>
                <button className="btn btn-sm" style={{ background: '#EF4444', color: 'white' }} onClick={() => onComplete(t.id)}>Close Account</button>
              </div>
            </div>
            {expanded && (
              <div style={{ padding: '0 20px 16px', background: '#FFF5F5', borderTop: '1px solid #fecaca' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
                  {[
                    { label: 'Reason', value: meta.reason?.replace(/_/g,' ') },
                    { label: 'Last Count Date', value: meta.last_count_date },
                    { label: 'Final Count Performed', value: meta.final_count_performed },
                    { label: 'Inventory Retrieved', value: meta.inventory_retrieved },
                  ].map((f, i) => f.value && (
                    <div key={i} style={{ background: 'white', borderRadius: 8, padding: '10px 12px', border: '1px solid #fecaca' }}>
                      <div style={{ fontSize: 10, fontWeight: 600, color: '#7A909F', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3 }}>{f.label}</div>
                      <div style={{ fontSize: 13, color: '#1A2B38', fontWeight: 500 }}>{f.value}</div>
                    </div>
                  ))}
                </div>
                {meta.notes && (
                  <div style={{ marginTop: 12, background: 'white', borderRadius: 8, padding: '10px 12px', border: '1px solid #fecaca' }}>
                    <div style={{ fontSize: 10, fontWeight: 600, color: '#7A909F', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3 }}>Notes</div>
                    <div style={{ fontSize: 13, color: '#3D5466', lineHeight: 1.5 }}>{meta.notes}</div>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      }} />

      {/* General Tasks */}
      <Section title="General Tasks" emptyMsg="No general tasks pending." badge={general.length} color="#7A909F" items={general} renderItem={t => (
        <div key={t.id} style={{ padding: '14px 20px', borderBottom: '1px solid #E1E8EE', display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
              <span className={'badge ' + (t.priority === 'high' ? 'b-red' : 'b-gray')} style={{ fontSize: 10 }}>{t.priority === 'high' ? 'High Priority' : 'Normal'}</span>
              <span style={{ fontSize: 11, color: '#7A909F' }}>{new Date(t.created_at).toLocaleDateString()}</span>
            </div>
            <div style={{ fontWeight: 600, fontSize: 14, color: '#1A2B38', marginBottom: 3 }}>{t.title}</div>
            {t.description && <div style={{ fontSize: 13, color: '#7A909F' }}>{t.description}</div>}
          </div>
          <button className="btn btn-ghost btn-sm" onClick={() => onComplete(t.id)}>Mark Complete</button>
        </div>
      )} />

      {/* Deny Modal */}
      {denyModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,31,50,0.6)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: 'white', borderRadius: 20, width: '100%', maxWidth: 380, overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
            <div style={{ background: '#7f1d1d', padding: '20px 24px', borderBottom: '3px solid #EF4444' }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: 'white' }}>Deny Edit Request</div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 3 }}>{parseMeta(denyModal).account_name}</div>
            </div>
            <div style={{ padding: 24 }}>
              <div style={{ fontSize: 13, color: '#3D5466', marginBottom: 16, lineHeight: 1.5 }}>
                Please provide a reason for denying this request. The rep will be notified.
              </div>
              <textarea value={denyReason} onChange={e => setDenyReason(e.target.value)} rows={4}
                placeholder="Explain why the edit request is being denied..."
                style={{ width: '100%', padding: '10px 12px', border: '1.5px solid #E1E8EE', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', outline: 'none', resize: 'vertical', boxSizing: 'border-box', marginBottom: 16 }} />
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={() => setDenyModal(null)}
                  style={{ flex: 1, padding: '12px', background: '#F2F5F8', border: '1.5px solid #E1E8EE', borderRadius: 8, fontSize: 14, fontWeight: 600, color: '#3D5466', cursor: 'pointer', fontFamily: 'inherit' }}>
                  Cancel
                </button>
                <button onClick={() => { onDenyEdit(denyModal, denyReason); setDenyModal(null); setDenyReason(''); }}
                  style={{ flex: 2, padding: '12px', background: '#EF4444', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 700, color: 'white', cursor: 'pointer', fontFamily: 'inherit' }}>
                  Deny Request
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function PastCycleRow({ cycle, onExport }) {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    supabase.from('inventory_counts')
      .select('status')
      .eq('cycle_id', cycle.id)
      .then(({ data }) => {
        const counts = data || [];
        setStats({
          total: counts.length,
          approved: counts.filter(c => c.status === 'approved').length,
          submitted: counts.filter(c => c.status === 'submitted').length,
        });
      });
  }, [cycle.id]);

  return (
    <tr>
      <td><strong style={{ color: '#1A2B38', fontWeight: 500 }}>{cycle.name}</strong></td>
      <td style={{ color: '#7A909F' }}>{cycle.opened_at ? new Date(cycle.opened_at).toLocaleDateString() : '--'}</td>
      <td style={{ color: '#7A909F' }}>{cycle.closed_at ? new Date(cycle.closed_at).toLocaleDateString() : '--'}</td>
      <td>
        {stats ? (
          <span style={{ fontSize: 13 }}>
            <span style={{ color: '#15803d', fontWeight: 600 }}>{stats.approved}</span>
            <span style={{ color: '#7A909F' }}> approved / </span>
            <span style={{ color: '#7A909F' }}>{stats.total} total</span>
          </span>
        ) : (
          <span style={{ color: '#C5D1DA', fontSize: 12 }}>Loading...</span>
        )}
      </td>
      <td>
        <button className="btn btn-blue btn-sm" onClick={() => onExport(cycle)}>
          Export CSV
        </button>
      </td>
    </tr>
  );
}

export default function AdminDashboard() {
  const { profile } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [tab, setTab]           = useState('overview');
  const [cycle, setCycle]       = useState(null);
  const [progress, setProgress] = useState([]);
  const [alerts, setAlerts]     = useState([]);
  const [todos, setTodos]       = useState([]);
  const [loading, setLoading]   = useState(true);
  const [progressFilter, setProgressFilter] = useState('all');
  const [cycleForm, setCycleForm] = useState({ name: '', quarter: 'Q1', year: new Date().getFullYear() });
  const [pastCycles, setPastCycles] = useState([]);

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

    const { data: pastData } = await supabase
      .from('count_cycles')
      .select('*')
      .eq('status', 'closed')
      .order('closed_at', { ascending: false });
    setPastCycles(pastData || []);
    if (cycleData) {
      const { data: counts } = await supabase
        .from('inventory_counts')
        .select('id, status, submitted_at, approved_at, rep_id, account:accounts(name, region:regions(name))')
        .eq('cycle_id', cycleData.id)
        .order('status').limit(500);
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
    toast.info('Cycle "' + cycleForm.name + '" created - populating counts...');
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
      if (acctId && h.item_number) histQtyMap[acctId + '_' + h.item_number] = h.quantity;
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
    if (!window.confirm('Close cycle "' + cycle?.name + '"? Reps will no longer be able to submit counts.')) return;
    await supabase.from('count_cycles').update({ status: 'closed', closed_at: new Date().toISOString() }).eq('id', cycle.id);
    toast.success('Count cycle closed.');
    setCycle(null); setProgress([]); loadData();
  }

  async function exportCycle(exportCycle) {
    toast.info('Preparing export for ' + exportCycle.name + '...');
    const { data: counts } = await supabase
      .from('inventory_counts')
      .select('status, submitted_at, account:accounts(name, region:regions(name)), rep:profiles(full_name)')
      .eq('cycle_id', exportCycle.id);

    const { data: lineItems } = await supabase
      .from('count_line_items')
      .select('item_number_raw, description_raw, vendor_raw, quantity, not_in_catalog, inventory_count_id')
      .in('inventory_count_id', (counts || []).map(c => c.id));

    const countMap = {};
    for (const c of counts || []) countMap[c.id] = c;

    const rows = [['Cycle', 'Account', 'Region', 'Rep', 'Status', 'Submitted', 'Item Number', 'Description', 'Vendor', 'Quantity', 'Not In Catalog']];
    for (const item of lineItems || []) {
      const c = countMap[item.inventory_count_id] || {};
      rows.push([
        exportCycle.name,
        c.account?.name || '',
        c.account?.region?.name || '',
        c.rep?.full_name || '',
        c.status || '',
        c.submitted_at ? new Date(c.submitted_at).toLocaleDateString() : '',
        item.item_number_raw || '',
        item.description_raw || '',
        item.vendor_raw || '',
        item.quantity || 0,
        item.not_in_catalog ? 'Yes' : 'No',
      ]);
    }

    const csv = rows.map(r => r.map(v => '"' + String(v).replace(/"/g, '""') + '"').join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = exportCycle.name.replace(/\s+/g, '_') + '_export.csv';
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Export downloaded!');
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
    setAlerts([]); toast.success('All alerts cleared.');
  }

  async function completeTodo(todoId) {
    await supabase.from('todos').update({ is_complete: true, completed_at: new Date().toISOString() }).eq('id', todoId);
    setTodos(prev => prev.filter(t => t.id !== todoId));
    toast.success('Task marked complete!');
  }

  async function approveEditRequest(todo) {
    if (todo.count_id) {
      await supabase.from('inventory_counts').update({ status: 'in_progress' }).eq('id', todo.count_id);
    }
    await supabase.from('todos').update({ is_complete: true, completed_at: new Date().toISOString() }).eq('id', todo.id);
    await supabase.from('alerts').insert({ alert_type: 'edit_approved', message: 'Edit request approved: ' + todo.title.replace('Edit request: ', ''), is_read: false });
    setTodos(prev => prev.filter(t => t.id !== todo.id));
    toast.success('Edit request approved - count unlocked!');
    loadData();
  }

  async function denyEditRequest(todo, reason) {
    await supabase.from('todos').update({ is_complete: true, completed_at: new Date().toISOString() }).eq('id', todo.id);
    let meta = {};
    try { meta = JSON.parse(todo.metadata || '{}'); } catch {}
    await supabase.from('alerts').insert({
      alert_type: 'edit_denied',
      message: 'Edit request denied for ' + (meta.account_name || todo.title) + (reason ? ' â€” ' + reason : ''),
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
  const total = progress.length;
  const pct = total > 0 ? Math.round((stats.submitted + stats.approved) / total * 100) : 0;
  const filteredProgress = progressFilter === 'all' ? progress : progress.filter(p => p.status === progressFilter);
  const initials = profile?.full_name?.split(' ').map(w => w[0]).join('').toUpperCase().slice(0,2) || 'AD';
  const currentLabel = NAV.find(n => n.key === tab)?.label || '';

  if (loading) return (
    <div style={{ display: 'flex', height: '100vh', width: '100vw', overflow: 'hidden' }}>
      <div style={{ width: 240, background: '#003f63', flexShrink: 0 }} />
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="loading-center"><div className="spinner" /><span>Loading...</span></div>
      </div>
    </div>
  );

  return (
    <div style={{ display: 'flex', height: '100vh', width: '100vw', overflow: 'hidden' }}>

      {/* â”€â”€ SIDEBAR â”€â”€ */}
      <div style={{ width: 240, minWidth: 240, background: '#003f63', display: 'flex', flexDirection: 'column', height: '100vh', overflowY: 'auto', flexShrink: 0 }}>

        {/* Logo */}
        <div style={{ padding: '24px 20px 18px', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
          <div style={{ fontSize: 32, fontWeight: 800, color: 'white', letterSpacing: '-1px', lineHeight: 1 }}>
            Med<span style={{ color: '#EEAF24' }}>Ex</span>
          </div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.14em', marginTop: 7, fontWeight: 600 }}>
            Inventory Control System
          </div>
        </div>

        {/* Nav */}
        <div style={{ padding: '8px 0', flex: 1 }}>
          {NAV.map((item, i) => {
            if (item.section) return (
              <div key={i} style={{ padding: '14px 20px 4px', fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.25)', letterSpacing: '0.08em' }}>
                {item.section}
              </div>
            );
            const active = tab === item.key;
            return (
              <div key={item.key}
                onClick={() => setTab(item.key)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '9px 12px', margin: '1px 8px',
                  color: active ? 'white' : 'rgba(255,255,255,0.55)',
                  fontSize: 15, fontWeight: active ? 600 : 400,
                  cursor: 'pointer', borderRadius: 8,
                  background: active ? 'rgba(255,255,255,0.11)' : 'transparent',
                  transition: 'all 0.15s', position: 'relative',
                }}
                onMouseEnter={e => { if (!active) { e.currentTarget.style.background = 'rgba(255,255,255,0.07)'; e.currentTarget.style.color = 'rgba(255,255,255,0.85)'; }}}
                onMouseLeave={e => { if (!active) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'rgba(255,255,255,0.55)'; }}}
              >
                {active && <div style={{ position: 'absolute', left: -8, top: '25%', bottom: '25%', width: 3, background: '#EEAF24', borderRadius: '0 2px 2px 0' }} />}
                <NavIcon path={item.icon} />
                <span style={{ flex: 1 }}>{item.label}</span>
                {item.key === 'todos' && todos.length > 0 && (
                  <span style={{ background: '#EF4444', color: 'white', fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 10 }}>{todos.length}</span>
                )}
                {item.key === 'overview' && alerts.length > 0 && (
                  <span style={{ background: '#EEAF24', color: '#1A2B38', fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 10 }}>{alerts.length}</span>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div style={{ padding: '14px 16px', borderTop: '1px solid rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 32, height: 32, background: 'linear-gradient(135deg, #3398cc, #EEAF24)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: 'white', flexShrink: 0 }}>
            {initials}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.75)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{profile?.full_name}</div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)' }}>Administrator</div>
          </div>
          <button onClick={signOut} title="Sign Out"
            style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.3)', cursor: 'pointer', fontSize: 18, padding: 4, lineHeight: 1 }}
            onMouseEnter={e => e.currentTarget.style.color = 'rgba(255,255,255,0.7)'}
            onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.3)'}>
            &rarr;
          </button>
        </div>
      </div>

      {/* â”€â”€ MAIN â”€â”€ */}
      <div style={{ flex: 1, minWidth: 0, background: '#F7F9FB', overflowY: 'auto', height: '100vh' }}>

        {/* Sticky header */}
        <div style={{ background: 'rgba(247,249,251,0.95)', backdropFilter: 'blur(20px)', borderBottom: '1px solid #E1E8EE', padding: '14px 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 10 }}>
          <div>
            <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-0.5px', color: '#1A2B38' }}>{currentLabel}</div>
            <div style={{ fontSize: 14, color: '#7A909F', marginTop: 2 }}>
              {tab === 'overview' && (cycle ? cycle.name + ' count cycle is active' : 'No active cycle')}
              {tab === 'todos'    && todos.length + ' pending task' + (todos.length !== 1 ? 's' : '')}
              {tab === 'accounts' && 'Manage account assignments'}
              {tab === 'users'    && 'Manage rep accounts'}
              {tab === 'data'     && 'Import and export data'}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>

            {tab === 'overview' && cycle && (
              <>
                <button className="btn btn-ghost btn-sm" onClick={() => {}}>Export</button>
                <button className="btn btn-blue btn-sm" onClick={closeCycle}>Close Cycle</button>
              </>
            )}
          </div>
        </div>

        {/* Content */}
        <div style={{ padding: '24px 28px' }}>

          {/* â”€â”€ OVERVIEW â”€â”€ */}
          {tab === 'overview' && (
            <>
              {alerts.length > 0 && (
                <div className="card">
                  <div className="card-header">
                    <div><div className="card-title" style={{ fontSize: 17 }}>Alerts</div><div className="card-sub" style={{ fontSize: 13 }}>{alerts.length} unread</div></div>
                    <button className="btn btn-ghost btn-sm" onClick={dismissAllAlerts}>Clear All</button>
                  </div>
                  {alerts.map(a => (
                    <div key={a.id} style={{ padding: '10px 20px', borderBottom: '1px solid #E1E8EE', display: 'flex', alignItems: 'center', gap: 12, fontSize: 13 }}>
                      <span style={{ flex: 1, color: '#3D5466' }}>{a.message}</span>
                      <span style={{ color: '#7A909F', fontSize: 11 }}>{new Date(a.created_at).toLocaleDateString()}</span>
                      <button className="btn btn-ghost btn-sm" onClick={() => dismissAlert(a.id)}>Dismiss</button>
                    </div>
                  ))}
                </div>
              )}

              {!cycle ? (
                <div className="card">
                  <div className="card-header"><div className="card-title" style={{ fontSize: 17 }}>Open a Count Cycle</div></div>
                  <div style={{ padding: 20 }}>
                    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                      <div className="input-group" style={{ marginBottom: 0 }}>
                        <label className="input-label">Cycle Name</label>
                        <input className="input" value={cycleForm.name} onChange={e => setCycleForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Q1 2026" style={{ width: 180 }} />
                      </div>
                      <div className="input-group" style={{ marginBottom: 0 }}>
                        <label className="input-label">Quarter</label>
                        <select className="select" style={{ width: 100 }} value={cycleForm.quarter} onChange={e => setCycleForm(p => ({ ...p, quarter: e.target.value }))}>
                          <option>Q1</option><option>Q2</option><option>Q3</option><option>Q4</option>
                        </select>
                      </div>
                      <div className="input-group" style={{ marginBottom: 0 }}>
                        <label className="input-label">Year</label>
                        <input className="input" type="number" style={{ width: 100 }} value={cycleForm.year} onChange={e => setCycleForm(p => ({ ...p, year: parseInt(e.target.value) }))} />
                      </div>
                      <button className="btn btn-blue" onClick={openCycle}>Open Cycle</button>
                    </div>
                  </div>
                </div>
              ) : (
                <div style={{ background: 'linear-gradient(135deg, #003f63 0%, #0076BB 100%)', borderRadius: 12, padding: '20px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, color: 'white', borderLeft: '4px solid #EEAF24', boxShadow: '0 4px 16px rgba(0,118,187,0.20)' }}>
                  <div>
                    <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.3px' }}>{cycle.name} Count Cycle</div>
                    <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)', marginTop: 4 }}>Opened {new Date(cycle.opened_at).toLocaleDateString()} &middot; {total} accounts</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                    <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Completion</div>
                    <div style={{ width: 120, height: 5, background: 'rgba(255,255,255,0.15)', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{ height: '100%', background: '#EEAF24', borderRadius: 3, width: pct + '%' }} />
                    </div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: '#EEAF24' }}>{pct}%</div>
                  </div>
                </div>
              )}

              {cycle && (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, marginBottom: 20 }}>
                    {[
                      { key: 'not_started', label: 'Not Started', color: '#7A909F', bar: '#C5D1DA' },
                      { key: 'in_progress',  label: 'In Progress',  color: '#0076BB', bar: '#0076BB' },
                      { key: 'submitted',    label: 'Submitted',    color: '#c88e0f', bar: '#EEAF24' },
                      { key: 'approved',     label: 'Approved',     color: '#15803d', bar: '#22C55E' },
                    ].map(s => (
                      <div key={s.key}
                        onClick={() => setProgressFilter(f => f === s.key ? 'all' : s.key)}
                        style={{
                          background: 'white', borderRadius: 12, padding: '18px 20px', cursor: 'pointer', transition: 'all 0.2s',
                          border: progressFilter === s.key ? '1.5px solid #0076BB' : '1.5px solid #E1E8EE',
                          boxShadow: progressFilter === s.key ? '0 0 0 3px #e8f4fb' : '0 1px 4px rgba(0,118,187,0.08)',
                        }}>
                        <div style={{ fontSize: 48, fontWeight: 700, letterSpacing: '-2px', lineHeight: 1, marginBottom: 6, color: s.color }}>{stats[s.key]}</div>
                        <div style={{ fontSize: 14, color: '#7A909F', fontWeight: 600 }}>{s.label}</div>
                        <div style={{ height: 3, borderRadius: 2, marginTop: 12, background: '#E1E8EE', overflow: 'hidden' }}>
                          <div style={{ height: '100%', borderRadius: 2, background: s.bar, width: total > 0 ? (stats[s.key] / total * 100) + '%' : '0%' }} />
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="card">
                    <div className="card-header">
                      <div>
                        <div className="card-title" style={{ fontSize: 17 }}>Count Progress {progressFilter !== 'all' ? 'â€” ' + progressFilter.replace('_', ' ') : ''}</div>
                        <div className="card-sub" style={{ fontSize: 13 }}>{filteredProgress.length} of {total} accounts{progressFilter === 'submitted' ? ' awaiting approval' : ''}</div>
                      </div>
                      {progressFilter !== 'all' && <button className="btn btn-ghost btn-sm" onClick={() => setProgressFilter('all')}>Clear Filter</button>}
                    </div>
                    <table className="tbl">
                      <thead>
                        <tr><th>Account</th><th>Region</th><th>Rep</th><th>Status</th><th>Submitted</th><th></th></tr>
                      </thead>
                      <tbody>
                        {filteredProgress.length === 0 ? (
                          <tr><td colSpan={6} className="table-empty">No counts match this filter.</td></tr>
                        ) : filteredProgress.map(p => (
                          <tr key={p.id}>
                            <td><strong style={{ color: '#1A2B38', fontWeight: 500 }}>{p.account?.name}</strong></td>
                            <td>{p.account?.region?.name}</td>
                            <td style={{ color: p.rep ? '#3D5466' : '#EF4444' }}>{p.rep?.full_name || 'Unassigned'}</td>
                            <td>
                              <span className={'badge ' + (p.status === 'approved' ? 'b-green' : p.status === 'submitted' ? 'b-gold' : p.status === 'in_progress' ? 'b-blue' : 'b-gray')}>
                                {COUNT_STATUS[p.status]?.label}
                              </span>
                            </td>
                            <td style={{ color: '#7A909F' }}>{p.submitted_at ? new Date(p.submitted_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '\u2014'}</td>
                            <td>{p.status === 'submitted' && <button className="btn btn-blue btn-sm" onClick={() => approveCount(p.id)}>Approve</button>}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
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

import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useToast } from '../components/ToastContext';

export default function AdminAccounts() {
  const toast = useToast();
  const [accounts, setAccounts]   = useState([]);
  const [reps, setReps]           = useState([]);
  const [regions, setRegions]     = useState([]);
  const [accountReps, setAccountReps] = useState({}); // accountId -> [repIds]
  const [loading, setLoading]     = useState(true);
  const [search, setSearch]       = useState('');
  const [filterRegion, setFilterRegion] = useState('');
  const [filterRep, setFilterRep] = useState('');
  const [activeCard, setActiveCard] = useState('all');
  const [saving, setSaving]       = useState(null);
  const [selectedClosed, setSelectedClosed] = useState(null);
  const [editingReps, setEditingReps] = useState(null); // accountId being edited
  const CATALOGS = [
    { value: 'claimsoft', label: 'Claimsoft (18 items)' },
    { value: 'edge', label: 'Edge (44 items)' },
  ];

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    const [{ data: accts }, { data: repData }, { data: regData }, { data: arData }] = await Promise.all([
      supabase.from('accounts')
        .select('id, name, rep_name_raw, is_active, assigned_rep_id, flagged_closed, closed_date, closed_notes, closed_at, closed_by, catalog_source, region:regions(id, name)')
        .order('name'),
      supabase.from('profiles').select('id, full_name, role').in('role', ['rep','manager','admin']).eq('is_active', true).order('full_name'),
      supabase.from('regions').select('*').order('name'),
      supabase.from('account_reps').select('account_id, rep_id'),
    ]);
    setAccounts(accts || []);
    setReps(repData || []);
    setRegions(regData || []);

    // Build accountReps map
    const arMap = {};
    for (const ar of arData || []) {
      if (!arMap[ar.account_id]) arMap[ar.account_id] = [];
      arMap[ar.account_id].push(ar.rep_id);
    }
    setAccountReps(arMap);
    setLoading(false);
  }

  async function addRepToAccount(accountId, repId) {
    if (!repId) return;
    const current = accountReps[accountId] || [];
    if (current.includes(repId)) { toast.info('Rep already assigned.'); return; }

    setSaving(accountId);
    const { error } = await supabase.from('account_reps').insert({ account_id: accountId, rep_id: repId });
    if (error) { toast.error('Failed: ' + error.message); setSaving(null); return; }

    // Update primary assigned_rep_id if none set
    const acct = accounts.find(a => a.id === accountId);
    if (!acct?.assigned_rep_id) {
      await supabase.from('accounts').update({ assigned_rep_id: repId }).eq('id', accountId);
      setAccounts(prev => prev.map(a => a.id === accountId ? { ...a, assigned_rep_id: repId } : a));
    }

    // Sync to open cycle if no count exists yet for this rep
    const { data: openCycle } = await supabase.from('count_cycles').select('id').eq('status', 'open').single();
    if (openCycle) {
      const { data: existing } = await supabase.from('inventory_counts')
        .select('id').eq('account_id', accountId).eq('cycle_id', openCycle.id).single();
      if (existing) {
        // Update rep_id on existing count
        await supabase.from('inventory_counts').update({ rep_id: repId }).eq('id', existing.id);
      } else {
        await supabase.from('inventory_counts').insert({
          cycle_id: openCycle.id, account_id: accountId, rep_id: repId, status: 'not_started'
        });
      }
    }

    setAccountReps(prev => ({ ...prev, [accountId]: [...(prev[accountId] || []), repId] }));
    toast.success('Rep added!');
    setSaving(null);
  }

  async function removeRepFromAccount(accountId, repId) {
    setSaving(accountId);
    await supabase.from('account_reps').delete().eq('account_id', accountId).eq('rep_id', repId);

    const remaining = (accountReps[accountId] || []).filter(id => id !== repId);

    // Update primary assigned_rep_id
    const newPrimary = remaining[0] || null;
    await supabase.from('accounts').update({ assigned_rep_id: newPrimary }).eq('id', accountId);
    setAccounts(prev => prev.map(a => a.id === accountId ? { ...a, assigned_rep_id: newPrimary } : a));

    setAccountReps(prev => ({ ...prev, [accountId]: remaining }));
    toast.success('Rep removed.');
    setSaving(null);
  }

  async function assignCatalog(accountId, catalogSource) {
    await supabase.from('accounts').update({ catalog_source: catalogSource }).eq('id', accountId);
    setAccounts(prev => prev.map(a => a.id === accountId ? { ...a, catalog_source: catalogSource } : a));
    toast.success('Catalog assigned!');
  }

  async function toggleActive(account) {
    await supabase.from('accounts').update({ is_active: !account.is_active }).eq('id', account.id);
    setAccounts(prev => prev.map(a => a.id === account.id ? { ...a, is_active: !a.is_active } : a));
    toast.success(`${account.name} ${account.is_active ? 'deactivated' : 'activated'}`);
  }

  async function approveClosure(account) {
    if (!window.confirm(`Confirm permanent closure of "${account.name}"?`)) return;
    await supabase.from('accounts').update({ flagged_closed: true, is_active: false }).eq('id', account.id);
    await supabase.from('todos').update({ is_complete: true, completed_at: new Date().toISOString() }).ilike('title', `%${account.name}%`);
    setAccounts(prev => prev.map(a => a.id === account.id ? { ...a, is_active: false } : a));
    setSelectedClosed(null);
    toast.success(`Closure of ${account.name} approved.`);
  }

  async function reactivateClosed(account) {
    if (!window.confirm(`Reactivate "${account.name}"?`)) return;
    await supabase.from('accounts').update({
      flagged_closed: false, closed_date: null, closed_notes: null,
      closed_by: null, closed_at: null, is_active: true,
    }).eq('id', account.id);
    setAccounts(prev => prev.map(a => a.id === account.id ? {
      ...a, flagged_closed: false, is_active: true
    } : a));
    setSelectedClosed(null);
    toast.success(`${account.name} reactivated.`);
  }

  function parseClosedNotes(notes) {
    if (!notes) return {};
    const parts = notes.split(' | ');
    return {
      reason: parts[0] || '',
      reasonCategory: parts.find(p => p.startsWith('Reason:'))?.replace('Reason: ', '') || '',
      finalCount: parts.find(p => p.startsWith('Final count performed:'))?.replace('Final count performed: ', '').split(' on ')[0] || '',
      finalCountDate: parts.find(p => p.startsWith('Final count date:'))?.replace('Final count date: ', '') || '',
      inventoryRetrieved: parts.find(p => p.startsWith('Inventory retrieved:'))?.replace('Inventory retrieved: ', '') || '',
    };
  }

  const activeCount     = accounts.filter(a => !a.flagged_closed).length;
  const unassignedCount = accounts.filter(a => !(accountReps[a.id]?.length) && !a.flagged_closed).length;
  const assignedCount   = accounts.filter(a => (accountReps[a.id]?.length > 0) && !a.flagged_closed).length;
  const closedCount     = accounts.filter(a => a.flagged_closed).length;

  function handleCardClick(card) {
    setActiveCard(prev => prev === card ? 'all' : card);
    setSearch(''); setFilterRegion(''); setFilterRep('');
  }

  const filtered = accounts
    .filter(a => {
      if (activeCard === 'closed')     return a.flagged_closed;
      if (activeCard === 'unassigned') return !(accountReps[a.id]?.length) && !a.flagged_closed;
      if (activeCard === 'assigned')   return (accountReps[a.id]?.length > 0) && !a.flagged_closed;
      return !a.flagged_closed;
    })
    .filter(a => !filterRegion || a.region?.name === filterRegion)
    .filter(a => !filterRep || (accountReps[a.id] || []).includes(filterRep))
    .filter(a => !search || a.name.toLowerCase().includes(search.toLowerCase()));

  const isClosedView = activeCard === 'closed';

  if (loading) return <div className="loading-center"><div className="spinner" /></div>;

  return (
    <div>
      {/* Closure Review Modal */}
      {selectedClosed && (() => {
        const { reason, reasonCategory, finalCount, finalCountDate, inventoryRetrieved } = parseClosedNotes(selectedClosed.closed_notes);
        const closedByRep = reps.find(r => r.id === selectedClosed.closed_by);
        return (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,31,50,0.6)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
            onClick={e => e.target === e.currentTarget && setSelectedClosed(null)}>
            <div style={{ background: 'white', borderRadius: 20, width: '100%', maxWidth: 520, overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.2)', maxHeight: '90vh', overflowY: 'auto' }}>
              <div style={{ background: 'linear-gradient(180deg,#EF4444 0%,#DC2626 30%,#B91C1C 65%,#991B1B 100%)', padding: '20px 24px', borderBottom: '3px solid #FF6B6B', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: 'white' }}>Closure Review</div>
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 3 }}>{selectedClosed.name}</div>
                </div>
                <button onClick={() => setSelectedClosed(null)} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: 'white', borderRadius: 8, padding: '6px 12px', cursor: 'pointer', fontFamily: 'inherit' }}>Close</button>
              </div>
              <div style={{ padding: 24 }}>
                <div style={{ display: 'grid', gap: 12 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div style={{ background: '#F7F9FB', borderRadius: 8, padding: 12 }}>
                      <div style={{ fontSize: 10, fontWeight: 600, color: '#7A909F', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Flagged By</div>
                      <div style={{ fontWeight: 600, color: '#1A2B38' }}>{closedByRep?.full_name || 'Unknown'}</div>
                    </div>
                    <div style={{ background: '#F7F9FB', borderRadius: 8, padding: 12 }}>
                      <div style={{ fontSize: 10, fontWeight: 600, color: '#7A909F', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Close Date</div>
                      <div style={{ fontWeight: 600, color: '#1A2B38' }}>{selectedClosed.closed_date || '--'}</div>
                    </div>
                  </div>
                  <div style={{ background: '#FFF5F5', borderRadius: 8, padding: 12, border: '1px solid #fecaca' }}>
                    <div style={{ fontSize: 10, fontWeight: 600, color: '#7A909F', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Reason</div>
                    <div style={{ fontWeight: 600, color: '#EF4444' }}>{reasonCategory || reason || '--'}</div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div style={{ background: finalCount === 'Yes' ? '#f0fff4' : '#fff5f5', borderRadius: 8, padding: 12 }}>
                      <div style={{ fontSize: 10, fontWeight: 600, color: '#7A909F', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Final Count</div>
                      <div style={{ fontWeight: 600, color: finalCount === 'Yes' ? '#22C55E' : '#EF4444' }}>{finalCount || '--'}</div>
                    </div>
                    <div style={{ background: inventoryRetrieved === 'Yes' ? '#f0fff4' : '#fff5f5', borderRadius: 8, padding: 12 }}>
                      <div style={{ fontSize: 10, fontWeight: 600, color: '#7A909F', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Inventory Retrieved</div>
                      <div style={{ fontWeight: 600, color: inventoryRetrieved === 'Yes' ? '#22C55E' : '#EF4444' }}>{inventoryRetrieved || '--'}</div>
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
                  <button onClick={() => setSelectedClosed(null)} style={{ flex: 1, padding: '12px', background: 'var(--bg)', border: '1.5px solid var(--border)', borderRadius: 8, fontSize: 14, fontWeight: 700, color: 'var(--text-mid)', cursor: 'pointer', fontFamily: 'var(--font)' }}>Cancel</button>
                  <button onClick={() => reactivateClosed(selectedClosed)} style={{ flex: 1, padding: '12px', background: 'var(--blue)', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 700, color: 'white', cursor: 'pointer', fontFamily: 'var(--font)' }}>Reactivate</button>
                  <button onClick={() => approveClosure(selectedClosed)} style={{ flex: 1, padding: '12px', background: '#EF4444', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 700, color: 'white', cursor: 'pointer', fontFamily: 'inherit' }}>Approve Closure</button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Rep assignment modal */}
      {editingReps && (() => {
        const acct = accounts.find(a => a.id === editingReps);
        const assigned = accountReps[editingReps] || [];
        const assignedRepObjects = assigned.map(id => reps.find(r => r.id === id)).filter(Boolean);
        const unassigned = reps.filter(r => !assigned.includes(r.id));
        return (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,31,50,0.6)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
            onClick={e => e.target === e.currentTarget && setEditingReps(null)}>
            <div style={{ background: 'white', borderRadius: 20, width: '100%', maxWidth: 480, overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
              <div style={{ background: 'linear-gradient(180deg,#2E88E8 0%,#1565C0 50%,#0D47A1 100%)', padding: '20px 24px', borderBottom: '3px solid #FFD040', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: 'white' }}>Assign Reps</div>
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 3 }}>{acct?.name} &middot; {acct?.region?.name}</div>
                </div>
                <button onClick={() => setEditingReps(null)} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: 'white', borderRadius: 8, padding: '6px 12px', cursor: 'pointer', fontFamily: 'inherit' }}>Done</button>
              </div>
              <div style={{ padding: 24 }}>
                {/* Currently assigned */}
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#7A909F', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>
                    Assigned Reps ({assignedRepObjects.length})
                  </div>
                  {assignedRepObjects.length === 0 ? (
                    <div style={{ fontSize: 13, color: '#C5D1DA', padding: '12px', background: '#F7F9FB', borderRadius: 8, textAlign: 'center' }}>No reps assigned yet</div>
                  ) : assignedRepObjects.map(r => (
                    <div key={r.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: '#e8f4fb', borderRadius: 8, marginBottom: 8, border: '1px solid #cce6f5' }}>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 600, color: '#1A2B38' }}>{r.full_name}</div>
                        <div style={{ fontSize: 11, color: '#7A909F' }}>{r.role}</div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {acct?.assigned_rep_id === r.id && (
                          <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--blue)', background: 'white', padding: '2px 8px', borderRadius: 10, border: '1px solid var(--blue)' }}>Primary</span>
                        )}
                        <button onClick={() => removeRepFromAccount(editingReps, r.id)}
                          style={{ background: '#EF4444', color: 'white', border: 'none', borderRadius: 6, padding: '4px 10px', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>
                          Remove
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Add rep */}
                {unassigned.length > 0 && (
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: '#7A909F', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>Add Rep</div>
                    <div style={{ display: 'flex', gap: 10 }}>
                      <select id="addRepSelect" className="select" style={{ flex: 1 }} defaultValue="">
                        <option value="">Select a rep...</option>
                        {unassigned.map(r => <option key={r.id} value={r.id}>{r.full_name} ({r.role})</option>)}
                      </select>
                      <button onClick={() => {
                        const sel = document.getElementById('addRepSelect');
                        if (sel.value) { addRepToAccount(editingReps, sel.value); sel.value = ''; }
                      }}
                        style={{ padding: '8px 16px', background: 'var(--blue)', color: 'white', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font)' }}
                        disabled={saving === editingReps}>
                        {saving === editingReps ? 'Adding...' : 'Add'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 20 }}>
        {[
          { key: 'all',        label: 'Active Accounts', val: activeCount,     bg: 'linear-gradient(135deg,#B8D8FF 0%,#60A8FF 100%)', tc: '#063B8A' },
          { key: 'unassigned', label: 'Unassigned',       val: unassignedCount, bg: unassignedCount > 0 ? 'linear-gradient(135deg,#FFAAAA 0%,#FF4848 100%)' : 'linear-gradient(135deg,#8EEFD4 0%,#28D09A 100%)', tc: unassignedCount > 0 ? '#7A0000' : '#064D28' },
          { key: 'assigned',   label: 'Assigned',         val: assignedCount,   bg: 'linear-gradient(135deg,#8EEFD4 0%,#28D09A 100%)', tc: '#064D28' },
          { key: 'closed',     label: 'Flagged Closed',   val: closedCount,     bg: closedCount > 0 ? 'linear-gradient(135deg,#FFAAAA 0%,#FF4848 100%)' : 'linear-gradient(135deg,#FFE180 0%,#FFC010 100%)', tc: closedCount > 0 ? '#7A0000' : '#6B3C00' },
        ].map(s => (
          <div key={s.key} onClick={() => handleCardClick(s.key)}
            style={{
              background: s.bg, borderRadius: 12, padding: '18px 20px', cursor: 'pointer',
              position: 'relative', overflow: 'hidden',
              outline: activeCard === s.key ? '2.5px solid rgba(0,0,0,0.2)' : 'none',
              outlineOffset: 2, transition: 'all 0.15s',
              boxShadow: activeCard === s.key ? '0 4px 16px rgba(0,0,0,0.15)' : '0 2px 8px rgba(0,0,0,0.08)',
            }}>
            <div style={{ position: 'absolute', bottom: -14, right: -14, width: 60, height: 60, borderRadius: '50%', background: 'rgba(255,255,255,0.2)' }} />
            <div style={{ fontSize: 32, fontWeight: 800, letterSpacing: '-1px', lineHeight: 1, marginBottom: 4, color: s.tc, position: 'relative', zIndex: 1 }}>{s.val}</div>
            <div style={{ fontSize: 11, color: s.tc, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', position: 'relative', zIndex: 1 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Filter bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
        {!isClosedView && <>
          <label style={{ fontSize: 13, color: '#7A909F', fontWeight: 500 }}>Region:</label>
          <select className="select" value={filterRegion} onChange={e => setFilterRegion(e.target.value)}>
            <option value="">All Regions</option>
            {regions.map(r => <option key={r.id} value={r.name}>{r.name}</option>)}
          </select>
          <label style={{ fontSize: 13, color: '#7A909F', fontWeight: 500 }}>Rep:</label>
          <select className="select" value={filterRep} onChange={e => setFilterRep(e.target.value)}>
            <option value="">All Reps</option>
            {reps.map(r => <option key={r.id} value={r.id}>{r.full_name}</option>)}
          </select>
        </>}
        <label style={{ fontSize: 13, color: '#7A909F', fontWeight: 500 }}>Search:</label>
        <input className="input" placeholder="Search accounts..." value={search} onChange={e => setSearch(e.target.value)} style={{ width: 200 }} />
        {(search || filterRegion || filterRep) && (
          <button className="btn btn-ghost btn-sm" onClick={() => { setSearch(''); setFilterRegion(''); setFilterRep(''); }}>Clear</button>
        )}
        <span style={{ marginLeft: 'auto', fontSize: 12, color: '#7A909F' }}>{filtered.length} accounts</span>
      </div>

      {/* Table */}
      <div className="card">
        <div className="card-header">
          <div className="card-title" style={{ fontSize: 17 }}>
            {activeCard === 'all'        && 'All Active Accounts'}
            {activeCard === 'unassigned' && 'Unassigned Accounts'}
            {activeCard === 'assigned'   && 'Assigned Accounts'}
            {activeCard === 'closed'     && 'Flagged Closed Accounts'}
          </div>
        </div>
        <table className="tbl">
          <thead>
            {!isClosedView ? (
              <tr><th style={{minWidth:80}}>Account Name</th><th style={{minWidth:80}}>Region</th><th style={{minWidth:160}}>Catalog</th><th style={{minWidth:440}}>Assigned Reps</th><th>Status</th><th>Actions</th></tr>
            ) : (
              <tr><th>Account Name</th><th>Region</th><th>Flagged By</th><th>Close Date</th><th>Actions</th></tr>
            )}
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={5} className="table-empty">No accounts match your filter.</td></tr>
            ) : !isClosedView ? filtered.map(acct => {
              const assigned = accountReps[acct.id] || [];
              const assignedRepObjects = assigned.map(id => reps.find(r => r.id === id)).filter(Boolean);
              return (
                <tr key={acct.id} style={{ background: assigned.length === 0 ? '#fef8eb' : undefined }}>
                  <td><strong style={{ color: '#1A2B38', fontWeight: 500 }}>{acct.name}</strong></td>
                  <td>{acct.region?.name}</td>
                  <td>
                    <select className="select" style={{ minWidth: 140 }}
                      value={acct.catalog_source || ''}
                      onChange={e => assignCatalog(acct.id, e.target.value)}>
                      <option value="">-- None --</option>
                      {CATALOGS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                    </select>
                  </td>
                <td>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                      {assignedRepObjects.length === 0 ? (
                        <span style={{ fontSize: 12, color: '#EF4444', fontWeight: 500 }}>Unassigned</span>
                      ) : assignedRepObjects.map(r => (
                        <span key={r.id} style={{
                          fontSize: 12, whiteSpace: 'nowrap', overflow: 'visible', background: acct.assigned_rep_id === r.id ? '#e8f4fb' : '#F2F5F8',
                          color: acct.assigned_rep_id === r.id ? 'var(--blue)' : 'var(--text-mid)',
                          padding: '3px 8px', borderRadius: 6, fontWeight: 500,
                          border: acct.assigned_rep_id === r.id ? '1px solid #cce6f5' : '1px solid #E1E8EE',
                        }}>
                          {r.full_name}</span>
                      ))}
                      <button onClick={() => setEditingReps(acct.id)}
                        style={{ fontSize: 11, color: 'var(--blue)', background: 'none', border: '1px dashed var(--blue)', borderRadius: 6, padding: '3px 8px', cursor: 'pointer', fontFamily: 'inherit' }}>
                        + Edit
                      </button>
                    </div>
                  </td>
                  <td>
                    <span className={'badge ' + (acct.is_active ? 'b-green' : 'b-gray')}>
                      {acct.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td>
                    <button className="btn btn-ghost btn-sm" onClick={() => toggleActive(acct)}>
                      {acct.is_active ? 'Deactivate' : 'Activate'}
                    </button>
                  </td>
                </tr>
              );
            }) : filtered.map(acct => {
              const closedByRep = reps.find(r => r.id === acct.closed_by);
              return (
                <tr key={acct.id} style={{ background: '#fff5f5', cursor: 'pointer' }}
                  onClick={() => setSelectedClosed(acct)}
                  onMouseEnter={e => e.currentTarget.style.background = '#ffe8e8'}
                  onMouseLeave={e => e.currentTarget.style.background = '#fff5f5'}>
                  <td><strong style={{ color: '#1A2B38', fontWeight: 500 }}>{acct.name}</strong></td>
                  <td>{acct.region?.name}</td>
                  <td style={{ fontSize: 12 }}>{closedByRep?.full_name || '--'}</td>
                  <td style={{ fontSize: 12 }}>{acct.closed_date || '--'}</td>
                  <td>
                    <button className="btn btn-ghost btn-sm" onClick={e => { e.stopPropagation(); setSelectedClosed(acct); }}>Review</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

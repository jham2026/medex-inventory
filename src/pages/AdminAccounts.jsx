import { useEffect, useState } from 'react';
import { useAuth } from '../components/AuthContext';
import { logAudit } from '../hooks/useAudit';
import { supabase } from '../lib/supabase';
import { useToast } from '../components/ToastContext';

const CATALOGS = [
  { value: 'claimsoft', label: 'Claimsoft' },
  { value: 'edge', label: 'Account Edge' },
];

function Pill({ status }) {
  const map = { Active: 'pill-app', Inactive: 'pill-ns' };
  return <span className={'pill ' + (map[status] || 'pill-ns')}>{status}</span>;
}


// â”€â”€ Versioned template download â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const TEMPLATE_DEFS = {
  accounts: {
    filename: 'MedEx_Accounts_Template_v1.csv',
    csvContent: '#MedEx_Template,accounts,v1\nAccount,Region,Status,Rep,Item Catalog\nExample Account,Austin,Open,Jane Smith,Claimsoft Catalog',
  },
  users: {
    filename: 'MedEx_Users_Template_v1.csv',
    csvContent: '#MedEx_Template,users,v1\nFirstName,LastName,FullName,EmailAddress,Role,Region,Status\nJane,Smith,Jane Smith,jsmith@medexpsi.com,rep,Austin,Active',
  },
  claimsoft_catalog: {
    filename: 'MedEx_ClaimsoftCatalog_Template_v1.csv',
    csvContent: '#MedEx_Template,claimsoft_catalog,v1\nItemNumber,ItemCategory,ItemType,ProductFamily,Description,Size,Side,Barcode1,Barcode2,NDCNumber,AllowNegQty,IsSerialized,SerialNumber,TransferCanCreatePO,VendorPartNumber,VendorName,VendorDescription,Manufacturer,CostPerItem,PurchaseUOM,CostPerUOM,ItemsPerUOM,LeadTime,BillableItem,HCPCS,Mod1,Mod2,Mod3,Mod4,SellingPrice,RentalPrice,UsedPrice,IsTaxable,IsOxygenItem,NonMedicareItem,Warehouse,Location,Bin,QOH,IsAvailable,ParLevel,MinOrderQuantity,Devices,CMN,NewItemNumber,Instructions,RequiredForms,LinkText,QRCodeURL,DiscontinueDate\nCS-001,Category,Type,Family,Example Item,Medium,,123456,,,,,,,,Claimsoft,Description,Mfg,10.00,EA,10.00,1,0,Yes,A4570,,,,,25.00,,,,,,,,,,1,1,0,5,,,,,,,',
  },
  edge_catalog: {
    filename: 'MedEx_EdgeCatalog_Template_v1.csv',
    csvContent: '#MedEx_Template,edge_catalog,v1\nItem Number,Item Name,Buy,Sell,Inventory,Asset Acct,Income Acct,Expense/COS Acct,Item Picture,Description,Use Desc. On Sale,Custom List 1,Custom List 2,Custom List 3,Custom Field 1,Custom Field 2,Custom Field 3,Primary Vendor,Vendor Item Number,Tax When Bought,Buy Unit Measure,# Items/Buy Unit,Reorder Quantity,Minimum Level,Selling Price,Sell Unit Measure,Tax When Sold,# Items/Sell Unit,Inactive Item,Standard Cost,Brand\nEDG-001,Example Item,Yes,Yes,Yes,,,,,Description,,,,,,,CF3,Edge Vendor,V001,,,5,2,25.00,EA,,,No,20.00,Brand',
  },
};

function downloadTemplate(type) {
  const tmpl = TEMPLATE_DEFS[type];
  if (!tmpl) return;
  const blob = new Blob([tmpl.csvContent], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = tmpl.filename; a.click();
  URL.revokeObjectURL(url);
}

export default function AdminAccounts() {
  const toast = useToast();
  const { profile } = useAuth();
  const [accounts, setAccounts]     = useState([]);
  const [reps, setReps]             = useState([]);
  const [regions, setRegions]       = useState([]);
  const [accountReps, setAccountReps] = useState({});
  const [loading, setLoading]       = useState(true);
  const [search, setSearch]         = useState('');
  const [filterRegion, setFilterRegion] = useState('');
  const [filterRep, setFilterRep]   = useState('');
  const [activeCard, setActiveCard] = useState('all');
  const [saving, setSaving]         = useState(null);
  const [selectedClosed, setSelectedClosed] = useState(null);
  const [editingReps, setEditingReps] = useState(null);

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    const [{ data: accts }, { data: repData }, { data: regData }, { data: arData }] = await Promise.all([
      supabase.from('accounts').select('id, name, rep_name_raw, is_active, assigned_rep_id, flagged_closed, closed_date, closed_notes, closed_at, closed_by, catalog_source, region:regions(id, name)').order('name'),
      supabase.from('profiles').select('id, full_name, role').in('role', ['rep','manager','admin']).eq('is_active', true).order('full_name'),
      supabase.from('regions').select('*').order('name'),
      supabase.from('account_reps').select('account_id, rep_id'),
    ]);
    setAccounts(accts || []);
    setReps(repData || []);
    setRegions(regData || []);
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
    const acct = accounts.find(a => a.id === accountId);
    if (!acct?.assigned_rep_id) {
      await supabase.from('accounts').update({ assigned_rep_id: repId }).eq('id', accountId);
      setAccounts(prev => prev.map(a => a.id === accountId ? { ...a, assigned_rep_id: repId } : a));
    }
    const repName = reps.find(r => r.id === repId)?.full_name || repId;
    const acctName = accounts.find(a => a.id === accountId)?.name || accountId;
    await logAudit(profile, 'ACCOUNT_REP_ADDED', 'account', { target_name: acctName, details: { rep: repName } });
    setAccountReps(prev => ({ ...prev, [accountId]: [...(prev[accountId] || []), repId] }));
    toast.success('Rep added!');
    setSaving(null);
  }

  async function removeRepFromAccount(accountId, repId) {
    setSaving(accountId);
    await supabase.from('account_reps').delete().eq('account_id', accountId).eq('rep_id', repId);
    const remaining = (accountReps[accountId] || []).filter(id => id !== repId);
    const newPrimary = remaining[0] || null;
    await supabase.from('accounts').update({ assigned_rep_id: newPrimary }).eq('id', accountId);
    setAccounts(prev => prev.map(a => a.id === accountId ? { ...a, assigned_rep_id: newPrimary } : a));
    const repName2 = reps.find(r => r.id === repId)?.full_name || repId;
    const acctName2 = accounts.find(a => a.id === accountId)?.name || accountId;
    await logAudit(profile, 'ACCOUNT_REP_REMOVED', 'account', { target_name: acctName2, details: { rep: repName2 } });
    setAccountReps(prev => ({ ...prev, [accountId]: remaining }));
    toast.success('Rep removed.');
    setSaving(null);
  }

  async function assignCatalog(accountId, catalogSource) {
    await supabase.from('accounts').update({ catalog_source: catalogSource }).eq('id', accountId);
    setAccounts(prev => prev.map(a => a.id === accountId ? { ...a, catalog_source: catalogSource } : a));
    const acctNameC = accounts.find(a => a.id === accountId)?.name || accountId;
    await logAudit(profile, 'ACCOUNT_CATALOG_CHANGED', 'account', { target_name: acctNameC, details: { catalog: catalogSource } });
    toast.success('Catalog assigned!');
  }

  async function toggleActive(account) {
    await supabase.from('accounts').update({ is_active: !account.is_active }).eq('id', account.id);
    setAccounts(prev => prev.map(a => a.id === account.id ? { ...a, is_active: !a.is_active } : a));
    await logAudit(profile, account.is_active ? 'ACCOUNT_DEACTIVATED' : 'ACCOUNT_ACTIVATED', 'account', { target_name: account.name });
    toast.success(account.name + (account.is_active ? ' deactivated' : ' activated'));
  }

  async function approveClosure(account) {
    if (!window.confirm('Confirm permanent closure of "' + account.name + '"?')) return;
    await supabase.from('accounts').update({ flagged_closed: true, is_active: false }).eq('id', account.id);
    setAccounts(prev => prev.map(a => a.id === account.id ? { ...a, is_active: false } : a));
    setSelectedClosed(null);
    await logAudit(profile, 'ACCOUNT_CLOSURE_APPROVED', 'account', { target_name: account.name });
    toast.success('Closure of ' + account.name + ' approved.');
  }

  async function reactivateClosed(account) {
    if (!window.confirm('Reactivate "' + account.name + '"?')) return;
    await supabase.from('accounts').update({ flagged_closed: false, closed_date: null, closed_notes: null, closed_by: null, closed_at: null, is_active: true }).eq('id', account.id);
    setAccounts(prev => prev.map(a => a.id === account.id ? { ...a, flagged_closed: false, is_active: true } : a));
    setSelectedClosed(null);
    await logAudit(profile, 'ACCOUNT_REACTIVATED', 'account', { target_name: account.name });
    toast.success(account.name + ' reactivated.');
  }

  const activeCount     = accounts.filter(a => !a.flagged_closed).length;
  const unassignedCount = accounts.filter(a => !(accountReps[a.id]?.length) && !a.flagged_closed).length;
  const assignedCount   = accounts.filter(a => (accountReps[a.id]?.length > 0) && !a.flagged_closed).length;
  const closedCount     = accounts.filter(a => a.flagged_closed).length;

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
      {/* Closure review modal */}
      {selectedClosed && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setSelectedClosed(null)}>
          <div className="modal">
            <div className="modal-head-red">
              <div className="modal-head-title">Closure Review</div>
              <div className="modal-head-sub">{selectedClosed.name}</div>
            </div>
            <div className="modal-body">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
                <div style={{ background: 'var(--bg)', borderRadius: 8, padding: 12 }}>
                  <div className="form-lbl" style={{ marginTop: 0 }}>Flagged By</div>
                  <div style={{ fontWeight: 700 }}>{reps.find(r => r.id === selectedClosed.closed_by)?.full_name || 'Unknown'}</div>
                </div>
                <div style={{ background: 'var(--bg)', borderRadius: 8, padding: 12 }}>
                  <div className="form-lbl" style={{ marginTop: 0 }}>Close Date</div>
                  <div style={{ fontWeight: 700 }}>{selectedClosed.closed_date || '--'}</div>
                </div>
              </div>
              <div style={{ background: 'var(--red-light)', borderRadius: 8, padding: 12, border: '1px solid #FECACA' }}>
                <div className="form-lbl" style={{ marginTop: 0 }}>Reason</div>
                <div style={{ fontWeight: 700, color: 'var(--red)' }}>{selectedClosed.closed_notes || '--'}</div>
              </div>
            </div>
            <div className="modal-actions">
              <button className="btn btn-outline" onClick={() => setSelectedClosed(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={() => reactivateClosed(selectedClosed)}>Reactivate</button>
              <button className="btn btn-danger" onClick={() => approveClosure(selectedClosed)}>Approve Closure</button>
            </div>
          </div>
        </div>
      )}

      {/* Rep assignment modal */}
      {editingReps && (() => {
        const acct = accounts.find(a => a.id === editingReps);
        const assigned = accountReps[editingReps] || [];
        const assignedRepObjects = assigned.map(id => reps.find(r => r.id === id)).filter(Boolean);
        const unassigned = reps.filter(r => !assigned.includes(r.id));
        return (
          <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setEditingReps(null)}>
            <div className="modal">
              <div className="modal-head-blue">
                <div className="modal-head-title">Assign Reps</div>
                <div className="modal-head-sub">{acct?.name} Ã‚Â· {acct?.region?.name}</div>
              </div>
              <div className="modal-body">
                <div className="form-lbl" style={{ marginTop: 0 }}>Assigned Reps ({assignedRepObjects.length})</div>
                {assignedRepObjects.length === 0
                  ? <div style={{ fontSize: 13, color: 'var(--text-dim)', padding: 12, background: 'var(--bg)', borderRadius: 8, textAlign: 'center' }}>No reps assigned yet</div>
                  : assignedRepObjects.map(r => (
                    <div key={r.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: 'var(--blue-light)', borderRadius: 8, marginBottom: 8, border: '1px solid #CCE6F5' }}>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{r.full_name}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{r.role}</div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {acct?.assigned_rep_id === r.id && <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--blue)', background: 'var(--white)', padding: '2px 8px', borderRadius: 10, border: '1px solid var(--blue)' }}>Primary</span>}
                        <button className="tbl-btn-danger" onClick={() => removeRepFromAccount(editingReps, r.id)}>Remove</button>
                      </div>
                    </div>
                  ))
                }
                {unassigned.length > 0 && (
                  <>
                    <div className="form-lbl">Add Rep</div>
                    <div style={{ display: 'flex', gap: 10 }}>
                      <select id="addRepSelect" className="form-sel" defaultValue="">
                        <option value="">Select a rep...</option>
                        {unassigned.map(r => <option key={r.id} value={r.id}>{r.full_name} ({r.role})</option>)}
                      </select>
                      <button className="btn btn-primary" disabled={saving === editingReps}
                        onClick={() => {
                          const sel = document.getElementById('addRepSelect');
                          if (sel.value) { addRepToAccount(editingReps, sel.value); sel.value = ''; }
                        }}>
                        {saving === editingReps ? 'Adding...' : 'Add'}
                      </button>
                    </div>
                  </>
                )}
              </div>
              <div className="modal-actions">
                <button className="btn btn-primary" onClick={() => setEditingReps(null)}>Done</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Stat cards */}
      <div className="summary-grid">
        {[
          { key: 'all',        label: 'Active Accounts', val: activeCount,     cls: 'sc-blue',  tc: 'c-blue'  },
          { key: 'unassigned', label: 'Unassigned',       val: unassignedCount, cls: unassignedCount > 0 ? 'sc-red' : 'sc-green', tc: unassignedCount > 0 ? 'c-red' : 'c-green' },
          { key: 'assigned',   label: 'Assigned',         val: assignedCount,   cls: 'sc-green', tc: 'c-green' },
          { key: 'closed',     label: 'Flagged Closed',   val: closedCount,     cls: closedCount > 0 ? 'sc-red' : 'sc-gold', tc: closedCount > 0 ? 'c-red' : 'c-gold' },
        ].map(s => (
          <div key={s.key} className={'stat-card ' + s.cls}
            style={{ outline: activeCard === s.key ? '2.5px solid white' : 'none', outlineOffset: 2 }}
            onClick={() => setActiveCard(p => p === s.key ? 'all' : s.key)}>
            <div className={'sc-num ' + s.tc}>{s.val}</div>
            <div className={'sc-lbl ' + s.tc}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Filter row */}
      <div className="filter-row">
        {!isClosedView && <>
          <span className="filter-label">Region:</span>
          <select className="filter-select" value={filterRegion} onChange={e => setFilterRegion(e.target.value)}>
            <option value="">All Regions</option>
            {regions.map(r => <option key={r.id} value={r.name}>{r.name}</option>)}
          </select>
          <span className="filter-label">Rep:</span>
          <select className="filter-select" value={filterRep} onChange={e => setFilterRep(e.target.value)}>
            <option value="">All Reps</option>
            {reps.map(r => <option key={r.id} value={r.id}>{r.full_name}</option>)}
          </select>
        </>}
        <span className="filter-label">Search:</span>
        <input className="search-input" placeholder="Search accounts..." value={search} onChange={e => setSearch(e.target.value)} />
        <span className="count-lbl ml-auto">{filtered.length} accounts</span>
        <button className="btn btn-outline" style={{ display: 'flex', alignItems: 'center', gap: 5 }} onClick={() => downloadTemplate('accounts')}>
          <svg width="11" height="11" viewBox="0 0 12 12" fill="none"><path d="M6 1v7M3 5.5l3 3 3-3M1 10h10" stroke="#475569" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
          Template
        </button>
      </div>

      <div className="section-title">
        {activeCard === 'all' && 'All Active Accounts'}
        {activeCard === 'unassigned' && 'Unassigned Accounts'}
        {activeCard === 'assigned' && 'Assigned Accounts'}
        {activeCard === 'closed' && 'Flagged Closed Accounts'}
      </div>

      {/* Table */}
      <div className="card">
        <table>
          <thead>
            {!isClosedView ? (
              <tr><th>Account Name</th><th>Region</th><th>Catalog</th><th>Assigned Reps</th><th>Status</th><th>Actions</th></tr>
            ) : (
              <tr><th>Account Name</th><th>Region</th><th>Flagged By</th><th>Close Date</th><th>Actions</th></tr>
            )}
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-dim)', padding: 32, fontStyle: 'italic' }}>No accounts match your filter.</td></tr>
            ) : !isClosedView ? filtered.map(acct => {
              const assigned = accountReps[acct.id] || [];
              const assignedRepObjects = assigned.map(id => reps.find(r => r.id === id)).filter(Boolean);
              return (
                <tr key={acct.id}>
                  <td style={{ fontWeight: 700 }}>{acct.name}</td>
                  <td>{acct.region?.name}</td>
                  <td>
                    <select className="cat-select" value={acct.catalog_source || ''} onChange={e => assignCatalog(acct.id, e.target.value)}>
                      <option value="">Ã¢â‚¬â€ None Ã¢â‚¬â€</option>
                      {CATALOGS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                    </select>
                  </td>
                  <td>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                      {assignedRepObjects.length === 0
                        ? <span style={{ fontSize: 12, color: 'var(--red)', fontWeight: 600 }}>Unassigned</span>
                        : assignedRepObjects.map(r => <span key={r.id} className="rep-tag">{r.full_name}</span>)
                      }
                      <button className="edit-link" onClick={() => setEditingReps(acct.id)}>Edit</button>
                    </div>
                  </td>
                  <td><Pill status={acct.is_active ? 'Active' : 'Inactive'} /></td>
                  <td>
                    <button className="tbl-btn-sm" onClick={() => toggleActive(acct)}>
                      {acct.is_active ? 'Deactivate' : 'Activate'}
                    </button>
                  </td>
                </tr>
              );
            }) : filtered.map(acct => (
              <tr key={acct.id} style={{ cursor: 'pointer' }} onClick={() => setSelectedClosed(acct)}>
                <td style={{ fontWeight: 700 }}>{acct.name}</td>
                <td>{acct.region?.name}</td>
                <td>{reps.find(r => r.id === acct.closed_by)?.full_name || '--'}</td>
                <td>{acct.closed_date || '--'}</td>
                <td><button className="tbl-btn-sm" onClick={e => { e.stopPropagation(); setSelectedClosed(acct); }}>Review</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

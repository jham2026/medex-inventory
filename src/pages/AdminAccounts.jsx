import { useEffect, useState } from 'react';
import { useAuth } from '../components/AuthContext';
import { logAudit } from '../hooks/useAudit';
import { supabase } from '../lib/supabase';
import { useToast } from '../components/ToastContext';

const CATALOGS = [
  { value: 'claimsoft', label: 'Claimsoft' },
  { value: 'edge', label: 'Account Edge' },
];

const CLOSURE_REASONS = [
  'Account closed / out of business',
  'No longer a customer',
  'Merged with another account',
  'Other',
];

// â”€â”€ Status pill â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function StatusPill({ account }) {
  if (account.flagged_closed) return <span className="pill pill-ns">Flagged Closed</span>;
  if (account.is_active)      return <span className="pill pill-app">Active</span>;
  return <span className="pill pill-ns">Inactive</span>;
}

// â”€â”€ Checkbox list â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function CheckboxList({ items, selected, onChange, labelKey = 'label', valueKey = 'value' }) {
  return (
    <div style={{ border: '1.5px solid var(--border)', borderRadius: 8, overflow: 'hidden', maxHeight: 160, overflowY: 'auto' }}>
      {items.map((item, i) => {
        const val     = item[valueKey];
        const lbl     = item[labelKey];
        const checked = selected.includes(val);
        return (
          <label key={val} style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '9px 12px',
            background: checked ? 'var(--blue-light)' : 'var(--white)',
            borderBottom: i < items.length - 1 ? '1px solid var(--border)' : 'none',
            cursor: 'pointer',
          }}>
            <input
              type="checkbox"
              checked={checked}
              onChange={() => onChange(checked ? selected.filter(v => v !== val) : [...selected, val])}
              style={{ width: 16, height: 16, accentColor: '#1565C0' }}
            />
            <span style={{ fontSize: 14, fontWeight: checked ? 600 : 400, color: checked ? 'var(--blue)' : 'var(--text)' }}>{lbl}</span>
          </label>
        );
      })}
    </div>
  );
}

// â”€â”€ Selected pills â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function SelectedPills({ items, selected, labelKey = 'label', valueKey = 'value', emptyText = 'None selected' }) {
  const sel = items.filter(i => selected.includes(i[valueKey]));
  if (!sel.length) return <span style={{ fontSize: 12, color: 'var(--text-dim)', fontStyle: 'italic' }}>{emptyText}</span>;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
      {sel.map(i => <span key={i[valueKey]} className="rep-tag">{i[labelKey]}</span>)}
    </div>
  );
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
export default function AdminAccounts({ onRegisterAdd }) {
  const toast = useToast();
  const { profile } = useAuth();

  const [accounts, setAccounts]         = useState([]);
  const [reps, setReps]                 = useState([]);
  const [regions, setRegions]           = useState([]);
  const [accountReps, setAccountReps]   = useState({});
  const [loading, setLoading]           = useState(true);
  const [saving, setSaving]             = useState(false);
  const [search, setSearch]             = useState('');
  const [filterRegion, setFilterRegion] = useState('');
  const [filterRep, setFilterRep]       = useState('');
  const [activeCard, setActiveCard]     = useState('all');

  // â”€â”€ Edit modal â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const [editAccount, setEditAccount]     = useState(null);
  const [editName, setEditName]           = useState('');
  const [editRegionIds, setEditRegionIds] = useState([]);
  const [editCatalogs, setEditCatalogs]   = useState([]);
  const [editRepIds, setEditRepIds]       = useState([]);
  const [editStatus, setEditStatus]       = useState('active');

  // â”€â”€ Flag closed confirmation â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const [showFlagConfirm, setShowFlagConfirm]       = useState(false);
  const [flagReason, setFlagReason]                 = useState('');
  const [flagNotes, setFlagNotes]                   = useState('');
  const [flagConfirmChecked, setFlagConfirmChecked] = useState(false);

  // â”€â”€ Add account modal â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const [showAddModal, setShowAddModal] = useState(false);
  const [newName, setNewName]           = useState('');
  const [newRegionIds, setNewRegionIds] = useState([]);
  const [newCatalogs, setNewCatalogs]   = useState([]);
  const [newRepIds, setNewRepIds]       = useState([]);

  useEffect(() => { loadData(); }, []);
  useEffect(() => { if (onRegisterAdd) onRegisterAdd(() => setShowAddModal(true)); }, [onRegisterAdd]);

  async function loadData() {
    setLoading(true);
    const [{ data: accts }, { data: repData }, { data: regData }, { data: arData }] = await Promise.all([
      supabase.from('accounts').select('id, name, rep_name_raw, is_active, assigned_rep_id, flagged_closed, closed_date, closed_notes, closed_at, closed_by, catalog_source, region:regions(id, name)').order('name'),
      supabase.from('profiles').select('id, full_name, role').in('role', ['rep', 'manager', 'admin']).eq('is_active', true).order('full_name'),
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

  // â”€â”€ Open edit modal â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  function openEdit(acct) {
    setEditAccount(acct);
    setEditName(acct.name);
    setEditRegionIds(acct.region?.id ? [acct.region.id] : []);
    const cats = acct.catalog_source
      ? (Array.isArray(acct.catalog_source)
          ? acct.catalog_source
          : acct.catalog_source.split(',').map(s => s.trim()).filter(Boolean))
      : [];
    setEditCatalogs(cats);
    setEditRepIds(accountReps[acct.id] || []);
    setEditStatus(acct.flagged_closed ? 'flagged' : acct.is_active ? 'active' : 'inactive');
    setShowFlagConfirm(false);
    setFlagReason('');
    setFlagNotes('');
    setFlagConfirmChecked(false);
  }

  function closeEdit() {
    setEditAccount(null);
    setShowFlagConfirm(false);
  }

  // â”€â”€ Save edit â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  async function saveEdit() {
    if (!editAccount) return;

    // If flagged selected and not already flagged - show confirmation
    if (editStatus === 'flagged' && !editAccount.flagged_closed) {
      setShowFlagConfirm(true);
      return;
    }

    setSaving(true);
    const catalogValue = editCatalogs.join(',');
    const regionId     = editRegionIds[0] || null;

    await supabase.from('accounts').update({
      name:           editName.trim(),
      region_id:      regionId,
      catalog_source: catalogValue || null,
      is_active:      editStatus === 'active',
      flagged_closed: editStatus === 'flagged',
    }).eq('id', editAccount.id);

    // Sync reps - delete then reinsert
    await supabase.from('account_reps').delete().eq('account_id', editAccount.id);
    if (editRepIds.length > 0) {
      await supabase.from('account_reps').insert(
        editRepIds.map(rid => ({ account_id: editAccount.id, rep_id: rid }))
      );
    }
    await supabase.from('accounts').update({ assigned_rep_id: editRepIds[0] || null }).eq('id', editAccount.id);

    await logAudit(profile, 'ACCOUNT_UPDATED', 'account', { target_name: editAccount.name });
    toast.success(editName.trim() + ' updated.');
    await loadData();
    closeEdit();
    setSaving(false);
  }

  // â”€â”€ Confirm flag closed â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  async function confirmFlagClosed() {
    if (!flagReason || !flagConfirmChecked) return;
    setSaving(true);
    await supabase.from('accounts').update({
      flagged_closed: true,
      is_active:      false,
      closed_notes:   flagReason + (flagNotes ? ' - ' + flagNotes : ''),
      closed_by:      profile?.id || null,
      closed_at:      new Date().toISOString(),
    }).eq('id', editAccount.id);
    await logAudit(profile, 'ACCOUNT_FLAGGED_CLOSED', 'account', {
      target_name: editAccount.name,
      details: { reason: flagReason },
    });
    toast.success(editAccount.name + ' flagged for closure.');
    await loadData();
    closeEdit();
    setSaving(false);
  }

  // â”€â”€ Add account â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  async function saveNewAccount() {
    if (!newName.trim()) { toast.error('Account name is required.'); return; }
    setSaving(true);
    const { data: inserted, error } = await supabase.from('accounts').insert({
      name:           newName.trim(),
      region_id:      newRegionIds[0] || null,
      catalog_source: newCatalogs.join(',') || null,
      is_active:      true,
      flagged_closed: false,
    }).select('id').single();
    if (error) { toast.error('Failed: ' + error.message); setSaving(false); return; }
    if (newRepIds.length > 0 && inserted?.id) {
      await supabase.from('account_reps').insert(
        newRepIds.map(rid => ({ account_id: inserted.id, rep_id: rid }))
      );
      await supabase.from('accounts').update({ assigned_rep_id: newRepIds[0] }).eq('id', inserted.id);
    }
    await logAudit(profile, 'ACCOUNT_CREATED', 'account', { target_name: newName.trim() });
    toast.success(newName.trim() + ' created.');
    setShowAddModal(false);
    setNewName(''); setNewRegionIds([]); setNewCatalogs([]); setNewRepIds([]);
    await loadData();
    setSaving(false);
  }

  // â”€â”€ Derived counts â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
    .filter(a => !filterRep    || (accountReps[a.id] || []).includes(filterRep))
    .filter(a => !search       || a.name.toLowerCase().includes(search.toLowerCase()));

  const repItems    = reps.map(r => ({ value: r.id, label: r.full_name }));
  const regionItems = regions.map(r => ({ value: r.id, label: r.name }));

  if (loading) return <div className="loading-center"><div className="spinner" /></div>;

  return (
    <div>

      {/* â”€â”€ EDIT MODAL â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      {editAccount && !showFlagConfirm && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && closeEdit()}>
          <div className="modal" style={{ maxWidth: 520 }}>
            <div className="modal-head-blue">
              <div className="modal-head-title">Edit Account</div>
              <div className="modal-head-sub">{editAccount.name}</div>
            </div>
            <div className="modal-body" style={{ overflowY: 'auto', maxHeight: '65vh' }}>

              <div className="form-lbl" style={{ marginTop: 0 }}>Account Name</div>
              <input className="form-inp" value={editName} onChange={e => setEditName(e.target.value)} />

              <div className="form-lbl" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                Regions
                <span style={{ fontSize: 11, color: 'var(--text-dim)', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>
                  - {editRegionIds.length > 0 ? editRegionIds.length + ' selected' : 'none selected'}
                </span>
              </div>
              <CheckboxList items={regionItems} selected={editRegionIds} onChange={setEditRegionIds} />
              <SelectedPills items={regionItems} selected={editRegionIds} emptyText="No regions selected" />

              <div className="form-lbl" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                Item Catalogs
                <span style={{ fontSize: 11, color: 'var(--text-dim)', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>
                  - {editCatalogs.length > 0 ? editCatalogs.length + ' selected' : 'none selected'}
                </span>
              </div>
              <CheckboxList items={CATALOGS} selected={editCatalogs} onChange={setEditCatalogs} />
              <p style={{ fontSize: 12, color: 'var(--text-dim)', margin: '5px 0 0' }}>
                Reps will only see items from selected catalog(s) during count entry.
              </p>

              <div className="form-lbl" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                Assigned Reps
                <span style={{ fontSize: 11, color: 'var(--text-dim)', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>
                  - {editRepIds.length > 0 ? editRepIds.length + ' selected' : 'none assigned'}
                </span>
              </div>
              <CheckboxList items={repItems} selected={editRepIds} onChange={setEditRepIds} />
              <SelectedPills items={repItems} selected={editRepIds} emptyText="No reps assigned" />

              <div className="form-lbl">Account Status</div>
              <div style={{ display: 'flex', gap: 8 }}>
                {[
                  { val: 'active',   label: 'Active',      sub: 'Currently counting',   activeBorder: '#1565C0', activeBg: 'var(--blue-light)', activeColor: 'var(--blue)' },
                  { val: 'inactive', label: 'Inactive',    sub: 'Excluded from cycles', activeBorder: 'var(--text-mid)', activeBg: 'var(--bg)', activeColor: 'var(--text-mid)' },
                  { val: 'flagged',  label: 'Flag Closed', sub: 'Opens confirmation',   activeBorder: 'var(--red)', activeBg: 'var(--red-light)', activeColor: 'var(--red)' },
                ].map(s => (
                  <div key={s.val} onClick={() => setEditStatus(s.val)} style={{
                    flex: 1, padding: '10px 12px', borderRadius: 8, cursor: 'pointer',
                    border: editStatus === s.val ? '2px solid ' + s.activeBorder : '1.5px solid var(--border)',
                    background: editStatus === s.val ? s.activeBg : 'var(--white)',
                  }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: editStatus === s.val ? s.activeColor : 'var(--text)' }}>{s.label}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>{s.sub}</div>
                  </div>
                ))}
              </div>

            </div>
            <div className="modal-actions">
              <button className="btn btn-outline" onClick={closeEdit}>Cancel</button>
              <button className="btn btn-primary" onClick={saveEdit} disabled={saving}>
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* â”€â”€ FLAG CLOSED CONFIRMATION â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      {editAccount && showFlagConfirm && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && closeEdit()}>
          <div className="modal" style={{ maxWidth: 460 }}>
            <div className="modal-head-red">
              <div className="modal-head-title">Flag Account for Closure</div>
              <div className="modal-head-sub">{editAccount.name}</div>
            </div>
            <div className="modal-body">
              <div style={{ background: 'var(--red-light)', border: '1px solid #FECACA', borderRadius: 8, padding: '12px 14px', marginBottom: 4 }}>
                <div style={{ fontWeight: 700, color: 'var(--red)', fontSize: 13 }}>This action cannot be undone.</div>
                <div style={{ fontSize: 13, color: 'var(--red)', marginTop: 4, lineHeight: 1.5 }}>
                  Flagging this account as closed will remove it from all future count cycles.
                </div>
              </div>

              <div className="form-lbl">Reason for Closure *</div>
              <select className="form-sel" value={flagReason} onChange={e => setFlagReason(e.target.value)}>
                <option value="">Select a reason...</option>
                {CLOSURE_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
              </select>

              <div className="form-lbl">Additional Notes</div>
              <textarea className="form-inp" style={{ height: 80, resize: 'none' }}
                placeholder="Any additional details about this closure..."
                value={flagNotes} onChange={e => setFlagNotes(e.target.value)} />

              <label style={{
                display: 'flex', alignItems: 'center', gap: 10, marginTop: 14,
                padding: '10px 12px', background: 'var(--bg)', borderRadius: 8,
                border: '1px solid var(--border)', cursor: 'pointer',
              }}>
                <input type="checkbox" checked={flagConfirmChecked}
                  onChange={e => setFlagConfirmChecked(e.target.checked)}
                  style={{ width: 16, height: 16, accentColor: '#DC2626' }} />
                <span style={{ fontSize: 13, color: 'var(--text)' }}>I understand this cannot be undone</span>
              </label>
            </div>
            <div className="modal-actions">
              <button className="btn btn-outline" onClick={() => setShowFlagConfirm(false)}>Go Back</button>
              <button className="btn btn-danger" onClick={confirmFlagClosed}
                disabled={!flagReason || !flagConfirmChecked || saving}>
                {saving ? 'Saving...' : 'Confirm - Flag Closed'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* â”€â”€ ADD ACCOUNT MODAL â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      {showAddModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowAddModal(false)}>
          <div className="modal" style={{ maxWidth: 520 }}>
            <div className="modal-head-blue">
              <div className="modal-head-title">Add Account</div>
              <div className="modal-head-sub">Create a new account</div>
            </div>
            <div className="modal-body" style={{ overflowY: 'auto', maxHeight: '65vh' }}>

              <div className="form-lbl" style={{ marginTop: 0 }}>Account Name *</div>
              <input className="form-inp" placeholder="e.g. AUS-MAIN" value={newName} onChange={e => setNewName(e.target.value)} />

              <div className="form-lbl" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                Regions
                <span style={{ fontSize: 11, color: 'var(--text-dim)', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>
                  - {newRegionIds.length > 0 ? newRegionIds.length + ' selected' : 'none selected'}
                </span>
              </div>
              <CheckboxList items={regionItems} selected={newRegionIds} onChange={setNewRegionIds} />
              <SelectedPills items={regionItems} selected={newRegionIds} emptyText="No regions selected" />

              <div className="form-lbl" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                Item Catalogs
                <span style={{ fontSize: 11, color: 'var(--text-dim)', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>
                  - {newCatalogs.length > 0 ? newCatalogs.length + ' selected' : 'none selected'}
                </span>
              </div>
              <CheckboxList items={CATALOGS} selected={newCatalogs} onChange={setNewCatalogs} />

              <div className="form-lbl" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                Assigned Reps
                <span style={{ fontSize: 11, color: 'var(--text-dim)', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>
                  - {newRepIds.length > 0 ? newRepIds.length + ' selected' : 'none selected'}
                </span>
              </div>
              <CheckboxList items={repItems} selected={newRepIds} onChange={setNewRepIds} />
              <SelectedPills items={repItems} selected={newRepIds} emptyText="No reps assigned" />

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

      {/* â”€â”€ STAT CARDS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <div className="summary-grid">
        {[
          { key: 'all',        label: 'Active Accounts', val: activeCount,     cls: 'sc-blue',  tc: 'c-blue'  },
          { key: 'unassigned', label: 'Unassigned',       val: unassignedCount, cls: 'sc-gold',  tc: 'c-gold'  },
          { key: 'assigned',   label: 'Assigned',         val: assignedCount,   cls: 'sc-green', tc: 'c-green' },
          { key: 'closed',     label: 'Flagged Closed',   val: closedCount,     cls: 'sc-red',   tc: 'c-red'   },
        ].map(s => (
          <div key={s.key} className={'stat-card ' + s.cls}
            style={{ outline: activeCard === s.key ? '2.5px solid white' : 'none', outlineOffset: 2 }}
            onClick={() => setActiveCard(p => p === s.key ? 'all' : s.key)}>
            <div className={'sc-num ' + s.tc}>{s.val}</div>
            <div className={'sc-lbl ' + s.tc}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* â”€â”€ FILTER ROW â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <div className="filter-row">
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
        <span className="filter-label">Search:</span>
        <input className="search-input" placeholder="Search accounts..."
          value={search} onChange={e => setSearch(e.target.value)} />
        <span className="count-lbl ml-auto">{filtered.length} accounts</span>
      </div>

      <div className="section-title">
        {activeCard === 'all'        && 'All Active Accounts'}
        {activeCard === 'unassigned' && 'Unassigned Accounts'}
        {activeCard === 'assigned'   && 'Assigned Accounts'}
        {activeCard === 'closed'     && 'Flagged Closed Accounts'}
      </div>

      {/* â”€â”€ TABLE â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Account Name</th>
              <th>Region</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={4} style={{ textAlign: 'center', color: 'var(--text-dim)', padding: 32, fontStyle: 'italic' }}>
                  No accounts match your filter.
                </td>
              </tr>
            ) : filtered.map(acct => (
              <tr key={acct.id}>
                <td style={{ fontWeight: 700 }}>{acct.name}</td>
                <td>{acct.region?.name || <span style={{ color: 'var(--text-dim)' }}>--</span>}</td>
                <td><StatusPill account={acct} /></td>
                <td><button className="tbl-btn-sm" onClick={() => openEdit(acct)}>Edit</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

    </div>
  );
}

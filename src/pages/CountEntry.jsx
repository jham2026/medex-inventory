import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../components/AuthContext';
import { useToast } from '../components/ToastContext';
import NavBar from '../components/NavBar';
import BarcodeScanner from '../components/BarcodeScanner';

export default function CountEntry() {
  const { countId } = useParams();
  const { profile } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();

  const [count, setCount]           = useState(null);
  const [items, setItems]           = useState([]);
  const [loading, setLoading]       = useState(true);
  const [saving, setSaving]         = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [scanning, setScanning]     = useState(false);

  const [search, setSearch]         = useState('');
  const [filterVendor, setFilterVendor] = useState('');

  const [addMode, setAddMode]       = useState(false);
  const [addSearch, setAddSearch]   = useState('');
  const [addResults, setAddResults] = useState([]);
  const [addSearching, setAddSearching] = useState(false);
  const addSearchRef = useRef(null);
  const addTimer = useRef(null);

  const [showCloseModal, setShowCloseModal] = useState(false);
  const [closeForm, setCloseForm] = useState({
    date: new Date().toISOString().split('T')[0],
    notes: '',
    reason_category: '',
    final_count_performed: '',
    final_count_date: '',
    inventory_retrieved: '',
    closing_count_eta: '',
  });
  const [closing, setClosing] = useState(false);

  useEffect(() => { loadCount(); }, [countId]);

  useEffect(() => {
    if (addMode && addSearchRef.current) addSearchRef.current.focus();
  }, [addMode]);

  useEffect(() => {
    clearTimeout(addTimer.current);
    if (!addSearch || addSearch.length < 2) { setAddResults([]); return; }
    addTimer.current = setTimeout(() => doAddSearch(addSearch), 300);
    return () => clearTimeout(addTimer.current);
  }, [addSearch]);

  async function doAddSearch(q) {
    setAddSearching(true);
    const catalogSource = count?.account?.catalog_source || 'edge';
    let query = supabase
      .from('item_catalog')
      .select('id, item_number, description, primary_vendor, barcode_1, hcpcs_code')
      .eq('catalog_source', catalogSource)
      .or(`item_number.ilike.%${q}%,description.ilike.%${q}%,barcode_1.eq.${q}`)
      .limit(15);
    const { data } = await query;
    setAddResults(data || []);
    setAddSearching(false);
  }

  async function loadCount() {
    setLoading(true);
    const { data: countData } = await supabase
      .from('inventory_counts')
      .select(`
        id, status, cycle_id, started_at, submitted_at,
        account:accounts(id, name, catalog_source, flagged_closed, closed_date, closed_notes, region:regions(name)),
        cycle:count_cycles(id, name, status)
      `)
      .eq('id', countId)
      .single();

    if (!countData) { navigate('/'); return; }
    setCount(countData);

    if (countData.status === 'not_started') {
      await supabase.from('inventory_counts')
        .update({ status: 'in_progress', started_at: new Date().toISOString() })
        .eq('id', countId);
      countData.status = 'in_progress';
    }

    const { data: lineItems } = await supabase
      .from('count_line_items')
      .select(`
        id, quantity, previous_quantity, item_number_raw,
        description_raw, vendor_raw, not_in_catalog,
        was_edited_after_submit, is_new_item, entered_via_scan,
        item:item_catalog(item_number, description, barcode_1, primary_vendor)
      `)
      .eq('inventory_count_id', countId)
      .order('description_raw');

    setItems(lineItems || []);
    setLoading(false);
  }

  async function updateQty(itemId, newQty) {
    const item = items.find(i => i.id === itemId);
    if (!item) return;
    const oldQty = item.quantity || 0;
    if (newQty === oldQty) return;
    const finalQty = Math.max(0, newQty);

    setItems(prev => prev.map(i => i.id === itemId ? { ...i, quantity: finalQty, _dirty: true } : i));

    const wasSubmitted = count?.status === 'submitted';
    const updates = { quantity: finalQty, updated_by: profile.id };
    if (wasSubmitted) updates.was_edited_after_submit = true;
    await supabase.from('count_line_items').update(updates).eq('id', itemId);

    await supabase.from('count_item_audit').insert({
      line_item_id:       itemId,
      inventory_count_id: countId,
      changed_by:         profile.id,
      old_quantity:       oldQty,
      new_quantity:       finalQty,
      note:               wasSubmitted ? 'Edited after submission' : null,
    });
  }

  function handleQtyInput(itemId, val) {
    const qty = Math.max(0, parseInt(val) || 0);
    setItems(prev => prev.map(i => i.id === itemId ? { ...i, quantity: qty, _dirty: true } : i));
  }

  async function flushQtyInput(itemId) {
    const item = items.find(i => i.id === itemId);
    if (!item || !item._dirty) return;
    await updateQty(itemId, item.quantity);
    setItems(prev => prev.map(i => i.id === itemId ? { ...i, _dirty: false } : i));
  }

  async function saveProgress() {
    setSaving(true);
    const dirty = items.filter(i => i._dirty);
    for (const item of dirty) {
      await updateQty(item.id, item.quantity);
    }
    setItems(prev => prev.map(i => ({ ...i, _dirty: false })));
    toast.success('Progress saved!');
    setSaving(false);
  }

  async function handleFlagClosed() {
    if (!closeForm.reason_category) { toast.error('Please select a reason category for the closure.'); return; }
    if (!closeForm.notes.trim()) { toast.error('Please enter additional notes about the closure.'); return; }
    if (!closeForm.final_count_performed) { toast.error('Please indicate whether a final closing count was performed.'); return; }
    if (!closeForm.inventory_retrieved) { toast.error('Please indicate whether inventory has been retrieved.'); return; }
    setClosing(true);
    const { error } = await supabase.from('accounts').update({
      flagged_closed: true,
      closed_date:    closeForm.date,
      closed_notes:   `${closeForm.notes} | Reason: ${closeForm.reason_category} | Final count performed: ${closeForm.final_count_performed}${closeForm.final_count_date ? ` on ${closeForm.final_count_date}` : ''} | Final count date: ${closeForm.final_count_date || 'N/A'} | Inventory retrieved: ${closeForm.inventory_retrieved}${closeForm.closing_count_eta ? ` | Closing count ETA: ${closeForm.closing_count_eta}` : ''}`,
      closed_by:      profile.id,
      closed_at:      new Date().toISOString(),
      is_active:      false,
    }).eq('id', count.account.id);

    if (error) { toast.error('Error: ' + error.message); setClosing(false); return; }

    await supabase.from('alerts').insert({
      alert_type: 'account_closed',
      message: `Account "${count.account.name}" flagged as closed by ${profile.full_name} on ${closeForm.date}. Reason: ${closeForm.reason_category}. Final count: ${closeForm.final_count_performed}. Inventory retrieved: ${closeForm.inventory_retrieved}. Notes: ${closeForm.notes}`,
      is_read: false,
    });

    await supabase.from('todos').insert({
      title: `Review closed account: ${count.account.name}`,
      description: `Flagged by ${profile.full_name} on ${closeForm.date}. Final count performed: ${closeForm.final_count_performed}${closeForm.final_count_date ? ` on ${closeForm.final_count_date}` : ''}. Notes: ${closeForm.notes}`,
      priority: 'high',
      is_complete: false,
    });

    toast.success(`${count.account.name} flagged as closed. Admin has been notified.`);
    setShowCloseModal(false);
    setCount(prev => ({ ...prev, account: { ...prev.account, flagged_closed: true } }));
    setClosing(false);
  }

  async function handleAddFromSearch(catalogItem) {
    const existing = items.find(i => i.item?.item_number === catalogItem.item_number || i.item_number_raw === catalogItem.item_number);
    if (existing) {
      toast.warning(`"${catalogItem.description}" is already in your count list. Please find it in the list below and update the quantity there.`);
      setAddMode(false);
      setAddSearch('');
      setAddResults([]);
      setSearch(catalogItem.item_number);
      return;
    } else {
      await addLineItem({
        item_catalog_id: catalogItem.id,
        item_number_raw: catalogItem.item_number,
        description_raw: catalogItem.description,
        vendor_raw:      catalogItem.primary_vendor,
        quantity:        1,
        is_new_item:     true,
        not_in_catalog:  false,
        entered_via_scan: false,
      });
      toast.success(`Added: ${catalogItem.description}`);
    }
    setAddSearch('');
    setAddResults([]);
    setAddMode(false);
  }

  async function handleAddNotInCatalog() {
    const desc = addSearch.trim();
    if (!desc) return;
    await addLineItem({
      item_catalog_id: null,
      item_number_raw: null,
      description_raw: desc,
      vendor_raw:      null,
      quantity:        0,
      is_new_item:     true,
      not_in_catalog:  true,
      entered_via_scan: false,
    });
    toast.warning(`Added "${desc}" -- flagged for admin review`);
    setAddSearch('');
    setAddResults([]);
    setAddMode(false);
  }

  async function addLineItem(lineData) {
    const { data } = await supabase
      .from('count_line_items')
      .insert({ ...lineData, inventory_count_id: countId })
      .select(`
        id, quantity, previous_quantity, item_number_raw,
        description_raw, vendor_raw, not_in_catalog,
        was_edited_after_submit, is_new_item, entered_via_scan,
        item:item_catalog(item_number, description, barcode_1, primary_vendor)
      `)
      .single();

    if (data) {
      setItems(prev => [...prev, data].sort((a, b) =>
        (a.description_raw || '').localeCompare(b.description_raw || '')));
      await supabase.from('count_item_audit').insert({
        line_item_id:       data.id,
        inventory_count_id: countId,
        changed_by:         profile.id,
        old_quantity:       0,
        new_quantity:       lineData.quantity || 0,
        note:               'Item added',
      });
    }
  }

  async function handleBarcodeDetected(code) {
    setScanning(false);
    const { data: catalogItem } = await supabase
      .from('item_catalog')
      .select('id, item_number, description, primary_vendor, barcode_1, barcode_2')
      .or(`barcode_1.eq.${code},barcode_2.eq.${code}`)
      .single();

    if (catalogItem) {
      const existing = items.find(i => i.item?.item_number === catalogItem.item_number);
      if (existing) {
        await updateQty(existing.id, (existing.quantity || 0) + 1);
        toast.info(`+1 - ${catalogItem.description}`);
      } else {
        await addLineItem({
          item_catalog_id: catalogItem.id,
          item_number_raw: catalogItem.item_number,
          description_raw: catalogItem.description,
          vendor_raw:      catalogItem.primary_vendor,
          quantity:        1,
          is_new_item:     true,
          not_in_catalog:  false,
          entered_via_scan: true,
        });
        toast.success(`Scanned & added: ${catalogItem.description}`);
      }
    } else {
      toast.warning(`Barcode ${code} not in catalog -- use Add Item`);
      setAddMode(true);
      setAddSearch(code);
    }
  }

  async function handleSubmit() {
    if (!window.confirm(`Submit count for ${count?.account?.name}?\n\nOnce submitted you will not be able to edit without admin approval.`)) return;
    setSubmitting(true);
    await saveProgress();

    await supabase.from('inventory_counts').update({
      status: 'submitted',
      submitted_at: new Date().toISOString(),
    }).eq('id', countId);

    const csvRows = [
      ['Item Number','Description','Vendor','Quantity','Previous Qty','New Item','Not In Catalog','Edited After Submit'],
      ...items.map(i => [
        i.item_number_raw || '',
        i.description_raw || '',
        i.vendor_raw || '',
        i.quantity,
        i.previous_quantity ?? '',
        i.is_new_item ? 'YES' : 'NO',
        i.not_in_catalog ? 'FLAG' : 'NO',
        i.was_edited_after_submit ? 'FLAG' : 'NO',
      ])
    ];
    const csv  = csvRows.map(r => r.map(v => `"${v}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url;
    a.download = `${count?.account?.name?.replace(/[^a-z0-9]/gi,'_')}_${count?.cycle?.name?.replace(/\s/g,'_')}.csv`;
    a.click();
    URL.revokeObjectURL(url);

    toast.success('Count submitted! CSV downloaded.');
    setCount(prev => ({ ...prev, status: 'submitted' }));
    setSubmitting(false);
  }

  const vendors = [...new Set(items.map(i => i.vendor_raw).filter(Boolean))].sort();
  const filtered = items
    .filter(i => !filterVendor || i.vendor_raw === filterVendor)
    .filter(i => !search ||
      i.description_raw?.toLowerCase().includes(search.toLowerCase()) ||
      i.item_number_raw?.toLowerCase().includes(search.toLowerCase()) ||
      i.vendor_raw?.toLowerCase().includes(search.toLowerCase())
    );

  if (loading) return (
    <>
      <NavBar />
      <div className="page"><div className="loading-center"><div className="spinner" /><span>Loading count...</span></div></div>
    </>
  );

  // â”€â”€ LOCKED SCREEN â”€â”€
  const isLocked = count?.status === 'submitted' || count?.status === 'approved';

  if (isLocked) return (
    <>
      <NavBar />
      <div className="page">
        <div className="page-inner">
          <div className="page-header">
            <div>
              <button className="btn btn-utility btn-sm" onClick={() => navigate('/')} style={{ marginBottom: 6 }}>Back</button>
              <div className="page-title">{count?.account?.name}</div>
              <div className="page-sub">
                {count?.account?.region?.name} | {count?.cycle?.name} |
                <span className={`badge badge-${count?.status}`} style={{ marginLeft: 4 }}>
                  {count?.status?.replace('_',' ')}
                </span>
              </div>
            </div>
          </div>
          <div style={{
            textAlign: 'center', padding: '60px 20px',
            background: 'white', borderRadius: 8,
            border: '1px solid var(--gray-mid)',
            boxShadow: '0 2px 8px rgba(0,0,0,0.06)'
          }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>&#128274;</div>
            <div style={{ fontSize: 20, fontWeight: 'bold', marginBottom: 8, color: 'var(--gray-900)' }}>
              Count {count?.status === 'approved' ? 'Approved' : 'Submitted'} - Locked
            </div>
            <div style={{ fontSize: 14, color: 'var(--gray-dark)', maxWidth: 400, margin: '0 auto 24px' }}>
              {count?.status === 'approved'
                ? 'This count has been approved by your administrator and is now locked.'
                : `This count was submitted on ${new Date(count?.submitted_at).toLocaleDateString()} and is locked for review.`
              }
            </div>
            {count?.status === 'submitted' && (
              <div style={{ background: '#f0f8ff', border: '1px solid var(--teal)', borderRadius: 6, padding: '14px 20px', maxWidth: 400, margin: '0 auto', fontSize: 13 }}>
                Need to make changes? Go back to your dashboard and click
                <strong> "Request Edit"</strong> on this account. Your administrator
                will be notified and can approve your request.
              </div>
            )}
            <button className="btn btn-utility" onClick={() => navigate('/')} style={{ marginTop: 24 }}>
              Back to My Counts
            </button>
          </div>
        </div>
      </div>
    </>
  );

  const cycleOpen    = count?.cycle?.status === 'open';
  const canEdit      = cycleOpen;
  const flaggedCount = items.filter(i => i.not_in_catalog || i.was_edited_after_submit).length;
  const isClosed     = count?.account?.flagged_closed;

  return (
    <>
      <NavBar />
      {scanning && <BarcodeScanner onDetected={handleBarcodeDetected} onClose={() => setScanning(false)} />}

      {showCloseModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowCloseModal(false)}>
          <div className="modal">
            <div className="modal-header" style={{ background: 'var(--error)' }}>
              <h3>Flag Account as Closed</h3>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowCloseModal(false)}
                style={{ color: 'white', borderColor: 'rgba(255,255,255,0.3)' }}>X</button>
            </div>
            <div className="modal-body">
              <div style={{ background: '#fff3f3', border: '1px solid var(--error)', borderRadius: 6, padding: 12, marginBottom: 16, fontSize: 13 }}>
                Note: This will mark <strong>{count?.account?.name}</strong> as permanently closed and remove it from future count cycles. Admin will be notified.
              </div>
              <div className="input-group">
                <label className="input-label">Closure Date *</label>
                <input className="input" type="date" value={closeForm.date}
                  onChange={e => setCloseForm(p => ({ ...p, date: e.target.value }))} />
              </div>
              <div className="input-group">
                <label className="input-label">Reason for Closure *</label>
                <select className="select" value={closeForm.reason_category}
                  onChange={e => setCloseForm(p => ({ ...p, reason_category: e.target.value }))}>
                  <option value="">-- Select a reason --</option>
                  <option value="Permanently Closed">Permanently Closed</option>
                  <option value="Relocated">Relocated / Moved to New Address</option>
                  <option value="Lost Contract">Lost Contract</option>
                  <option value="Merged with Another Location">Merged with Another Location</option>
                  <option value="Other">Other</option>
                </select>
              </div>
              <div className="input-group">
                <label className="input-label">Additional Notes *</label>
                <textarea className="input" rows={2} placeholder="Any additional details about this closure..."
                  value={closeForm.notes}
                  onChange={e => setCloseForm(p => ({ ...p, notes: e.target.value }))}
                  style={{ resize: 'vertical' }} />
              </div>
              <div className="input-group">
                <label className="input-label">Has a final closing inventory count been performed? *</label>
                <select className="select" value={closeForm.final_count_performed}
                  onChange={e => setCloseForm(p => ({ ...p, final_count_performed: e.target.value, closing_count_eta: '' }))}>
                  <option value="">-- Select --</option>
                  <option value="Yes">Yes - final count has been completed</option>
                  <option value="No">No - a final count has not been performed</option>
                  <option value="In Progress">In Progress - count is currently underway</option>
                </select>
              </div>
              {closeForm.final_count_performed === 'Yes' && (
                <div className="input-group">
                  <label className="input-label">Date the final closing count was completed</label>
                  <input className="input" type="date" value={closeForm.final_count_date}
                    onChange={e => setCloseForm(p => ({ ...p, final_count_date: e.target.value }))} />
                </div>
              )}
              {closeForm.final_count_performed === 'In Progress' && (
                <div className="input-group">
                  <label className="input-label">Estimated completion date for the closing count *</label>
                  <input className="input" type="date" value={closeForm.closing_count_eta}
                    onChange={e => setCloseForm(p => ({ ...p, closing_count_eta: e.target.value }))} />
                </div>
              )}
              <div className="input-group">
                <label className="input-label">Has all inventory been retrieved or returned from this location? *</label>
                <select className="select" value={closeForm.inventory_retrieved}
                  onChange={e => setCloseForm(p => ({ ...p, inventory_retrieved: e.target.value }))}>
                  <option value="">-- Select --</option>
                  <option value="Yes">Yes - all inventory has been retrieved</option>
                  <option value="No">No - inventory has not yet been retrieved</option>
                  <option value="Partial">Partial - some inventory has been retrieved</option>
                  <option value="N/A">N/A - no inventory on site</option>
                </select>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-utility" onClick={() => setShowCloseModal(false)}>Cancel</button>
              <button className="btn btn-danger" onClick={handleFlagClosed} disabled={closing}>
                {closing ? 'Saving...' : 'Confirm - Flag as Closed'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="page">
        <div className="page-inner">
          <div className="page-header">
            <div>
              <button className="btn btn-utility btn-sm" onClick={() => navigate('/')} style={{ marginBottom: 6 }}>Back</button>
              <div className="page-title">
                {count?.account?.name}
                {isClosed && <span className="badge badge-closed" style={{ marginLeft: 10, fontSize: 13 }}>CLOSED</span>}
              </div>
              <div className="page-sub">
                {count?.account?.region?.name} &nbsp;|&nbsp; {count?.cycle?.name} &nbsp;|&nbsp;
                <span className={`badge badge-${count?.status}`} style={{ marginLeft: 4 }}>
                  {count?.status?.replace('_',' ')}
                </span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {canEdit && <button className="btn btn-secondary" onClick={() => setScanning(true)}>Scan Barcode</button>}
              {canEdit && !isClosed && (
                <button className="btn btn-danger btn-sm" onClick={() => setShowCloseModal(true)}>
                  Flag as Closed
                </button>
              )}
            </div>
          </div>

          {isClosed && (
            <div className="alert-banner" style={{ background: '#fff3f3', borderColor: 'var(--error)', color: 'var(--error)', marginBottom: 16 }}>
              This account was flagged as closed on {count.account.closed_date}.
              {count.account.closed_notes && <> Reason: {count.account.closed_notes}</>}
            </div>
          )}
          {!cycleOpen && <div className="alert-banner warning">The count cycle is closed. Viewing only.</div>}
          {flaggedCount > 0 && (
            <div className="alert-banner warning">
              {flaggedCount} item{flaggedCount > 1 ? 's' : ''} flagged for admin review.
            </div>
          )}

          <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(3,1fr)', marginBottom: 16 }}>
            <div className="stat-card"><div className="stat-val">{items.length}</div><div className="stat-label">Total Items</div></div>
            <div className="stat-card green"><div className="stat-val">{items.reduce((s,i) => s+(i.quantity||0),0)}</div><div className="stat-label">Total Units</div></div>
            <div className="stat-card orange"><div className="stat-val">{flaggedCount}</div><div className="stat-label">Flagged</div></div>
          </div>

          <div className="card" style={{ marginBottom: 80 }}>
            <div className="card-header">
              <span style={{ fontWeight: 'bold' }}>Items ({filtered.length}{filtered.length !== items.length ? ` of ${items.length}` : ''})</span>
            </div>

            <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--gray-mid)', display: 'flex', gap: 8, flexWrap: 'wrap', background: 'var(--gray-light)' }}>
              <input className="input" style={{ flex: 1, minWidth: 180 }}
                placeholder="Search by item #, description, or vendor..."
                value={search} onChange={e => setSearch(e.target.value)} />
              <select className="select" style={{ width: 160 }} value={filterVendor} onChange={e => setFilterVendor(e.target.value)}>
                <option value="">All Vendors</option>
                {vendors.map(v => <option key={v} value={v}>{v}</option>)}
              </select>
              {canEdit && (
                <button className="btn btn-secondary" onClick={() => { setAddMode(m => !m); setAddSearch(''); setAddResults([]); }}>
                  {addMode ? 'Cancel' : '+ Add Item'}
                </button>
              )}
              {(search || filterVendor) && (
                <button className="btn btn-utility btn-sm" onClick={() => { setSearch(''); setFilterVendor(''); }}>Clear</button>
              )}
            </div>

            {addMode && (
              <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--gray-mid)', background: '#f0f8ff' }}>
                <div style={{ fontSize: 12, fontWeight: 'bold', color: 'var(--teal-dark)', marginBottom: 6 }}>
                  ADD ITEM -- type to search catalog (item #, description, or barcode)
                </div>
                <input ref={addSearchRef} className="input"
                  placeholder="Start typing to search..."
                  value={addSearch} onChange={e => setAddSearch(e.target.value)}
                  onKeyDown={e => e.key === 'Escape' && setAddMode(false)}
                  style={{ marginBottom: 8 }} />
                {addSearching && <div style={{ fontSize: 12, color: 'var(--gray-dark)' }}>Searching...</div>}
                {addResults.length > 0 && (
                  <div style={{ border: '1px solid var(--gray-mid)', borderRadius: 4, maxHeight: 220, overflowY: 'auto', background: 'white' }}>
                    {addResults.map(r => (
                      <div key={r.id} onClick={() => handleAddFromSearch(r)}
                        style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid var(--gray-mid)', fontSize: 13 }}
                        onMouseEnter={e => e.currentTarget.style.background = '#e8f4fa'}
                        onMouseLeave={e => e.currentTarget.style.background = 'white'}>
                        <div style={{ fontWeight: 'bold' }}>{r.description}</div>
                        <div style={{ fontSize: 11, color: 'var(--gray-dark)' }}>
                          #{r.item_number} &nbsp;|&nbsp; {r.primary_vendor || '--'} &nbsp;|&nbsp; HCPCS: {r.hcpcs_code || '--'}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {addSearch.length >= 2 && !addSearching && addResults.length === 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', fontSize: 13, color: 'var(--gray-dark)' }}>
                    No catalog matches for "{addSearch}".
                    <button className="btn btn-utility btn-sm" onClick={handleAddNotInCatalog}>
                      Add "{addSearch}" as unlisted item (flagged)
                    </button>
                  </div>
                )}
              </div>
            )}

            <div style={{ overflowX: 'auto' }}>
              <div style={{ overflowY: 'auto', maxHeight: '540px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
                    <tr>
                      <th style={{ background: 'var(--teal-dark)', color: 'white', padding: '9px 12px', textAlign: 'left', fontSize: 12, fontWeight: 'bold', whiteSpace: 'nowrap', width: '16%' }}>Item #</th>
                      <th style={{ background: 'var(--teal-dark)', color: 'white', padding: '9px 12px', textAlign: 'left', fontSize: 12, fontWeight: 'bold' }}>Description</th>
                      <th style={{ background: 'var(--teal-dark)', color: 'white', padding: '9px 12px', textAlign: 'left', fontSize: 12, fontWeight: 'bold', whiteSpace: 'nowrap', width: '14%' }}>Vendor</th>
                      <th style={{ background: 'var(--teal-dark)', color: 'white', padding: '9px 12px', textAlign: 'center', fontSize: 12, fontWeight: 'bold', whiteSpace: 'nowrap', width: '8%' }}>Prev Qty</th>
                      <th style={{ background: 'var(--teal-dark)', color: 'white', padding: '9px 12px', textAlign: 'center', fontSize: 12, fontWeight: 'bold', width: '16%' }}>Count</th>
                      <th style={{ background: 'var(--teal-dark)', color: 'white', padding: '9px 12px', textAlign: 'center', fontSize: 12, fontWeight: 'bold', width: '6%' }}>Flags</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.length === 0 ? (
                      <tr><td colSpan={6} className="table-empty">
                        {items.length === 0 ? 'No items yet. Use + Add Item or scan a barcode to begin.' : 'No items match your search.'}
                      </td></tr>
                    ) : filtered.map((item, idx) => (
                      <tr key={item.id} style={{
                        background: item.not_in_catalog ? '#fff8ec' : item.was_edited_after_submit ? '#fdf0ef' : idx % 2 === 0 ? 'white' : 'var(--gray-light)',
                        borderBottom: '1px solid var(--gray-mid)',
                      }}>
                        <td style={{ padding: '7px 12px', fontFamily: 'monospace', fontWeight: 'bold', fontSize: 13, color: 'var(--teal-dark)' }}>{item.item_number_raw || '--'}</td>
                        <td style={{ padding: '7px 12px' }}>
                          <div style={{ fontSize: 13 }}>{item.description_raw}</div>
                          {item.is_new_item && <span style={{ fontSize: 10, color: 'var(--teal)', fontWeight: 'bold' }}>NEW</span>}
                        </td>
                        <td style={{ padding: '7px 12px', fontSize: 12, color: 'var(--gray-dark)' }}>{item.vendor_raw || '--'}</td>
                        <td style={{ padding: '7px 12px', textAlign: 'center', color: 'var(--gray-dark)', fontSize: 13 }}>{item.previous_quantity ?? '--'}</td>
                        <td style={{ padding: '7px 12px', textAlign: 'center' }}>
                          {canEdit ? (
                            <div className="qty-control" style={{ justifyContent: 'center' }}>
                              <button className="qty-btn" onClick={() => updateQty(item.id, (item.quantity||0) - 1)}>-</button>
                              <input className="qty-val" type="number" min="0"
                                value={item.quantity || 0}
                                onChange={e => handleQtyInput(item.id, e.target.value)}
                                onBlur={() => flushQtyInput(item.id)} />
                              <button className="qty-btn" onClick={() => updateQty(item.id, (item.quantity||0) + 1)}>+</button>
                            </div>
                          ) : <strong>{item.quantity}</strong>}
                        </td>
                        <td style={{ padding: '7px 12px', textAlign: 'center', fontSize: 16 }}>
                          {item.not_in_catalog && <span title="Not in catalog">[!]</span>}
                          {item.was_edited_after_submit && <span title="Edited after submission">[edited]</span>}
                          {item.entered_via_scan && <span title="Scanned" style={{ opacity: 0.5 }}>[scan]</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {canEdit && (
            <div style={{
              position: 'fixed', bottom: 0, left: 0, right: 0,
              background: 'white', borderTop: '2px solid var(--gray-mid)',
              padding: '12px 16px', display: 'flex', gap: 12,
              justifyContent: 'flex-end', alignItems: 'center',
              boxShadow: '0 -2px 8px rgba(0,0,0,0.1)', zIndex: 100,
            }}>
              <span style={{ color: 'var(--gray-dark)', fontSize: 13, marginRight: 'auto' }}>
                {items.filter(i => i._dirty).length > 0 && '* Unsaved changes'}
              </span>
              <button className="btn btn-utility" onClick={saveProgress} disabled={saving}>
                {saving ? 'Saving...' : 'Save Progress'}
              </button>
              <button className="btn btn-primary btn-lg" onClick={handleSubmit}
                disabled={submitting || items.length === 0}>
                {submitting ? 'Submitting...' : 'Submit Count'}
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

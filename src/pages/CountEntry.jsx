import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../components/AuthContext';
import { useToast } from '../components/ToastContext';
import NavBar from '../components/NavBar';
import BarcodeScanner from '../components/BarcodeScanner';
import AddItemModal from '../components/AddItemModal';

export default function CountEntry() {
  const { countId } = useParams();
  const { profile } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();

  const [count, setCount]         = useState(null);
  const [items, setItems]         = useState([]);
  const [loading, setLoading]     = useState(true);
  const [saving, setSaving]       = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [scanning, setScanning]   = useState(false);
  const [addingItem, setAddingItem] = useState(false);
  const [scannedCode, setScannedCode] = useState(null);

  useEffect(() => { loadCount(); }, [countId]);

  async function loadCount() {
    setLoading(true);
    const { data: countData } = await supabase
      .from('inventory_counts')
      .select(`
        id, status, cycle_id, started_at, submitted_at,
        account:accounts(id, name, region:regions(name)),
        cycle:count_cycles(id, name, status)
      `)
      .eq('id', countId)
      .single();

    if (!countData) { navigate('/'); return; }
    setCount(countData);

    // If not started yet, mark as in_progress
    if (countData.status === 'not_started') {
      await supabase.from('inventory_counts')
        .update({ status: 'in_progress', started_at: new Date().toISOString() })
        .eq('id', countId);
      countData.status = 'in_progress';
    }

    // Load line items
    const { data: lineItems } = await supabase
      .from('count_line_items')
      .select(`
        id, quantity, previous_quantity, item_number_raw,
        description_raw, vendor_raw, not_in_catalog,
        was_edited_after_submit, is_new_item, entered_via_scan,
        item:item_catalog(item_number, description, barcode_1, barcode_2, primary_vendor)
      `)
      .eq('inventory_count_id', countId)
      .order('description_raw');

    setItems(lineItems || []);
    setLoading(false);
  }

  function updateQty(itemId, delta) {
    setItems(prev => prev.map(item => {
      if (item.id !== itemId) return item;
      const newQty = Math.max(0, (item.quantity || 0) + delta);
      return { ...item, quantity: newQty, _dirty: true };
    }));
  }

  function setQty(itemId, val) {
    const qty = Math.max(0, parseInt(val) || 0);
    setItems(prev => prev.map(item =>
      item.id !== itemId ? item : { ...item, quantity: qty, _dirty: true }
    ));
  }

  async function saveProgress() {
    setSaving(true);
    const dirty = items.filter(i => i._dirty);
    const wasSubmitted = count?.status === 'submitted';

    for (const item of dirty) {
      const updates = { quantity: item.quantity, updated_by: profile.id };
      if (wasSubmitted) updates.was_edited_after_submit = true;
      await supabase.from('count_line_items').update(updates).eq('id', item.id);

      // Log edit if post-submit
      if (wasSubmitted) {
        await supabase.from('count_edit_log').insert({
          line_item_id: item.id,
          inventory_count_id: countId,
          edited_by: profile.id,
          old_quantity: item.previous_quantity ?? 0,
          new_quantity: item.quantity,
        });
      }
    }

    setItems(prev => prev.map(i => ({ ...i, _dirty: false })));
    toast.success('Progress saved!');
    setSaving(false);
  }

  async function handleBarcodeDetected(code) {
    setScanning(false);
    setScannedCode(code);

    // Look up item in catalog
    const { data: catalogItem } = await supabase
      .from('item_catalog')
      .select('id, item_number, description, primary_vendor, barcode_1, barcode_2')
      .or(`barcode_1.eq.${code},barcode_2.eq.${code}`)
      .single();

    if (catalogItem) {
      // Check if already in count
      const existing = items.find(i => i.item?.item_number === catalogItem.item_number);
      if (existing) {
        updateQty(existing.id, 1);
        toast.info(`+1 → ${catalogItem.description}`);
      } else {
        // Add new line item
        await addLineItem({
          item_catalog_id: catalogItem.id,
          item_number_raw: catalogItem.item_number,
          description_raw: catalogItem.description,
          vendor_raw: catalogItem.primary_vendor,
          quantity: 1,
          entered_via_scan: true,
          not_in_catalog: false,
          is_new_item: true,
        });
        toast.success(`Added: ${catalogItem.description}`);
      }
    } else {
      toast.warning(`Barcode ${code} not found in catalog — add manually`);
      setAddingItem(true);
    }
    setScannedCode(null);
  }

  async function addLineItem(lineData) {
    const { data } = await supabase
      .from('count_line_items')
      .insert({ ...lineData, inventory_count_id: countId })
      .select(`
        id, quantity, previous_quantity, item_number_raw,
        description_raw, vendor_raw, not_in_catalog,
        was_edited_after_submit, is_new_item, entered_via_scan,
        item:item_catalog(item_number, description, barcode_1, barcode_2, primary_vendor)
      `)
      .single();

    if (data) setItems(prev => [...prev, data].sort((a,b) =>
      a.description_raw?.localeCompare(b.description_raw)));
  }

  async function handleSubmit() {
    if (!window.confirm(`Submit count for ${count?.account?.name}?\n\nA CSV will be emailed to you and the admin. You can still edit after submitting.`)) return;

    setSubmitting(true);
    await saveProgress();

    await supabase.from('inventory_counts').update({
      status: 'submitted',
      submitted_at: new Date().toISOString(),
    }).eq('id', countId);

    // Build CSV and trigger email via Supabase Edge Function (if configured)
    // For now we save locally and show download
    const csvRows = [
      ['Item Number', 'Description', 'Vendor', 'Quantity', 'Previous Qty', 'New Item', 'Not In Catalog', 'Edited After Submit'],
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
    const csv = csvRows.map(r => r.map(v => `"${v}"`).join(',')).join('\n');
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

  if (loading) return (
    <>
      <NavBar />
      <div className="page"><div className="loading-center"><div className="spinner" /><span>Loading count...</span></div></div>
    </>
  );

  const cycleOpen = count?.cycle?.status === 'open';
  const canEdit   = cycleOpen;
  const flaggedCount = items.filter(i => i.not_in_catalog || i.was_edited_after_submit).length;

  return (
    <>
      <NavBar />
      {scanning && (
        <BarcodeScanner
          onDetected={handleBarcodeDetected}
          onClose={() => setScanning(false)}
        />
      )}
      {addingItem && (
        <AddItemModal
          countId={countId}
          prefillBarcode={scannedCode}
          onAdd={item => { addLineItem(item); setAddingItem(false); }}
          onClose={() => setAddingItem(false)}
        />
      )}

      <div className="page">
        <div className="page-inner">
          {/* Header */}
          <div className="page-header">
            <div>
              <button className="btn btn-utility btn-sm" onClick={() => navigate('/')}
                style={{ marginBottom: '6px' }}>← Back</button>
              <div className="page-title">{count?.account?.name}</div>
              <div className="page-sub">
                {count?.account?.region?.name} &nbsp;·&nbsp; {count?.cycle?.name} &nbsp;·&nbsp;
                <span className={`badge badge-${count?.status}`} style={{ marginLeft: 4 }}>
                  {count?.status?.replace('_', ' ')}
                </span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {canEdit && (
                <button className="btn btn-secondary" onClick={() => setScanning(true)}>
                  📷 Scan Barcode
                </button>
              )}
              {canEdit && (
                <button className="btn btn-utility" onClick={() => setAddingItem(true)}>
                  + Add Item
                </button>
              )}
              {canEdit && (
                <button className="btn btn-utility" onClick={saveProgress} disabled={saving}>
                  {saving ? 'Saving...' : '💾 Save'}
                </button>
              )}
            </div>
          </div>

          {!cycleOpen && (
            <div className="alert-banner warning">
              ⚠ The count cycle is closed. Viewing only — edits are disabled.
            </div>
          )}

          {flaggedCount > 0 && (
            <div className="alert-banner warning">
              ⚠ {flaggedCount} item{flaggedCount > 1 ? 's' : ''} flagged for admin review
              (not in catalog or edited after submission).
            </div>
          )}

          {/* Stats row */}
          <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(3,1fr)', marginBottom: 16 }}>
            <div className="stat-card">
              <div className="stat-val">{items.length}</div>
              <div className="stat-label">Total Items</div>
            </div>
            <div className="stat-card green">
              <div className="stat-val">{items.reduce((s,i) => s + (i.quantity||0), 0)}</div>
              <div className="stat-label">Total Units</div>
            </div>
            <div className="stat-card orange">
              <div className="stat-val">{flaggedCount}</div>
              <div className="stat-label">Flagged Items</div>
            </div>
          </div>

          {/* Line items table */}
          <div className="card" style={{ marginBottom: 80 }}>
            <div className="card-header">
              <span style={{ fontWeight: 'bold', fontSize: 14 }}>
                Items ({items.length})
              </span>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Item # </th>
                    <th>Description</th>
                    <th>Vendor</th>
                    <th style={{ textAlign: 'center' }}>Prev Qty</th>
                    <th style={{ textAlign: 'center' }}>Count</th>
                    <th style={{ textAlign: 'center' }}>Flags</th>
                  </tr>
                </thead>
                <tbody>
                  {items.length === 0 ? (
                    <tr><td colSpan={6} className="table-empty">
                      No items yet. Use + Add Item or 📷 Scan Barcode to begin.
                    </td></tr>
                  ) : items.map(item => (
                    <tr key={item.id} onClick={e => e.stopPropagation()}
                      style={{ background: item.not_in_catalog ? '#fff8ec' : item.was_edited_after_submit ? '#fdf0ef' : undefined }}>
                      <td style={{ fontSize: 12, color: 'var(--gray-dark)' }}>
                        {item.item_number_raw || '—'}
                      </td>
                      <td>
                        <div style={{ fontWeight: 'bold', fontSize: 13 }}>{item.description_raw}</div>
                        {item.is_new_item && <span style={{ fontSize: 11, color: 'var(--teal)' }}>NEW</span>}
                      </td>
                      <td style={{ fontSize: 12, color: 'var(--gray-dark)' }}>{item.vendor_raw || '—'}</td>
                      <td style={{ textAlign: 'center', color: 'var(--gray-dark)' }}>
                        {item.previous_quantity ?? '—'}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        {canEdit ? (
                          <div className="qty-control">
                            <button className="qty-btn" onClick={() => updateQty(item.id, -1)}>−</button>
                            <input
                              className="qty-val"
                              type="number" min="0"
                              value={item.quantity || 0}
                              onChange={e => setQty(item.id, e.target.value)}
                            />
                            <button className="qty-btn" onClick={() => updateQty(item.id, 1)}>+</button>
                          </div>
                        ) : (
                          <strong>{item.quantity}</strong>
                        )}
                      </td>
                      <td style={{ textAlign: 'center', fontSize: 18 }}>
                        {item.not_in_catalog && <span title="Not in catalog">⚠</span>}
                        {item.was_edited_after_submit && <span title="Edited after submission">✏️</span>}
                        {item.entered_via_scan && <span title="Scanned" style={{ opacity: 0.5 }}>📷</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Sticky submit bar */}
          {canEdit && (
            <div style={{
              position: 'fixed', bottom: 0, left: 0, right: 0,
              background: 'white', borderTop: '2px solid var(--gray-mid)',
              padding: '12px 16px', display: 'flex', gap: '12px',
              justifyContent: 'flex-end', alignItems: 'center',
              boxShadow: '0 -2px 8px rgba(0,0,0,0.1)', zIndex: 100,
            }}>
              <span style={{ color: 'var(--gray-dark)', fontSize: 13, marginRight: 'auto' }}>
                {items.filter(i => i._dirty).length > 0 && '● Unsaved changes'}
              </span>
              <button className="btn btn-utility" onClick={saveProgress} disabled={saving}>
                {saving ? 'Saving...' : '💾 Save Progress'}
              </button>
              <button
                className="btn btn-primary btn-lg"
                onClick={handleSubmit}
                disabled={submitting || items.length === 0}
              >
                {submitting ? 'Submitting...' : '✓ Submit Count'}
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

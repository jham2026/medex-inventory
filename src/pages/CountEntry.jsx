import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../components/AuthContext';
import { useToast } from '../components/ToastContext';

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
  const [search, setSearch]       = useState('');
  const [catalogResults, setCatalogResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [showClosureModal, setShowClosureModal] = useState(false);
  const [closureForm, setClosureForm] = useState({ reason: '', notes: '', last_count_date: '', final_count_performed: '', inventory_retrieved: '' });
  const searchTimer = useRef(null);
  const scanInputRef = useRef(null);
  const [scanMode, setScanMode] = useState(false);
  const [scanInput, setScanInput] = useState('');
  const [scanResult, setScanResult] = useState(null);
  const [scanQty, setScanQty] = useState(1);

  useEffect(() => { loadCount(); }, [countId]);

  useEffect(() => {
    if (search.length >= 2) {
      clearTimeout(searchTimer.current);
      searchTimer.current = setTimeout(() => searchCatalog(search), 300);
    } else {
      setCatalogResults([]);
    }
    return () => clearTimeout(searchTimer.current);
  }, [search]);

  async function loadCount() {
    setLoading(true);
    const { data: countData } = await supabase
      .from('inventory_counts')
      .select('id, status, submitted_at, rep_id, closure_reason, closure_notes, account:accounts(id, name, catalog_source, region:regions(name)), cycle:count_cycles(name)')
      .eq('id', countId).single();
    setCount(countData);

    if (countData) {
      const { data: lineItems } = await supabase
        .from('count_line_items')
        .select('*')
        .eq('inventory_count_id', countId)
        .order('item_number_raw');
      setItems(lineItems || []);
    }
    setLoading(false);
  }

  async function searchCatalog(query) {
    if (!query || query.length < 2) { setCatalogResults([]); return; }
    setSearching(true);
    const catalog = count?.account?.catalog_source || 'edge';
    const { data } = await supabase
      .from('item_catalog')
      .select('id, item_number, description, primary_vendor, catalog_source')
      .eq('catalog_source', catalog)
      .or('item_number.ilike.%' + query + '%,description.ilike.%' + query + '%,primary_vendor.ilike.%' + query + '%')
      .limit(10);
    // Only show catalog results for items NOT already in the prepopulated list
    const existingNums = new Set(items.map(i => i.item_number_raw?.toLowerCase()));
    const filtered = (data || []).filter(r => !existingNums.has(r.item_number?.toLowerCase()));
    setCatalogResults(filtered);
    setSearching(false);
  }

  async function updateQty(itemId, newQty) {
    const qty = Math.max(0, parseInt(newQty) || 0);
    setItems(prev => prev.map(i => i.id === itemId ? { ...i, quantity: qty } : i));
    await supabase.from('count_line_items').update({ quantity: qty, updated_by: profile?.id }).eq('id', itemId);
  }

  async function addCatalogItem(catalogItem) {
    const exists = items.find(i => i.item_number_raw?.toLowerCase() === catalogItem.item_number?.toLowerCase());
    if (exists) { toast.info('Item already in count list.'); setCatalogResults([]); setSearch(''); return; }
    const { data: newItem } = await supabase.from('count_line_items').insert({
      inventory_count_id: countId,
      item_catalog_id: catalogItem.id,
      item_number_raw: catalogItem.item_number,
      description_raw: catalogItem.description,
      vendor_raw: catalogItem.primary_vendor,
      quantity: 0,
      is_new_item: true,
      not_in_catalog: false,
    }).select().single();
    if (newItem) {
      setItems(prev => [...prev, newItem].sort((a,b) => a.item_number_raw?.localeCompare(b.item_number_raw)));
      setCatalogResults([]);
      setSearch('');
      toast.success('Item added!');
    }
  }

  async function addCustomItem(query) {
    const { data: newItem } = await supabase.from('count_line_items').insert({
      inventory_count_id: countId,
      item_number_raw: query.trim(),
      description_raw: query.trim(),
      quantity: 0,
      is_new_item: true,
      not_in_catalog: true,
    }).select().single();
    if (newItem) {
      setItems(prev => [...prev, newItem]);
      setCatalogResults([]);
      setSearch('');
      toast.success('Custom item added!');
    }
  }

  async function handleScanInput(barcode) {
    if (!barcode.trim()) return;
    const catalog = count?.account?.catalog_source || 'edge';
    const { data } = await supabase
      .from('item_catalog')
      .select('*')
      .eq('catalog_source', catalog)
      .or('item_number.eq.' + barcode + ',upc.eq.' + barcode)
      .single();
    if (data) {
      setScanResult(data);
      setScanQty(1);
    } else {
      toast.error('Item not found in catalog: ' + barcode);
      setScanInput('');
    }
  }

  async function confirmScanItem() {
    if (!scanResult) return;
    const existing = items.find(i => i.item_number_raw === scanResult.item_number);
    if (existing) {
      const newQty = (existing.quantity || 0) + scanQty;
      await updateQty(existing.id, newQty);
      toast.success('Updated qty for ' + scanResult.item_number + ' to ' + newQty);
    } else {
      const { data: newItem } = await supabase.from('count_line_items').insert({
        inventory_count_id: countId,
        item_catalog_id: scanResult.id,
        item_number_raw: scanResult.item_number,
        description_raw: scanResult.description,
        vendor_raw: scanResult.primary_vendor,
        quantity: scanQty,
        is_new_item: true,
        not_in_catalog: false,
        entered_via_scan: true,
      }).select().single();
      if (newItem) setItems(prev => [...prev, newItem]);
      toast.success('Added ' + scanResult.item_number);
    }
    setScanResult(null);
    setScanInput('');
    if (scanInputRef.current) scanInputRef.current.focus();
  }

  async function saveProgress() {
    setSaving(true);
    await supabase.from('inventory_counts').update({ status: 'in_progress' }).eq('id', countId);
    toast.success('Progress saved!');
    setSaving(false);
  }

  async function submitCount() {
    setSubmitting(true);
    setShowSubmitModal(false);
    await supabase.from('inventory_counts').update({
      status: 'submitted',
      submitted_at: new Date().toISOString(),
    }).eq('id', countId);
    await supabase.from('alerts').insert({
      alert_type: 'count_submitted',
      message: (profile?.full_name || 'A rep') + ' submitted count for ' + count?.account?.name,
      is_read: false,
    });
    await supabase.from('todos').insert({
      title: 'Count to approve: ' + count?.account?.name,
      description: 'Rep ' + (profile?.full_name || '') + ' submitted count for ' + count?.account?.name + ' on ' + new Date().toLocaleDateString(),
      priority: 'normal',
      todo_type: 'count_approval',
      account_id: count?.account?.id,
      count_id: countId,
      is_complete: false,
    });
    toast.success('Count submitted successfully!');
    navigate('/');
    setSubmitting(false);
  }

  async function flagForClosure() {
    if (!closureForm.reason) { toast.error('Please select a reason for closure.'); return; }
    await supabase.from('inventory_counts').update({
      closure_reason: closureForm.reason,
      closure_notes: closureForm.notes,
      closure_flagged_at: new Date().toISOString(),
    }).eq('id', countId);
    await supabase.from('todos').insert({
      title: 'Account flagged for closure: ' + count?.account?.name,
      description: 'Rep ' + (profile?.full_name || '') + ' flagged ' + count?.account?.name + ' for closure. Reason: ' + closureForm.reason,
      priority: 'high',
      todo_type: 'account_closure',
      account_id: count?.account?.id,
      count_id: countId,
      is_complete: false,
      metadata: JSON.stringify(closureForm),
    });
    await supabase.from('alerts').insert({
      alert_type: 'account_closure_flagged',
      message: count?.account?.name + ' has been flagged for closure by ' + (profile?.full_name || 'a rep'),
      is_read: false,
    });
    setShowClosureModal(false);
    toast.success('Account flagged for closure. Admin has been notified.');
  }

  const filteredItems = items.filter(item => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      item.item_number_raw?.toLowerCase().includes(s) ||
      item.description_raw?.toLowerCase().includes(s) ||
      item.vendor_raw?.toLowerCase().includes(s)
    );
  });

  const searchMatchesExisting = search.length >= 2 && filteredItems.length > 0;
  const showAddFromCatalog = search.length >= 2 && catalogResults.length > 0;
  const showAddCustom = search.length >= 2 && catalogResults.length === 0 && !searching && !searchMatchesExisting;

  const totalItems = items.length;
  const totalUnits = items.reduce((sum, i) => sum + (i.quantity || 0), 0);
  const flagged = items.filter(i => i.not_in_catalog).length;

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#F7F9FB' }}>
      <div className="loading-center"><div className="spinner" /><span>Loading...</span></div>
    </div>
  );

  // Locked screen
  if (count?.status === 'submitted' || count?.status === 'approved') {
    return (
      <div style={{ background: '#F7F9FB', minHeight: '100vh', maxWidth: 430, margin: '0 auto', borderLeft: '1px solid #E1E8EE', borderRight: '1px solid #E1E8EE' }}>
        <div style={{ background: '#003f63', padding: '14px 18px', color: 'white', borderBottom: '3px solid #EEAF24' }}>
          <div onClick={() => navigate('/')} style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginBottom: 6, cursor: 'pointer' }}>
            &lsaquo; Back to Accounts
          </div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>{count.account?.name}</div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 3 }}>{count.account?.region?.name} &middot; {count.cycle?.name}</div>
        </div>
        <div style={{ padding: 32, textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>&#128274;</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#1A2B38', marginBottom: 8 }}>
            Count {count.status === 'approved' ? 'Approved' : 'Submitted'}
          </div>
          <div style={{ fontSize: 14, color: '#7A909F', marginBottom: 24, lineHeight: 1.6 }}>
            {count.status === 'approved'
              ? 'This count has been approved and is locked.'
              : 'This count has been submitted. To make changes, use the Request Edit button on your dashboard.'}
          </div>
          <button onClick={() => navigate('/')} style={{ background: '#0076BB', color: 'white', border: 'none', borderRadius: 8, padding: '12px 24px', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
            Back to Accounts
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ background: '#F7F9FB', height: '100vh', maxWidth: 430, margin: '0 auto', display: 'flex', flexDirection: 'column', borderLeft: '1px solid #E1E8EE', borderRight: '1px solid #E1E8EE', overflow: 'hidden' }}>

      {/* Top bar */}
      <div style={{ background: '#003f63', padding: '14px 18px', color: 'white', borderBottom: '3px solid #EEAF24', flexShrink: 0 }}>
        <div onClick={() => navigate('/')} style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginBottom: 6, cursor: 'pointer' }}>
          &lsaquo; Back to Accounts
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-0.3px' }}>{count?.account?.name}</div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 3 }}>
              {count?.account?.region?.name} &middot; {count?.cycle?.name}
              <span style={{ marginLeft: 8, background: 'rgba(238,175,36,0.2)', color: '#EEAF24', fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 10 }}>In Progress</span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={() => setScanMode(!scanMode)}
              style={{ background: scanMode ? '#EEAF24' : 'rgba(255,255,255,0.1)', color: scanMode ? '#1A2B38' : 'white', border: 'none', borderRadius: 6, padding: '5px 10px', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
              {scanMode ? 'Exit Scan' : 'Scan'}
            </button>
            <button onClick={() => setShowClosureModal(true)}
              style={{ background: 'rgba(239,68,68,0.15)', color: '#fca5a5', border: 'none', borderRadius: 6, padding: '5px 10px', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
              Flag Closure
            </button>
          </div>
        </div>
      </div>

      {/* Scan mode */}
      {scanMode && (
        <div style={{ background: '#1A2B38', padding: '14px', borderBottom: '1px solid #E1E8EE', flexShrink: 0 }}>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginBottom: 8, textAlign: 'center', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Scan Mode Active</div>
          <input
            ref={scanInputRef}
            autoFocus
            value={scanInput}
            onChange={e => setScanInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { handleScanInput(scanInput); } }}
            placeholder="Scan barcode or type item number..."
            style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '2px solid #EEAF24', background: '#0d1b24', color: 'white', fontSize: 14, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }}
          />
          {scanResult && (
            <div style={{ marginTop: 10, background: 'white', borderRadius: 8, padding: 12 }}>
              <div style={{ fontSize: 12, color: '#7A909F', marginBottom: 4 }}>Found:</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#1A2B38' }}>{scanResult.description}</div>
              <div style={{ fontSize: 11, color: '#7A909F', marginBottom: 10 }}>{scanResult.item_number} &middot; {scanResult.primary_vendor}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ fontSize: 13, color: '#3D5466' }}>Qty:</div>
                <div style={{ display: 'flex', alignItems: 'center', border: '1.5px solid #E1E8EE', borderRadius: 8, overflow: 'hidden' }}>
                  <button onClick={() => setScanQty(q => Math.max(1, q-1))} style={{ width: 32, height: 34, border: 'none', background: '#F2F5F8', fontSize: 18, cursor: 'pointer', fontFamily: 'inherit' }}>-</button>
                  <input type="number" value={scanQty} onChange={e => setScanQty(Math.max(1, parseInt(e.target.value)||1))}
                    style={{ width: 48, height: 34, border: 'none', borderLeft: '1.5px solid #E1E8EE', borderRight: '1.5px solid #E1E8EE', textAlign: 'center', fontSize: 14, fontWeight: 700, fontFamily: 'inherit', outline: 'none' }} />
                  <button onClick={() => setScanQty(q => q+1)} style={{ width: 32, height: 34, border: 'none', background: '#F2F5F8', fontSize: 18, cursor: 'pointer', fontFamily: 'inherit' }}>+</button>
                </div>
                <button onClick={confirmScanItem} style={{ flex: 1, padding: '8px', background: '#0076BB', color: 'white', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                  Confirm + Scan Next
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Stats bar */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', background: '#E1E8EE', gap: 1, borderBottom: '1px solid #E1E8EE', flexShrink: 0 }}>
        {[
          { n: totalItems, l: 'Items' },
          { n: totalUnits, l: 'Units', color: '#0076BB' },
          { n: flagged,    l: 'Flagged', color: '#c88e0f' },
        ].map((s, i) => (
          <div key={i} style={{ background: 'white', padding: '12px 14px', textAlign: 'center' }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: s.color || '#1A2B38', letterSpacing: '-0.5px' }}>{s.n}</div>
            <div style={{ fontSize: 10, color: '#7A909F', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600, marginTop: 1 }}>{s.l}</div>
          </div>
        ))}
      </div>

      {/* Search bar */}
      {!scanMode && (
        <div style={{ background: 'white', padding: '10px 14px', borderBottom: '1px solid #E1E8EE', flexShrink: 0 }}>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search item #, description, vendor..."
            style={{ width: '100%', background: '#F2F5F8', border: '1.5px solid #E1E8EE', borderRadius: 8, padding: '9px 12px', fontSize: 13, fontFamily: 'inherit', outline: 'none', color: '#1A2B38', boxSizing: 'border-box' }}
            onFocus={e => e.target.style.borderColor = '#0076BB'}
            onBlur={e => e.target.style.borderColor = '#E1E8EE'}
          />
          {/* Catalog results - only shown when search doesn't match existing items */}
          {showAddFromCatalog && !searchMatchesExisting && (
            <div style={{ marginTop: 8, border: '1px solid #E1E8EE', borderRadius: 8, overflow: 'hidden' }}>
              <div style={{ padding: '6px 12px', background: '#F2F5F8', fontSize: 11, color: '#7A909F', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Add from Catalog
              </div>
              {catalogResults.map(r => (
                <div key={r.id} onClick={() => addCatalogItem(r)}
                  style={{ padding: '8px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, borderTop: '1px solid #E1E8EE', background: 'white' }}
                  onMouseEnter={e => e.currentTarget.style.background = '#e8f4fb'}
                  onMouseLeave={e => e.currentTarget.style.background = 'white'}>
                  <div style={{ fontSize: 10, fontFamily: 'monospace', color: '#0076BB', background: '#e8f4fb', padding: '2px 6px', borderRadius: 4, flexShrink: 0, fontWeight: 700 }}>{r.item_number}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, color: '#1A2B38', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.description}</div>
                    <div style={{ fontSize: 11, color: '#7A909F' }}>{r.primary_vendor}</div>
                  </div>
                  <div style={{ fontSize: 11, color: '#0076BB', fontWeight: 600, flexShrink: 0 }}>+ Add</div>
                </div>
              ))}
            </div>
          )}
          {/* Custom item - only shown when nothing found in catalog or existing */}
          {showAddCustom && (
            <div onClick={() => addCustomItem(search)}
              style={{ marginTop: 8, padding: '10px 12px', background: '#fef8eb', border: '1px solid #EEAF24', borderRadius: 8, cursor: 'pointer', fontSize: 13, color: '#c88e0f', fontWeight: 600 }}>
              + Add "{search}" as custom item (not in catalog)
            </div>
          )}
          {searching && <div style={{ marginTop: 6, fontSize: 12, color: '#7A909F', padding: '0 4px' }}>Searching catalog...</div>}
        </div>
      )}

      {/* Item list */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {filteredItems.length === 0 && !search ? (
          <div style={{ textAlign: 'center', padding: '40px 20px', color: '#7A909F', fontSize: 14 }}>
            No items yet. Search above to add items.
          </div>
        ) : filteredItems.length === 0 && search ? (
          <div style={{ textAlign: 'center', padding: '20px', color: '#7A909F', fontSize: 13 }}>
            No existing items match "{search}" — check the catalog results above.
          </div>
        ) : filteredItems.map(item => (
          <div key={item.id} style={{
            background: item.not_in_catalog ? '#fef8eb' : 'white',
            borderBottom: '1px solid #E1E8EE',
            padding: '12px 14px',
            display: 'flex', alignItems: 'center', gap: 10,
          }}>
            <div style={{
              fontSize: 10.5, fontFamily: 'Courier New, monospace',
              color: item.not_in_catalog ? '#c88e0f' : '#0076BB',
              background: item.not_in_catalog ? 'rgba(238,175,36,0.15)' : '#e8f4fb',
              padding: '3px 8px', borderRadius: 5,
              whiteSpace: 'nowrap', flexShrink: 0,
              minWidth: 76, textAlign: 'center', fontWeight: 700,
            }}>
              {item.item_number_raw}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: '#1A2B38', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.description_raw}</div>
              <div style={{ fontSize: 11, color: '#7A909F', marginTop: 1 }}>
                {item.vendor_raw}
                {item.previous_quantity != null && (
                  <span style={{ marginLeft: 6, color: '#C5D1DA' }}>prev: {item.previous_quantity}</span>
                )}
                {item.not_in_catalog && <span style={{ color: '#c88e0f', fontSize: 10, fontWeight: 600, marginLeft: 6 }}>Not in catalog</span>}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', border: '1.5px solid #E1E8EE', borderRadius: 8, overflow: 'hidden', flexShrink: 0 }}>
              <button onClick={() => updateQty(item.id, (item.quantity || 0) - 1)}
                style={{ width: 30, height: 34, border: 'none', background: '#F2F5F8', fontSize: 18, color: '#7A909F', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700 }}
                onMouseEnter={e => { e.currentTarget.style.background = '#e8f4fb'; e.currentTarget.style.color = '#0076BB'; }}
                onMouseLeave={e => { e.currentTarget.style.background = '#F2F5F8'; e.currentTarget.style.color = '#7A909F'; }}>
                -
              </button>
              <input type="number" min="0" value={item.quantity || 0}
                onChange={e => updateQty(item.id, e.target.value)}
                style={{ width: 42, height: 34, border: 'none', borderLeft: '1.5px solid #E1E8EE', borderRight: '1.5px solid #E1E8EE', textAlign: 'center', fontSize: 14, fontWeight: 700, fontFamily: 'inherit', color: '#1A2B38', background: 'white', outline: 'none' }}
              />
              <button onClick={() => updateQty(item.id, (item.quantity || 0) + 1)}
                style={{ width: 30, height: 34, border: 'none', background: '#F2F5F8', fontSize: 18, color: '#7A909F', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700 }}
                onMouseEnter={e => { e.currentTarget.style.background = '#e8f4fb'; e.currentTarget.style.color = '#0076BB'; }}
                onMouseLeave={e => { e.currentTarget.style.background = '#F2F5F8'; e.currentTarget.style.color = '#7A909F'; }}>
                +
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div style={{ background: 'rgba(255,255,255,0.97)', backdropFilter: 'blur(20px)', borderTop: '1px solid #E1E8EE', padding: '12px 14px 28px', display: 'flex', gap: 10, flexShrink: 0 }}>
        <button onClick={saveProgress} disabled={saving}
          style={{ flex: 1, padding: 13, background: '#F2F5F8', border: '1.5px solid #E1E8EE', borderRadius: 8, fontSize: 14, fontWeight: 600, color: '#3D5466', fontFamily: 'inherit', cursor: 'pointer' }}>
          {saving ? 'Saving...' : 'Save Progress'}
        </button>
        <button onClick={() => setShowSubmitModal(true)} disabled={submitting}
          style={{ flex: 2, padding: 13, background: '#0076BB', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 700, color: 'white', fontFamily: 'inherit', cursor: 'pointer' }}
          onMouseEnter={e => e.currentTarget.style.background = '#005a8e'}
          onMouseLeave={e => e.currentTarget.style.background = '#0076BB'}>
          Submit Count
        </button>
      </div>

      {/* Submit confirmation modal */}
      {showSubmitModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,31,50,0.6)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: 'white', borderRadius: 20, width: '100%', maxWidth: 380, overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
            <div style={{ background: '#003f63', padding: '20px 24px', borderBottom: '3px solid #EEAF24' }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: 'white' }}>Submit Count</div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 3 }}>{count?.account?.name}</div>
            </div>
            <div style={{ padding: 24 }}>
              <div style={{ fontSize: 14, color: '#3D5466', lineHeight: 1.6, marginBottom: 20 }}>
                You are about to submit this count for <strong>{count?.account?.name}</strong> for review and approval.
              </div>
              <div style={{ background: '#fef8eb', border: '1px solid #EEAF24', borderRadius: 8, padding: 12, fontSize: 13, color: '#78350f', marginBottom: 20, lineHeight: 1.5 }}>
                <strong>This cannot be undone</strong> without going through the admin request to reopen process. Please make sure all items and quantities are correct before submitting.
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginBottom: 20, textAlign: 'center' }}>
                <div style={{ background: '#F2F5F8', borderRadius: 8, padding: '10px 0' }}>
                  <div style={{ fontSize: 22, fontWeight: 700, color: '#1A2B38' }}>{totalItems}</div>
                  <div style={{ fontSize: 11, color: '#7A909F' }}>Items</div>
                </div>
                <div style={{ background: '#F2F5F8', borderRadius: 8, padding: '10px 0' }}>
                  <div style={{ fontSize: 22, fontWeight: 700, color: '#0076BB' }}>{totalUnits}</div>
                  <div style={{ fontSize: 11, color: '#7A909F' }}>Units</div>
                </div>
                <div style={{ background: '#F2F5F8', borderRadius: 8, padding: '10px 0' }}>
                  <div style={{ fontSize: 22, fontWeight: 700, color: '#c88e0f' }}>{flagged}</div>
                  <div style={{ fontSize: 11, color: '#7A909F' }}>Flagged</div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={() => setShowSubmitModal(false)}
                  style={{ flex: 1, padding: '12px', background: '#F2F5F8', border: '1.5px solid #E1E8EE', borderRadius: 8, fontSize: 14, fontWeight: 600, color: '#3D5466', cursor: 'pointer', fontFamily: 'inherit' }}>
                  Go Back
                </button>
                <button onClick={submitCount}
                  style={{ flex: 2, padding: '12px', background: '#0076BB', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 700, color: 'white', cursor: 'pointer', fontFamily: 'inherit' }}>
                  Yes, Submit Count
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Flag for closure modal */}
      {showClosureModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,31,50,0.6)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: 'white', borderRadius: 20, width: '100%', maxWidth: 400, overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.2)', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ background: '#7f1d1d', padding: '20px 24px', borderBottom: '3px solid #EF4444' }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: 'white' }}>Flag Account for Closure</div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 3 }}>{count?.account?.name}</div>
            </div>
            <div style={{ padding: 24 }}>
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#7A909F', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Reason for Closure *</label>
                <select value={closureForm.reason} onChange={e => setClosureForm(p => ({ ...p, reason: e.target.value }))}
                  style={{ width: '100%', padding: '10px 12px', border: '1.5px solid #E1E8EE', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', outline: 'none', background: 'white' }}>
                  <option value="">Select a reason...</option>
                  <option value="business_closed">Business Closed</option>
                  <option value="lost_account">Lost Account</option>
                  <option value="moved_location">Moved Location</option>
                  <option value="no_longer_using">No Longer Using Service</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#7A909F', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Last Count Date</label>
                <input type="date" value={closureForm.last_count_date} onChange={e => setClosureForm(p => ({ ...p, last_count_date: e.target.value }))}
                  style={{ width: '100%', padding: '10px 12px', border: '1.5px solid #E1E8EE', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }} />
              </div>
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#7A909F', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Was a Final Count Performed?</label>
                <select value={closureForm.final_count_performed} onChange={e => setClosureForm(p => ({ ...p, final_count_performed: e.target.value }))}
                  style={{ width: '100%', padding: '10px 12px', border: '1.5px solid #E1E8EE', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', outline: 'none', background: 'white' }}>
                  <option value="">Select...</option>
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                </select>
              </div>
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#7A909F', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Was Inventory Retrieved?</label>
                <select value={closureForm.inventory_retrieved} onChange={e => setClosureForm(p => ({ ...p, inventory_retrieved: e.target.value }))}
                  style={{ width: '100%', padding: '10px 12px', border: '1.5px solid #E1E8EE', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', outline: 'none', background: 'white' }}>
                  <option value="">Select...</option>
                  <option value="yes">Yes - All Retrieved</option>
                  <option value="partial">Partial</option>
                  <option value="no">No</option>
                </select>
              </div>
              <div style={{ marginBottom: 20 }}>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#7A909F', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Additional Notes</label>
                <textarea value={closureForm.notes} onChange={e => setClosureForm(p => ({ ...p, notes: e.target.value }))} rows={3}
                  placeholder="Any additional details about this closure..."
                  style={{ width: '100%', padding: '10px 12px', border: '1.5px solid #E1E8EE', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', outline: 'none', resize: 'vertical', boxSizing: 'border-box' }} />
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={() => setShowClosureModal(false)}
                  style={{ flex: 1, padding: '12px', background: '#F2F5F8', border: '1.5px solid #E1E8EE', borderRadius: 8, fontSize: 14, fontWeight: 600, color: '#3D5466', cursor: 'pointer', fontFamily: 'inherit' }}>
                  Cancel
                </button>
                <button onClick={flagForClosure}
                  style={{ flex: 2, padding: '12px', background: '#EF4444', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 700, color: 'white', cursor: 'pointer', fontFamily: 'inherit' }}>
                  Flag for Closure
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
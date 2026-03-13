import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../components/AuthContext';
import { useToast } from '../components/ToastContext';

export default function CountEntry() {
  const { countId } = useParams();
  const { profile } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [searchParams] = useSearchParams();
  const desktopMode = searchParams.get('mode') === 'desktop';

  const [count, setCount]           = useState(null);
  const [items, setItems]           = useState([]);
  const [loading, setLoading]       = useState(true);
  const [saving, setSaving]         = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [search, setSearch]         = useState('');
  const [catalogResults, setCatalogResults] = useState([]);
  const [searching, setSearching]   = useState(false);
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [showClosureModal, setShowClosureModal] = useState(false);
  const [closureForm, setClosureForm] = useState({ reason: '', notes: '', last_count_date: '', final_count_performed: '', inventory_retrieved: '' });
  const searchTimer = useRef(null);
  const scanInputRef = useRef(null);
  const [scanMode, setScanMode]     = useState(false);
  const [scanInput, setScanInput]   = useState('');
  const [scanResult, setScanResult] = useState(null);
  const [scanQty, setScanQty]       = useState(1);

  useEffect(() => { loadCount(); }, [countId]);

  useEffect(() => {
    if (search.length >= 1) {
      clearTimeout(searchTimer.current);
      searchTimer.current = setTimeout(() => searchCatalog(search, count?.account?.catalog_source), 150);
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

  async function searchCatalog(query, catalogSource) {
    if (!query || query.length < 1) { setCatalogResults([]); return; }
    setSearching(true);
    const q = query.toLowerCase();
    const catalog = catalogSource || 'edge';
    const { data } = await supabase
      .from('item_catalog')
      .select('id, item_number, description, primary_vendor, catalog_source')
      .eq('catalog_source', catalog)
      .or(`item_number.ilike.%${q}%,description.ilike.%${q}%,primary_vendor.ilike.%${q}%`)
      .limit(15);
    const existingNums = new Set(items.map(i => i.item_number_raw?.toLowerCase()));
    setCatalogResults((data || []).filter(r => !existingNums.has(r.item_number?.toLowerCase())));
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
      quantity: 0, is_new_item: true, not_in_catalog: false,
    }).select().single();
    if (newItem) {
      setItems(prev => [...prev, newItem].sort((a,b) => a.item_number_raw?.localeCompare(b.item_number_raw)));
      setCatalogResults([]); setSearch('');
      toast.success('Item added!');
    }
  }

  async function addCustomItem(query) {
    const { data: newItem } = await supabase.from('count_line_items').insert({
      inventory_count_id: countId,
      item_number_raw: query.trim(), description_raw: query.trim(),
      quantity: 0, is_new_item: true, not_in_catalog: true,
    }).select().single();
    if (newItem) {
      setItems(prev => [...prev, newItem]);
      setCatalogResults([]); setSearch('');
      toast.success('Custom item added!');
    }
  }

  async function handleScanInput(barcode) {
    if (!barcode.trim()) return;
    const catalog = count?.account?.catalog_source || 'edge';
    const { data } = await supabase.from('item_catalog').select('*').eq('catalog_source', catalog)
      .or('item_number.eq.' + barcode + ',upc.eq.' + barcode).single();
    if (data) { setScanResult(data); setScanQty(1); }
    else { toast.error('Item not found in catalog: ' + barcode); setScanInput(''); }
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
        inventory_count_id: countId, item_catalog_id: scanResult.id,
        item_number_raw: scanResult.item_number, description_raw: scanResult.description,
        vendor_raw: scanResult.primary_vendor, quantity: scanQty,
        is_new_item: true, not_in_catalog: false, entered_via_scan: true,
      }).select().single();
      if (newItem) setItems(prev => [...prev, newItem]);
      toast.success('Added ' + scanResult.item_number);
    }
    setScanResult(null); setScanInput('');
    if (scanInputRef.current) scanInputRef.current.focus();
  }

  async function saveProgress() {
    setSaving(true);
    await supabase.from('inventory_counts').update({ status: 'in_progress' }).eq('id', countId);
    toast.success('Progress saved!');
    setSaving(false);
  }

  async function submitCount() {
    setSubmitting(true); setShowSubmitModal(false);
    await supabase.from('inventory_counts').update({ status: 'submitted', submitted_at: new Date().toISOString() }).eq('id', countId);
    await supabase.from('alerts').insert({ alert_type: 'count_submitted', message: (profile?.full_name || 'A rep') + ' submitted count for ' + count?.account?.name, is_read: false });
    await supabase.from('todos').insert({
      title: 'Count to approve: ' + count?.account?.name,
      description: 'Rep ' + (profile?.full_name || '') + ' submitted count for ' + count?.account?.name + ' on ' + new Date().toLocaleDateString(),
      priority: 'normal', todo_type: 'count_approval',
      account_id: count?.account?.id, count_id: countId, is_complete: false,
    });
    toast.success('Count submitted successfully!');
    navigate('/');
    setSubmitting(false);
  }

  async function flagForClosure() {
    if (!closureForm.reason) { toast.error('Please select a reason for closure.'); return; }
    await supabase.from('inventory_counts').update({ closure_reason: closureForm.reason, closure_notes: closureForm.notes, closure_flagged_at: new Date().toISOString() }).eq('id', countId);
    await supabase.from('todos').insert({
      title: 'Account flagged for closure: ' + count?.account?.name,
      description: 'Rep ' + (profile?.full_name || '') + ' flagged ' + count?.account?.name + ' for closure. Reason: ' + closureForm.reason,
      priority: 'high', todo_type: 'account_closure',
      account_id: count?.account?.id,
      rep_id: profile?.id || null,
      count_id: countId, is_complete: false,
      metadata: JSON.stringify({
        ...closureForm,
        rep_name: profile?.full_name || '',
        account_name: count?.account?.name || '',
        region: count?.account?.region?.name || '',
      }),
    });
    await supabase.from('alerts').insert({ alert_type: 'account_closure_flagged', message: count?.account?.name + ' has been flagged for closure by ' + (profile?.full_name || 'a rep'), is_read: false });
    setShowClosureModal(false);
    toast.success('Account flagged for closure. Admin notified.');
  }

  // Search filtering: item # first, then description/vendor
  const filteredItems = !search ? items : (() => {
    const s = search.toLowerCase();
    const byNum = items.filter(i => i.item_number_raw?.toLowerCase().includes(s));
    const byOther = items.filter(i => !i.item_number_raw?.toLowerCase().includes(s) && (
      i.description_raw?.toLowerCase().includes(s) ||
      i.vendor_raw?.toLowerCase().includes(s) ||
      i.part_number_raw?.toLowerCase().includes(s)
    ));
    return [...byNum, ...byOther];
  })();

  const searchMatchesExisting = search.length >= 1 && filteredItems.length > 0;
  const showAddFromCatalog = search.length >= 1 && catalogResults.length > 0 && !searchMatchesExisting;
  const showAddCustom = search.length >= 1 && catalogResults.length === 0 && !searching && !searchMatchesExisting;
  const totalItems = items.length;
  const totalUnits = items.reduce((sum, i) => sum + (i.quantity || 0), 0);
  const flagged = items.filter(i => i.not_in_catalog).length;

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
      <div className="loading-center"><div className="spinner" /><span>Loading...</span></div>
    </div>
  );

  if (count?.status === 'submitted' || count?.status === 'approved') {
    if (desktopMode) {
      const statusLabel = count.status === 'approved' ? 'Approved' : 'Submitted';
      const statusCls   = count.status === 'approved' ? 'pill-app' : 'pill-sub';
      return (
        <div style={{ background: 'var(--bg)', minHeight: '100vh' }}>
          <div className="topbar" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <button className="btn btn-outline" onClick={() => navigate(-1)} style={{ fontSize: 13 }}>&#8592; Back</button>
              <div>
                <h1 style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>{count.account?.name}</h1>
                <p style={{ fontSize: 12, color: 'var(--text-dim)', margin: 0 }}>
                  {count.account?.region?.name} &middot; {count.cycle?.name} &middot; Submitted {count.submitted_at ? new Date(count.submitted_at).toLocaleDateString() : '--'}
                </p>
              </div>
            </div>
            <span className={'pill ' + statusCls}>{statusLabel}</span>
          </div>
          <div style={{ padding: '24px 28px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 24, maxWidth: 480 }}>
              {[
                { n: totalItems, l: 'Items',   cls: 'sc-blue',  tc: 'c-blue'  },
                { n: totalUnits, l: 'Units',   cls: 'sc-gold',  tc: 'c-gold'  },
                { n: flagged,    l: 'Flagged', cls: flagged > 0 ? 'sc-red' : 'sc-green', tc: flagged > 0 ? 'c-red' : 'c-green' },
              ].map((s, i) => (
                <div key={i} className={'stat-card ' + s.cls}>
                  <div className={'sc-num ' + s.tc}>{s.n}</div>
                  <div className={'sc-lbl ' + s.tc}>{s.l}</div>
                </div>
              ))}
            </div>
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <table>
                <thead>
                  <tr>
                    <th style={{ width: '20%' }}>Item #</th>
                    <th style={{ width: '40%' }}>Description</th>
                    <th style={{ width: '20%' }}>Vendor</th>
                    <th style={{ width: '10%', textAlign: 'right' }}>Qty</th>
                    <th style={{ width: '10%' }}>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {items.length === 0 ? (
                    <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-dim)', padding: 32, fontStyle: 'italic' }}>No items recorded in this count.</td></tr>
                  ) : items.map(item => (
                    <tr key={item.id}>
                      <td style={{ fontWeight: 700, color: item.not_in_catalog ? 'var(--amber)' : 'var(--blue-action)' }}>{item.item_number_raw}</td>
                      <td>{item.description_raw}</td>
                      <td style={{ color: 'var(--text-dim)' }}>{item.vendor_raw || '--'}</td>
                      <td style={{ textAlign: 'right', fontWeight: 700 }}>{item.quantity ?? 0}</td>
                      <td>
                        {item.not_in_catalog && <span style={{ fontSize: 10, fontWeight: 700, background: 'var(--gold-light)', color: '#92660A', padding: '2px 6px', borderRadius: 4 }}>Custom</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div style={{ background: 'var(--bg)', minHeight: '100vh', maxWidth: 430, margin: '0 auto', borderLeft: '1px solid var(--border)', borderRight: '1px solid var(--border)' }}>
        <div className="mob-header">
          <div onClick={() => navigate('/')} style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginBottom: 8, cursor: 'pointer', fontWeight: 600, position: 'relative', zIndex: 1 }}>&#8249; Back to Accounts</div>
          <div className="mob-title" style={{ fontSize: 18 }}>{count.account?.name}</div>
        </div>
        <div style={{ padding: 32, textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>&#128274;</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)', marginBottom: 8 }}>Count {count.status === 'approved' ? 'Approved' : 'Submitted'}</div>
          <div style={{ fontSize: 14, color: 'var(--text-dim)', marginBottom: 24, lineHeight: 1.6 }}>
            {count.status === 'approved' ? 'This count has been approved and is locked.' : 'This count has been submitted. To make changes, use the Request Edit button on your dashboard.'}
          </div>
          <button className="btn btn-primary" onClick={() => navigate('/')}>Back to Accounts</button>
        </div>
      </div>
    );
  }

  if (desktopMode) {
    return (
      <div style={{ background: 'var(--bg)', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
        {/* Desktop topbar */}
        <div className="topbar" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <button className="btn btn-outline" onClick={() => navigate(-1)} style={{ fontSize: 13 }}>&#8592; Back</button>
            <div>
              <h1 style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>{count?.account?.name}</h1>
              <p style={{ fontSize: 12, color: 'var(--text-dim)', margin: 0 }}>
                {count?.account?.region?.name} &middot; {count?.cycle?.name}
              </p>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <button className={'btn btn-outline' + (scanMode ? ' btn-danger' : '')} onClick={() => setScanMode(!scanMode)}>
              {scanMode ? 'Exit Scan' : 'Scan'}
            </button>
            <button className="btn btn-outline" style={{ borderColor: '#FCA5A5', color: '#DC2626' }} onClick={() => setShowClosureModal(true)}>Flag Closure</button>
          </div>
        </div>

        <div style={{ padding: '20px 28px', flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* Scan mode panel */}
          {scanMode && (
            <div style={{ background: '#0D1B2A', borderRadius: 10, padding: 14, marginBottom: 16, flexShrink: 0 }}>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 8, textAlign: 'center', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Scan Mode Active</div>
              <input ref={scanInputRef} autoFocus value={scanInput} onChange={e => setScanInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleScanInput(scanInput); }}
                placeholder="Scan barcode or type item number..."
                style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '2px solid #FFD040', background: '#0D1B2A', color: 'white', fontSize: 14, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }} />
              {scanResult && (
                <div style={{ marginTop: 10, background: 'white', borderRadius: 8, padding: 12, display: 'flex', alignItems: 'center', gap: 16 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 700 }}>{scanResult.description}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{scanResult.item_number} &middot; {scanResult.primary_vendor}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 13, color: 'var(--text-mid)' }}>Qty:</span>
                    <div style={{ display: 'flex', alignItems: 'center', border: '1.5px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
                      <button onClick={() => setScanQty(q => Math.max(1, q-1))} style={{ width: 32, height: 34, border: 'none', background: 'var(--bg)', fontSize: 18, cursor: 'pointer' }}>-</button>
                      <input type="number" value={scanQty} onChange={e => setScanQty(Math.max(1, parseInt(e.target.value)||1))}
                        style={{ width: 48, height: 34, border: 'none', borderLeft: '1.5px solid var(--border)', borderRight: '1.5px solid var(--border)', textAlign: 'center', fontSize: 14, fontWeight: 700, fontFamily: 'inherit', outline: 'none' }} />
                      <button onClick={() => setScanQty(q => q+1)} style={{ width: 32, height: 34, border: 'none', background: 'var(--bg)', fontSize: 18, cursor: 'pointer' }}>+</button>
                    </div>
                    <button className="btn btn-primary" onClick={confirmScanItem}>Confirm + Next</button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Stat cards + search row */}
          <div style={{ display: 'flex', gap: 14, alignItems: 'stretch', marginBottom: 16, flexShrink: 0 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, width: 360, flexShrink: 0 }}>
              {[
                { n: totalItems, l: 'Items',   cls: 'sc-blue',  tc: 'c-blue'  },
                { n: totalUnits, l: 'Units',   cls: 'sc-gold',  tc: 'c-gold'  },
                { n: flagged,    l: 'Flagged', cls: flagged > 0 ? 'sc-red' : 'sc-green', tc: flagged > 0 ? 'c-red' : 'c-green' },
              ].map((s, i) => (
                <div key={i} className={'stat-card ' + s.cls} style={{ padding: '12px 14px' }}>
                  <div className={'sc-num ' + s.tc} style={{ fontSize: 28 }}>{s.n}</div>
                  <div className={'sc-lbl ' + s.tc}>{s.l}</div>
                </div>
              ))}
            </div>
            <div style={{ flex: 1, position: 'relative' }}>
              <input
                className={search.length >= 1 ? 'active-input' : ''}
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search by item #, description, vendor, part #..."
                style={{ width: '100%', height: '100%', padding: '12px 16px', border: '1.5px solid', borderColor: search.length >= 1 ? 'var(--blue-action)' : 'var(--border)', borderRadius: 9, fontSize: 14, fontFamily: 'inherit', background: search.length >= 1 ? 'var(--blue-light)' : 'var(--bg)', outline: 'none', boxSizing: 'border-box' }}
              />
              {showAddFromCatalog && (
                <div style={{ position: 'absolute', left: 0, right: 0, top: '100%', zIndex: 50, background: 'white', border: '1.5px solid var(--blue-action)', borderRadius: 10, boxShadow: '0 8px 24px rgba(21,101,192,0.15)', overflow: 'hidden', marginTop: 2 }}>
                  <div style={{ padding: '7px 12px', background: 'var(--blue-light)', borderBottom: '1px solid #C3DEFF', fontSize: 11, fontWeight: 700, color: 'var(--blue-action)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', justifyContent: 'space-between' }}>
                    <span>From Catalog &#8212; not in your count</span>
                    <span style={{ color: 'var(--text-dim)' }}>{catalogResults.length} result{catalogResults.length !== 1 ? 's' : ''}</span>
                  </div>
                  {catalogResults.map(r => (
                    <div key={r.id} onClick={() => addCatalogItem(r)}
                      style={{ padding: '10px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12, borderBottom: '1px solid var(--border)' }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--blue-light)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'white'}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', gap: 8, marginBottom: 2 }}>
                          <span className="item-id">{r.item_number}</span>
                          <span className="item-vendor">{r.primary_vendor}</span>
                        </div>
                        <div className="item-desc">{r.description}</div>
                      </div>
                      <button className="add-btn">+ Add</button>
                    </div>
                  ))}
                </div>
              )}
              {showAddCustom && (
                <div onClick={() => addCustomItem(search)}
                  style={{ position: 'absolute', left: 0, right: 0, top: '100%', marginTop: 4, padding: '10px 14px', background: 'var(--gold-light)', border: '1px solid var(--gold)', borderRadius: 8, cursor: 'pointer', fontSize: 13, color: '#92660A', fontWeight: 600, zIndex: 50 }}>
                  + Add "{search}" as custom item (not in catalog)
                </div>
              )}
              {searching && <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 6 }}>Searching catalog...</div>}
            </div>
          </div>

          {/* Item table */}
          <div className="card" style={{ padding: 0, overflow: 'hidden', flex: 1, display: 'flex', flexDirection: 'column' }}>
            <table style={{ tableLayout: 'fixed' }}>
              <thead>
                <tr>
                  <th style={{ width: '18%' }}>Item #</th>
                  <th style={{ width: '38%' }}>Description</th>
                  <th style={{ width: '18%' }}>Vendor</th>
                  <th style={{ width: '8%' }}>Prev</th>
                  <th style={{ width: '12%', textAlign: 'right' }}>Qty</th>
                  <th style={{ width: '6%' }}></th>
                </tr>
              </thead>
            </table>
            <div style={{ flex: 1, overflowY: 'auto' }}>
              <table style={{ tableLayout: 'fixed' }}>
                <colgroup>
                  <col style={{ width: '18%' }} />
                  <col style={{ width: '38%' }} />
                  <col style={{ width: '18%' }} />
                  <col style={{ width: '8%' }} />
                  <col style={{ width: '12%' }} />
                  <col style={{ width: '6%' }} />
                </colgroup>
                <tbody>
                  {filteredItems.length === 0 && !search ? (
                    <tr><td colSpan={6} style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-dim)', fontSize: 14 }}>No items yet. Search above to add items.</td></tr>
                  ) : filteredItems.length === 0 ? (
                    <tr><td colSpan={6} style={{ textAlign: 'center', padding: 20, color: 'var(--text-dim)', fontSize: 13 }}>No existing items match &#8212; check catalog results above.</td></tr>
                  ) : filteredItems.map(item => (
                    <tr key={item.id} style={{ background: item.not_in_catalog ? 'var(--gold-light)' : 'white' }}>
                      <td style={{ fontWeight: 700, color: item.not_in_catalog ? '#92660A' : 'var(--blue-action)' }}>{item.item_number_raw}</td>
                      <td>{item.description_raw}</td>
                      <td style={{ color: 'var(--text-dim)', fontSize: 12 }}>{item.vendor_raw}</td>
                      <td style={{ color: 'var(--text-dim)', fontSize: 12 }}>{item.previous_quantity ?? '--'}</td>
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', border: '1.5px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
                          <button onClick={() => updateQty(item.id, (item.quantity || 0) - 1)}
                            style={{ width: 28, height: 32, border: 'none', background: 'var(--bg)', fontSize: 16, color: 'var(--text-dim)', cursor: 'pointer' }}>-</button>
                          <input type="number" min="0" value={item.quantity || 0} onChange={e => updateQty(item.id, e.target.value)}
                            style={{ width: 44, height: 32, border: 'none', borderLeft: '1.5px solid var(--border)', borderRight: '1.5px solid var(--border)', textAlign: 'center', fontSize: 14, fontWeight: 700, fontFamily: 'inherit', color: 'var(--text)', background: 'white', outline: 'none' }} />
                          <button onClick={() => updateQty(item.id, (item.quantity || 0) + 1)}
                            style={{ width: 28, height: 32, border: 'none', background: 'var(--bg)', fontSize: 16, color: 'var(--text-dim)', cursor: 'pointer' }}>+</button>
                        </div>
                      </td>
                      <td>
                        {item.not_in_catalog && <span style={{ fontSize: 9, fontWeight: 700, color: '#92660A', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Custom</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Footer actions */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, paddingTop: 16, flexShrink: 0 }}>
            <button className="btn btn-outline" onClick={saveProgress} disabled={saving}>{saving ? 'Saving...' : 'Save Progress'}</button>
            <button className="btn btn-primary" onClick={() => setShowSubmitModal(true)} disabled={submitting}>Submit Count</button>
          </div>
        </div>

        {/* Modals (shared) */}
        {showSubmitModal && (
          <div className="modal-overlay">
            <div className="modal">
              <div className="modal-head-blue">
                <div className="modal-head-title">Submit Count</div>
                <div className="modal-head-sub">{count?.account?.name}</div>
              </div>
              <div className="modal-body">
                <p style={{ fontSize: 14, color: 'var(--text-mid)', lineHeight: 1.6, marginBottom: 12 }}>
                  You are about to submit this count for <strong>{count?.account?.name}</strong> for review and approval.
                </p>
                <div className="warn-box">
                  <strong>This cannot be undone</strong> without going through the admin request to reopen process. Please make sure all items and quantities are correct.
                </div>
                <div className="modal-stats" style={{ marginBottom: 12 }}>
                  {[
                    { n: totalItems, l: 'Items',   cls: 'sc-blue',  tc: 'c-blue'  },
                    { n: totalUnits, l: 'Units',   cls: 'sc-gold',  tc: 'c-gold'  },
                    { n: flagged,    l: 'Flagged', cls: flagged > 0 ? 'sc-red' : 'sc-green', tc: flagged > 0 ? 'c-red' : 'c-green' },
                  ].map((s, i) => (
                    <div key={i} className={'ms-card stat-card ' + s.cls}>
                      <div className={'sc-num ' + s.tc} style={{ fontSize: 26 }}>{s.n}</div>
                      <div className={'sc-lbl ' + s.tc} style={{ fontSize: 9 }}>{s.l}</div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="modal-actions">
                <button className="btn btn-outline" onClick={() => setShowSubmitModal(false)}>Go Back</button>
                <button className="btn btn-primary" onClick={submitCount}>Yes, Submit Count</button>
              </div>
            </div>
          </div>
        )}
        {showClosureModal && (
          <div className="modal-overlay">
            <div className="modal">
              <div className="modal-head-red">
                <div className="modal-head-title">Flag Account for Closure</div>
                <div className="modal-head-sub">{count?.account?.name}</div>
              </div>
              <div className="modal-body">
                <div className="form-lbl" style={{ marginTop: 0 }}>Reason for Closure *</div>
                <select className="form-sel" value={closureForm.reason} onChange={e => setClosureForm(p => ({ ...p, reason: e.target.value }))}>
                  <option value="">Select a reason...</option>
                  <option value="business_closed">Business Closed</option>
                  <option value="lost_account">Lost Account</option>
                  <option value="moved_location">Moved Location</option>
                  <option value="no_longer_using">No Longer Using Service</option>
                  <option value="other">Other</option>
                </select>
                <div className="form-lbl">Last Count Date</div>
                <input type="date" className="form-inp" value={closureForm.last_count_date} onChange={e => setClosureForm(p => ({ ...p, last_count_date: e.target.value }))} />
                <div className="form-lbl">Final Count Performed?</div>
                <select className="form-sel" value={closureForm.final_count_performed} onChange={e => setClosureForm(p => ({ ...p, final_count_performed: e.target.value }))}>
                  <option value="">Select...</option><option value="yes">Yes</option><option value="no">No</option>
                </select>
                <div className="form-lbl">Inventory Retrieved?</div>
                <select className="form-sel" value={closureForm.inventory_retrieved} onChange={e => setClosureForm(p => ({ ...p, inventory_retrieved: e.target.value }))}>
                  <option value="">Select...</option>
                  <option value="yes">Yes &#8212; All Retrieved</option>
                  <option value="partial">Partial</option>
                  <option value="no">No</option>
                </select>
                <div className="form-lbl">Additional Notes</div>
                <textarea className="form-ta" value={closureForm.notes} onChange={e => setClosureForm(p => ({ ...p, notes: e.target.value }))} placeholder="Any additional details..." />
              </div>
              <div className="modal-actions">
                <button className="btn btn-outline" onClick={() => setShowClosureModal(false)}>Cancel</button>
                <button className="btn btn-danger" onClick={flagForClosure}>Flag for Closure</button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{ background: 'var(--bg)', height: '100vh', maxWidth: 430, margin: '0 auto', display: 'flex', flexDirection: 'column', borderLeft: '1px solid var(--border)', borderRight: '1px solid var(--border)', overflow: 'hidden' }}>

      {/* Header */}
      <div className="mob-header">
        <div onClick={() => navigate('/')} style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginBottom: 6, cursor: 'pointer', fontWeight: 600, position: 'relative', zIndex: 1 }}>&#8249; Back to Accounts</div>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', position: 'relative', zIndex: 1 }}>
          <div>
            <div className="mob-title" style={{ fontSize: 18 }}>{count?.account?.name}</div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', marginTop: 3 }}>
              {count?.account?.region?.name} &middot; {count?.cycle?.name}
              <span style={{ marginLeft: 8, background: 'rgba(255,208,64,0.2)', color: '#FFD040', fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 10 }}>In Progress</span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button className={'mob-btn' + (scanMode ? ' mob-btn-red' : '')} onClick={() => setScanMode(!scanMode)}>
              {scanMode ? 'Exit Scan' : 'Scan'}
            </button>
            <button className="mob-btn" style={{ borderColor: '#FCA5A5', color: '#FCA5A5' }} onClick={() => setShowClosureModal(true)}>Flag Closure</button>
          </div>
        </div>
      </div>

      {/* Scan mode */}
      {scanMode && (
        <div style={{ background: '#0D1B2A', padding: 14, borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 8, textAlign: 'center', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Scan Mode Active</div>
          <input ref={scanInputRef} autoFocus value={scanInput} onChange={e => setScanInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleScanInput(scanInput); }}
            placeholder="Scan barcode or type item number..."
            style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '2px solid #FFD040', background: '#0D1B2A', color: 'white', fontSize: 14, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }} />
          {scanResult && (
            <div style={{ marginTop: 10, background: 'white', borderRadius: 8, padding: 12 }}>
              <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 4 }}>Found:</div>
              <div style={{ fontSize: 14, fontWeight: 700 }}>{scanResult.description}</div>
              <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 10 }}>{scanResult.item_number} &middot; {scanResult.primary_vendor}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 13, color: 'var(--text-mid)' }}>Qty:</span>
                <div style={{ display: 'flex', alignItems: 'center', border: '1.5px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
                  <button onClick={() => setScanQty(q => Math.max(1, q-1))} style={{ width: 32, height: 34, border: 'none', background: 'var(--bg)', fontSize: 18, cursor: 'pointer' }}>-</button>
                  <input type="number" value={scanQty} onChange={e => setScanQty(Math.max(1, parseInt(e.target.value)||1))}
                    style={{ width: 48, height: 34, border: 'none', borderLeft: '1.5px solid var(--border)', borderRight: '1.5px solid var(--border)', textAlign: 'center', fontSize: 14, fontWeight: 700, fontFamily: 'inherit', outline: 'none' }} />
                  <button onClick={() => setScanQty(q => q+1)} style={{ width: 32, height: 34, border: 'none', background: 'var(--bg)', fontSize: 18, cursor: 'pointer' }}>+</button>
                </div>
                <button className="btn btn-primary" style={{ flex: 1, padding: '8px' }} onClick={confirmScanItem}>Confirm + Next</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Stats bar */}
      <div className="mob-stats">
        {[
          { n: totalItems, l: 'Items',   cls: 'sc-blue',  tc: 'c-blue'  },
          { n: totalUnits, l: 'Units',   cls: 'sc-gold',  tc: 'c-gold'  },
          { n: flagged,    l: 'Flagged', cls: flagged > 0 ? 'sc-red' : 'sc-green', tc: flagged > 0 ? 'c-red' : 'c-green' },
        ].map((s, i) => (
          <div key={i} className={'mob-stat stat-card ' + s.cls}>
            <div className={'mob-stat-num ' + s.tc}>{s.n}</div>
            <div className={'mob-stat-lbl ' + s.tc}>{s.l}</div>
          </div>
        ))}
      </div>

      {/* Search */}
      {!scanMode && (
        <div className="mob-search" style={{ flexDirection: 'column', alignItems: 'stretch', position: 'relative' }}>
          <input
            className={search.length >= 1 ? 'active-input' : ''}
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by item #, description, vendor, part #..."
            style={{ width: '100%', padding: '10px 14px', border: '1.5px solid', borderColor: search.length >= 1 ? 'var(--blue-action)' : 'var(--border)', borderRadius: 9, fontSize: 14, fontFamily: 'inherit', background: search.length >= 1 ? 'var(--blue-light)' : 'var(--bg)', outline: 'none' }}
          />
          {showAddFromCatalog && (
            <div style={{ position: 'absolute', left: 16, right: 16, top: '100%', zIndex: 50, background: 'white', border: '1.5px solid var(--blue-action)', borderRadius: 10, boxShadow: '0 8px 24px rgba(21,101,192,0.15)', overflow: 'hidden', marginTop: 2 }}>
              <div style={{ padding: '7px 12px', background: 'var(--blue-light)', borderBottom: '1px solid #C3DEFF', fontSize: 11, fontWeight: 700, color: 'var(--blue-action)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', justifyContent: 'space-between' }}>
                <span>From Catalog &#8212; not in your count</span>
                <span style={{ color: 'var(--text-dim)' }}>{catalogResults.length} result{catalogResults.length !== 1 ? 's' : ''}</span>
              </div>
              {catalogResults.map(r => (
                <div key={r.id} onClick={() => addCatalogItem(r)}
                  style={{ padding: '10px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, borderBottom: '1px solid var(--border)' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--blue-light)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'white'}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', gap: 8, marginBottom: 2 }}>
                      <span className="item-id">{r.item_number}</span>
                      <span className="item-vendor">{r.primary_vendor}</span>
                    </div>
                    <div className="item-desc">{r.description}</div>
                  </div>
                  <button className="add-btn">+ Add</button>
                </div>
              ))}
            </div>
          )}
          {showAddCustom && (
            <div onClick={() => addCustomItem(search)}
              style={{ marginTop: 8, padding: '10px 12px', background: 'var(--gold-light)', border: '1px solid var(--gold)', borderRadius: 8, cursor: 'pointer', fontSize: 13, color: '#92660A', fontWeight: 600 }}>
              + Add "{search}" as custom item (not in catalog)
            </div>
          )}
          {searching && <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 6 }}>Searching catalog...</div>}
        </div>
      )}

      {/* Column headers */}
      <div className="cat-header">
        <span>Item # / Description</span>
        <span>Qty</span>
      </div>

      {/* Item list */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {filteredItems.length === 0 && !search ? (
          <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-dim)', fontSize: 14 }}>No items yet. Search above to add items.</div>
        ) : filteredItems.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 20, color: 'var(--text-dim)', fontSize: 13 }}>No existing items match &#8212; check catalog results above.</div>
        ) : filteredItems.map(item => (
          <div key={item.id} className="cat-item" style={{ background: item.not_in_catalog ? 'var(--gold-light)' : 'white' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <span className="item-id" style={{ color: item.not_in_catalog ? '#92660A' : 'var(--blue-action)' }}>{item.item_number_raw}</span>
                {item.vendor_raw && <span className="item-vendor">{item.vendor_raw}</span>}
                {item.not_in_catalog && <span style={{ fontSize: 9, fontWeight: 700, color: '#92660A', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Custom</span>}
              </div>
              <div className="item-desc">{item.description_raw}</div>
              {item.previous_quantity != null && <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 1 }}>prev: {item.previous_quantity}</div>}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', border: '1.5px solid var(--border)', borderRadius: 8, overflow: 'hidden', flexShrink: 0 }}>
              <button onClick={() => updateQty(item.id, (item.quantity || 0) - 1)}
                style={{ width: 30, height: 34, border: 'none', background: 'var(--bg)', fontSize: 18, color: 'var(--text-dim)', cursor: 'pointer', fontWeight: 700 }}>-</button>
              <input type="number" min="0" value={item.quantity || 0} onChange={e => updateQty(item.id, e.target.value)}
                style={{ width: 44, height: 34, border: 'none', borderLeft: '1.5px solid var(--border)', borderRight: '1.5px solid var(--border)', textAlign: 'center', fontSize: 14, fontWeight: 700, fontFamily: 'inherit', color: 'var(--text)', background: 'white', outline: 'none' }} />
              <button onClick={() => updateQty(item.id, (item.quantity || 0) + 1)}
                style={{ width: 30, height: 34, border: 'none', background: 'var(--bg)', fontSize: 18, color: 'var(--text-dim)', cursor: 'pointer', fontWeight: 700 }}>+</button>
            </div>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="mob-footer">
        <button className="mob-foot-btn mob-foot-outline" onClick={saveProgress} disabled={saving}>{saving ? 'Saving...' : 'Save Progress'}</button>
        <button className="mob-foot-btn mob-foot-primary" onClick={() => setShowSubmitModal(true)} disabled={submitting}>Submit Count</button>
      </div>

      {/* Submit modal */}
      {showSubmitModal && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-head-blue">
              <div className="modal-head-title">Submit Count</div>
              <div className="modal-head-sub">{count?.account?.name}</div>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: 14, color: 'var(--text-mid)', lineHeight: 1.6, marginBottom: 12 }}>
                You are about to submit this count for <strong>{count?.account?.name}</strong> for review and approval.
              </p>
              <div className="warn-box">
                <strong>This cannot be undone</strong> without going through the admin request to reopen process. Please make sure all items and quantities are correct.
              </div>
              <div className="modal-stats" style={{ marginBottom: 12 }}>
                {[
                  { n: totalItems, l: 'Items',   cls: 'sc-blue',  tc: 'c-blue'  },
                  { n: totalUnits, l: 'Units',   cls: 'sc-gold',  tc: 'c-gold'  },
                  { n: flagged,    l: 'Flagged', cls: flagged > 0 ? 'sc-red' : 'sc-green', tc: flagged > 0 ? 'c-red' : 'c-green' },
                ].map((s, i) => (
                  <div key={i} className={'ms-card stat-card ' + s.cls}>
                    <div className={'sc-num ' + s.tc} style={{ fontSize: 26 }}>{s.n}</div>
                    <div className={'sc-lbl ' + s.tc} style={{ fontSize: 9 }}>{s.l}</div>
                  </div>
                ))}
              </div>
            </div>
            <div className="modal-actions">
              <button className="btn btn-outline" onClick={() => setShowSubmitModal(false)}>Go Back</button>
              <button className="btn btn-primary" onClick={submitCount}>Yes, Submit Count</button>
            </div>
          </div>
        </div>
      )}

      {/* Closure modal */}
      {showClosureModal && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-head-red">
              <div className="modal-head-title">Flag Account for Closure</div>
              <div className="modal-head-sub">{count?.account?.name}</div>
            </div>
            <div className="modal-body">
              <div className="form-lbl" style={{ marginTop: 0 }}>Reason for Closure *</div>
              <select className="form-sel" value={closureForm.reason} onChange={e => setClosureForm(p => ({ ...p, reason: e.target.value }))}>
                <option value="">Select a reason...</option>
                <option value="business_closed">Business Closed</option>
                <option value="lost_account">Lost Account</option>
                <option value="moved_location">Moved Location</option>
                <option value="no_longer_using">No Longer Using Service</option>
                <option value="other">Other</option>
              </select>
              <div className="form-lbl">Last Count Date</div>
              <input type="date" className="form-inp" value={closureForm.last_count_date} onChange={e => setClosureForm(p => ({ ...p, last_count_date: e.target.value }))} />
              <div className="form-lbl">Final Count Performed?</div>
              <select className="form-sel" value={closureForm.final_count_performed} onChange={e => setClosureForm(p => ({ ...p, final_count_performed: e.target.value }))}>
                <option value="">Select...</option><option value="yes">Yes</option><option value="no">No</option>
              </select>
              <div className="form-lbl">Inventory Retrieved?</div>
              <select className="form-sel" value={closureForm.inventory_retrieved} onChange={e => setClosureForm(p => ({ ...p, inventory_retrieved: e.target.value }))}>
                <option value="">Select...</option>
                <option value="yes">Yes &#8212; All Retrieved</option>
                <option value="partial">Partial</option>
                <option value="no">No</option>
              </select>
              <div className="form-lbl">Additional Notes</div>
              <textarea className="form-ta" value={closureForm.notes} onChange={e => setClosureForm(p => ({ ...p, notes: e.target.value }))} placeholder="Any additional details..." />
            </div>
            <div className="modal-actions">
              <button className="btn btn-outline" onClick={() => setShowClosureModal(false)}>Cancel</button>
              <button className="btn btn-danger" onClick={flagForClosure}>Flag for Closure</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

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

  const [count, setCount]     = useState(null);
  const [items, setItems]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [search, setSearch]   = useState('');
  const [addSearch, setAddSearch] = useState('');
  const [addResults, setAddResults] = useState([]);
  const [addMode, setAddMode] = useState(false);
  const [addSearching, setAddSearching] = useState(false);
  const addTimer = useRef(null);

  useEffect(() => { loadCount(); }, [countId]);

  async function loadCount() {
    setLoading(true);
    const { data: countData } = await supabase
      .from('inventory_counts')
      .select('id, status, submitted_at, rep_id, account:accounts(id, name, catalog_source, region:regions(name)), cycle:count_cycles(name)')
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

  async function updateQty(itemId, newQty) {
    const qty = Math.max(0, parseInt(newQty) || 0);
    setItems(prev => prev.map(i => i.id === itemId ? { ...i, quantity: qty } : i));
    await supabase.from('count_line_items').update({ quantity: qty }).eq('id', itemId);
  }

  async function saveProgress() {
    setSaving(true);
    await supabase.from('inventory_counts').update({ status: 'in_progress' }).eq('id', countId);
    toast.success('Progress saved!');
    setSaving(false);
  }

  async function submitCount() {
    if (!window.confirm('Submit this count? Once submitted you will not be able to edit without admin approval.')) return;
    setSubmitting(true);
    await supabase.from('inventory_counts').update({
      status: 'submitted',
      submitted_at: new Date().toISOString(),
    }).eq('id', countId);
    await supabase.from('alerts').insert({
      alert_type: 'count_submitted',
      message: (profile?.full_name || 'A rep') + ' submitted count for ' + count?.account?.name,
      is_read: false,
    });
    toast.success('Count submitted successfully!');
    navigate('/');
    setSubmitting(false);
  }

  async function doAddSearch(query) {
    if (!query || query.length < 2) { setAddResults([]); return; }
    setAddSearching(true);
    const catalog = count?.account?.catalog_source || 'edge';
    let q = supabase.from('item_catalog')
      .select('id, item_number, description, primary_vendor, catalog_source')
      .eq('catalog_source', catalog)
      .limit(20);
    q = q.or('item_number.ilike.%' + query + '%,description.ilike.%' + query + '%,primary_vendor.ilike.%' + query + '%');
    const { data } = await q;
    setAddResults(data || []);
    setAddSearching(false);
  }

  async function addItem(catalogItem) {
    const exists = items.find(i => i.item_number_raw === catalogItem.item_number);
    if (exists) { toast.info('Item already in count.'); return; }
    const { data: newItem } = await supabase.from('count_line_items').insert({
      inventory_count_id: countId,
      item_number_raw: catalogItem.item_number,
      description_raw: catalogItem.description,
      vendor_raw: catalogItem.primary_vendor,
      quantity: 0,
      is_new_item: true,
      not_in_catalog: false,
    }).select().single();
    if (newItem) {
      setItems(prev => [...prev, newItem]);
      setAddMode(false);
      setAddSearch('');
      setAddResults([]);
      toast.success('Item added!');
    }
  }

  async function addCustomItem() {
    if (!addSearch.trim()) return;
    const { data: newItem } = await supabase.from('count_line_items').insert({
      inventory_count_id: countId,
      item_number_raw: addSearch.trim(),
      description_raw: addSearch.trim(),
      vendor_raw: null,
      quantity: 0,
      is_new_item: true,
      not_in_catalog: true,
    }).select().single();
    if (newItem) {
      setItems(prev => [...prev, newItem]);
      setAddMode(false);
      setAddSearch('');
      setAddResults([]);
      toast.success('Custom item added!');
    }
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
          <div onClick={() => navigate('/')} style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginBottom: 6, cursor: 'pointer' }}>&#8249; Back to Accounts</div>
          <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-0.3px' }}>{count.account?.name}</div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 3 }}>{count.account?.region?.name} &middot; {count.cycle?.name}</div>
        </div>
        <div style={{ padding: 32, textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>&#128274;</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#1A2B38', marginBottom: 8 }}>Count {count.status === 'approved' ? 'Approved' : 'Submitted'}</div>
          <div style={{ fontSize: 14, color: '#7A909F', marginBottom: 24, lineHeight: 1.6 }}>
            {count.status === 'approved'
              ? 'This count has been approved and is locked.'
              : 'This count has been submitted. To make changes, request admin approval from your dashboard.'}
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
          &#8249; Back to Accounts
        </div>
        <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-0.3px' }}>{count?.account?.name}</div>
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 3, display: 'flex', alignItems: 'center', gap: 8 }}>
          {count?.account?.region?.name} &middot; {count?.cycle?.name}
          <span style={{ background: 'rgba(238,175,36,0.2)', color: '#EEAF24', fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 10 }}>In Progress</span>
        </div>
      </div>

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

      {/* Search / Add bar */}
      <div style={{ background: 'white', padding: '10px 14px', borderBottom: '1px solid #E1E8EE', flexShrink: 0 }}>
        {!addMode ? (
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search item #, description, vendor..."
              style={{ flex: 1, background: '#F2F5F8', border: '1.5px solid #E1E8EE', borderRadius: 8, padding: '9px 12px', fontSize: 13, fontFamily: 'inherit', outline: 'none', color: '#1A2B38' }}
              onFocus={e => e.target.style.borderColor = '#0076BB'}
              onBlur={e => e.target.style.borderColor = '#E1E8EE'}
            />
            <button onClick={() => setAddMode(true)}
              style={{ background: '#0076BB', color: 'white', border: 'none', borderRadius: 8, padding: '9px 14px', fontSize: 13, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer', whiteSpace: 'nowrap' }}>
              + Add
            </button>
          </div>
        ) : (
          <div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              <input
                autoFocus
                value={addSearch}
                onChange={e => {
                  setAddSearch(e.target.value);
                  clearTimeout(addTimer.current);
                  addTimer.current = setTimeout(() => doAddSearch(e.target.value), 300);
                }}
                placeholder="Search item # or description..."
                style={{ flex: 1, background: '#F2F5F8', border: '1.5px solid #0076BB', borderRadius: 8, padding: '9px 12px', fontSize: 13, fontFamily: 'inherit', outline: 'none', color: '#1A2B38' }}
              />
              <button onClick={() => { setAddMode(false); setAddSearch(''); setAddResults([]); }}
                style={{ background: '#F2F5F8', color: '#7A909F', border: '1.5px solid #E1E8EE', borderRadius: 8, padding: '9px 12px', fontSize: 13, fontFamily: 'inherit', cursor: 'pointer' }}>
                Cancel
              </button>
            </div>
            {addSearching && <div style={{ fontSize: 12, color: '#7A909F', padding: '4px 0' }}>Searching...</div>}
            {addResults.map(r => (
              <div key={r.id} onClick={() => addItem(r)}
                style={{ padding: '8px 10px', borderRadius: 6, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, marginBottom: 2 }}
                onMouseEnter={e => e.currentTarget.style.background = '#e8f4fb'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                <div style={{ fontSize: 10, fontFamily: 'monospace', color: '#0076BB', background: '#e8f4fb', padding: '2px 6px', borderRadius: 4, flexShrink: 0, fontWeight: 700 }}>{r.item_number}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, color: '#1A2B38', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.description}</div>
                  <div style={{ fontSize: 11, color: '#7A909F' }}>{r.primary_vendor}</div>
                </div>
              </div>
            ))}
            {addSearch.length > 1 && addResults.length === 0 && !addSearching && (
              <div onClick={addCustomItem} style={{ padding: '8px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 13, color: '#c88e0f', fontWeight: 600 }}
                onMouseEnter={e => e.currentTarget.style.background = '#fef8eb'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                + Add "{addSearch}" as custom item
              </div>
            )}
          </div>
        )}
      </div>

      {/* Item list */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {filteredItems.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 20px', color: '#7A909F', fontSize: 14 }}>
            {search ? 'No items match your search.' : 'No items yet. Use + Add to add items.'}
          </div>
        ) : filteredItems.map(item => (
          <div key={item.id} style={{
            background: item.not_in_catalog ? '#fef8eb' : 'white',
            borderBottom: '1px solid #E1E8EE',
            padding: '12px 14px',
            display: 'flex', alignItems: 'center', gap: 10,
          }}>
            {/* Item number badge */}
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

            {/* Description */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: '#1A2B38', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.description_raw}</div>
              <div style={{ fontSize: 11, color: '#7A909F', marginTop: 1 }}>
                {item.vendor_raw}
                {item.not_in_catalog && <span style={{ color: '#c88e0f', fontSize: 10, fontWeight: 600, marginLeft: 6 }}>Not in catalog</span>}
              </div>
            </div>

            {/* Qty control */}
            <div style={{ display: 'flex', alignItems: 'center', border: '1.5px solid #E1E8EE', borderRadius: 8, overflow: 'hidden', flexShrink: 0 }}>
              <button onClick={() => updateQty(item.id, (item.quantity || 0) - 1)}
                style={{ width: 30, height: 34, border: 'none', background: '#F2F5F8', fontSize: 18, color: '#7A909F', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'inherit', fontWeight: 700 }}
                onMouseEnter={e => { e.currentTarget.style.background = '#e8f4fb'; e.currentTarget.style.color = '#0076BB'; }}
                onMouseLeave={e => { e.currentTarget.style.background = '#F2F5F8'; e.currentTarget.style.color = '#7A909F'; }}>
                -
              </button>
              <input
                type="number" min="0"
                value={item.quantity || 0}
                onChange={e => updateQty(item.id, e.target.value)}
                style={{ width: 42, height: 34, border: 'none', borderLeft: '1.5px solid #E1E8EE', borderRight: '1.5px solid #E1E8EE', textAlign: 'center', fontSize: 14, fontWeight: 700, fontFamily: 'inherit', color: '#1A2B38', background: 'white', outline: 'none' }}
              />
              <button onClick={() => updateQty(item.id, (item.quantity || 0) + 1)}
                style={{ width: 30, height: 34, border: 'none', background: '#F2F5F8', fontSize: 18, color: '#7A909F', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'inherit', fontWeight: 700 }}
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
        <button onClick={submitCount} disabled={submitting}
          style={{ flex: 2, padding: 13, background: '#0076BB', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 700, color: 'white', fontFamily: 'inherit', cursor: 'pointer' }}
          onMouseEnter={e => e.currentTarget.style.background = '#005a8e'}
          onMouseLeave={e => e.currentTarget.style.background = '#0076BB'}>
          {submitting ? 'Submitting...' : 'Submit Count'}
        </button>
      </div>
    </div>
  );
}

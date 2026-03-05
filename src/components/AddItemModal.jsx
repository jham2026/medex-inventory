import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

export default function AddItemModal({ countId, prefillBarcode, onAdd, onClose }) {
  const [search, setSearch]       = useState(prefillBarcode || '');
  const [results, setResults]     = useState([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected]   = useState(null);
  const [qty, setQty]             = useState(1);
  const [customItem, setCustomItem] = useState({ item_number: '', description: '', vendor: '' });
  const [notInCatalog, setNotInCatalog] = useState(false);

  useEffect(() => {
    if (prefillBarcode) doSearch(prefillBarcode);
  }, [prefillBarcode]);

  async function doSearch(q) {
    if (!q || q.length < 2) { setResults([]); return; }
    setSearching(true);
    const { data } = await supabase
      .from('item_catalog')
      .select('id, item_number, description, primary_vendor, barcode_1, hcpcs_code')
      .or(`item_number.ilike.%${q}%,description.ilike.%${q}%,barcode_1.eq.${q},barcode_2.eq.${q}`)
      .limit(20);
    setResults(data || []);
    setSearching(false);
    if (!data?.length) setNotInCatalog(true);
  }

  function handleAdd() {
    if (notInCatalog || !selected) {
      if (!customItem.description) return;
      onAdd({
        item_catalog_id: null,
        item_number_raw: customItem.item_number || null,
        description_raw: customItem.description,
        vendor_raw: customItem.vendor || null,
        quantity: qty,
        not_in_catalog: true,
        is_new_item: true,
        entered_via_scan: !!prefillBarcode,
      });
    } else {
      onAdd({
        item_catalog_id: selected.id,
        item_number_raw: selected.item_number,
        description_raw: selected.description,
        vendor_raw: selected.primary_vendor,
        quantity: qty,
        not_in_catalog: false,
        is_new_item: true,
        entered_via_scan: !!prefillBarcode,
      });
    }
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header">
          <h3>Add Item</h3>
          <button className="btn btn-ghost btn-sm" onClick={onClose}
            style={{ color: 'white', borderColor: 'rgba(255,255,255,0.3)' }}>✕</button>
        </div>
        <div className="modal-body">
          {!notInCatalog ? (
            <>
              <div className="input-group">
                <label className="input-label">Search Catalog (item #, description, or barcode)</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    className="input" value={search}
                    onChange={e => setSearch(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && doSearch(search)}
                    placeholder="Type to search..."
                    autoFocus
                  />
                  <button className="btn btn-secondary btn-sm" onClick={() => doSearch(search)}>
                    Search
                  </button>
                </div>
              </div>

              {searching && <div style={{ color: 'var(--gray-dark)', fontSize: 13 }}>Searching...</div>}

              {results.length > 0 && (
                <div style={{ border: '1px solid var(--gray-mid)', borderRadius: 4, maxHeight: 240, overflowY: 'auto', marginBottom: 14 }}>
                  {results.map(r => (
                    <div
                      key={r.id}
                      onClick={() => setSelected(r)}
                      style={{
                        padding: '8px 12px', cursor: 'pointer', fontSize: 13,
                        borderBottom: '1px solid var(--gray-mid)',
                        background: selected?.id === r.id ? '#e8f4fa' : 'white',
                      }}
                    >
                      <div style={{ fontWeight: 'bold' }}>{r.description}</div>
                      <div style={{ color: 'var(--gray-dark)', fontSize: 11 }}>
                        #{r.item_number} &nbsp;·&nbsp; {r.primary_vendor || '—'} &nbsp;·&nbsp; HCPCS: {r.hcpcs_code || '—'}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {results.length === 0 && search.length >= 2 && !searching && (
                <div className="alert-banner warning" style={{ marginBottom: 12 }}>
                  No catalog matches found.
                  <button className="btn btn-sm btn-utility" style={{ marginLeft: 8 }}
                    onClick={() => setNotInCatalog(true)}>Add Manually (Not in Catalog)</button>
                </div>
              )}
            </>
          ) : (
            <>
              <div className="alert-banner warning" style={{ marginBottom: 12 }}>
                ⚠ This item will be flagged for admin review — not found in catalog.
              </div>
              <div className="input-group">
                <label className="input-label">Item Number (if known)</label>
                <input className="input" value={customItem.item_number}
                  onChange={e => setCustomItem(p => ({ ...p, item_number: e.target.value }))} />
              </div>
              <div className="input-group">
                <label className="input-label">Description *</label>
                <input className="input" value={customItem.description} autoFocus
                  onChange={e => setCustomItem(p => ({ ...p, description: e.target.value }))}
                  placeholder="Required" />
              </div>
              <div className="input-group">
                <label className="input-label">Vendor</label>
                <input className="input" value={customItem.vendor}
                  onChange={e => setCustomItem(p => ({ ...p, vendor: e.target.value }))} />
              </div>
              <button className="btn btn-utility btn-sm" onClick={() => setNotInCatalog(false)}>
                ← Back to Catalog Search
              </button>
            </>
          )}

          {(selected || notInCatalog) && (
            <div className="input-group" style={{ marginTop: 16 }}>
              <label className="input-label">Quantity</label>
              <div className="qty-control">
                <button className="qty-btn" onClick={() => setQty(q => Math.max(0, q-1))}>−</button>
                <input className="qty-val" type="number" min="0" value={qty}
                  onChange={e => setQty(Math.max(0, parseInt(e.target.value)||0))} />
                <button className="qty-btn" onClick={() => setQty(q => q+1)}>+</button>
              </div>
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn btn-utility" onClick={onClose}>Cancel</button>
          <button
            className="btn btn-primary"
            onClick={handleAdd}
            disabled={(!selected && !notInCatalog) || (notInCatalog && !customItem.description)}
          >
            Add Item
          </button>
        </div>
      </div>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useToast } from '../components/ToastContext';
import Papa from 'papaparse';

const CATALOGS = [
  { value: 'edge', label: 'Account Edge' },
  { value: 'claimsoft', label: 'Claimsoft' },
];


// Ã¢â€â‚¬Ã¢â€â‚¬ Versioned template download Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
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

export default function AdminItemCatalog() {
  const toast = useToast();
  const [items, setItems]           = useState([]);
  const [loading, setLoading]       = useState(true);
  const [search, setSearch]         = useState('');
  const [filterVendor, setFilterVendor] = useState('');
  const [filterCatalog, setFilterCatalog] = useState('');
  const [editItem, setEditItem]     = useState(null);
  const [showAdd, setShowAdd]       = useState(false);
  const [importing, setImporting]   = useState(false);
  const [form, setForm]             = useState({ item_number: '', description: '', primary_vendor: '', catalog_source: 'edge' });

  useEffect(() => { loadItems(); }, []);

  async function loadItems() {
    setLoading(true);
    const { data } = await supabase
      .from('item_catalog')
      .select('*')
      .order('catalog_source')
      .order('item_number');
    setItems(data || []);
    setLoading(false);
  }

  async function saveItem() {
    if (!form.item_number || !form.description) { toast.error('Item number and description are required.'); return; }
    if (editItem) {
      const { error } = await supabase.from('item_catalog').update({
        item_number: form.item_number,
        description: form.description,
        primary_vendor: form.primary_vendor,
        catalog_source: form.catalog_source,
      }).eq('id', editItem.id);
      if (error) { toast.error('Update failed: ' + error.message); return; }
      setItems(prev => prev.map(i => i.id === editItem.id ? { ...i, ...form } : i));
      toast.success('Item updated!');
    } else {
      const { data: newItem, error } = await supabase.from('item_catalog').insert({
        item_number: form.item_number,
        description: form.description,
        primary_vendor: form.primary_vendor,
        catalog_source: form.catalog_source,
      }).select().single();
      if (error) { toast.error('Add failed: ' + error.message); return; }
      setItems(prev => [...prev, newItem].sort((a,b) => a.item_number.localeCompare(b.item_number)));
      toast.success('Item added!');
    }
    setEditItem(null);
    setShowAdd(false);
    setForm({ item_number: '', description: '', primary_vendor: '', catalog_source: 'edge' });
  }

  function openEdit(item) {
    setEditItem(item);
    setForm({ item_number: item.item_number, description: item.description, primary_vendor: item.primary_vendor || '', catalog_source: item.catalog_source || 'edge' });
    setShowAdd(true);
  }

  function openAdd() {
    setEditItem(null);
    setForm({ item_number: '', description: '', primary_vendor: '', catalog_source: filterCatalog || 'edge' });
    setShowAdd(true);
  }



  function handleImport(e) {
    const file = e.target.files[0];
    if (!file) return;
    setImporting(true);
    Papa.parse(file, {
      header: true, skipEmptyLines: true,
      complete: async (res) => {
        const rows = res.data;
        let inserted = 0, errors = 0;
        for (let i = 0; i < rows.length; i += 100) {
          const batch = rows.slice(i, i + 100).map(row => {
            const itemNumber  = (row['Item Number'] || row['item_number'] || '').trim();
            const description = (row['Description'] || row['description'] || '').trim();
            const vendor      = (row['Primary Vendor'] || row['primary_vendor'] || '').trim();
            const catalog     = (row['Catalog Source'] || row['catalog_source'] || filterCatalog || 'edge').trim().toLowerCase();
            if (!itemNumber) return null;
            return { item_number: itemNumber, description, primary_vendor: vendor, catalog_source: catalog };
          }).filter(Boolean);
          const { error } = await supabase.from('item_catalog').upsert(batch, { onConflict: 'item_number,catalog_source' });
          if (error) errors += batch.length; else inserted += batch.length;
        }
        if (errors === 0) toast.success('Imported ' + inserted + ' items!');
        else toast.warning('Imported ' + inserted + ' items with ' + errors + ' errors.');
        loadItems();
        setImporting(false);
        e.target.value = '';
      }
    });
  }

  // Get unique vendors for filter
  const vendors = [...new Set(items.map(i => i.primary_vendor).filter(Boolean))].sort();

  const filtered = items
    .filter(i => !filterCatalog || i.catalog_source === filterCatalog)
    .filter(i => !filterVendor || i.primary_vendor === filterVendor)
    .filter(i => !search || i.item_number?.toLowerCase().includes(search.toLowerCase()) || i.description?.toLowerCase().includes(search.toLowerCase()) || i.primary_vendor?.toLowerCase().includes(search.toLowerCase()));

  const catalogLabel = cat => CATALOGS.find(c => c.value === cat)?.label || cat;

  if (loading) return <div className="loading-center"><div className="spinner" /></div>;

  return (
    <div>
      {/* Add/Edit Modal */}
      {showAdd && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowAdd(false)}>
          <div className="modal">
            <div className="modal-head-blue">
              <div className="modal-head-title">{editItem ? 'Edit Item' : 'Add New Item'}</div>
              <div className="modal-head-sub">{editItem ? editItem.item_number : 'New catalog item'}</div>
            </div>
            <div className="modal-body">
              <div className="form-lbl" style={{ marginTop: 0 }}>Catalog *</div>
              <select className="form-sel" value={form.catalog_source} onChange={e => setForm(p => ({ ...p, catalog_source: e.target.value }))}>
                {CATALOGS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
              <div className="form-lbl">Item Number *</div>
              <input className="form-inp" value={form.item_number} onChange={e => setForm(p => ({ ...p, item_number: e.target.value }))} placeholder="e.g. EDG-001" autoFocus />
              <div className="form-lbl">Description *</div>
              <input className="form-inp" value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} placeholder="e.g. Surgical Gloves (Box/100)" />
              <div className="form-lbl">Vendor</div>
              <input className="form-inp" value={form.primary_vendor} onChange={e => setForm(p => ({ ...p, primary_vendor: e.target.value }))} placeholder="e.g. Edge" />
            </div>
            <div className="modal-actions">
              <button className="btn btn-outline" onClick={() => { setShowAdd(false); setEditItem(null); }}>Cancel</button>
              <button className="btn btn-primary" onClick={saveItem}>{editItem ? 'Save Changes' : 'Add Item'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Catalog toggle */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
        <div onClick={() => setFilterCatalog('')}
          style={{ padding: '10px 20px', borderRadius: 9, cursor: 'pointer', border: '1.5px solid', fontWeight: 700, fontSize: 13,
            borderColor: filterCatalog === '' ? 'var(--blue-action)' : 'var(--border)',
            background: filterCatalog === '' ? 'var(--blue-light)' : 'var(--white)',
            color: filterCatalog === '' ? 'var(--blue-action)' : 'var(--text-mid)' }}>
          All Catalogs ({items.length})
        </div>
        {CATALOGS.map(c => (
          <div key={c.value} onClick={() => setFilterCatalog(v => v === c.value ? '' : c.value)}
            style={{ padding: '10px 20px', borderRadius: 9, cursor: 'pointer', border: '1.5px solid', fontWeight: 700, fontSize: 13,
              borderColor: filterCatalog === c.value ? 'var(--blue-action)' : 'var(--border)',
              background: filterCatalog === c.value ? 'var(--blue-light)' : 'var(--white)',
              color: filterCatalog === c.value ? 'var(--blue-action)' : 'var(--text-mid)' }}>
            {c.label} ({items.filter(i => i.catalog_source === c.value).length})
          </div>
        ))}
      </div>

      {/* Filter row + action buttons */}
      <div className="filter-row" style={{ marginBottom: 16 }}>
        <span className="filter-label">Vendor:</span>
        <select className="filter-select" value={filterVendor} onChange={e => setFilterVendor(e.target.value)}>
          <option value="">All Vendors</option>
          {vendors.map(v => <option key={v} value={v}>{v}</option>)}
        </select>
        <span className="filter-label">Search:</span>
        <input className="search-input" placeholder="Search items..." value={search} onChange={e => setSearch(e.target.value)} />
        <span className="count-lbl ml-auto">{filtered.length} items</span>
        <button className="btn btn-outline" style={{ display: 'flex', alignItems: 'center', gap: 5 }} onClick={() => downloadTemplate('claimsoft_catalog')}>
          <svg width="11" height="11" viewBox="0 0 12 12" fill="none"><path d="M6 1v7M3 5.5l3 3 3-3M1 10h10" stroke="#475569" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
          Claimsoft Template
        </button>
        <button className="btn btn-outline" style={{ display: 'flex', alignItems: 'center', gap: 5 }} onClick={() => downloadTemplate('edge_catalog')}>
          <svg width="11" height="11" viewBox="0 0 12 12" fill="none"><path d="M6 1v7M3 5.5l3 3 3-3M1 10h10" stroke="#475569" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
          Account Edge Template
        </button>
        <label className="btn btn-outline" style={{ cursor: 'pointer' }}>
          {importing ? 'Importing...' : 'Import'}
          <input type="file" accept=".csv" onChange={handleImport} style={{ display: 'none' }} disabled={importing} />
        </label>
        <button className="btn btn-primary" onClick={openAdd}>+ Add Item</button>
      </div>

      {/* Table */}
      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Item Number</th>
              <th>Description</th>
              <th>Vendor</th>
              <th>Catalog</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-dim)', padding: 32, fontStyle: 'italic' }}>No items match your filter.</td></tr>
            ) : filtered.map(item => (
              <tr key={item.id}>
                <td style={{ fontWeight: 700, fontSize: 13 }}>{item.item_number}</td>
                <td>{item.description}</td>
                <td style={{ color: 'var(--text-mid)' }}>{item.primary_vendor || 'ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â'}</td>
                <td>
                  <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 6,
                    background: item.catalog_source === 'edge' ? 'var(--blue-light)' : 'var(--gold-light)',
                    color: item.catalog_source === 'edge' ? 'var(--blue-action)' : '#92660A' }}>
                    {catalogLabel(item.catalog_source)}
                  </span>
                </td>
                <td>
                  <button className="tbl-btn-sm" onClick={() => openEdit(item)}>Edit</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

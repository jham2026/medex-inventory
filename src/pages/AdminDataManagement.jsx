import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useToast } from '../components/ToastContext';
import Papa from 'papaparse';

export default function AdminDataManagement({ cycle }) {
  const toast = useToast();
  const [activeTab, setActiveTab] = useState('import');

  // Import state
  const [importType, setImportType]     = useState('accounts');
  const [catalogSource, setCatalogSource] = useState('edge');
  const [file, setFile]                 = useState(null);
  const [preview, setPreview]           = useState([]);
  const [importing, setImporting]       = useState(false);
  const [importResults, setImportResults] = useState(null);

  // Export state
  const [scope, setScope]               = useState('company');
  const [region, setRegion]             = useState('');
  const [rep, setRep]                   = useState('');
  const [regions, setRegions]           = useState([]);
  const [reps, setReps]                 = useState([]);
  const [exporting, setExporting]       = useState(false);
  const [cycles, setCycles]             = useState([]);
  const [selectedCycle, setSelectedCycle] = useState(cycle?.id || '');

  useEffect(() => {
    supabase.from('regions').select('*').order('name').then(({ data }) => setRegions(data || []));
    supabase.from('profiles').select('id,full_name').in('role', ['rep','manager']).order('full_name').then(({ data }) => setReps(data || []));
    supabase.from('count_cycles').select('*').order('created_at', { ascending: false }).then(({ data }) => {
      setCycles(data || []);
      if (!selectedCycle && data?.length) setSelectedCycle(data[0].id);
    });
  }, []);

  function handleFile(e) {
    const f = e.target.files[0];
    if (!f) return;
    setFile(f); setImportResults(null);
    Papa.parse(f, { header: true, skipEmptyLines: true, complete: (res) => setPreview(res.data.slice(0, 5)) });
  }

  function resetImport() { setFile(null); setPreview([]); setImportResults(null); }

  async function runImport() {
    if (!file) { toast.error('Please select a CSV file'); return; }
    setImporting(true); setImportResults(null);
    Papa.parse(file, {
      header: true, skipEmptyLines: true,
      complete: async (res) => {
        const rows = res.data;
        let inserted = 0, updated = 0, errors = 0;
        try {
          if (importType === 'accounts') {
            for (const row of rows) {
              const name    = (row['Account'] || row['account'] || '').trim();
              const region  = (row['Region'] || row['region'] || '').trim();
              const status  = (row['Status'] || row['status'] || 'Open').trim();
              const catalog = (row['Item Catalog'] || row['item_catalog'] || 'edge').trim().toLowerCase();
              const repRaw  = (row['Rep'] || row['rep'] || '').trim();
              if (!name) { errors++; continue; }
              const { data: regionData } = await supabase.from('regions').select('id').eq('name', region).single();
              const { error } = await supabase.from('accounts').upsert({
                name, is_active: status.toLowerCase() === 'open',
                catalog_source: catalog, region_id: regionData?.id || null, rep_name_raw: repRaw || null,
              }, { onConflict: 'name' });
              if (error) errors++; else inserted++;
            }
          } else if (importType === 'users') {
            for (const row of rows) {
              const email    = (row['EmailAddress'] || row['Email'] || row['email'] || '').trim();
              const fullName = (row['FullName'] || row['Full Name'] || row['full_name'] || '').trim();
              const role     = (row['Role'] || row['role'] || 'rep').trim().toLowerCase();
              const region   = (row['Region'] || row['region'] || '').trim();
              if (!email) { errors++; continue; }
              const { error } = await supabase.from('profiles').update({ full_name: fullName, role, region: region || null }).eq('email', email);
              if (error) errors++; else updated++;
            }
          } else if (importType === 'item_catalog') {
            for (let i = 0; i < rows.length; i += 100) {
              const batch = rows.slice(i, i + 100).map(row => {
                const itemNumber  = (row['Item Number'] || row['ItemNumber'] || row['item_number'] || '').trim();
                const description = (row['Description'] || row['description'] || row['Item Name'] || '').trim();
                const vendor      = (row['Primary Vendor'] || row['VendorName'] || row['vendor'] || '').trim();
                if (!itemNumber) return null;
                return { item_number: itemNumber, description, primary_vendor: vendor, catalog_source: catalogSource };
              }).filter(Boolean);
              const { error } = await supabase.from('item_catalog').upsert(batch, { onConflict: 'item_number,catalog_source' });
              if (error) errors += batch.length; else inserted += batch.length;
            }
          }
          setImportResults({ inserted, updated, errors, total: rows.length });
          if (errors === 0) toast.success('Import complete â€” ' + (inserted + updated) + ' records processed');
          else toast.warning('Import finished with ' + errors + ' errors â€” ' + (inserted + updated) + ' succeeded');
        } catch (err) { toast.error('Import failed: ' + err.message); }
        setImporting(false);
      }
    });
  }

  async function runExport() {
    if (!selectedCycle) { toast.error('Select a count cycle'); return; }
    setExporting(true);
    let query = supabase.from('count_line_items').select(`
      item_number_raw, description_raw, vendor_raw, quantity, previous_quantity, not_in_catalog,
      was_edited_after_submit, is_new_item, entered_via_scan,
      count:inventory_counts(id, submitted_at, approved_at, status,
        rep:profiles(full_name, email),
        account:accounts(name, region:regions(name)))
    `).eq('count.cycle_id', selectedCycle);
    if (scope === 'region' && region) query = query.eq('count.account.region.name', region);
    if (scope === 'rep' && rep) query = query.eq('count.rep_id', rep);
    const { data, error } = await query;
    if (error) { toast.error('Export error: ' + error.message); setExporting(false); return; }
    const rows = (data || []).filter(d => d.count);
    const cycleLabel = cycles.find(c => c.id === selectedCycle)?.name || 'export';
    const header = ['Region','Account','Rep','Item Number','Description','Vendor','Count','Previous Count','New Item','Not In Catalog','Edited After Submit','Scanned','Submitted Date','Status'];
    const csvRows = [header, ...rows.map(r => [
      r.count?.account?.region?.name || '', r.count?.account?.name || '',
      r.count?.rep?.full_name || '', r.item_number_raw || '',
      r.description_raw || '', r.vendor_raw || '', r.quantity, r.previous_quantity ?? '',
      r.is_new_item ? 'YES' : 'NO', r.not_in_catalog ? 'FLAG' : 'NO',
      r.was_edited_after_submit ? 'FLAG' : 'NO', r.entered_via_scan ? 'YES' : 'NO',
      r.count?.submitted_at ? new Date(r.count.submitted_at).toLocaleDateString() : '',
      r.count?.status || '',
    ])];
    const csv = csvRows.map(r => r.map(v => '"' + String(v).replace(/"/g,'""') + '"').join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'MedEx_' + cycleLabel.replace(/\s/g,'_') + '_export.csv';
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Exported ' + rows.length + ' line items');
    setExporting(false);
  }

  const importTypes = [
    { key: 'accounts',     label: 'Accounts',    desc: 'Region, Account, Status, Rep, Item Catalog' },
    { key: 'users',        label: 'Users',        desc: 'FullName, EmailAddress, Role, Region' },
    { key: 'item_catalog', label: 'Item Catalog', desc: 'Item Number, Description, Primary Vendor' },
  ];

  return (
    <div>
      {/* Tabs */}
      <div className="tab-row">
        <button className={'tab' + (activeTab === 'import' ? ' active' : '')} onClick={() => setActiveTab('import')}>Import Data</button>
        <button className={'tab' + (activeTab === 'export' ? ' active' : '')} onClick={() => setActiveTab('export')}>Export Data</button>
      </div>

      {/* â”€â”€ IMPORT â”€â”€ */}
      {activeTab === 'import' && (
        <div className="import-grid">
          <div className="card">
            <div className="card-head">
              <div>
                <div className="card-head-title">Import Data</div>
                <div className="card-head-sub">Upload a CSV to add or update records</div>
              </div>
            </div>
            <div className="card-body">
              <div className="field-label">What are you importing?</div>
              {importTypes.map(({ key, label, desc }) => (
                <div key={key} className={'import-opt' + (importType === key ? ' sel' : '')} onClick={() => { setImportType(key); resetImport(); }}>
                  <div className="import-opt-title">{label}</div>
                  <div className="import-opt-sub">{desc}</div>
                </div>
              ))}

              {importType === 'item_catalog' && (
                <>
                  <div className="field-label">Catalog Source</div>
                  <div style={{ display: 'flex', gap: 10 }}>
                    {[['edge','Edge'],['claimsoft','Claimsoft']].map(([k, v]) => (
                      <div key={k} onClick={() => setCatalogSource(k)}
                        style={{ flex: 1, padding: 10, borderRadius: 8, cursor: 'pointer', border: '1.5px solid', textAlign: 'center', fontSize: 13, fontWeight: 600,
                          borderColor: catalogSource === k ? 'var(--blue-action)' : 'var(--border)',
                          background: catalogSource === k ? 'var(--blue-light)' : 'var(--white)',
                          color: catalogSource === k ? 'var(--blue-action)' : 'var(--text-mid)' }}>
                        {v}
                      </div>
                    ))}
                  </div>
                </>
              )}

              <div className="field-label">Select CSV File</div>
              <label className="file-drop" style={{ borderColor: file ? 'var(--blue-action)' : 'var(--border)', background: file ? 'var(--blue-light)' : 'var(--bg)' }}>
                <input type="file" accept=".csv" onChange={handleFile} style={{ display: 'none' }} />
                <div style={{ fontWeight: 600, color: file ? 'var(--blue-action)' : 'var(--text-mid)' }}>{file ? file.name : 'Choose CSV file...'}</div>
                <div style={{ fontSize: 12, marginTop: 4, color: 'var(--text-dim)' }}>{file ? (file.size / 1024).toFixed(1) + ' KB' : 'Click to browse'}</div>
              </label>

              {importResults && (
                <div style={{ padding: '12px 14px', borderRadius: 8, marginTop: 12, background: importResults.errors === 0 ? 'var(--green-light)' : 'var(--amber-light)', border: '1px solid ' + (importResults.errors === 0 ? '#86EFAC' : '#FDE68A') }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: importResults.errors === 0 ? 'var(--green)' : 'var(--amber)' }}>Import Complete</div>
                  <div style={{ fontSize: 12, marginTop: 3, color: 'var(--text-mid)' }}>{importResults.inserted + importResults.updated} processed Â· {importResults.errors} errors Â· {importResults.total} total rows</div>
                </div>
              )}

              <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
                <button className="btn btn-primary" style={{ flex: 1 }} onClick={runImport} disabled={importing || !file}>{importing ? 'Importing...' : 'Run Import'}</button>
                {file && <button className="btn btn-outline" onClick={resetImport}>Clear</button>}
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-head">
              <div>
                <div className="card-head-title">File Preview</div>
                <div className="card-head-sub">First 5 rows of your CSV</div>
              </div>
            </div>
            <div className="card-body">
              {preview.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-dim)' }}>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>No file selected</div>
                  <div style={{ fontSize: 12, marginTop: 4 }}>Upload a CSV to preview its contents</div>
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ fontSize: 11 }}>
                    <thead>
                      <tr>{Object.keys(preview[0]).slice(0,6).map(k => <th key={k}>{k}</th>)}</tr>
                    </thead>
                    <tbody>
                      {preview.map((row, i) => (
                        <tr key={i}>{Object.values(row).slice(0,6).map((v, j) => <td key={j}>{v}</td>)}</tr>
                      ))}
                    </tbody>
                  </table>
                  <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 8 }}>Showing up to 6 columns Â· {preview.length} rows previewed</div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* â”€â”€ EXPORT â”€â”€ */}
      {activeTab === 'export' && (
        <div style={{ maxWidth: 600 }}>
          <div className="card">
            <div className="card-head">
              <div>
                <div className="card-head-title">Export Count Data</div>
                <div className="card-head-sub">Download count data as CSV</div>
              </div>
            </div>
            <div className="card-body">
              <div className="field-label">Count Cycle</div>
              <select className="form-sel" style={{ width: '100%', marginBottom: 4 }} value={selectedCycle} onChange={e => setSelectedCycle(e.target.value)}>
                {cycles.map(c => <option key={c.id} value={c.id}>{c.name} ({c.status})</option>)}
              </select>

              <div className="field-label">Export Scope</div>
              <div style={{ display: 'flex', gap: 10, marginBottom: 4 }}>
                {[['company','Company-Wide'],['region','By Region'],['rep','By Rep']].map(([k,v]) => (
                  <div key={k} onClick={() => setScope(k)}
                    style={{ flex: 1, padding: 10, borderRadius: 8, cursor: 'pointer', border: '1.5px solid', textAlign: 'center', fontSize: 13, fontWeight: 600,
                      borderColor: scope === k ? 'var(--blue-action)' : 'var(--border)',
                      background: scope === k ? 'var(--blue-light)' : 'var(--white)',
                      color: scope === k ? 'var(--blue-action)' : 'var(--text-mid)' }}>
                    {v}
                  </div>
                ))}
              </div>

              {scope === 'region' && (
                <>
                  <div className="field-label">Region</div>
                  <select className="form-sel" style={{ width: '100%' }} value={region} onChange={e => setRegion(e.target.value)}>
                    <option value="">Select Region...</option>
                    {regions.map(r => <option key={r.id} value={r.name}>{r.name}</option>)}
                  </select>
                </>
              )}
              {scope === 'rep' && (
                <>
                  <div className="field-label">Rep</div>
                  <select className="form-sel" style={{ width: '100%' }} value={rep} onChange={e => setRep(e.target.value)}>
                    <option value="">Select Rep...</option>
                    {reps.map(r => <option key={r.id} value={r.id}>{r.full_name}</option>)}
                  </select>
                </>
              )}

              <div className="warn-box">Export includes all count line items with flags for not-in-catalog items, post-submission edits, and new items.</div>
              <button className="btn btn-primary" style={{ width: '100%', padding: 13 }} onClick={runExport} disabled={exporting || !selectedCycle}>
                {exporting ? 'Exporting...' : 'Download CSV Export'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

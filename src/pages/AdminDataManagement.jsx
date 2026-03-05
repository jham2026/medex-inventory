import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { useToast } from '../components/ToastContext';
import Papa from 'papaparse';

//  EXPORT COMPONENT 
function ExportPanel({ cycle }) {
  const toast = useToast();
  const [scope, setScope] = useState('company');
  const [region, setRegion] = useState('');
  const [rep, setRep] = useState('');
  const [regions, setRegions] = useState([]);
  const [reps, setReps] = useState([]);
  const [exporting, setExporting] = useState(false);
  const [cycles, setCycles] = useState([]);
  const [selectedCycle, setSelectedCycle] = useState(cycle?.id || '');

  useState(() => {
    supabase.from('regions').select('*').order('name').then(({ data }) => setRegions(data || []));
    supabase.from('profiles').select('id,full_name').eq('role', 'rep').order('full_name').then(({ data }) => setReps(data || []));
    supabase.from('count_cycles').select('*').order('year', { ascending: false }).then(({ data }) => {
      setCycles(data || []);
      if (!selectedCycle && data?.length) setSelectedCycle(data[0].id);
    });
  }, []);

  async function runExport() {
    if (!selectedCycle) { toast.error('Select a count cycle'); return; }
    setExporting(true);
    let query = supabase
      .from('count_line_items')
      .select(`
        item_number_raw, description_raw, vendor_raw,
        quantity, previous_quantity, not_in_catalog,
        was_edited_after_submit, is_new_item, entered_via_scan,
        count:inventory_counts(
          id, submitted_at, approved_at, status,
          rep:profiles(full_name, email),
          account:accounts(name, region:regions(name))
        )
      `)
      .eq('count.cycle_id', selectedCycle);

    if (scope === 'region' && region) query = query.eq('count.account.region.name', region);
    if (scope === 'rep' && rep) query = query.eq('count.rep_id', rep);

    const { data, error } = await query;
    if (error) { toast.error('Export error: ' + error.message); setExporting(false); return; }

    const rows = (data || []).filter(d => d.count);
    const cycleLabel = cycles.find(c => c.id === selectedCycle)?.name || 'export';
    const header = ['Region', 'Account', 'Rep', 'Item Number', 'Description', 'Vendor',
      'Count', 'Previous Count', 'New Item', 'Not In Catalog',
      'Edited After Submit', 'Scanned', 'Submitted Date', 'Status'];
    const csvRows = [header, ...rows.map(r => [
      r.count?.account?.region?.name || '',
      r.count?.account?.name || '',
      r.count?.rep?.full_name || '',
      r.item_number_raw || '',
      r.description_raw || '',
      r.vendor_raw || '',
      r.quantity,
      r.previous_quantity ?? '',
      r.is_new_item ? 'YES' : 'NO',
      r.not_in_catalog ? 'FLAG' : 'NO',
      r.was_edited_after_submit ? 'FLAG' : 'NO',
      r.entered_via_scan ? 'YES' : 'NO',
      r.count?.submitted_at ? new Date(r.count.submitted_at).toLocaleDateString() : '',
      r.count?.status || '',
    ])];
    const csv = csvRows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const scopeLabel = scope === 'company' ? 'company_wide' : scope === 'region' ? `region_${region}` : `rep`;
    a.download = `MedEx_${cycleLabel.replace(/\s/g, '_')}_${scopeLabel}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${rows.length} line items`);
    setExporting(false);
  }

  return (
    <div className="card">
      <div className="card-header">
        <span style={{ fontWeight: 'bold' }}>Export Count Data</span>
      </div>
      <div className="card-body">
        <div className="input-group">
          <label className="input-label">Count Cycle</label>
          <select className="select" style={{ maxWidth: 240 }}
            value={selectedCycle} onChange={e => setSelectedCycle(e.target.value)}>
            {cycles.map(c => <option key={c.id} value={c.id}>{c.name} ({c.status})</option>)}
          </select>
        </div>
        <div className="input-group">
          <label className="input-label">Export Scope</label>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {[['company', 'Company-Wide'], ['region', 'By Region'], ['rep', 'By Rep']].map(([k, v]) => (
              <label key={k} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13 }}>
                <input type="radio" name="scope" value={k} checked={scope === k} onChange={() => setScope(k)} />
                {v}
              </label>
            ))}
          </div>
        </div>
        {scope === 'region' && (
          <div className="input-group">
            <label className="input-label">Region</label>
            <select className="select" style={{ maxWidth: 200 }} value={region} onChange={e => setRegion(e.target.value)}>
              <option value=""> Select Region </option>
              {regions.map(r => <option key={r.id} value={r.name}>{r.name}</option>)}
            </select>
          </div>
        )}
        {scope === 'rep' && (
          <div className="input-group">
            <label className="input-label">Rep</label>
            <select className="select" style={{ maxWidth: 240 }} value={rep} onChange={e => setRep(e.target.value)}>
              <option value=""> Select Rep </option>
              {reps.map(r => <option key={r.id} value={r.id}>{r.full_name}</option>)}
            </select>
          </div>
        )}
        <div className="alert-banner info" style={{ marginBottom: 16 }}>
          Export includes all count line items with flags for: not-in-catalog items, post-submission edits, and new items.
        </div>
        <button className="btn btn-primary btn-lg" onClick={runExport} disabled={exporting || !selectedCycle}>
          {exporting ? 'Exporting...' : 'Download CSV Export'}
        </button>
      </div>
    </div>
  );
}

//  IMPORT COMPONENT 
function ImportPanel() {
  const toast = useToast();
  const [importType, setImportType] = useState('accounts');
  const [catalogSource, setCatalogSource] = useState('edge');
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState([]);
  const [importing, setImporting] = useState(false);
  const [results, setResults] = useState(null);

  const importTypes = [
    { key: 'accounts',     label: 'Accounts',      icon: '' },
    { key: 'users',        label: 'Users',          icon: '' },
    { key: 'item_catalog', label: 'Item Catalog',   icon: '' },
  ];

  function handleFile(e) {
    const f = e.target.files[0];
    if (!f) return;
    setFile(f);
    setResults(null);
    Papa.parse(f, {
      header: true,
      skipEmptyLines: true,
      complete: (res) => {
        setPreview(res.data.slice(0, 5));
      }
    });
  }

  async function runImport() {
    if (!file) { toast.error('Please select a CSV file'); return; }
    setImporting(true);
    setResults(null);

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (res) => {
        const rows = res.data;
        let inserted = 0, updated = 0, errors = 0;

        try {
          if (importType === 'accounts') {
            for (const row of rows) {
              const name = (row['Account'] || row['account'] || '').trim();
              const region = (row['Region '] || row['Region'] || row['region'] || '').trim();
              const status = (row['Status'] || row['status'] || 'Open').trim();
              const catalog = (row['Item Catalog'] || row['item_catalog'] || 'edge').trim().toLowerCase();
              const repRaw = (row['Rep'] || row['rep'] || '').trim();
              if (!name) { errors++; continue; }

              // Get region id
              const { data: regionData } = await supabase
                .from('regions').select('id').eq('name', region).single();

              const { error } = await supabase.from('accounts').upsert({
                name,
                is_active: status.toLowerCase() === 'open',
                catalog_source: catalog,
                region_id: regionData?.id || null,
                rep_name_raw: repRaw || null,
              }, { onConflict: 'name' });

              if (error) { errors++; } else { inserted++; }
            }
          }

          else if (importType === 'users') {
            for (const row of rows) {
              const email = (row['EmailAddress'] || row['Email'] || row['email'] || '').trim();
              const fullName = (row['FullName'] || row['Full Name'] || row['full_name'] || '').trim();
              const role = (row['Role'] || row['role'] || 'rep').trim().toLowerCase();
              const region = (row['Region'] || row['region'] || '').trim();
              if (!email) { errors++; continue; }

              const { data: regionData } = await supabase
                .from('regions').select('id').eq('name', region).single();

              const { error } = await supabase
                .from('profiles')
                .update({ full_name: fullName, role, region: region || null })
                .eq('email', email);

              if (error) { errors++; } else { updated++; }
            }
          }

          else if (importType === 'item_catalog') {
            const batchSize = 100;
            for (let i = 0; i < rows.length; i += batchSize) {
              const batch = rows.slice(i, i + batchSize).map(row => {
                // Handle both Edge and Claimsoft column formats
                const itemNumber = (
                  row['Item Number'] || row['ItemNumber'] ||
                  row['item_number'] || ''
                ).trim();
                const description = (
                  row['Description'] || row['description'] ||
                  row['Item Name'] || ''
                ).trim();
                const vendor = (
                  row['Primary Vendor'] || row['VendorName'] ||
                  row['vendor'] || ''
                ).trim();
                if (!itemNumber) return null;
                return { item_number: itemNumber, description, primary_vendor: vendor, catalog_source: catalogSource };
              }).filter(Boolean);

              const { error } = await supabase.from('item_catalog')
                .upsert(batch, { onConflict: 'item_number' });

              if (error) { errors += batch.length; }
              else { inserted += batch.length; }
            }
          }

          setResults({ inserted, updated, errors, total: rows.length });
          if (errors === 0) {
            toast.success(`Import complete  ${inserted + updated} records processed`);
          } else {
            toast.warning(`Import finished with ${errors} errors  ${inserted + updated} succeeded`);
          }
        } catch (err) {
          toast.error('Import failed: ' + err.message);
        }
        setImporting(false);
      }
    });
  }

  function reset() {
    setFile(null);
    setPreview([]);
    setResults(null);
  }

  return (
    <div className="card">
      <div className="card-header">
        <span style={{ fontWeight: 'bold' }}>Import Data</span>
      </div>
      <div className="card-body">

        {/* Import Type Selector */}
        <div className="input-group">
          <label className="input-label">What are you importing?</label>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {importTypes.map(({ key, label, icon }) => (
              <button key={key}
                onClick={() => { setImportType(key); reset(); }}
                className={`btn ${importType === key ? 'btn-primary' : 'btn-utility'}`}
                style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {icon} {label}
              </button>
            ))}
          </div>
        </div>

        {/* Catalog Source (only for item catalog) */}
        {importType === 'item_catalog' && (
          <div className="input-group">
            <label className="input-label">Catalog Source</label>
            <div style={{ display: 'flex', gap: 10 }}>
              {[['edge', 'Edge'], ['claimsoft', 'Claimsoft']].map(([k, v]) => (
                <label key={k} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13 }}>
                  <input type="radio" name="catalogSource" value={k}
                    checked={catalogSource === k} onChange={() => setCatalogSource(k)} />
                  {v}
                </label>
              ))}
            </div>
          </div>
        )}

        {/* Expected Format Info */}
        <div className="alert-banner info" style={{ marginBottom: 16, fontSize: 12 }}>
          {importType === 'accounts' && (
            <>Expected columns: <strong>Region, Account, Status, Rep, Item Catalog</strong></>
          )}
          {importType === 'users' && (
            <>Expected columns: <strong>LastName, FirstName, FullName, EmailAddress, Role, Region</strong></>
          )}
          {importType === 'item_catalog' && (
            <>Supports both Edge format <strong>(Item Number, Description, Primary Vendor)</strong> and Claimsoft format <strong>(ItemNumber, Description, VendorName)</strong></>
          )}
        </div>

        {/* File Upload */}
        <div className="input-group">
          <label className="input-label">Select CSV File</label>
          <input type="file" accept=".csv"
            onChange={handleFile}
            style={{ fontSize: 13, padding: '6px 0' }} />
        </div>

        {/* Preview */}
        {preview.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--gray-dark)', marginBottom: 6 }}>
              PREVIEW (first 5 rows)
            </div>
            <div style={{ overflowX: 'auto', border: '1px solid var(--gray-mid)', borderRadius: 6 }}>
              <table style={{ fontSize: 11, minWidth: 400 }}>
                <thead>
                  <tr>
                    {Object.keys(preview[0]).slice(0, 6).map(k => (
                      <th key={k} style={{ padding: '6px 10px', background: 'var(--gray-light)', textAlign: 'left', whiteSpace: 'nowrap' }}>{k}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.map((row, i) => (
                    <tr key={i}>
                      {Object.values(row).slice(0, 6).map((v, j) => (
                        <td key={j} style={{ padding: '5px 10px', borderTop: '1px solid var(--gray-mid)', whiteSpace: 'nowrap' }}>{v}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ fontSize: 11, color: 'var(--gray-dark)', marginTop: 4 }}>Showing up to 6 columns</div>
          </div>
        )}

        {/* Results */}
        {results && (
          <div className={`alert-banner ${results.errors === 0 ? 'success' : 'warning'}`} style={{ marginBottom: 16 }}>
            <strong>Import Complete</strong><br />
             {results.inserted + results.updated} records processed &nbsp;
            {results.errors > 0 && <span> {results.errors} errors</span>}
            <span style={{ color: 'var(--gray-dark)', marginLeft: 8, fontSize: 12 }}>({results.total} total rows in file)</span>
          </div>
        )}

        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-primary btn-lg"
            onClick={runImport}
            disabled={importing || !file}>
            {importing ? 'Importing...' : 'Run Import'}
          </button>
          {file && (
            <button className="btn btn-utility" onClick={reset}>
              Clear
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

//  MAIN DATA MANAGEMENT PAGE 
export default function AdminDataManagement({ cycle }) {
  const [panel, setPanel] = useState('import');

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
        {[['import', 'Import Data'], ['export', 'Export Data']].map(([k, v]) => (
          <button key={k}
            className={`btn ${panel === k ? 'btn-primary' : 'btn-utility'}`}
            onClick={() => setPanel(k)}>
            {v}
          </button>
        ))}
      </div>
      {panel === 'import' && <ImportPanel />}
      {panel === 'export' && <ExportPanel cycle={cycle} />}
    </div>
  );
}

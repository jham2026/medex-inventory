import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useToast } from '../components/ToastContext';
import Papa from 'papaparse';

export default function AdminDataManagement({ cycle }) {
  const toast = useToast();

  // Import state
  const [importType, setImportType]       = useState('accounts');
  const [catalogSource, setCatalogSource] = useState('edge');
  const [file, setFile]                   = useState(null);
  const [preview, setPreview]             = useState([]);
  const [importing, setImporting]         = useState(false);
  const [importResults, setImportResults] = useState(null);

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
              const region  = (row['Region']  || row['region']  || '').trim();
              const status  = (row['Status']  || row['status']  || 'Open').trim();
              const catalog = (row['Item Catalog'] || row['item_catalog'] || 'edge').trim().toLowerCase();
              const repRaw  = (row['Rep'] || row['rep'] || '').trim();
              if (!name) { errors++; continue; }
              const { data: regionData } = await supabase.from('regions').select('id').eq('name', region).maybeSingle();
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
                const catalog     = (row['Catalog Source'] || row['catalog_source'] || catalogSource).trim().toLowerCase();
                if (!itemNumber) return null;
                return { item_number: itemNumber, description, primary_vendor: vendor, catalog_source: catalog };
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

  const importTypes = [
    { key: 'accounts',     label: 'Accounts',     desc: 'Account, Region, Status, Rep, Item Catalog' },
    { key: 'users',        label: 'Users',         desc: 'FullName, EmailAddress, Role, Region' },
    { key: 'item_catalog', label: 'Item Catalog',  desc: 'Item Number, Description, Primary Vendor, Catalog Source' },
  ];

  return (
    <div className="import-grid">
      {/* Left: Import settings */}
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
                {[['edge','Account Edge'],['claimsoft','Claimsoft']].map(([k, v]) => (
                  <div key={k} onClick={() => setCatalogSource(k)}
                    style={{ flex: 1, padding: 10, borderRadius: 8, cursor: 'pointer', border: '1.5px solid', textAlign: 'center', fontSize: 13, fontWeight: 600,
                      borderColor: catalogSource === k ? 'var(--blue-action)' : 'var(--border)',
                      background:  catalogSource === k ? 'var(--blue-light)'   : 'var(--white)',
                      color:       catalogSource === k ? 'var(--blue-action)' : 'var(--text-mid)' }}>
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
            <div style={{ padding: '12px 14px', borderRadius: 8, marginTop: 12,
              background: importResults.errors === 0 ? 'var(--green-light)' : 'var(--amber-light)',
              border: '1px solid ' + (importResults.errors === 0 ? '#86EFAC' : '#FDE68A') }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: importResults.errors === 0 ? 'var(--green)' : 'var(--amber)' }}>Import Complete</div>
              <div style={{ fontSize: 12, marginTop: 3, color: 'var(--text-mid)' }}>
                {importResults.inserted + importResults.updated} processed Â· {importResults.errors} errors Â· {importResults.total} total rows
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
            <button className="btn btn-primary" style={{ flex: 1 }} onClick={runImport} disabled={importing || !file}>
              {importing ? 'Importing...' : 'Run Import'}
            </button>
            {file && <button className="btn btn-outline" onClick={resetImport}>Clear</button>}
          </div>
        </div>
      </div>

      {/* Right: File preview */}
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
              <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 8 }}>
                Showing up to 6 columns Â· {preview.length} rows previewed
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useToast } from '../components/ToastContext';
import Papa from 'papaparse';

export default function AdminDataManagement({ cycle }) {
  const toast = useToast();
  const [activeTab, setActiveTab] = useState('import');

  // â”â” IMPORT STATE â”â”
  const [importType, setImportType] = useState('accounts');
  const [catalogSource, setCatalogSource] = useState('edge');
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState([]);
  const [importing, setImporting] = useState(false);
  const [importResults, setImportResults] = useState(null);

  // â”â” EXPORT STATE â”â”
  const [scope, setScope] = useState('company');
  const [region, setRegion] = useState('');
  const [rep, setRep] = useState('');
  const [regions, setRegions] = useState([]);
  const [reps, setReps] = useState([]);
  const [exporting, setExporting] = useState(false);
  const [cycles, setCycles] = useState([]);
  const [selectedCycle, setSelectedCycle] = useState(cycle?.id || '');

  useEffect(() => {
    supabase.from('regions').select('*').order('name').then(({ data }) => setRegions(data || []));
    supabase.from('profiles').select('id,full_name').in('role', ['rep','manager']).order('full_name').then(({ data }) => setReps(data || []));
    supabase.from('count_cycles').select('*').order('created_at', { ascending: false }).then(({ data }) => {
      setCycles(data || []);
      if (!selectedCycle && data?.length) setSelectedCycle(data[0].id);
    });
  }, []);

  // â”â” IMPORT FUNCTIONS â”â”
  function handleFile(e) {
    const f = e.target.files[0];
    if (!f) return;
    setFile(f);
    setImportResults(null);
    Papa.parse(f, {
      header: true,
      skipEmptyLines: true,
      complete: (res) => setPreview(res.data.slice(0, 5)),
    });
  }

  function resetImport() {
    setFile(null);
    setPreview([]);
    setImportResults(null);
  }

  async function runImport() {
    if (!file) { toast.error('Please select a CSV file'); return; }
    setImporting(true);
    setImportResults(null);

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
              const region = (row['Region'] || row['region'] || '').trim();
              const status = (row['Status'] || row['status'] || 'Open').trim();
              const catalog = (row['Item Catalog'] || row['item_catalog'] || 'edge').trim().toLowerCase();
              const repRaw = (row['Rep'] || row['rep'] || '').trim();
              if (!name) { errors++; continue; }
              const { data: regionData } = await supabase.from('regions').select('id').eq('name', region).single();
              const { error } = await supabase.from('accounts').upsert({
                name, is_active: status.toLowerCase() === 'open',
                catalog_source: catalog, region_id: regionData?.id || null, rep_name_raw: repRaw || null,
              }, { onConflict: 'name' });
              if (error) { errors++; } else { inserted++; }
            }
          } else if (importType === 'users') {
            for (const row of rows) {
              const email = (row['EmailAddress'] || row['Email'] || row['email'] || '').trim();
              const fullName = (row['FullName'] || row['Full Name'] || row['full_name'] || '').trim();
              const role = (row['Role'] || row['role'] || 'rep').trim().toLowerCase();
              const region = (row['Region'] || row['region'] || '').trim();
              if (!email) { errors++; continue; }
              const { error } = await supabase.from('profiles')
                .update({ full_name: fullName, role, region: region || null }).eq('email', email);
              if (error) { errors++; } else { updated++; }
            }
          } else if (importType === 'item_catalog') {
            const batchSize = 100;
            for (let i = 0; i < rows.length; i += batchSize) {
              const batch = rows.slice(i, i + batchSize).map(row => {
                const itemNumber = (row['Item Number'] || row['ItemNumber'] || row['item_number'] || '').trim();
                const description = (row['Description'] || row['description'] || row['Item Name'] || '').trim();
                const vendor = (row['Primary Vendor'] || row['VendorName'] || row['vendor'] || '').trim();
                if (!itemNumber) return null;
                return { item_number: itemNumber, description, primary_vendor: vendor, catalog_source: catalogSource };
              }).filter(Boolean);
              const { error } = await supabase.from('item_catalog').upsert(batch, { onConflict: 'item_number,catalog_source' });
              if (error) { errors += batch.length; } else { inserted += batch.length; }
            }
          }

          setImportResults({ inserted, updated, errors, total: rows.length });
          if (errors === 0) toast.success(`Import complete â” ${inserted + updated} records processed`);
          else toast.warning(`Import finished with ${errors} errors â” ${inserted + updated} succeeded`);
        } catch (err) {
          toast.error('Import failed: ' + err.message);
        }
        setImporting(false);
      }
    });
  }

  // â”â” EXPORT FUNCTION â”â”
  async function runExport() {
    if (!selectedCycle) { toast.error('Select a count cycle'); return; }
    setExporting(true);

    let query = supabase.from('count_line_items').select(`
      item_number_raw, description_raw, vendor_raw,
      quantity, previous_quantity, not_in_catalog,
      was_edited_after_submit, is_new_item, entered_via_scan,
      count:inventory_counts(
        id, submitted_at, approved_at, status,
        rep:profiles(full_name, email),
        account:accounts(name, region:regions(name))
      )
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
      r.description_raw || '', r.vendor_raw || '', r.quantity,
      r.previous_quantity ?? '', r.is_new_item ? 'YES' : 'NO',
      r.not_in_catalog ? 'FLAG' : 'NO', r.was_edited_after_submit ? 'FLAG' : 'NO',
      r.entered_via_scan ? 'YES' : 'NO',
      r.count?.submitted_at ? new Date(r.count.submitted_at).toLocaleDateString() : '',
      r.count?.status || '',
    ])];
    const csv = csvRows.map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `MedEx_${cycleLabel.replace(/\s/g,'_')}_${scope === 'company' ? 'company_wide' : scope === 'region' ? `region_${region}` : 'rep'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${rows.length} line items`);
    setExporting(false);
  }

  const importTypes = [
    { key: 'accounts',     label: 'Accounts',     desc: 'Region, Account, Status, Rep, Item Catalog' },
    { key: 'users',        label: 'Users',         desc: 'FullName, EmailAddress, Role, Region' },
    { key: 'item_catalog', label: 'Item Catalog',  desc: 'Item Number, Description, Primary Vendor' },
  ];

  return (
    <div>
      {/* Tab Toggle */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 24, background: 'white', borderRadius: 10, padding: 4, border: '1.5px solid #E1E8EE', width: 'fit-content' }}>
        {[['import', 'Import Data'], ['export', 'Export Data']].map(([k, v]) => (
          <button key={k} onClick={() => setActiveTab(k)}
            style={{
              padding: '8px 24px', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600,
              cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s',
              background: activeTab === k ? '#0076BB' : 'transparent',
              color: activeTab === k ? 'white' : '#7A909F',
            }}>
            {v}
          </button>
        ))}
      </div>

      {/* â”â” IMPORT PANEL â”â” */}
      {activeTab === 'import' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, alignItems: 'start' }}>

          {/* Left: Import settings */}
          <div className="card">
            <div className="card-header" style={{ borderBottom: '3px solid #EEAF24' }}>
              <div className="card-title">Import Data</div>
              <div style={{ fontSize: 12, color: '#7A909F', marginTop: 2 }}>Upload a CSV to add or update records</div>
            </div>
            <div className="card-body">

              {/* Import Type */}
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#7A909F', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>What are you importing?</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {importTypes.map(({ key, label, desc }) => (
                    <div key={key} onClick={() => { setImportType(key); resetImport(); }}
                      style={{
                        padding: '12px 14px', borderRadius: 8, cursor: 'pointer', border: '1.5px solid',
                        borderColor: importType === key ? '#0076BB' : '#E1E8EE',
                        background: importType === key ? '#e8f4fb' : 'white',
                        transition: 'all 0.15s',
                      }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: importType === key ? '#0076BB' : '#1A2B38' }}>{label}</div>
                      <div style={{ fontSize: 11, color: '#7A909F', marginTop: 2 }}>{desc}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Catalog Source */}
              {importType === 'item_catalog' && (
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#7A909F', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>Catalog Source</div>
                  <div style={{ display: 'flex', gap: 10 }}>
                    {[['edge', 'Edge'], ['claimsoft', 'Claimsoft']].map(([k, v]) => (
                      <label key={k} onClick={() => setCatalogSource(k)}
                        style={{
                          flex: 1, padding: '10px', borderRadius: 8, cursor: 'pointer', border: '1.5px solid',
                          borderColor: catalogSource === k ? '#0076BB' : '#E1E8EE',
                          background: catalogSource === k ? '#e8f4fb' : 'white',
                          textAlign: 'center', fontSize: 13, fontWeight: 600,
                          color: catalogSource === k ? '#0076BB' : '#3D5466',
                        }}>
                        {v}
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {/* File Upload */}
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#7A909F', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Select CSV File</div>
                <label style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px',
                  border: '2px dashed ' + (file ? '#0076BB' : '#C5D1DA'), borderRadius: 8,
                  cursor: 'pointer', background: file ? '#e8f4fb' : '#F7F9FB',
                }}>
                  <input type="file" accept=".csv" onChange={handleFile} style={{ display: 'none' }} />
                  
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: file ? '#0076BB' : '#3D5466' }}>
                      {file ? file.name : 'Choose CSV file...'}
                    </div>
                    <div style={{ fontSize: 11, color: '#7A909F' }}>
                      {file ? `${(file.size / 1024).toFixed(1)} KB` : 'Click to browse'}
                    </div>
                  </div>
                </label>
              </div>

              {/* Results */}
              {importResults && (
                <div style={{
                  padding: '12px 14px', borderRadius: 8, marginBottom: 16,
                  background: importResults.errors === 0 ? '#f0fff4' : '#fef8eb',
                  border: '1px solid ' + (importResults.errors === 0 ? '#22C55E' : '#EEAF24'),
                }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: importResults.errors === 0 ? '#15803d' : '#c88e0f', marginBottom: 4 }}>
                    Import Complete
                  </div>
                  <div style={{ fontSize: 12, color: '#3D5466' }}>
                    {importResults.inserted + importResults.updated} records processed
                    {importResults.errors > 0 && <span style={{ color: '#EF4444', marginLeft: 8 }}>{importResults.errors} errors</span>}
                    <span style={{ color: '#7A909F', marginLeft: 8 }}>({importResults.total} total rows)</span>
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={runImport} disabled={importing || !file}
                  style={{
                    flex: 1, padding: '12px', background: importing || !file ? '#C5D1DA' : '#0076BB',
                    color: 'white', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 700,
                    cursor: importing || !file ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
                  }}>
                  {importing ? 'Importing...' : 'Run Import'}
                </button>
                {file && (
                  <button onClick={resetImport}
                    style={{ padding: '12px 16px', background: '#F2F5F8', border: '1.5px solid #E1E8EE', borderRadius: 8, fontSize: 14, fontWeight: 600, color: '#3D5466', cursor: 'pointer', fontFamily: 'inherit' }}>
                    Clear
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Right: Preview */}
          <div className="card">
            <div className="card-header" style={{ borderBottom: '3px solid #E1E8EE' }}>
              <div className="card-title">File Preview</div>
              <div style={{ fontSize: 12, color: '#7A909F', marginTop: 2 }}>First 5 rows of your CSV</div>
            </div>
            <div className="card-body">
              {preview.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 20px', color: '#C5D1DA' }}>
                  
                  <div style={{ fontSize: 14, fontWeight: 600 }}>No file selected</div>
                  <div style={{ fontSize: 12, marginTop: 4 }}>Upload a CSV to preview its contents</div>
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        {Object.keys(preview[0]).slice(0, 6).map(k => (
                          <th key={k} style={{ padding: '8px 10px', background: '#F2F5F8', textAlign: 'left', whiteSpace: 'nowrap', fontWeight: 600, color: '#3D5466', borderBottom: '1px solid #E1E8EE' }}>{k}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {preview.map((row, i) => (
                        <tr key={i} style={{ background: i % 2 === 0 ? 'white' : '#F7F9FB' }}>
                          {Object.values(row).slice(0, 6).map((v, j) => (
                            <td key={j} style={{ padding: '7px 10px', borderBottom: '1px solid #E1E8EE', whiteSpace: 'nowrap', color: '#1A2B38' }}>{v}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div style={{ fontSize: 11, color: '#7A909F', marginTop: 8, padding: '0 2px' }}>Showing up to 6 columns Â· {preview.length} rows previewed</div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* â”â” EXPORT PANEL â”â” */}
      {activeTab === 'export' && (
        <div style={{ maxWidth: 600 }}>
          <div className="card">
            <div className="card-header" style={{ borderBottom: '3px solid #EEAF24' }}>
              <div className="card-title">Export Count Data</div>
              <div style={{ fontSize: 12, color: '#7A909F', marginTop: 2 }}>Download count data as CSV</div>
            </div>
            <div className="card-body">

              {/* Cycle selector */}
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#7A909F', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Count Cycle</div>
                <select className="select" style={{ width: '100%' }}
                  value={selectedCycle} onChange={e => setSelectedCycle(e.target.value)}>
                  {cycles.map(c => <option key={c.id} value={c.id}>{c.name} ({c.status})</option>)}
                </select>
              </div>

              {/* Scope */}
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#7A909F', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>Export Scope</div>
                <div style={{ display: 'flex', gap: 10 }}>
                  {[['company','Company-Wide'], ['region','By Region'], ['rep','By Rep']].map(([k, v]) => (
                    <div key={k} onClick={() => setScope(k)}
                      style={{
                        flex: 1, padding: '10px', borderRadius: 8, cursor: 'pointer', border: '1.5px solid',
                        borderColor: scope === k ? '#0076BB' : '#E1E8EE',
                        background: scope === k ? '#e8f4fb' : 'white',
                        textAlign: 'center', fontSize: 13, fontWeight: 600,
                        color: scope === k ? '#0076BB' : '#3D5466',
                      }}>
                      {v}
                    </div>
                  ))}
                </div>
              </div>

              {/* Region filter */}
              {scope === 'region' && (
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#7A909F', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Region</div>
                  <select className="select" style={{ width: '100%' }} value={region} onChange={e => setRegion(e.target.value)}>
                    <option value="">Select Region...</option>
                    {regions.map(r => <option key={r.id} value={r.name}>{r.name}</option>)}
                  </select>
                </div>
              )}

              {/* Rep filter */}
              {scope === 'rep' && (
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#7A909F', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Rep</div>
                  <select className="select" style={{ width: '100%' }} value={rep} onChange={e => setRep(e.target.value)}>
                    <option value="">Select Rep...</option>
                    {reps.map(r => <option key={r.id} value={r.id}>{r.full_name}</option>)}
                  </select>
                </div>
              )}

              <div style={{ padding: '12px 14px', background: '#e8f4fb', border: '1px solid #cce6f5', borderRadius: 8, fontSize: 12, color: '#3D5466', marginBottom: 20, lineHeight: 1.6 }}>
                Export includes all count line items with flags for not-in-catalog items, post-submission edits, and new items.
              </div>

              <button onClick={runExport} disabled={exporting || !selectedCycle}
                style={{
                  width: '100%', padding: '13px', background: exporting || !selectedCycle ? '#C5D1DA' : '#0076BB',
                  color: 'white', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 700,
                  cursor: exporting || !selectedCycle ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
                }}>
                {exporting ? 'Exporting...' : 'Download CSV Export'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

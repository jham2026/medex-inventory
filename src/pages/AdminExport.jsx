import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useToast } from '../components/ToastContext';

export default function AdminExport({ cycle }) {
  const toast = useToast();
  const [cycles, setCycles]             = useState([]);
  const [regions, setRegions]           = useState([]);
  const [selectedCycle, setSelectedCycle] = useState(cycle?.id || '');
  const [selectedRegion, setSelectedRegion] = useState('');
  const [exporting, setExporting]       = useState(false);
  const [exportingRef, setExportingRef] = useState(null);
  const [catalogSelection, setCatalogSelection] = useState({ claimsoft: true, edge: true });
  const [showCatalogDrop, setShowCatalogDrop]   = useState(false);

  useEffect(() => {
    supabase.from('count_cycles').select('*').order('created_at', { ascending: false })
      .then(({ data }) => {
        setCycles(data || []);
        if (!selectedCycle && data?.length) setSelectedCycle(data[0].id);
      });
    supabase.from('regions').select('*').order('name').then(({ data }) => setRegions(data || []));
  }, []);

  async function runCountExport() {
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
          rep:profiles!inventory_counts_rep_id_fkey(full_name, email),
          account:accounts(name, region:regions(name))
        )
      `)
      .eq('count.cycle_id', selectedCycle);
    if (selectedRegion) query = query.eq('count.account.region.name', selectedRegion);
    const { data, error } = await query;
    if (error) { toast.error('Export error: ' + error.message); setExporting(false); return; }
    const rows = (data || []).filter(d => d.count);
    const cycleLabel = cycles.find(c => c.id === selectedCycle)?.name || 'export';
    const header = [
      'Region', 'Account', 'Rep', 'Rep Email',
      'Item Number', 'Description', 'Vendor',
      'Count', 'Previous Count',
      'New Item', 'Not In Catalog', 'Edited After Submit', 'Scanned',
      'Submitted Date', 'Approved Date', 'Status'
    ];
    const csvRows = [header, ...rows.map(r => [
      r.count?.account?.region?.name || '',
      r.count?.account?.name || '',
      r.count?.rep?.full_name || '',
      r.count?.rep?.email || '',
      r.item_number_raw || '',
      r.description_raw || '',
      r.vendor_raw || '',
      r.quantity ?? '',
      r.previous_quantity ?? '',
      r.is_new_item ? 'YES' : 'NO',
      r.not_in_catalog ? 'FLAG' : 'NO',
      r.was_edited_after_submit ? 'FLAG' : 'NO',
      r.entered_via_scan ? 'YES' : 'NO',
      r.count?.submitted_at ? new Date(r.count.submitted_at).toLocaleDateString() : '',
      r.count?.approved_at  ? new Date(r.count.approved_at).toLocaleDateString()  : '',
      r.count?.status || '',
    ])];
    downloadCsv(csvRows, 'MedEx_Counts_' + cycleLabel.replace(/\s/g, '_') + (selectedRegion ? '_' + selectedRegion : ''));
    toast.success('Exported ' + rows.length + ' line items');
    setExporting(false);
  }

  async function runAccountsExport() {
    setExportingRef('accounts');
    const { data: accts, error: e1 } = await supabase.from('accounts').select('id, name, is_active, flagged_closed, catalog_source, region:regions(name)').order('name');
    const { data: arData } = await supabase.from('account_reps').select('account_id, rep:profiles(full_name)');
    if (e1) { toast.error('Export error: ' + e1.message); setExportingRef(null); return; }
    const repMap = {};
    for (const ar of arData || []) {
      if (!repMap[ar.account_id]) repMap[ar.account_id] = [];
      if (ar.rep?.full_name) repMap[ar.account_id].push(ar.rep.full_name);
    }
    const header = ['Account Name', 'Region', 'Catalog', 'Assigned Reps', 'Active', 'Flagged Closed'];
    const rows = (accts || []).map(a => [
      a.name || '',
      a.region?.name || '',
      a.catalog_source || '',
      (repMap[a.id] || []).join('; '),
      a.is_active ? 'YES' : 'NO',
      a.flagged_closed ? 'YES' : 'NO',
    ]);
    downloadCsv([header, ...rows], 'MedEx_Accounts');
    toast.success('Exported ' + rows.length + ' accounts');
    setExportingRef(null);
  }

  async function runUsersExport() {
    setExportingRef('users');
    const { data, error } = await supabase.from('profiles').select('full_name, email, role, region, is_active').order('full_name');
    if (error) { toast.error('Export error: ' + error.message); setExportingRef(null); return; }
    const header = ['Full Name', 'Email', 'Role', 'Region', 'Active'];
    const rows = (data || []).map(u => [u.full_name || '', u.email || '', u.role || '', u.region || '', u.is_active ? 'YES' : 'NO']);
    downloadCsv([header, ...rows], 'MedEx_Users');
    toast.success('Exported ' + rows.length + ' users');
    setExportingRef(null);
  }

  async function runCatalogExport() {
    const selected = Object.entries(catalogSelection).filter(([,v]) => v).map(([k]) => k);
    if (selected.length === 0) { toast.error('Select at least one catalog to export'); return; }
    setExportingRef('catalog');

    const header = ['Item Number', 'Description', 'Primary Vendor', 'Catalog'];

    // If both selected and user wants combined, export as one file
    // If single catalog selected, export as one file labeled accordingly
    // If both selected, export as two separate files
    if (selected.length === 2) {
      // Export both as separate files
      for (const cat of selected) {
        const label = cat === 'claimsoft' ? 'Claimsoft Catalog' : 'Account Edge';
        const { data, error } = await supabase
          .from('item_catalog')
          .select('item_number, description, primary_vendor, catalog_source')
          .eq('catalog_source', cat)
          .order('item_number');
        if (error) { toast.error('Export error: ' + error.message); continue; }
        const rows = (data || []).map(i => [i.item_number || '', i.description || '', i.primary_vendor || '', label]);
        downloadCsv([header, ...rows], 'MedEx_' + (cat === 'claimsoft' ? 'ClaimsoftCatalog' : 'AccountEdgeCatalog'));
        toast.success('Exported ' + rows.length + ' ' + label + ' items');
      }
    } else {
      const cat   = selected[0];
      const label = cat === 'claimsoft' ? 'Claimsoft Catalog' : 'Account Edge';
      const { data, error } = await supabase
        .from('item_catalog')
        .select('item_number, description, primary_vendor, catalog_source')
        .eq('catalog_source', cat)
        .order('item_number');
      if (error) { toast.error('Export error: ' + error.message); setExportingRef(null); return; }
      const rows = (data || []).map(i => [i.item_number || '', i.description || '', i.primary_vendor || '', label]);
      downloadCsv([header, ...rows], 'MedEx_' + (cat === 'claimsoft' ? 'ClaimsoftCatalog' : 'AccountEdgeCatalog'));
      toast.success('Exported ' + rows.length + ' ' + label + ' items');
    }
    setExportingRef(null);
  }

  function downloadCsv(rows, filename) {
    const csv = rows.map(r => r.map(v => '"' + String(v ?? '').replace(/"/g, '""') + '"').join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url;
    a.download = filename + '.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>

      {/* Intro note */}
      <div style={{
        background: 'var(--blue-light)', border: '1px solid #C7DCFF',
        borderRadius: 12, padding: '14px 18px', marginBottom: 24,
        display: 'flex', alignItems: 'center', gap: 12,
      }}>
        <div style={{ width: 36, height: 36, borderRadius: 8, background: 'var(--blue)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 1v9M4 7l4 4 4-4M1 13h14" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-mid)', lineHeight: 1.5 }}>
          All exports download as <strong style={{ color: 'var(--blue)' }}>standard CSV files</strong> compatible with Excel and Google Sheets.
          To <strong style={{ color: 'var(--blue)' }}>import data</strong> or download a blank CSV template, go to the relevant Settings page (Accounts, Users, or Item Catalog).
        </div>
      </div>

      {/* Section: Reference Data */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--text-dim)' }}>Reference Data</span>
        <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
      </div>

      <ExportCard
        label="AC" iconBg="var(--blue-light)"
        title="Accounts"
        sub="Account names, regions, assigned reps, catalog and status"
        loading={exportingRef === 'accounts'}
        onExport={runAccountsExport}
      />
      <ExportCard
        label="US" iconBg="var(--gold-light)"
        title="Users"
        sub="User names, emails, roles and regions"
        loading={exportingRef === 'users'}
        onExport={runUsersExport}
      />
      {/* Item Catalog - with catalog selector */}
      <div style={{
        background: 'var(--white)', border: '1px solid var(--border)',
        borderRadius: 12, padding: '16px 20px', marginBottom: 10,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
        flexWrap: 'wrap',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 40, height: 40, borderRadius: 10, background: 'var(--amber-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, color: 'var(--blue)', flexShrink: 0 }}>IC</div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700 }}>Item Catalog</div>
            <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 2 }}>Item numbers, descriptions and vendor info</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>

          {/* Catalog selector dropdown */}
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setShowCatalogDrop(p => !p)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                background: 'var(--bg)', border: '1.5px solid var(--border)',
                borderRadius: 8, padding: '7px 12px', fontSize: 12,
                fontWeight: 600, color: 'var(--text)', cursor: 'pointer',
                fontFamily: 'inherit', whiteSpace: 'nowrap',
              }}
            >
              <span>
                {catalogSelection.claimsoft && catalogSelection.edge
                  ? 'Both Catalogs'
                  : catalogSelection.claimsoft ? 'Claimsoft Catalog'
                  : catalogSelection.edge      ? 'Account Edge'
                  : 'None Selected'}
              </span>
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                <path d="M2 3.5l3 3 3-3" stroke="#64748B" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </button>

            {showCatalogDrop && (
              <>
                <div style={{ position: 'fixed', inset: 0, zIndex: 99 }} onClick={() => setShowCatalogDrop(false)} />
                <div style={{
                  position: 'absolute', right: 0, top: 'calc(100% + 6px)', zIndex: 100,
                  background: 'white', border: '1px solid var(--border)',
                  borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
                  minWidth: 200, overflow: 'hidden',
                }}>
                  <div style={{ padding: '8px 4px' }}>
                    {[
                      { key: 'claimsoft', label: 'Claimsoft Catalog' },
                      { key: 'edge',      label: 'Account Edge' },
                    ].map(({ key, label }) => (
                      <label key={key} style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        padding: '9px 14px', cursor: 'pointer', borderRadius: 6,
                        margin: '0 4px',
                      }}
                        onMouseEnter={e => e.currentTarget.style.background = 'var(--bg)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                      >
                        <input
                          type="checkbox"
                          checked={catalogSelection[key]}
                          onChange={e => setCatalogSelection(p => ({ ...p, [key]: e.target.checked }))}
                          style={{ width: 15, height: 15, accentColor: 'var(--blue)', cursor: 'pointer' }}
                        />
                        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{label}</span>
                      </label>
                    ))}
                    <div style={{ margin: '6px 14px 4px', fontSize: 11, color: 'var(--text-dim)' }}>
                      {catalogSelection.claimsoft && catalogSelection.edge
                        ? 'Will export as 2 separate files'
                        : 'Will export as 1 file'}
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>

          <button
            className="btn btn-primary"
            onClick={runCatalogExport}
            disabled={exportingRef === 'catalog' || (!catalogSelection.claimsoft && !catalogSelection.edge)}
            style={{ whiteSpace: 'nowrap', flexShrink: 0 }}
          >
            {exportingRef === 'catalog' ? 'Exporting...' : 'Export CSV'}
          </button>
        </div>
      </div>

      {/* Section: Count Data */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '24px 0 14px' }}>
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--text-dim)' }}>Count Data</span>
        <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
      </div>

      {/* Count History */}
      <div style={{
        background: 'var(--white)', border: '1px solid var(--border)',
        borderRadius: 12, padding: '16px 20px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexWrap: 'wrap', gap: 12,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 40, height: 40, borderRadius: 10, background: 'var(--green-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, color: 'var(--green)', flexShrink: 0 }}>CH</div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700 }}>Count History</div>
            <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 2 }}>
              Full count results - all statuses (not started, in progress, submitted) - every line item detail
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--bg)', border: '1.5px solid var(--border)', borderRadius: 8, padding: '6px 12px' }}>
            <span style={{ fontSize: 12, color: 'var(--text-dim)', fontWeight: 600 }}>Cycle:</span>
            <select
              style={{ border: 'none', background: 'transparent', fontSize: 12, fontFamily: 'inherit', fontWeight: 600, color: 'var(--blue)', cursor: 'pointer', outline: 'none' }}
              value={selectedCycle} onChange={e => setSelectedCycle(e.target.value)}
            >
              {cycles.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--bg)', border: '1.5px solid var(--border)', borderRadius: 8, padding: '6px 12px' }}>
            <span style={{ fontSize: 12, color: 'var(--text-dim)', fontWeight: 600 }}>Region:</span>
            <select
              style={{ border: 'none', background: 'transparent', fontSize: 12, fontFamily: 'inherit', fontWeight: 600, color: 'var(--blue)', cursor: 'pointer', outline: 'none' }}
              value={selectedRegion} onChange={e => setSelectedRegion(e.target.value)}
            >
              <option value="">All Regions</option>
              {regions.map(r => <option key={r.id} value={r.name}>{r.name}</option>)}
            </select>
          </div>
          <button
            className="btn btn-primary"
            onClick={runCountExport}
            disabled={exporting || !selectedCycle}
            style={{ whiteSpace: 'nowrap' }}
          >
            {exporting ? 'Exporting...' : 'Export CSV'}
          </button>
        </div>
      </div>

    </div>
  );
}

function ExportCard({ label, iconBg, title, sub, loading, onExport }) {
  return (
    <div style={{
      background: 'var(--white)', border: '1px solid var(--border)',
      borderRadius: 12, padding: '16px 20px', marginBottom: 10,
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={{ width: 40, height: 40, borderRadius: 10, background: iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, color: 'var(--blue)', flexShrink: 0 }}>{label}</div>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700 }}>{title}</div>
          <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 2 }}>{sub}</div>
        </div>
      </div>
      <button className="btn btn-primary" onClick={onExport} disabled={loading} style={{ whiteSpace: 'nowrap', flexShrink: 0 }}>
        {loading ? 'Exporting...' : 'Export CSV'}
      </button>
    </div>
  );
}

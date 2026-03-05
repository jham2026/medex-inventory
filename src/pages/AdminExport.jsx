import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { useToast } from '../components/ToastContext';

export default function AdminExport({ cycle }) {
  const toast = useToast();
  const [scope, setScope]   = useState('company');
  const [region, setRegion] = useState('');
  const [rep, setRep]       = useState('');
  const [regions, setRegions] = useState([]);
  const [reps, setReps]     = useState([]);
  const [exporting, setExporting] = useState(false);
  const [cycles, setCycles] = useState([]);
  const [selectedCycle, setSelectedCycle] = useState(cycle?.id || '');

  useState(() => {
    supabase.from('regions').select('*').order('name').then(({ data }) => setRegions(data || []));
    supabase.from('profiles').select('id,full_name').eq('role','rep').order('full_name').then(({ data }) => setReps(data || []));
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

    if (scope === 'region' && region) {
      query = query.eq('count.account.region.name', region);
    }
    if (scope === 'rep' && rep) {
      query = query.eq('count.rep_id', rep);
    }

    const { data, error } = await query;
    if (error) { toast.error('Export error: ' + error.message); setExporting(false); return; }

    const rows = (data || []).filter(d => d.count);
    const cycleLabel = cycles.find(c => c.id === selectedCycle)?.name || 'export';

    const header = [
      'Region','Account','Rep','Item Number','Description','Vendor',
      'Count','Previous Count','New Item','Not In Catalog',
      'Edited After Submit','Scanned','Submitted Date','Status'
    ];

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

    const csv = csvRows.map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url;
    const scopeLabel = scope === 'company' ? 'company_wide' : scope === 'region' ? `region_${region}` : `rep`;
    a.download = `MedEx_${cycleLabel.replace(/\s/g,'_')}_${scopeLabel}.csv`;
    a.click();
    URL.revokeObjectURL(url);

    toast.success(`Exported ${rows.length} line items`);
    setExporting(false);
  }

  return (
    <div>
      <div className="card">
        <div className="card-header">
          <span style={{ fontWeight: 'bold' }}>Export Count Data</span>
        </div>
        <div className="card-body">
          <div className="input-group">
            <label className="input-label">Count Cycle</label>
            <select className="select" style={{ maxWidth: 240 }}
              value={selectedCycle} onChange={e => setSelectedCycle(e.target.value)}>
              {cycles.map(c => (
                <option key={c.id} value={c.id}>{c.name} ({c.status})</option>
              ))}
            </select>
          </div>

          <div className="input-group">
            <label className="input-label">Export Scope</label>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {[['company','Company-Wide'],['region','By Region'],['rep','By Rep']].map(([k,v]) => (
                <label key={k} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13 }}>
                  <input type="radio" name="scope" value={k} checked={scope===k} onChange={() => setScope(k)} />
                  {v}
                </label>
              ))}
            </div>
          </div>

          {scope === 'region' && (
            <div className="input-group">
              <label className="input-label">Region</label>
              <select className="select" style={{ maxWidth: 200 }} value={region} onChange={e => setRegion(e.target.value)}>
                <option value="">— Select Region —</option>
                {regions.map(r => <option key={r.id} value={r.name}>{r.name}</option>)}
              </select>
            </div>
          )}

          {scope === 'rep' && (
            <div className="input-group">
              <label className="input-label">Rep</label>
              <select className="select" style={{ maxWidth: 240 }} value={rep} onChange={e => setRep(e.target.value)}>
                <option value="">— Select Rep —</option>
                {reps.map(r => <option key={r.id} value={r.id}>{r.full_name}</option>)}
              </select>
            </div>
          )}

          <div className="alert-banner info" style={{ marginBottom: 16 }}>
            Export includes all count line items with flags for: not-in-catalog items, post-submission edits, and new items. Flagged items are marked in the export for your review.
          </div>

          <button
            className="btn btn-primary btn-lg"
            onClick={runExport}
            disabled={exporting || !selectedCycle}
          >
            {exporting ? 'Exporting...' : '⬇ Download CSV Export'}
          </button>
        </div>
      </div>
    </div>
  );
}

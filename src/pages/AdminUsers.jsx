import { useEffect, useState } from 'react';
import { useAuth } from '../components/AuthContext';
import { logAudit } from '../hooks/useAudit';
import { supabase } from '../lib/supabase';
import { useToast } from '../components/ToastContext';

const BLANK_FORM = { full_name: '', email: '', role: 'rep', region: '', is_active: true };
const SERVICE_KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVzY2p5cWdmbmNxb3FxZWdyY2p3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjY2OTgxNSwiZXhwIjoyMDg4MjQ1ODE1fQ.OCe9Kx7CJkdgukE_7-dBmMpF24Tqmmz0Vo7OjmdSQ6k';
const SUPABASE_URL = 'https://uscjyqgfncqoqqegrcjw.supabase.co';

const USER_TEMPLATE_CSV =
  '#MedEx_Template,users,v1\n' +
  'FirstName,LastName,FullName,EmailAddress,Role,Region,Status\n' +
  'Jane,Smith,Jane Smith,jsmith@example.com,rep,Austin,Active';

function parseVersionStamp(text) {
  const first = text.split('\n')[0].trim();
  if (!first.startsWith('#MedEx_Template,users,v1'))
    return { valid: false, error: 'Wrong template. Please download and use the Users template.' };
  return { valid: true };
}

export default function AdminUsers() {
  const toast               = useToast();
  const { profile }         = useAuth();
  const [users, setUsers]   = useState([]);
  const [regions, setRegions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editUser, setEditUser] = useState(null);
  const [form, setForm]     = useState(BLANK_FORM);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [filterRole, setFilterRole] = useState('all');

  // Import state
  const [importFile, setImportFile]       = useState(null);
  const [importRaw, setImportRaw]         = useState('');
  const [importPreview, setImportPreview] = useState([]);
  const [importError, setImportError]     = useState(null);
  const [importing, setImporting]         = useState(false);
  const [showImport, setShowImport]       = useState(false);

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    const [{ data: u }, { data: r }] = await Promise.all([
      supabase.from('profiles').select('*').order('full_name'),
      supabase.from('regions').select('*').order('name'),
    ]);
    setUsers(u || []);
    setRegions(r || []);
    setLoading(false);
  }

  function openAdd()  { setEditUser(null); setForm(BLANK_FORM); setShowForm(true); }
  function openEdit(user) {
    setEditUser(user);
    setForm({ full_name: user.full_name || '', email: user.email || '', role: user.role || 'rep', region: user.region || '', is_active: user.is_active });
    setShowForm(true);
  }

  async function handleSave() {
    if (!form.full_name || !form.email) { toast.error('Name and email are required'); return; }
    setSaving(true);
    if (editUser) {
      const { error } = await supabase.from('profiles')
        .update({ full_name: form.full_name, role: form.role, region: form.region || null, is_active: form.is_active })
        .eq('id', editUser.id);
      if (error) toast.error('Update failed: ' + error.message);
      else {
        setUsers(prev => prev.map(u => u.id === editUser.id ? { ...u, ...form } : u));
        await logAudit(profile, 'USER_UPDATED', 'user', { target_name: form.full_name, details: { role: form.role, region: form.region } });
        toast.success(form.full_name + ' updated!');
        setShowForm(false);
      }
    } else {
      const authRes = await fetch(SUPABASE_URL + '/auth/v1/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': SERVICE_KEY, 'Authorization': 'Bearer ' + SERVICE_KEY },
        body: JSON.stringify({ email: form.email, password: 'MedEx1234!', email_confirm: true, user_metadata: { full_name: form.full_name } }),
      });
      const authResult = await authRes.json();
      if (!authRes.ok) { toast.error('Error: ' + (authResult.msg || authResult.message || 'Unknown')); setSaving(false); return; }
      const { error: profError } = await supabase.from('profiles').insert({ id: authResult.id, full_name: form.full_name, email: form.email, role: form.role, region: form.region || null, is_active: true });
      if (profError) toast.error('Profile error: ' + profError.message);
      else {
        await logAudit(profile, 'USER_CREATED', 'user', { target_name: form.full_name, details: { email: form.email, role: form.role } });
        toast.success('Import Complete | ' + form.full_name + ' created! Default password: MedEx1234!');
        loadData(); setShowForm(false);
      }
    }
    setSaving(false);
  }

  async function toggleActive(user) {
    await supabase.from('profiles').update({ is_active: !user.is_active }).eq('id', user.id);
    setUsers(prev => prev.map(u => u.id === user.id ? { ...u, is_active: !u.is_active } : u));
    await logAudit(profile, user.is_active ? 'USER_DEACTIVATED' : 'USER_ACTIVATED', 'user', { target_name: user.full_name });
    toast.success(user.full_name + (user.is_active ? ' deactivated' : ' activated'));
  }

  async function resetPassword(user) {
    if (!window.confirm('Reset password for ' + user.full_name + ' to MedEx1234!?')) return;
    const res = await fetch(SUPABASE_URL + '/auth/v1/admin/users/' + user.id, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'apikey': SERVICE_KEY, 'Authorization': 'Bearer ' + SERVICE_KEY },
      body: JSON.stringify({ password: 'MedEx1234!' }),
    });
    if (res.ok) { await logAudit(profile, 'USER_PASSWORD_RESET', 'user', { target_name: user.full_name }); toast.success('Password reset for ' + user.full_name); }
    else toast.error('Reset failed');
  }

  function downloadTemplate() {
    const blob = new Blob([USER_TEMPLATE_CSV], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = 'MedEx_Users_Template_v1.csv'; a.click();
    URL.revokeObjectURL(url);
  }

  function handleFileSelect(e) {
    const f = e.target.files[0];
    if (!f) return;
    setImportFile(f); setImportError(null); setImportPreview([]);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target.result;
      setImportRaw(text);
      const check = parseVersionStamp(text);
      if (!check.valid) { setImportError(check.error); return; }
      // Parse preview rows
      const lines = text.split('\n').filter(l => l.trim() && !l.startsWith('#'));
      const headers = lines[0].split(',').map(h => h.trim());
      const rows = lines.slice(1).map(line => {
        const vals = line.split(',');
        const obj = {};
        headers.forEach((h, i) => obj[h] = (vals[i] || '').trim());
        return obj;
      }).filter(r => r['EmailAddress'] || r['Email']);
      setImportPreview(rows.slice(0, 5));
    };
    reader.readAsText(f);
  }

  async function runImport() {
    if (!importRaw || importError) return;
    setImporting(true);

    const lines   = importRaw.split('\n').filter(l => l.trim() && !l.startsWith('#'));
    const headers = lines[0].split(',').map(h => h.trim());
    const dataRows = lines.slice(1).map(line => {
      const vals = line.split(',');
      const obj = {};
      headers.forEach((h, i) => obj[h] = (vals[i] || '').trim());
      return obj;
    }).filter(r => r['EmailAddress'] || r['Email']);

    let inserted = 0, updated = 0, errors = 0, errorDetails = [];

    for (const row of dataRows) {
      const email     = (row['EmailAddress'] || row['Email'] || '').trim();
      const firstName = (row['FirstName'] || '').trim();
      const lastName  = (row['LastName']  || '').trim();
      const fullName  = (row['FullName']  || (firstName + ' ' + lastName).trim()).trim();
      const role      = (row['Role']      || 'rep').trim().toLowerCase();
      const region    = (row['Region']    || '').trim();
      const status    = (row['Status']    || 'Active').trim();
      const isActive  = status.toLowerCase() === 'active' || status.toLowerCase() === 'open';

      if (!email) { errors++; errorDetails.push('Row skipped: missing EmailAddress'); continue; }

      try {
        // Step 1: Check Auth API for existing user by email
        const listRes = await fetch(
          SUPABASE_URL + '/auth/v1/admin/users?email=' + encodeURIComponent(email),
          { headers: { 'apikey': SERVICE_KEY, 'Authorization': 'Bearer ' + SERVICE_KEY } }
        );
        const listJson = await listRes.json();
        const authUsers = listJson.users || [];
        const existingAuth = authUsers.find(u => u.email?.toLowerCase() === email.toLowerCase());

        if (existingAuth) {
          // User exists in Auth â€” upsert the profile
          const { error: upErr } = await supabase.from('profiles').upsert({
            id: existingAuth.id, full_name: fullName || null,
            email, role, region: region || null, is_active: isActive,
          }, { onConflict: 'id' });
          if (upErr) { errors++; errorDetails.push(email + ' (profile upsert): ' + upErr.message); }
          else updated++;
        } else {
          // Brand new â€” create in Auth first
          const createRes = await fetch(SUPABASE_URL + '/auth/v1/admin/users', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'apikey': SERVICE_KEY, 'Authorization': 'Bearer ' + SERVICE_KEY },
            body: JSON.stringify({ email, password: 'MedEx1234!', email_confirm: true, user_metadata: { full_name: fullName } }),
          });
          const createJson = await createRes.json();
          if (!createRes.ok) {
            errors++;
            errorDetails.push(email + ' (auth): ' + (createJson.msg || createJson.message || JSON.stringify(createJson)));
            continue;
          }
          // Insert profile row
          const { error: profErr } = await supabase.from('profiles').insert({
            id: createJson.id, full_name: fullName || null,
            email, role, region: region || null, is_active: isActive,
          });
          if (profErr) { errors++; errorDetails.push(email + ' (profile): ' + profErr.message); }
          else inserted++;
        }
      } catch (err) {
        errors++; errorDetails.push(email + ' (unexpected): ' + err.message);
      }
    }

    setImporting(false);
    await logAudit(profile, 'IMPORT_USERS', 'import', { details: { inserted, updated, errors, total: dataRows.length } });

    if (errors === 0) {
      toast.success('Import Complete | ' + inserted + ' new, ' + updated + ' updated');
      loadData(); resetImport();
    } else {
      const detail = errorDetails.slice(0, 2).join('; ') + (errorDetails.length > 2 ? '...' : '');
      toast.warning('Import Finished | ' + (inserted + updated) + ' succeeded, ' + errors + ' error(s): ' + detail);
      if (inserted + updated > 0) loadData();
    }
  }

  function resetImport() {
    setImportFile(null); setImportRaw(''); setImportPreview([]);
    setImportError(null); setShowImport(false);
  }

  const filtered = users
    .filter(u => filterRole === 'all' || u.role === filterRole)
    .filter(u => !search || u.full_name?.toLowerCase().includes(search.toLowerCase()) || u.email?.toLowerCase().includes(search.toLowerCase()));

  const roleTag = role => {
    const cls = role === 'admin' ? 'role-admin' : role === 'manager' ? 'role-mgr' : 'role-rep';
    return <span className={'role-tag ' + cls}>{role}</span>;
  };

  if (loading) return <div className="loading-center"><div className="spinner" /></div>;

  return (
    <div>
      {/* Add/Edit modal */}
      {showForm && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowForm(false)}>
          <div className="modal">
            <div className="modal-head-blue">
              <div className="modal-head-title">{editUser ? 'Edit User' : 'Add New User'}</div>
              <div className="modal-head-sub">{editUser ? editUser.full_name : 'New account'}</div>
            </div>
            <div className="modal-body">
              <div className="form-lbl" style={{ marginTop: 0 }}>Full Name *</div>
              <input className="form-inp" value={form.full_name} onChange={e => setForm(p => ({ ...p, full_name: e.target.value }))} autoFocus />
              <div className="form-lbl">Email Address *</div>
              <input className="form-inp" type="email" value={form.email} disabled={!!editUser} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} />
              {editUser && <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 4 }}>Email cannot be changed after creation.</div>}
              <div className="form-lbl">Role *</div>
              <select className="form-sel" value={form.role} onChange={e => setForm(p => ({ ...p, role: e.target.value }))}>
                <option value="rep">Rep</option>
                <option value="manager">Manager</option>
                <option value="admin">Admin</option>
              </select>
              <div className="form-lbl">Region</div>
              <select className="form-sel" value={form.region} onChange={e => setForm(p => ({ ...p, region: e.target.value }))}>
                <option value="">All Regions (Admin/Manager)</option>
                {regions.map(r => <option key={r.id} value={r.name}>{r.name}</option>)}
              </select>
              {editUser && <>
                <div className="form-lbl">Status</div>
                <select className="form-sel" value={form.is_active ? 'active' : 'inactive'} onChange={e => setForm(p => ({ ...p, is_active: e.target.value === 'active' }))}>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </>}
              {!editUser && (
                <div className="warn-box" style={{ marginTop: 16 }}>Default password: <strong>MedEx1234!</strong> - ask the rep to change it on first login.</div>
              )}
            </div>
            <div className="modal-actions">
              <button className="btn btn-outline" onClick={() => setShowForm(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : editUser ? 'Save Changes' : 'Create User'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Import panel */}
      {showImport && (
        <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 12, padding: '20px 24px', marginBottom: 16, boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <div style={{ fontSize: 15, fontWeight: 800 }}>Import Users via CSV</div>
            <button className="btn btn-outline" onClick={resetImport} style={{ fontSize: 12 }}>Cancel</button>
          </div>
          {importError && (
            <div className="alert-banner alert-error" style={{ marginBottom: 12 }}>{importError}</div>
          )}
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 14 }}>
            <input type="file" accept=".csv" onChange={handleFileSelect} style={{ fontSize: 13 }} />
            <button className="btn btn-outline" onClick={downloadTemplate} style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
              Download Template
            </button>
          </div>
          {importPreview.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-dim)', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 }}>
                Preview â€” {importPreview.length} of {importRaw.split('\n').filter(l => l.trim() && !l.startsWith('#')).length - 1} rows
              </div>
              <div style={{ overflowX: 'auto', borderRadius: 8, border: '1px solid var(--border)' }}>
                <table style={{ fontSize: 12 }}>
                  <thead>
                    <tr>
                      {['EmailAddress','FullName','Role','Region','Status'].map(h => (
                        <th key={h}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {importPreview.map((row, i) => (
                      <tr key={i}>
                        <td>{row['EmailAddress'] || row['Email']}</td>
                        <td>{row['FullName'] || (row['FirstName'] + ' ' + row['LastName'])}</td>
                        <td>{row['Role'] || 'rep'}</td>
                        <td>{row['Region'] || '-'}</td>
                        <td>{row['Status'] || 'Active'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <button
              className="btn btn-primary"
              onClick={runImport}
              disabled={!importFile || !!importError || importing}
            >
              {importing ? 'Importing...' : 'Run Import'}
            </button>
            <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>
              New users get default password: MedEx1234!
            </span>
          </div>
        </div>
      )}

      {/* Filter row */}
      <div className="filter-row">
        <span className="filter-label">Role:</span>
        <select className="filter-select" value={filterRole} onChange={e => setFilterRole(e.target.value)}>
          <option value="all">All Roles</option>
          <option value="rep">Rep</option>
          <option value="manager">Manager</option>
          <option value="admin">Admin</option>
        </select>
        <span className="filter-label">Search:</span>
        <input className="search-input" placeholder="Name or email..." value={search} onChange={e => setSearch(e.target.value)} />
        <span className="count-lbl ml-auto">{filtered.length} of {users.length} users</span>
        <button className="btn btn-outline" onClick={downloadTemplate} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M6.5 1v7M3.5 5.5l3 3 3-3M1.5 10.5h10" stroke="#475569" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
          Template
        </button>
        <button className="btn btn-outline" onClick={() => setShowImport(v => !v)} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M6.5 9V2M3.5 4.5l3-3 3 3M1.5 10.5h10" stroke="#475569" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
          {showImport ? 'Hide Import' : 'Import'}
        </button>
        <button className="btn btn-primary" onClick={openAdd}>+ Add User</button>
      </div>

      {/* Table */}
      <div className="region-block">
        <table>
          <thead>
            <tr><th>Name</th><th>Email</th><th>Role</th><th>Region</th><th>Status</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-dim)', padding: 32, fontStyle: 'italic' }}>No users match your filter.</td></tr>
            ) : filtered.map(u => (
              <tr key={u.id}>
                <td style={{ fontWeight: 700 }}>{u.full_name}</td>
                <td style={{ fontSize: 12, color: 'var(--text-mid)' }}>{u.email}</td>
                <td>{roleTag(u.role)}</td>
                <td style={{ fontSize: 12, color: 'var(--text-dim)' }}>{u.region || 'All'}</td>
                <td>
                  <span style={{ fontSize: 12, fontWeight: 700, color: u.is_active ? 'var(--green)' : 'var(--text-dim)' }}>
                    {u.is_active ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td>
                  <button className="tbl-btn-sm" onClick={() => openEdit(u)}>Edit</button>
                  <button className="tbl-btn-sm" onClick={() => resetPassword(u)}>Reset PW</button>
                  <button className="tbl-btn-sm" onClick={() => toggleActive(u)}>{u.is_active ? 'Deactivate' : 'Activate'}</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

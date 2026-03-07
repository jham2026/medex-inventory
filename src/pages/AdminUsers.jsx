import { useEffect, useState } from 'react';
import { useAuth } from '../components/AuthContext';
import { logAudit } from '../hooks/useAudit';
import { supabase } from '../lib/supabase';
import { useToast } from '../components/ToastContext';

const BLANK_FORM = { full_name: '', email: '', role: 'rep', regions: [], is_active: true };
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

// Multi-select list component
function MultiSelectList({ items, selected, onChange, placeholder }) {
  return (
    <div style={{
      border: '1.5px solid var(--border)', borderRadius: 8, overflow: 'hidden',
      maxHeight: 160, overflowY: 'auto', background: 'var(--bg)',
    }}>
      {items.length === 0 && (
        <div style={{ padding: '10px 14px', fontSize: 12, color: 'var(--text-dim)', fontStyle: 'italic' }}>{placeholder || 'None available'}</div>
      )}
      {items.map(item => {
        const isSelected = selected.includes(item.value);
        return (
          <div
            key={item.value}
            onClick={() => {
              if (isSelected) onChange(selected.filter(v => v !== item.value));
              else onChange([...selected, item.value]);
            }}
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '9px 14px', cursor: 'pointer', fontSize: 13,
              borderBottom: '1px solid var(--border)',
              background: isSelected ? 'var(--blue-light)' : 'transparent',
              color: isSelected ? 'var(--blue-action)' : 'var(--text)',
              transition: 'background 0.1s',
            }}
          >
            <div style={{
              width: 16, height: 16, borderRadius: 4, flexShrink: 0,
              border: '1.5px solid ' + (isSelected ? 'var(--blue-action)' : 'var(--border)'),
              background: isSelected ? 'var(--blue-action)' : 'white',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {isSelected && (
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                  <path d="M2 5l2.5 2.5 3.5-4" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              )}
            </div>
            <span style={{ fontWeight: isSelected ? 700 : 400 }}>{item.label}</span>
          </div>
        );
      })}
    </div>
  );
}

export default function AdminUsers({ showImportPanel, onImportClose, triggerAdd, onAddHandled }) {
  const toast               = useToast();
  const { profile }         = useAuth();
  const [users, setUsers]   = useState([]);
  const [regions, setRegions] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editUser, setEditUser] = useState(null);
  const [form, setForm]     = useState(BLANK_FORM);
  const [formAccounts, setFormAccounts] = useState([]); // selected account IDs
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

  useEffect(() => { if (showImportPanel) setShowImport(true); }, [showImportPanel]);
  useEffect(() => { if (!showImport && onImportClose) onImportClose(); }, [showImport]);
  useEffect(() => { if (triggerAdd) { openAdd(); if (onAddHandled) onAddHandled(); } }, [triggerAdd]);

  async function loadData() {
    setLoading(true);
    const [{ data: u }, { data: r }, { data: a }] = await Promise.all([
      supabase.from('profiles').select('*').order('full_name'),
      supabase.from('regions').select('*').order('name'),
      supabase.from('accounts').select('id, name, is_active').eq('is_active', true).order('name'),
    ]);
    setUsers(u || []);
    setRegions(r || []);
    setAccounts(a || []);
    setLoading(false);
  }

  function openAdd() {
    setEditUser(null);
    setForm(BLANK_FORM);
    setFormAccounts([]);
    setShowForm(true);
  }

  async function openEdit(user) {
    setEditUser(user);
    // Parse regions from comma-separated string
    const userRegions = user.region
      ? user.region.split(',').map(r => r.trim()).filter(Boolean)
      : [];
    setForm({
      full_name: user.full_name || '',
      email: user.email || '',
      role: user.role || 'rep',
      regions: userRegions,
      is_active: user.is_active,
    });
    // Load assigned accounts for this user
    const { data: repAccts } = await supabase
      .from('account_reps')
      .select('account_id')
      .eq('rep_id', user.id);
    setFormAccounts((repAccts || []).map(r => r.account_id));
    setShowForm(true);
  }

  async function handleSave() {
    if (!form.full_name || !form.email) { toast.error('Name and email are required'); return; }
    setSaving(true);

    const regionString = form.regions.join(',') || null;

    if (editUser) {
      // Update profile
      const { error } = await supabase.from('profiles')
        .update({ full_name: form.full_name, role: form.role, region: regionString, is_active: form.is_active })
        .eq('id', editUser.id);
      if (error) { toast.error('Update failed: ' + error.message); setSaving(false); return; }

      // Sync account_reps â€” delete all then re-insert selected
      await supabase.from('account_reps').delete().eq('rep_id', editUser.id);
      if (formAccounts.length > 0) {
        const inserts = formAccounts.map(account_id => ({ account_id, rep_id: editUser.id }));
        await supabase.from('account_reps').insert(inserts);
      }

      setUsers(prev => prev.map(u => u.id === editUser.id ? { ...u, ...form, region: regionString } : u));
      await logAudit(profile, 'USER_UPDATED', 'user', { target_name: form.full_name, details: { role: form.role, regions: form.regions, accounts: formAccounts.length } });
      toast.success(form.full_name + ' updated!');
      setShowForm(false);
    } else {
      // Create new user
      const authRes = await fetch(SUPABASE_URL + '/auth/v1/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': SERVICE_KEY, 'Authorization': 'Bearer ' + SERVICE_KEY },
        body: JSON.stringify({ email: form.email, password: 'MedEx1234!', email_confirm: true, user_metadata: { full_name: form.full_name } }),
      });
      const authResult = await authRes.json();
      if (!authRes.ok) { toast.error('Error: ' + (authResult.msg || authResult.message || 'Unknown')); setSaving(false); return; }
      const { error: profError } = await supabase.from('profiles').insert({
        id: authResult.id, full_name: form.full_name, email: form.email,
        role: form.role, region: regionString, is_active: true,
      });
      if (profError) { toast.error('Profile error: ' + profError.message); setSaving(false); return; }
      // Assign accounts if any selected
      if (formAccounts.length > 0) {
        const inserts = formAccounts.map(account_id => ({ account_id, rep_id: authResult.id }));
        await supabase.from('account_reps').insert(inserts);
      }
      await logAudit(profile, 'USER_CREATED', 'user', { target_name: form.full_name, details: { email: form.email, role: form.role } });
      toast.success('User Created | ' + form.full_name + ' â€” default password: MedEx1234!');
      loadData(); setShowForm(false);
    }
    setSaving(false);
  }

  async function handleResetPassword() {
    if (!editUser) return;
    if (!window.confirm('Reset password for ' + editUser.full_name + ' to MedEx1234!?')) return;
    const res = await fetch(SUPABASE_URL + '/auth/v1/admin/users/' + editUser.id, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'apikey': SERVICE_KEY, 'Authorization': 'Bearer ' + SERVICE_KEY },
      body: JSON.stringify({ password: 'MedEx1234!' }),
    });
    if (res.ok) {
      await logAudit(profile, 'USER_PASSWORD_RESET', 'user', { target_name: editUser.full_name });
      toast.success('Password reset | ' + editUser.full_name + ' â€” MedEx1234!');
    } else toast.error('Reset failed');
  }

  async function handleToggleActive() {
    if (!editUser) return;
    const newActive = !form.is_active;
    setForm(p => ({ ...p, is_active: newActive }));
    await supabase.from('profiles').update({ is_active: newActive }).eq('id', editUser.id);
    setUsers(prev => prev.map(u => u.id === editUser.id ? { ...u, is_active: newActive } : u));
    await logAudit(profile, newActive ? 'USER_ACTIVATED' : 'USER_DEACTIVATED', 'user', { target_name: editUser.full_name });
    toast.success(editUser.full_name + (newActive ? ' activated' : ' deactivated'));
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
        const listRes = await fetch(
          SUPABASE_URL + '/auth/v1/admin/users?email=' + encodeURIComponent(email),
          { headers: { 'apikey': SERVICE_KEY, 'Authorization': 'Bearer ' + SERVICE_KEY } }
        );
        const listJson = await listRes.json();
        const authUsers = listJson.users || [];
        const existingAuth = authUsers.find(u => u.email?.toLowerCase() === email.toLowerCase());

        if (existingAuth) {
          const { error: upErr } = await supabase.from('profiles').upsert({
            id: existingAuth.id, full_name: fullName || null,
            email, role, region: region || null, is_active: isActive,
          }, { onConflict: 'id' });
          if (upErr) { errors++; errorDetails.push(email + ' (profile upsert): ' + upErr.message); }
          else updated++;
        } else {
          const createRes = await fetch(SUPABASE_URL + '/auth/v1/admin/users', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'apikey': SERVICE_KEY, 'Authorization': 'Bearer ' + SERVICE_KEY },
            body: JSON.stringify({ email, password: 'MedEx1234!', email_confirm: true, user_metadata: { full_name: fullName } }),
          });
          const createJson = await createRes.json();
          if (!createRes.ok) {
            errors++; errorDetails.push(email + ' (auth): ' + (createJson.msg || createJson.message || JSON.stringify(createJson)));
            continue;
          }
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

  if (loading) return <div className="loading-center"><div className="spinner" /></div>;

  return (
    <div>
      {/* â”€â”€ Edit / Add modal â”€â”€ */}
      {showForm && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowForm(false)}>
          <div className="modal" style={{ width: 520, maxWidth: '95vw' }}>
            <div className="modal-head-blue">
              <div className="modal-head-title">{editUser ? 'Edit User' : 'Add New User'}</div>
              <div className="modal-head-sub">{editUser ? editUser.email : 'New account'}</div>
            </div>
            <div className="modal-body" style={{ maxHeight: '65vh', overflowY: 'auto' }}>
              {/* Name */}
              <div className="form-lbl" style={{ marginTop: 0 }}>Full Name *</div>
              <input className="form-inp" value={form.full_name} onChange={e => setForm(p => ({ ...p, full_name: e.target.value }))} autoFocus />

              {/* Email */}
              <div className="form-lbl">Email Address *</div>
              <input className="form-inp" type="email" value={form.email} disabled={!!editUser} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} />
              {editUser && <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 4 }}>Email cannot be changed after creation.</div>}

              {/* Role */}
              <div className="form-lbl">Role</div>
              <select className="form-sel" value={form.role} onChange={e => setForm(p => ({ ...p, role: e.target.value }))}>
                <option value="rep">Rep</option>
                <option value="manager">Manager</option>
                <option value="admin">Admin</option>
              </select>

              {/* Regions â€” multi-select */}
              <div className="form-lbl" style={{ marginTop: 16 }}>
                Regions
                <span style={{ fontSize: 10, color: 'var(--text-dim)', fontWeight: 400, marginLeft: 8 }}>
                  {form.regions.length > 0 ? form.regions.length + ' selected' : 'none selected'}
                </span>
              </div>
              <MultiSelectList
                items={regions.map(r => ({ value: r.name, label: r.name }))}
                selected={form.regions}
                onChange={val => setForm(p => ({ ...p, regions: val }))}
                placeholder="No regions available"
              />
              {form.regions.length > 0 && (
                <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {form.regions.map(r => (
                    <span key={r} style={{ background: 'var(--blue-light)', color: 'var(--blue-action)', borderRadius: 99, padding: '2px 10px', fontSize: 11, fontWeight: 700 }}>
                      {r}
                    </span>
                  ))}
                </div>
              )}

              {/* Accounts â€” multi-select */}
              <div className="form-lbl" style={{ marginTop: 16 }}>
                Account Assignments
                <span style={{ fontSize: 10, color: 'var(--text-dim)', fontWeight: 400, marginLeft: 8 }}>
                  {formAccounts.length > 0 ? formAccounts.length + ' assigned' : 'none assigned'}
                </span>
              </div>
              <MultiSelectList
                items={accounts.map(a => ({ value: a.id, label: a.name }))}
                selected={formAccounts}
                onChange={setFormAccounts}
                placeholder="No active accounts available"
              />

              {!editUser && (
                <div className="warn-box" style={{ marginTop: 16 }}>Default password: <strong>MedEx1234!</strong> - ask the rep to change it on first login.</div>
              )}
            </div>

            {/* Extra actions for existing users */}
            {editUser && (
              <div style={{ padding: '12px 24px', background: 'var(--bg)', borderTop: '1px solid var(--border)', display: 'flex', gap: 8, alignItems: 'center' }}>
                <button className="btn btn-outline" style={{ fontSize: 12 }} onClick={handleResetPassword}>
                  Reset Password
                </button>
                <button
                  className="btn btn-outline"
                  style={{ fontSize: 12, borderColor: form.is_active ? '#FECACA' : 'var(--border)', color: form.is_active ? 'var(--red)' : 'var(--green)' }}
                  onClick={handleToggleActive}
                >
                  {form.is_active ? 'Deactivate User' : 'Activate User'}
                </button>
              </div>
            )}
            <div className="modal-actions">
              <button className="btn btn-outline" onClick={() => setShowForm(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : editUser ? 'Save Changes' : 'Create User'}</button>
            </div>
          </div>
        </div>
      )}

      {/* â”€â”€ Import panel â”€â”€ */}
      {showImport && (
        <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 12, padding: '20px 24px', marginBottom: 16, boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <div style={{ fontSize: 15, fontWeight: 800 }}>Import Users via CSV</div>
            <button className="btn btn-outline" onClick={resetImport} style={{ fontSize: 12 }}>Cancel</button>
          </div>
          {importError && <div className="alert-banner alert-error" style={{ marginBottom: 12 }}>{importError}</div>}
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 14 }}>
            <input type="file" accept=".csv" onChange={handleFileSelect} style={{ fontSize: 13 }} />
          </div>
          {importPreview.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-dim)', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 }}>
                Preview â€” {importPreview.length} of {importRaw.split('\n').filter(l => l.trim() && !l.startsWith('#')).length - 1} rows
              </div>
              <div style={{ overflowX: 'auto', borderRadius: 8, border: '1px solid var(--border)' }}>
                <table style={{ fontSize: 12 }}>
                  <thead>
                    <tr>{['EmailAddress','FullName','Role','Region','Status'].map(h => <th key={h}>{h}</th>)}</tr>
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
            <button className="btn btn-primary" onClick={runImport} disabled={!importFile || !!importError || importing}>
              {importing ? 'Importing...' : 'Run Import'}
            </button>
            <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>New users get default password: MedEx1234!</span>
          </div>
        </div>
      )}

      {/* â”€â”€ Filter row â”€â”€ */}
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

      {/* â”€â”€ Table â”€â”€ */}
      <div className="region-block">
        <table>
          <thead>
            <tr>
              <th style={{ width: '30%' }}>Name</th>
              <th style={{ width: '40%' }}>Email</th>
              <th style={{ width: '15%' }}>Status</th>
              <th style={{ width: '15%' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--text-dim)', padding: 32, fontStyle: 'italic' }}>No users match your filter.</td></tr>
            ) : filtered.map(u => (
              <tr key={u.id}>
                <td style={{ fontWeight: 700 }}>{u.full_name}</td>
                <td style={{ fontSize: 13, color: 'var(--text-mid)' }}>{u.email}</td>
                <td>
                  <span style={{ fontSize: 12, fontWeight: 700, color: u.is_active ? 'var(--green)' : 'var(--text-dim)' }}>
                    {u.is_active ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td>
                  <button className="tbl-btn-sm" onClick={() => openEdit(u)}>Edit</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

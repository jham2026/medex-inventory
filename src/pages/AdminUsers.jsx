import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useToast } from '../components/ToastContext';

const BLANK_FORM = { full_name: '', email: '', role: 'rep', region: '', is_active: true };
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVzY2p5cWdmbmNxb3FxZWdyY2p3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjY2OTgxNSwiZXhwIjoyMDg4MjQ1ODE1fQ.OCe9Kx7CJkdgukE_7-dBmMpF24Tqmmz0Vo7OjmdSQ6k';
const SUPABASE_URL = 'https://uscjyqgfncqoqqegrcjw.supabase.co';

export default function AdminUsers() {
  const toast = useToast();
  const [users, setUsers]         = useState([]);
  const [regions, setRegions]     = useState([]);
  const [loading, setLoading]     = useState(true);
  const [showForm, setShowForm]   = useState(false);
  const [editUser, setEditUser]   = useState(null);
  const [form, setForm]           = useState(BLANK_FORM);
  const [saving, setSaving]       = useState(false);
  const [search, setSearch]       = useState('');
  const [filterRole, setFilterRole] = useState('all');

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

  function openAdd() { setEditUser(null); setForm(BLANK_FORM); setShowForm(true); }
  function openEdit(user) {
    setEditUser(user);
    setForm({ full_name: user.full_name || '', email: user.email || '', role: user.role || 'rep', region: user.region || '', is_active: user.is_active });
    setShowForm(true);
  }

  async function handleSave() {
    if (!form.full_name || !form.email) { toast.error('Name and email are required'); return; }
    setSaving(true);
    if (editUser) {
      const { error } = await supabase.from('profiles').update({ full_name: form.full_name, role: form.role, region: form.region || null, is_active: form.is_active }).eq('id', editUser.id);
      if (error) toast.error('Update failed: ' + error.message);
      else { setUsers(prev => prev.map(u => u.id === editUser.id ? { ...u, ...form } : u)); toast.success(form.full_name + ' updated!'); setShowForm(false); }
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
      else { toast.success(form.full_name + ' created! Password: MedEx1234!'); loadData(); setShowForm(false); }
    }
    setSaving(false);
  }

  async function toggleActive(user) {
    await supabase.from('profiles').update({ is_active: !user.is_active }).eq('id', user.id);
    setUsers(prev => prev.map(u => u.id === user.id ? { ...u, is_active: !u.is_active } : u));
    toast.success(user.full_name + (user.is_active ? ' deactivated' : ' activated'));
  }

  async function resetPassword(user) {
    if (!window.confirm('Reset password for ' + user.full_name + ' to MedEx1234!?')) return;
    const res = await fetch(SUPABASE_URL + '/auth/v1/admin/users/' + user.id, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'apikey': SERVICE_KEY, 'Authorization': 'Bearer ' + SERVICE_KEY },
      body: JSON.stringify({ password: 'MedEx1234!' }),
    });
    if (res.ok) toast.success('Password reset for ' + user.full_name);
    else toast.error('Reset failed');
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
                <div className="warn-box" style={{ marginTop: 16 }}>Default password: <strong>MedEx1234!</strong> â€” ask the rep to change it on first login.</div>
              )}
            </div>
            <div className="modal-actions">
              <button className="btn btn-outline" onClick={() => setShowForm(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : editUser ? 'Save Changes' : 'Create User'}</button>
            </div>
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
        <button className="btn btn-primary" onClick={openAdd}>+ Add User</button>
      </div>

      {/* Table */}
      <div className="card">
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

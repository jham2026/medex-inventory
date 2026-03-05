import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useToast } from '../components/ToastContext';

const BLANK_FORM = { full_name: '', email: '', role: 'rep', region: '', is_active: true };

export default function AdminUsers() {
  const toast = useToast();
  const [users, setUsers]       = useState([]);
  const [regions, setRegions]   = useState([]);
  const [loading, setLoading]   = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editUser, setEditUser] = useState(null);
  const [form, setForm]         = useState(BLANK_FORM);
  const [saving, setSaving]     = useState(false);
  const [search, setSearch]     = useState('');
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

  function openAdd() {
    setEditUser(null);
    setForm(BLANK_FORM);
    setShowForm(true);
  }

  function openEdit(user) {
    setEditUser(user);
    setForm({
      full_name: user.full_name || '',
      email:     user.email || '',
      role:      user.role || 'rep',
      region:    user.region || '',
      is_active: user.is_active,
    });
    setShowForm(true);
  }

  async function handleSave() {
    if (!form.full_name || !form.email) { toast.error('Name and email are required'); return; }
    setSaving(true);

    if (editUser) {
      const { error } = await supabase.from('profiles').update({
        full_name: form.full_name,
        role:      form.role,
        region:    form.region || null,
        is_active: form.is_active,
      }).eq('id', editUser.id);
      if (error) { toast.error('Update failed: ' + error.message); }
      else {
        setUsers(prev => prev.map(u => u.id === editUser.id ? { ...u, ...form, region: form.region || null } : u));
        toast.success(`${form.full_name} updated!`);
        setShowForm(false);
      }
    } else {
      const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVzY2p5cWdmbmNxb3FxZWdyY2p3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjY2OTgxNSwiZXhwIjoyMDg4MjQ1ODE1fQ.OCe9Kx7CJkdgukE_7-dBmMpF24Tqmmz0Vo7OjmdSQ6k';
      const SUPABASE_URL = 'https://uscjyqgfncqoqqegrcjw.supabase.co';
      const authRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': SERVICE_KEY, 'Authorization': `Bearer ${SERVICE_KEY}` },
        body: JSON.stringify({ email: form.email, password: 'MedEx1234!', email_confirm: true, user_metadata: { full_name: form.full_name } }),
      });
      const authResult = await authRes.json();
      if (!authRes.ok) { toast.error('Error: ' + (authResult.msg || authResult.message || 'Unknown')); setSaving(false); return; }
      const { error: profError } = await supabase.from('profiles').insert({
        id: authResult.id, full_name: form.full_name, email: form.email,
        role: form.role, region: form.region || null, is_active: true,
      });
      if (profError) { toast.error('Profile error: ' + profError.message); }
      else { toast.success(`${form.full_name} created! Password: MedEx1234!`); loadData(); setShowForm(false); }
    }
    setSaving(false);
  }

  async function toggleActive(user) {
    await supabase.from('profiles').update({ is_active: !user.is_active }).eq('id', user.id);
    setUsers(prev => prev.map(u => u.id === user.id ? { ...u, is_active: !u.is_active } : u));
    toast.success(`${user.full_name} ${user.is_active ? 'deactivated' : 'activated'}`);
  }

  async function resetPassword(user) {
    if (!window.confirm(`Reset password for ${user.full_name} to MedEx1234!?`)) return;
    const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVzY2p5cWdmbmNxb3FxZWdyY2p3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjY2OTgxNSwiZXhwIjoyMDg4MjQ1ODE1fQ.OCe9Kx7CJkdgukE_7-dBmMpF24Tqmmz0Vo7OjmdSQ6k';
    const SUPABASE_URL = 'https://uscjyqgfncqoqqegrcjw.supabase.co';
    const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${user.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'apikey': SERVICE_KEY, 'Authorization': `Bearer ${SERVICE_KEY}` },
      body: JSON.stringify({ password: 'MedEx1234!' }),
    });
    if (res.ok) toast.success(`Password reset for ${user.full_name}`);
    else toast.error('Reset failed');
  }

  const filtered = users
    .filter(u => filterRole === 'all' || u.role === filterRole)
    .filter(u => !search || u.full_name?.toLowerCase().includes(search.toLowerCase()) || u.email?.toLowerCase().includes(search.toLowerCase()));

  if (loading) return <div className="loading-center"><div className="spinner" /></div>;

  return (
    <div>
      {showForm && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowForm(false)}>
          <div className="modal">
            <div className="modal-header">
              <h3>{editUser ? `Edit — ${editUser.full_name}` : 'Add New User'}</h3>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowForm(false)}
                style={{ color: 'white', borderColor: 'rgba(255,255,255,0.3)' }}></button>
            </div>
            <div className="modal-body">
              <div className="input-group">
                <label className="input-label">Full Name *</label>
                <input className="input" value={form.full_name} autoFocus
                  onChange={e => setForm(p => ({ ...p, full_name: e.target.value }))} />
              </div>
              <div className="input-group">
                <label className="input-label">Email Address *</label>
                <input className="input" type="email" value={form.email} disabled={!!editUser}
                  onChange={e => setForm(p => ({ ...p, email: e.target.value }))} />
                {editUser && <div style={{ fontSize: 11, color: 'var(--gray-dark)', marginTop: 3 }}>Email cannot be changed after creation.</div>}
              </div>
              <div className="input-group">
                <label className="input-label">Role *</label>
                <select className="select" value={form.role} onChange={e => setForm(p => ({ ...p, role: e.target.value }))}>
                  <option value="rep">Rep</option>
                  <option value="manager">Manager</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <div className="input-group">
                <label className="input-label">Region</label>
                <select className="select" value={form.region} onChange={e => setForm(p => ({ ...p, region: e.target.value }))}>
                  <option value="">All Regions (Admin/Manager)</option>
                  {regions.map(r => <option key={r.id} value={r.name}>{r.name}</option>)}
                </select>
              </div>
              {editUser && (
                <div className="input-group">
                  <label className="input-label">Status</label>
                  <select className="select" value={form.is_active ? 'active' : 'inactive'}
                    onChange={e => setForm(p => ({ ...p, is_active: e.target.value === 'active' }))}>
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>
              )}
              {!editUser && (
                <div className="alert-banner info">
                  Default password: <strong>MedEx1234!</strong> — ask the rep to change it on first login.
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-utility" onClick={() => setShowForm(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? 'Saving...' : editUser ? 'Save Changes' : 'Create User'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <strong>{users.length} users</strong>
        <button className="btn btn-secondary btn-sm" onClick={openAdd}>+ Add User</button>
      </div>

      <div className="filter-bar" style={{ marginBottom: 14 }}>
        <label>Role:</label>
        <select className="select" value={filterRole} onChange={e => setFilterRole(e.target.value)}>
          <option value="all">All Roles</option>
          <option value="rep">Rep</option>
          <option value="manager">Manager</option>
          <option value="admin">Admin</option>
        </select>
        <label>Search:</label>
        <input className="input" placeholder="Name or email..."
          value={search} onChange={e => setSearch(e.target.value)} />
        <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--gray-dark)' }}>
          {filtered.length} of {users.length} users
        </span>
      </div>

      <div className="card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th><th>Email</th><th>Role</th><th>Region</th><th>Status</th><th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(u => (
                <tr key={u.id}>
                  <td><strong>{u.full_name}</strong></td>
                  <td style={{ fontSize: 12 }}>{u.email}</td>
                  <td>
                    <span className={`badge ${u.role === 'admin' ? 'badge-submitted' : u.role === 'manager' ? 'badge-in_progress' : 'badge-not_started'}`}>
                      {u.role}
                    </span>
                  </td>
                  <td style={{ fontSize: 12, color: 'var(--gray-dark)' }}>{u.region || 'All'}</td>
                  <td>
                    <span className={`badge ${u.is_active ? 'badge-approved' : 'badge-closed'}`}>
                      {u.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button className="btn btn-secondary btn-sm" onClick={() => openEdit(u)}>Edit</button>
                      <button className="btn btn-utility btn-sm" onClick={() => resetPassword(u)}>Reset PW</button>
                      <button className={`btn btn-sm ${u.is_active ? 'btn-utility' : 'btn-secondary'}`}
                        onClick={() => toggleActive(u)}>
                        {u.is_active ? 'Deactivate' : 'Activate'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={6} className="table-empty">No users match your filter.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      <AccountRequests regions={regions} />
    </div>
  );
}

function AccountRequests({ regions }) {
  const toast = useToast();
  const [requests, setRequests] = useState([]);
  useEffect(() => {
    supabase.from('account_requests').select(`*, rep:profiles(full_name)`)
      .eq('status', 'pending').order('created_at', { ascending: false })
      .then(({ data }) => setRequests(data || []));
  }, []);
  async function resolve(req, status) {
    await supabase.from('account_requests').update({ status, resolved_at: new Date().toISOString() }).eq('id', req.id);
    setRequests(prev => prev.filter(r => r.id !== req.id));
    toast.success(status === 'approved' ? 'Request approved' : 'Request denied');
  }
  if (!requests.length) return null;
  return (
    <div className="card" style={{ marginTop: 20 }}>
      <div className="card-header"><span style={{ fontWeight: 'bold' }}> Account Requests ({requests.length})</span></div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Rep</th><th>Account Requested</th><th>Region</th><th>Notes</th><th>Date</th><th>Actions</th></tr></thead>
          <tbody>
            {requests.map(r => (
              <tr key={r.id}>
                <td>{r.rep?.full_name}</td>
                <td><strong>{r.account_name}</strong></td>
                <td>{regions.find(reg => reg.id === r.region_id)?.name || '—'}</td>
                <td style={{ fontSize: 12 }}>{r.notes || '—'}</td>
                <td style={{ fontSize: 12 }}>{new Date(r.created_at).toLocaleDateString()}</td>
                <td style={{ display: 'flex', gap: 6 }}>
                  <button className="btn btn-secondary btn-sm" onClick={() => resolve(r, 'approved')}>Approve</button>
                  <button className="btn btn-utility btn-sm" onClick={() => resolve(r, 'denied')}>Deny</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

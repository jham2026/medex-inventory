import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useToast } from '../components/ToastContext';

export default function AdminUsers() {
  const toast = useToast();
  const [users, setUsers]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ full_name: '', email: '', role: 'rep', region: '' });
  const [regions, setRegions] = useState([]);

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

  async function toggleActive(user) {
    await supabase.from('profiles').update({ is_active: !user.is_active }).eq('id', user.id);
    setUsers(prev => prev.map(u => u.id === user.id ? { ...u, is_active: !u.is_active } : u));
    toast.success(`${user.full_name} ${user.is_active ? 'deactivated' : 'activated'}`);
  }

  async function updateRole(userId, role) {
    await supabase.from('profiles').update({ role }).eq('id', userId);
    setUsers(prev => prev.map(u => u.id === userId ? { ...u, role } : u));
    toast.success('Role updated');
  }

  if (loading) return <div className="loading-center"><div className="spinner" /></div>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <strong>{users.length} users</strong>
          <span style={{ color: 'var(--gray-dark)', fontSize: 12, marginLeft: 8 }}>
            Active Users CSV import available in the Import Tool
          </span>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={() => setShowForm(true)}>+ Add User</button>
      </div>

      <div className="alert-banner info" style={{ marginBottom: 16 }}>
        To bulk-import users, use the Import Tool and upload your Active Users CSV. Individual users can be added or edited here.
      </div>

      <div className="card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Region</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id}>
                  <td><strong>{u.full_name}</strong></td>
                  <td style={{ fontSize: 12 }}>{u.email}</td>
                  <td>
                    <select
                      className="select" style={{ width: 110, padding: '3px 6px' }}
                      value={u.role}
                      onChange={e => updateRole(u.id, e.target.value)}
                    >
                      <option value="rep">Rep</option>
                      <option value="manager">Manager</option>
                      <option value="admin">Admin</option>
                    </select>
                  </td>
                  <td style={{ fontSize: 12, color: 'var(--gray-dark)' }}>{u.region || 'All'}</td>
                  <td>
                    <span className={`badge ${u.is_active ? 'badge-approved' : 'badge-closed'}`}>
                      {u.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td>
                    <button
                      className={`btn btn-sm ${u.is_active ? 'btn-utility' : 'btn-secondary'}`}
                      onClick={() => toggleActive(u)}
                    >
                      {u.is_active ? 'Deactivate' : 'Activate'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Account Requests */}
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
    await supabase.from('account_requests')
      .update({ status, resolved_at: new Date().toISOString() })
      .eq('id', req.id);
    setRequests(prev => prev.filter(r => r.id !== req.id));
    toast.success(status === 'approved' ? 'Request approved' : 'Request denied');
  }

  if (!requests.length) return null;

  return (
    <div className="card" style={{ marginTop: 20 }}>
      <div className="card-header">
        <span style={{ fontWeight: 'bold' }}>📋 Account Requests ({requests.length})</span>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>Rep</th><th>Account Requested</th><th>Region</th><th>Notes</th><th>Date</th><th>Actions</th></tr>
          </thead>
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

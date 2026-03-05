import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../components/AuthContext';
import { useToast } from '../components/ToastContext';
import NavBar from '../components/NavBar';

export default function RequestAccount() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [regions, setRegions] = useState([]);
  const [form, setForm] = useState({ account_name: '', region_id: '', notes: '' });
  const [submitting, setSubmitting] = useState(false);
  const [myRequests, setMyRequests] = useState([]);

  useEffect(() => {
    supabase.from('regions').select('*').order('name').then(({ data }) => setRegions(data || []));
    supabase.from('account_requests').select('*')
      .eq('requested_by', profile.id).order('created_at', { ascending: false })
      .then(({ data }) => setMyRequests(data || []));
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.account_name) { toast.error('Account name is required'); return; }
    setSubmitting(true);
    const { error } = await supabase.from('account_requests').insert({
      requested_by: profile.id,
      account_name: form.account_name,
      region_id: form.region_id || null,
      notes: form.notes || null,
    });
    if (error) { toast.error('Error submitting request'); setSubmitting(false); return; }
    toast.success('Request submitted! Admin will review and assign the account.');
    setForm({ account_name: '', region_id: '', notes: '' });
    setSubmitting(false);
    navigate('/');
  }

  return (
    <>
      <NavBar />
      <div className="page">
        <div className="page-inner" style={{ maxWidth: 600 }}>
          <div style={{ marginBottom: 20 }}>
            <button className="btn btn-utility btn-sm" onClick={() => navigate('/')}
              style={{ marginBottom: 8 }}>← Back</button>
            <div className="page-title">Request Account Assignment</div>
            <div className="page-sub">
              If you have a new location that isn't in your list, submit a request here.
              Admin will review and assign it to you.
            </div>
          </div>

          <div className="card">
            <div className="card-body">
              <form onSubmit={handleSubmit}>
                <div className="input-group">
                  <label className="input-label">Account / Location Name *</label>
                  <input className="input" required
                    value={form.account_name}
                    onChange={e => setForm(p => ({ ...p, account_name: e.target.value }))}
                    placeholder="e.g. AUS-NEW SURGERY CENTER" />
                </div>
                <div className="input-group">
                  <label className="input-label">Region</label>
                  <select className="select"
                    value={form.region_id}
                    onChange={e => setForm(p => ({ ...p, region_id: e.target.value }))}>
                    <option value="">— Select Region (if known) —</option>
                    {regions.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                  </select>
                </div>
                <div className="input-group">
                  <label className="input-label">Notes</label>
                  <textarea className="textarea" rows={3}
                    value={form.notes}
                    onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
                    placeholder="Any additional context for admin..." />
                </div>
                <button className="btn btn-primary" type="submit" disabled={submitting}>
                  {submitting ? 'Submitting...' : 'Submit Request'}
                </button>
              </form>
            </div>
          </div>

          {myRequests.length > 0 && (
            <div className="card" style={{ marginTop: 20 }}>
              <div className="card-header"><span style={{ fontWeight: 'bold' }}>My Previous Requests</span></div>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Account</th><th>Status</th><th>Date</th></tr></thead>
                  <tbody>
                    {myRequests.map(r => (
                      <tr key={r.id}>
                        <td>{r.account_name}</td>
                        <td><span className={`badge badge-${r.status === 'approved' ? 'approved' : r.status === 'denied' ? 'closed' : 'in_progress'}`}>
                          {r.status}
                        </span></td>
                        <td style={{ fontSize: 12 }}>{new Date(r.created_at).toLocaleDateString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

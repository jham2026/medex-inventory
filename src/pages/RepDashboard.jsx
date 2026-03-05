import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../components/AuthContext';
import { useToast } from '../components/ToastContext';

const STATUS_COLOR = {
  not_started: { color: '#7A909F', label: 'Not Started' },
  in_progress:  { color: '#0076BB', label: 'In Progress' },
  submitted:    { color: '#c88e0f', label: 'Submitted for Review' },
  approved:     { color: '#22C55E', label: 'Approved' },
};

export default function RepDashboard() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [cycle, setCycle]     = useState(null);
  const [counts, setCounts]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('accounts');
  const [editRequestModal, setEditRequestModal] = useState(null); // holds the count object
  const [editForm, setEditForm] = useState({ reason: '', details: '', urgency: 'normal' });
  const [submittingRequest, setSubmittingRequest] = useState(false);
  const [pendingRequests, setPendingRequests] = useState({}); // countId -> true if request pending
  const [notifications, setNotifications] = useState([]);
  const [showNotifications, setShowNotifications] = useState(false);

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    const { data: cycleData } = await supabase
      .from('count_cycles').select('*').eq('status', 'open').single();
    setCycle(cycleData);

    if (cycleData && profile?.id) {
      const { data: countData } = await supabase
        .from('inventory_counts')
        .select('id, status, submitted_at, account:accounts(id, name, region:regions(name))')
        .eq('cycle_id', cycleData.id)
        .eq('rep_id', profile.id)
        .order('status');
      setCounts(countData || []);

      // Check which counts have pending edit requests
      if (countData?.length) {
        const { data: pendingTodos } = await supabase
          .from('todos')
          .select('count_id')
          .in('count_id', countData.map(c => c.id))
          .eq('todo_type', 'edit_request')
          .eq('is_complete', false);
        const pending = {};
        for (const t of pendingTodos || []) pending[t.count_id] = true;
        setPendingRequests(pending);
      }
    }
    // Load rep notifications
    if (profile?.id) {
      const { data: notifData } = await supabase
        .from('alerts')
        .select('*')
        .eq('rep_id', profile.id)
        .order('created_at', { ascending: false })
        .limit(20);
      setNotifications(notifData || []);
    }

    setLoading(false);
  }

  async function submitEditRequest() {
    if (!editForm.reason) { toast.error('Please select a reason.'); return; }
    if (!editForm.details.trim()) { toast.error('Please provide details about why you need to reopen this count.'); return; }
    setSubmittingRequest(true);

    const count = editRequestModal;
    await supabase.from('todos').insert({
      title: 'Edit request: ' + count.account?.name,
      description: profile?.full_name + ' is requesting to reopen their submitted count for ' + count.account?.name,
      priority: editForm.urgency === 'urgent' ? 'high' : 'normal',
      todo_type: 'edit_request',
      account_id: count.account?.id,
      count_id: count.id,
      is_complete: false,
      metadata: JSON.stringify({
        rep_name: profile?.full_name,
        rep_email: profile?.email,
        account_name: count.account?.name,
        region: count.account?.region?.name,
        reason: editForm.reason,
        details: editForm.details,
        urgency: editForm.urgency,
        requested_at: new Date().toISOString(),
      }),
    });

    await supabase.from('alerts').insert({
      alert_type: 'edit_request',
      message: profile?.full_name + ' requested to reopen count for ' + count.account?.name + ' â€” Reason: ' + editForm.reason,
      is_read: false,
    });

    setPendingRequests(p => ({ ...p, [count.id]: true }));
    setEditRequestModal(null);
    setEditForm({ reason: '', details: '', urgency: 'normal' });
    toast.success('Edit request sent to admin!');
    setSubmittingRequest(false);
  }

  async function markAllRead() {
    const unreadIds = notifications.filter(n => !n.is_read).map(n => n.id);
    if (unreadIds.length === 0) return;
    await supabase.from('alerts').update({ is_read: true }).in('id', unreadIds);
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
  }

  async function signOut() {
    await supabase.auth.signOut();
    navigate('/login');
  }

  const firstName = profile?.full_name?.split(' ')[0] || 'there';
  const initials = profile?.full_name?.split(' ').map(w => w[0]).join('').toUpperCase().slice(0,2) || 'RR';
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  const stats = {
    not_started: counts.filter(c => c.status === 'not_started').length,
    in_progress:  counts.filter(c => c.status === 'in_progress').length,
    submitted:    counts.filter(c => c.status === 'submitted').length,
    approved:     counts.filter(c => c.status === 'approved').length,
  };
  const total = counts.length;
  const remaining = stats.not_started + stats.in_progress;

  function StatBar({ value, total, color }) {
    const pct = total > 0 ? Math.round(value / total * 100) : 0;
    return (
      <div style={{ marginTop: 6 }}>
        <div style={{ height: 3, background: 'rgba(255,255,255,0.15)', borderRadius: 2, overflow: 'hidden' }}>
          <div style={{ height: '100%', background: color, borderRadius: 2, width: pct + '%', transition: 'width 0.4s' }} />
        </div>
        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', marginTop: 2 }}>{pct}%</div>
      </div>
    );
  }

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#F7F9FB' }}>
      <div className="loading-center"><div className="spinner" /><span>Loading...</span></div>
    </div>
  );

  return (
    <div style={{ background: '#F7F9FB', minHeight: '100vh', maxWidth: 430, margin: '0 auto', position: 'relative', borderLeft: '1px solid #E1E8EE', borderRight: '1px solid #E1E8EE' }}>

      {/* Top bar */}
      <div style={{ background: '#003f63', padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '3px solid #EEAF24', position: 'sticky', top: 0, zIndex: 20 }}>
        <div style={{ fontSize: 22, fontWeight: 800, color: 'white', letterSpacing: '-0.5px' }}>
          Med<span style={{ color: '#EEAF24' }}>Ex</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={signOut} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>Sign out</button>
          {/* Notification Bell */}
          <div style={{ position: 'relative' }}>
            <button onClick={() => { setShowNotifications(!showNotifications); if (!showNotifications) markAllRead(); }}
              style={{ background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: 8, width: 34, height: 34, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
              <span style={{ fontSize: 16 }}>&#128276;</span>
              {notifications.filter(n => !n.is_read).length > 0 && (
                <span style={{ position: 'absolute', top: 2, right: 2, background: '#EF4444', color: 'white', fontSize: 9, fontWeight: 700, width: 16, height: 16, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {notifications.filter(n => !n.is_read).length}
                </span>
              )}
            </button>
          </div>
          <div style={{ width: 34, height: 34, background: 'linear-gradient(135deg, #3398cc, #EEAF24)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: 'white' }}>
            {initials}
          </div>
        </div>
      </div>

      {/* Body */}
      <div style={{ padding: '18px 16px 110px' }}>

        {/* Greeting */}
        <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.5px', color: '#1A2B38', marginBottom: 2 }}>
          {greeting}, {firstName}
        </div>
        <div style={{ fontSize: 13, color: '#7A909F', marginBottom: 18 }}>
          {remaining > 0
            ? remaining + ' account' + (remaining !== 1 ? 's' : '') + ' still need your attention'
            : total > 0 ? 'All accounts submitted!' : 'No accounts assigned yet.'}
        </div>

        {/* Hero card */}
        {cycle ? (
          <div style={{ background: 'linear-gradient(135deg, #003f63 0%, #0076BB 100%)', borderRadius: 18, padding: 20, marginBottom: 20, color: 'white', position: 'relative', overflow: 'hidden', borderLeft: '4px solid #EEAF24' }}>
            <div style={{ position: 'absolute', right: -30, top: -30, width: 130, height: 130, background: 'rgba(255,255,255,0.04)', borderRadius: '50%' }} />
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4 }}>Active Cycle</div>
            <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.4px', marginBottom: 16 }}>{cycle.name}</div>

            {/* Expanded stats with progress bars */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 12 }}>
              {[
                { key: 'not_started', label: 'Not Started',        color: 'rgba(255,255,255,0.4)' },
                { key: 'in_progress', label: 'In Progress',        color: '#60c4ff' },
                { key: 'submitted',   label: 'Submitted for Review', color: '#EEAF24' },
                { key: 'approved',    label: 'Approved',            color: '#4ade80' },
              ].map(s => (
                <div key={s.key}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                    <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.5px', color: s.color }}>{stats[s.key]}</div>
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>{s.label}</div>
                  </div>
                  <StatBar value={stats[s.key]} total={total} color={s.color} />
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div style={{ background: '#E1E8EE', borderRadius: 18, padding: 20, marginBottom: 20, textAlign: 'center', color: '#7A909F', fontSize: 14 }}>
            No active count cycle at this time.
          </div>
        )}

        {/* Accounts list */}
        {counts.length > 0 && (
          <>
            <div style={{ fontSize: 16, fontWeight: 600, letterSpacing: '-0.3px', color: '#1A2B38', marginBottom: 10 }}>Your Accounts</div>
            {counts.map(count => {
              const st = STATUS_COLOR[count.status] || STATUS_COLOR.not_started;
              const locked = count.status === 'submitted' || count.status === 'approved';
              const hasPendingRequest = pendingRequests[count.id];
              return (
                <div key={count.id}
                  onClick={() => { if (!locked) navigate('/count/' + count.id); }}
                  style={{
                    background: 'white', borderRadius: 12,
                    border: '1px solid #E1E8EE', padding: '14px 16px',
                    marginBottom: 8, display: 'flex', alignItems: 'center', gap: 12,
                    boxShadow: '0 1px 4px rgba(0,118,187,0.08)',
                    cursor: locked ? 'default' : 'pointer',
                    transition: 'all 0.15s',
                    opacity: count.status === 'approved' ? 0.7 : 1,
                  }}
                  onMouseEnter={e => { if (!locked) { e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,118,187,0.12)'; e.currentTarget.style.transform = 'translateY(-1px)'; }}}
                  onMouseLeave={e => { e.currentTarget.style.boxShadow = '0 1px 4px rgba(0,118,187,0.08)'; e.currentTarget.style.transform = 'none'; }}
                >
                  <div style={{ width: 38, height: 38, background: '#e8f4fb', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>
                    &#127973;
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 500, color: '#1A2B38', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{count.account?.name}</div>
                    <div style={{ fontSize: 11, color: '#7A909F', marginTop: 2 }}>
                      {count.account?.region?.name}&nbsp;&middot;&nbsp;
                      <span style={{ color: st.color, fontWeight: 600 }}>{st.label}</span>
                    </div>
                  </div>

                  {locked && (
                    hasPendingRequest ? (
                      <div style={{ fontSize: 11, fontWeight: 600, color: '#7A909F', background: '#F2F5F8', border: '1px solid #E1E8EE', borderRadius: 6, padding: '5px 10px', flexShrink: 0 }}>
                        Request Pending
                      </div>
                    ) : (
                      <button
                        onClick={e => { e.stopPropagation(); setEditRequestModal(count); setEditForm({ reason: '', details: '', urgency: 'normal' }); }}
                        style={{ fontSize: 11, fontWeight: 600, color: '#0076BB', background: '#e8f4fb', border: 'none', borderRadius: 6, padding: '5px 10px', cursor: 'pointer', flexShrink: 0, fontFamily: 'inherit' }}>
                        Request Edit
                      </button>
                    )
                  )}
                  {!locked && (
                    <div style={{ color: '#C5D1DA', fontSize: 22 }}>&#8250;</div>
                  )}
                </div>
              );
            })}
          </>
        )}

        {cycle && counts.length === 0 && (
          <div style={{ textAlign: 'center', padding: '40px 20px', color: '#7A909F', fontSize: 14 }}>
            No accounts assigned to you for this cycle yet.
          </div>
        )}
      </div>

      {/* Notifications Panel */}
      {showNotifications && (
        <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: '100%', maxWidth: 430, background: 'white', zIndex: 100, display: 'flex', flexDirection: 'column', boxShadow: '-4px 0 20px rgba(0,0,0,0.15)' }}>
          <div style={{ background: '#003f63', padding: '14px 18px', borderBottom: '3px solid #EEAF24', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: 'white' }}>Notifications</div>
            <button onClick={() => setShowNotifications(false)}
              style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: 'white', borderRadius: 8, padding: '6px 12px', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13 }}>
              Close
            </button>
          </div>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {notifications.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '60px 20px', color: '#7A909F', fontSize: 14 }}>
                No notifications yet.
              </div>
            ) : notifications.map(n => {
              const isApproved = n.alert_type === 'edit_approved' || n.alert_type === 'count_approved';
              const isDenied = n.alert_type === 'edit_denied';
              return (
                <div key={n.id} style={{
                  padding: '14px 18px',
                  borderBottom: '1px solid #E1E8EE',
                  background: n.is_read ? 'white' : '#f0f7ff',
                }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                    <div style={{
                      width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                      background: isApproved ? '#dcfce7' : isDenied ? '#fee2e2' : '#e8f4fb',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16,
                    }}>
                      {isApproved ? 'âœ“' : isDenied ? 'âœ—' : 'i'}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: isApproved ? '#15803d' : isDenied ? '#b91c1c' : '#1A2B38', marginBottom: 3 }}>
                        {n.title || n.alert_type?.replace(/_/g, ' ')}
                      </div>
                      <div style={{ fontSize: 13, color: '#3D5466', lineHeight: 1.5 }}>{n.message}</div>
                      <div style={{ fontSize: 11, color: '#C5D1DA', marginTop: 4 }}>
                        {new Date(n.created_at).toLocaleDateString()} at {new Date(n.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Bottom tab bar */}
      <div style={{ position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)', width: 430, maxWidth: '100%', background: 'rgba(255,255,255,0.96)', backdropFilter: 'blur(20px)', borderTop: '1px solid #E1E8EE', display: 'flex', padding: '8px 0 20px', zIndex: 50 }}>
        {[
          { key: 'accounts', label: 'Accounts' },
          { key: 'history',  label: 'History'  },
          { key: 'settings', label: 'Settings' },
        ].map(t => (
          <div key={t.key} onClick={() => setActiveTab(t.key)}
            style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
            <div style={{ width: 24, height: 24, borderRadius: '50%', background: activeTab === t.key ? '#0076BB' : '#E1E8EE', transition: 'background 0.15s' }} />
            <div style={{ fontSize: 10, color: activeTab === t.key ? '#0076BB' : '#C5D1DA', fontWeight: 600 }}>{t.label}</div>
          </div>
        ))}
      </div>

      {/* Edit Request Modal */}
      {editRequestModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,31,50,0.6)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: 'white', borderRadius: 20, width: '100%', maxWidth: 400, overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.2)', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ background: '#003f63', padding: '20px 24px', borderBottom: '3px solid #EEAF24' }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: 'white' }}>Request to Reopen Count</div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 3 }}>{editRequestModal.account?.name}</div>
            </div>
            <div style={{ padding: 24 }}>
              <div style={{ background: '#fef8eb', border: '1px solid #EEAF24', borderRadius: 8, padding: 12, fontSize: 13, color: '#78350f', marginBottom: 20, lineHeight: 1.5 }}>
                This request will be sent to your admin for approval. You will not be able to edit your count until it is approved.
              </div>

              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#7A909F', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
                  Reason for Edit Request *
                </label>
                <select value={editForm.reason} onChange={e => setEditForm(p => ({ ...p, reason: e.target.value }))}
                  style={{ width: '100%', padding: '10px 12px', border: '1.5px solid #E1E8EE', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', outline: 'none', background: 'white' }}>
                  <option value="">Select a reason...</option>
                  <option value="incorrect_quantity">Incorrect Quantity</option>
                  <option value="missing_items">Missing Items</option>
                  <option value="wrong_item">Wrong Item Added</option>
                  <option value="data_entry_error">Data Entry Error</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#7A909F', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
                  Urgency
                </label>
                <div style={{ display: 'flex', gap: 8 }}>
                  {[{ key: 'normal', label: 'Normal' }, { key: 'urgent', label: 'Urgent' }].map(u => (
                    <button key={u.key} onClick={() => setEditForm(p => ({ ...p, urgency: u.key }))}
                      style={{
                        flex: 1, padding: '9px', border: '1.5px solid', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                        borderColor: editForm.urgency === u.key ? '#0076BB' : '#E1E8EE',
                        background: editForm.urgency === u.key ? '#e8f4fb' : 'white',
                        color: editForm.urgency === u.key ? '#0076BB' : '#7A909F',
                      }}>
                      {u.label}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ marginBottom: 20 }}>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#7A909F', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
                  Details *
                </label>
                <textarea value={editForm.details} onChange={e => setEditForm(p => ({ ...p, details: e.target.value }))} rows={4}
                  placeholder="Please explain what needs to be corrected and why..."
                  style={{ width: '100%', padding: '10px 12px', border: '1.5px solid #E1E8EE', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', outline: 'none', resize: 'vertical', boxSizing: 'border-box' }}
                  onFocus={e => e.target.style.borderColor = '#0076BB'}
                  onBlur={e => e.target.style.borderColor = '#E1E8EE'}
                />
              </div>

              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={() => { setEditRequestModal(null); setEditForm({ reason: '', details: '', urgency: 'normal' }); }}
                  style={{ flex: 1, padding: '12px', background: '#F2F5F8', border: '1.5px solid #E1E8EE', borderRadius: 8, fontSize: 14, fontWeight: 600, color: '#3D5466', cursor: 'pointer', fontFamily: 'inherit' }}>
                  Cancel
                </button>
                <button onClick={submitEditRequest} disabled={submittingRequest}
                  style={{ flex: 2, padding: '12px', background: '#0076BB', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 700, color: 'white', cursor: 'pointer', fontFamily: 'inherit' }}>
                  {submittingRequest ? 'Sending...' : 'Send Request'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

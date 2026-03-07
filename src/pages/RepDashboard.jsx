import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../components/AuthContext';
import { useToast } from '../components/ToastContext';

const STAT_CARDS = [
  { key: 'not_started', label: 'Not Started', cls: 'sc-red',   tc: 'c-red'   },
  { key: 'in_progress', label: 'In Progress',  cls: 'sc-gold',  tc: 'c-gold'  },
  { key: 'submitted',   label: 'Submitted',    cls: 'sc-blue',  tc: 'c-blue'  },
  { key: 'approved',    label: 'Approved',     cls: 'sc-green', tc: 'c-green' },
];

export default function RepDashboard() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [cycle, setCycle]               = useState(null);
  const [counts, setCounts]             = useState([]);
  const [loading, setLoading]           = useState(true);
  const [activeTab, setActiveTab]       = useState('accounts');
  const [editRequestModal, setEditRequestModal] = useState(null);
  const [editForm, setEditForm]         = useState({ reason: '', details: '', urgency: 'normal' });
  const [submittingRequest, setSubmittingRequest] = useState(false);
  const [pendingRequests, setPendingRequests] = useState({});
  const [notifications, setNotifications] = useState([]);
  const [showNotifications, setShowNotifications] = useState(false);

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    const { data: cycleData } = await supabase.from('count_cycles').select('*').eq('status', 'open').single();
    setCycle(cycleData);

    if (cycleData && profile?.id) {
      const { data: countData } = await supabase
        .from('inventory_counts')
        .select('id, status, submitted_at, account:accounts(id, name, region:regions(name))')
        .eq('cycle_id', cycleData.id)
        .eq('rep_id', profile.id)
        .order('status');
      setCounts(countData || []);

      if (countData?.length) {
        const { data: pendingTodos } = await supabase.from('todos').select('count_id')
          .in('count_id', countData.map(c => c.id)).eq('todo_type', 'edit_request').eq('is_complete', false);
        const pending = {};
        for (const t of pendingTodos || []) pending[t.count_id] = true;
        setPendingRequests(pending);
      }
    }
    if (profile?.id) {
      const { data: notifData } = await supabase.from('alerts').select('*')
        .eq('rep_id', profile.id).order('created_at', { ascending: false }).limit(20);
      setNotifications(notifData || []);
    }
    setLoading(false);
  }

  async function submitEditRequest() {
    if (!editForm.reason) { toast.error('Please select a reason.'); return; }
    if (!editForm.details.trim()) { toast.error('Please provide details.'); return; }
    setSubmittingRequest(true);
    const count = editRequestModal;
    await supabase.from('todos').insert({
      title: 'Edit request: ' + count.account?.name,
      description: profile?.full_name + ' is requesting to reopen count for ' + count.account?.name,
      priority: editForm.urgency === 'urgent' ? 'high' : 'normal',
      todo_type: 'edit_request', account_id: count.account?.id, count_id: count.id, is_complete: false,
      metadata: JSON.stringify({ rep_name: profile?.full_name, rep_email: profile?.email, account_name: count.account?.name, region: count.account?.region?.name, reason: editForm.reason, details: editForm.details, urgency: editForm.urgency, requested_at: new Date().toISOString() }),
    });
    await supabase.from('alerts').insert({ alert_type: 'edit_request', message: profile?.full_name + ' requested to reopen count for ' + count.account?.name + ' â€” Reason: ' + editForm.reason, is_read: false });
    setPendingRequests(p => ({ ...p, [count.id]: true }));
    setEditRequestModal(null);
    setEditForm({ reason: '', details: '', urgency: 'normal' });
    toast.success('Edit request sent to admin!');
    setSubmittingRequest(false);
  }

  async function markAllRead() {
    const unreadIds = notifications.filter(n => !n.is_read).map(n => n.id);
    if (!unreadIds.length) return;
    await supabase.from('alerts').update({ is_read: true }).in('id', unreadIds);
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
  }

  async function signOut() {
    await supabase.auth.signOut();
    navigate('/login');
  }

  const firstName = profile?.full_name?.split(' ')[0] || 'there';
  const initials  = profile?.full_name?.split(' ').map(w => w[0]).join('').toUpperCase().slice(0,2) || 'RR';
  const hour      = new Date().getHours();
  const greeting  = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  const stats = {
    not_started: counts.filter(c => c.status === 'not_started').length,
    in_progress:  counts.filter(c => c.status === 'in_progress').length,
    submitted:    counts.filter(c => c.status === 'submitted').length,
    approved:     counts.filter(c => c.status === 'approved').length,
  };
  const total     = counts.length;
  const remaining = stats.not_started + stats.in_progress;
  const unread    = notifications.filter(n => !n.is_read).length;

  const accBorderColor = {
    not_started: '#FF4848', in_progress: 'var(--blue-action)', submitted: 'var(--amber)', approved: '#28D09A',
  };
  const accStatusColor = {
    not_started: '#FF4848', in_progress: 'var(--blue-action)', submitted: 'var(--amber)', approved: '#28D09A',
  };
  const accStatusLabel = {
    not_started: 'Not Started', in_progress: 'In Progress', submitted: 'Submitted for Review', approved: 'Approved',
  };

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
      <div className="loading-center"><div className="spinner" /><span>Loading...</span></div>
    </div>
  );

  return (
    <div style={{ background: 'var(--bg)', minHeight: '100vh', maxWidth: 430, margin: '0 auto', display: 'flex', flexDirection: 'column', borderLeft: '1px solid var(--border)', borderRight: '1px solid var(--border)' }}>

      {/* Top bar */}
      <div className="rep-topbar" style={{ position: 'sticky', top: 0, zIndex: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'relative', zIndex: 1, marginBottom: 4 }}>
          <div className="rep-logo"><span>Med</span><span>Ex</span></div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ position: 'relative' }}>
              <button onClick={() => { setShowNotifications(!showNotifications); if (!showNotifications) markAllRead(); }}
                style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: 'white', borderRadius: 8, width: 34, height: 34, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>
                ðŸ””
                {unread > 0 && <span style={{ position: 'absolute', top: 2, right: 2, background: '#EF4444', color: 'white', fontSize: 9, fontWeight: 700, width: 16, height: 16, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{unread}</span>}
              </button>
            </div>
            <div style={{ width: 34, height: 34, background: 'rgba(255,255,255,0.18)', border: '1px solid rgba(255,255,255,0.28)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: 'white' }}>{initials}</div>
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'relative', zIndex: 1 }}>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>{greeting}, {firstName}</div>
          <button onClick={signOut} style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.55)', fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 7, cursor: 'pointer', fontFamily: 'inherit' }}>Sign Out</button>
        </div>
      </div>

      {/* Scrollable body */}
      <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 80 }}>

        {/* Cycle hero card */}
        {cycle ? (
          <div className="rep-cycle-card">
            <div className="rep-cycle-eyebrow">Active Cycle</div>
            <div className="rep-cycle-name">{cycle.name}</div>
            <div className="rep-cycle-stats">
              {STAT_CARDS.map(s => (
                <div key={s.key} className={'rep-cycle-stat stat-card ' + s.cls}>
                  <div className={'rep-stat-num ' + s.tc}>{stats[s.key]}</div>
                  <div className={'rep-stat-lbl ' + s.tc}>{s.label}</div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div style={{ margin: 16, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 14, padding: 20, textAlign: 'center', color: 'var(--text-dim)', fontSize: 14 }}>
            No active count cycle at this time.
          </div>
        )}

        {/* Your Accounts */}
        {counts.length > 0 && (
          <div style={{ padding: '0 16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text)' }}>Your Accounts</div>
              <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>{counts.length} accounts</div>
            </div>

            {counts.map(count => {
              const locked = count.status === 'submitted' || count.status === 'approved';
              const hasPending = pendingRequests[count.id];
              const borderColor = accBorderColor[count.status] || 'var(--border)';
              const statusColor = accStatusColor[count.status] || 'var(--text-dim)';
              const statusLabel = accStatusLabel[count.status] || count.status;

              return (
                <div key={count.id}
                  className={'rep-account-card acc-' + (count.status === 'not_started' ? 'ns' : count.status === 'in_progress' ? 'ip' : count.status === 'submitted' ? 'sub' : 'app')}
                  onClick={() => { if (!locked) navigate('/count/' + count.id); }}
                  style={{ cursor: locked ? 'default' : 'pointer' }}>
                  <div style={{ flex: 1, minWidth: 0, paddingLeft: 10 }}>
                    <div className="rep-acc-name">{count.account?.name}</div>
                    <div className="rep-acc-sub">{count.account?.region?.name}</div>
                    <div className="rep-acc-status" style={{ color: statusColor }}>{statusLabel}</div>
                  </div>
                  <div>
                    {locked && (
                      hasPending ? (
                        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-dim)', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, padding: '5px 10px' }}>Request Pending</div>
                      ) : (
                        <button onClick={e => { e.stopPropagation(); setEditRequestModal(count); setEditForm({ reason: '', details: '', urgency: 'normal' }); }}
                          style={{ fontSize: 11, fontWeight: 700, color: 'var(--blue-action)', background: 'var(--blue-light)', border: 'none', borderRadius: 6, padding: '5px 10px', cursor: 'pointer', fontFamily: 'inherit' }}>
                          Request Edit
                        </button>
                      )
                    )}
                    {!locked && <div style={{ color: 'var(--text-dim)', fontSize: 22 }}>â€º</div>}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {cycle && counts.length === 0 && (
          <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-dim)', fontSize: 14 }}>No accounts assigned to you for this cycle yet.</div>
        )}
      </div>

      {/* Notifications panel */}
      {showNotifications && (
        <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: '100%', maxWidth: 430, background: 'white', zIndex: 100, display: 'flex', flexDirection: 'column', boxShadow: '-4px 0 20px rgba(0,0,0,0.15)' }}>
          <div className="mob-header" style={{ flexShrink: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'relative', zIndex: 1 }}>
              <div className="mob-title" style={{ fontSize: 18 }}>Notifications</div>
              <button className="mob-btn" onClick={() => setShowNotifications(false)}>Close</button>
            </div>
          </div>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {notifications.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-dim)', fontSize: 14 }}>No notifications yet.</div>
            ) : notifications.map(n => {
              const isApproved = n.alert_type === 'edit_approved' || n.alert_type === 'count_approved';
              const isDenied   = n.alert_type === 'edit_denied';
              return (
                <div key={n.id} style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', background: n.is_read ? 'white' : 'var(--blue-light)' }}>
                  <div style={{ display: 'flex', gap: 12 }}>
                    <div style={{ width: 36, height: 36, borderRadius: '50%', flexShrink: 0, background: isApproved ? 'var(--green-light)' : isDenied ? 'var(--red-light)' : 'var(--blue-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>
                      {isApproved ? 'âœ“' : isDenied ? 'âœ—' : 'â„¹'}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: isApproved ? 'var(--green)' : isDenied ? 'var(--red)' : 'var(--text)', marginBottom: 3 }}>{n.title || n.alert_type?.replace(/_/g,' ')}</div>
                      <div style={{ fontSize: 13, color: 'var(--text-mid)', lineHeight: 1.5 }}>{n.message}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 4 }}>{new Date(n.created_at).toLocaleDateString()}</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Bottom nav */}
      <div className="rep-bottom-nav" style={{ position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)', width: 430, maxWidth: '100%', zIndex: 50 }}>
        {[{ key: 'accounts', label: 'Accounts' }, { key: 'history', label: 'History' }, { key: 'alerts', label: 'Alerts' }, { key: 'settings', label: 'Settings' }].map(t => (
          <div key={t.key} className="rep-nav-item" onClick={() => setActiveTab(t.key)}>
            <div className={'rep-nav-label' + (activeTab === t.key ? ' active' : ' inactive')}>{t.label}</div>
          </div>
        ))}
      </div>

      {/* Edit Request Modal */}
      {editRequestModal && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-head-blue">
              <div className="modal-head-title">Request to Reopen Count</div>
              <div className="modal-head-sub">{editRequestModal.account?.name}</div>
            </div>
            <div className="modal-body">
              <div className="warn-box">This request will be sent to your admin for approval. You will not be able to edit until approved.</div>
              <div className="form-lbl">Reason for Edit Request *</div>
              <select className="form-sel" value={editForm.reason} onChange={e => setEditForm(p => ({ ...p, reason: e.target.value }))}>
                <option value="">Select a reason...</option>
                <option value="incorrect_quantity">Incorrect Quantity</option>
                <option value="missing_items">Missing Items</option>
                <option value="wrong_item">Wrong Item Added</option>
                <option value="data_entry_error">Data Entry Error</option>
                <option value="other">Other</option>
              </select>
              <div className="form-lbl">Urgency</div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
                {[{ key: 'normal', label: 'Normal' }, { key: 'urgent', label: 'Urgent' }].map(u => (
                  <button key={u.key} onClick={() => setEditForm(p => ({ ...p, urgency: u.key }))}
                    style={{ flex: 1, padding: 9, border: '1.5px solid', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                      borderColor: editForm.urgency === u.key ? 'var(--blue-action)' : 'var(--border)',
                      background: editForm.urgency === u.key ? 'var(--blue-light)' : 'var(--white)',
                      color: editForm.urgency === u.key ? 'var(--blue-action)' : 'var(--text-mid)' }}>
                    {u.label}
                  </button>
                ))}
              </div>
              <div className="form-lbl">Details *</div>
              <textarea className="form-ta" value={editForm.details} onChange={e => setEditForm(p => ({ ...p, details: e.target.value }))} placeholder="Please explain what needs to be corrected and why..." />
            </div>
            <div className="modal-actions">
              <button className="btn btn-outline" onClick={() => { setEditRequestModal(null); setEditForm({ reason: '', details: '', urgency: 'normal' }); }}>Cancel</button>
              <button className="btn btn-primary" onClick={submitEditRequest} disabled={submittingRequest}>{submittingRequest ? 'Sending...' : 'Send Request'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

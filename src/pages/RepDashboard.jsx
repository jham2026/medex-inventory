import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../components/AuthContext';
import { useToast } from '../components/ToastContext';

const STATUS_COLOR = {
  not_started: { color: '#7A909F', label: 'Not Started' },
  in_progress:  { color: '#c88e0f', label: 'In Progress' },
  submitted:    { color: '#22C55E', label: 'Submitted' },
  approved:     { color: '#22C55E', label: 'Approved' },
};

export default function RepDashboard() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [cycle, setCycle]   = useState(null);
  const [counts, setCounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('accounts');
  const [requestingEdit, setRequestingEdit] = useState({});

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
    }
    setLoading(false);
  }

  async function requestEdit(count) {
    setRequestingEdit(p => ({ ...p, [count.id]: true }));
    const { data: existing } = await supabase
      .from('todos')
      .select('id')
      .eq('count_id', count.id)
      .eq('is_complete', false)
      .single();
    if (existing) {
      toast.info('Edit request already pending.');
      setRequestingEdit(p => ({ ...p, [count.id]: false }));
      return;
    }
    await supabase.from('todos').insert({
      title: 'Edit request: ' + count.account?.name,
      description: profile?.full_name + ' is requesting to edit their submitted count for ' + count.account?.name,
      priority: 'high',
      is_complete: false,
      count_id: count.id,
    });
    toast.success('Edit request sent to admin!');
    setRequestingEdit(p => ({ ...p, [count.id]: false }));
  }

  async function signOut() {
    await supabase.auth.signOut();
    navigate('/login');
  }

  const firstName = profile?.full_name?.split(' ')[0] || 'there';
  const initials = profile?.full_name?.split(' ').map(w => w[0]).join('').toUpperCase().slice(0,2) || 'RR';
  const submitted = counts.filter(c => c.status === 'submitted' || c.status === 'approved').length;
  const remaining = counts.filter(c => c.status === 'not_started' || c.status === 'in_progress').length;
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

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
          {remaining > 0 ? remaining + ' account' + (remaining !== 1 ? 's' : '') + ' still need your attention' : 'All accounts submitted!'}
        </div>

        {/* Hero card */}
        {cycle ? (
          <div style={{ background: 'linear-gradient(135deg, #003f63 0%, #0076BB 100%)', borderRadius: 18, padding: 20, marginBottom: 20, color: 'white', position: 'relative', overflow: 'hidden', borderLeft: '4px solid #EEAF24' }}>
            <div style={{ position: 'absolute', right: -30, top: -30, width: 130, height: 130, background: 'rgba(255,255,255,0.04)', borderRadius: '50%' }} />
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4 }}>Active Cycle</div>
            <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.4px', marginBottom: 14 }}>{cycle.name}</div>
            <div style={{ display: 'flex', gap: 22 }}>
              <div>
                <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.5px' }}>{counts.length}</div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>Assigned</div>
              </div>
              <div>
                <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.5px', color: '#EEAF24' }}>{submitted}</div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>Submitted</div>
              </div>
              <div>
                <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.5px', color: 'rgba(255,255,255,0.3)' }}>{remaining}</div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>Remaining</div>
              </div>
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
                    opacity: count.status === 'approved' ? 0.6 : 1,
                  }}
                  onMouseEnter={e => { if (!locked) { e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,118,187,0.12)'; e.currentTarget.style.transform = 'translateY(-1px)'; }}}
                  onMouseLeave={e => { e.currentTarget.style.boxShadow = '0 1px 4px rgba(0,118,187,0.08)'; e.currentTarget.style.transform = 'none'; }}
                >
                  {/* Icon */}
                  <div style={{ width: 38, height: 38, background: '#e8f4fb', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>
                    &#127973;
                  </div>

                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 500, color: '#1A2B38', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{count.account?.name}</div>
                    <div style={{ fontSize: 11, color: '#7A909F', marginTop: 2 }}>
                      {count.account?.region?.name}&nbsp;&middot;&nbsp;
                      <span style={{ color: st.color, fontWeight: 600 }}>{st.label}</span>
                    </div>
                  </div>

                  {/* Action */}
                  {locked ? (
                    <button
                      onClick={e => { e.stopPropagation(); requestEdit(count); }}
                      disabled={requestingEdit[count.id]}
                      style={{ fontSize: 11, fontWeight: 600, color: '#0076BB', background: '#e8f4fb', border: 'none', borderRadius: 6, padding: '5px 10px', cursor: 'pointer', flexShrink: 0, fontFamily: 'inherit' }}>
                      {requestingEdit[count.id] ? '...' : 'Request Edit'}
                    </button>
                  ) : (
                    <div style={{ color: '#C5D1DA', fontSize: 22, marginLeft: 'auto' }}>&#8250;</div>
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
    </div>
  );
}

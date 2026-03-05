import { useNavigate } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { supabase } from '../lib/supabase';
import { useEffect, useState } from 'react';

export default function NavBar() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [cycle, setCycle] = useState(null);

  useEffect(() => {
    supabase.from('count_cycles').select('name, status').eq('status', 'open').single()
      .then(({ data }) => setCycle(data));
  }, []);

  async function signOut() {
    await supabase.auth.signOut();
    navigate('/login');
  }

  return (
    <nav className="nav">
      {/* Brand */}
      <div className="nav-brand" onClick={() => navigate('/')} style={{ cursor: 'pointer' }}>
        <div>
          <div className="nav-brand-text">
            Med<span>Ex</span>PSI
          </div>
          <div className="nav-brand-sub">Inventory Counts</div>
        </div>
      </div>

      {/* Right side */}
      <div className="nav-right">
        {cycle ? (
          <span className="nav-cycle-badge">
            {cycle.name} Open
          </span>
        ) : (
          <span className="nav-cycle-badge closed">No Active Cycle</span>
        )}

        {profile && (
          <span className="nav-user">
            {profile.full_name || profile.email}
            {profile.role === 'admin' && (
              <span style={{ marginLeft: 6, fontSize: 10, background: 'rgba(238,175,36,0.2)', color: 'var(--gold)', padding: '1px 6px', borderRadius: 10, fontWeight: 700, verticalAlign: 'middle' }}>
                ADMIN
              </span>
            )}
          </span>
        )}

        <button className="nav-signout" onClick={signOut}>Sign Out</button>
      </div>
    </nav>
  );
}

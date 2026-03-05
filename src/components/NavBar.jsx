import { useAuth } from './AuthContext';
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export default function NavBar() {
  const { profile, signOut } = useAuth();
  const [cycle, setCycle] = useState(null);

  useEffect(() => {
    supabase.from('count_cycles').select('*').eq('status', 'open').single()
      .then(({ data }) => setCycle(data));
  }, []);

  return (
    <nav className="nav">
      <div className="nav-brand">MedEx<span>PSI</span> &nbsp;|&nbsp; Inventory</div>
      <div className="nav-right">
        {cycle
          ? <span className="nav-cycle-badge">● {cycle.name} Open</span>
          : <span className="nav-cycle-badge closed">No Active Cycle</span>
        }
        <span className="nav-user">{profile?.full_name} ({profile?.role})</span>
        <button className="btn btn-utility btn-sm" onClick={signOut}>Sign Out</button>
      </div>
    </nav>
  );
}

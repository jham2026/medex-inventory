import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

export default function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');

  async function handleLogin(e) {
    e.preventDefault();
    setLoading(true); setError('');
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) { setError(error.message); setLoading(false); return; }
    navigate('/');
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div style={{ marginBottom: 6 }}>
          <div style={{ fontSize: 36, fontWeight: 800, lineHeight: 1, marginBottom: 4 }}>
            <span style={{ color: '#1565C0' }}>Med</span><span style={{ color: '#F0A500' }}>Ex</span>
          </div>
          <div style={{ fontSize: 10, letterSpacing: 3, color: '#8FA3BF', textTransform: 'uppercase' }}>Inventory Counts</div>
          <div style={{ width: 32, height: 2, background: '#F0A500', margin: '12px auto 20px' }} />
        </div>
        <div className="login-title">Welcome Back</div>
        <div className="login-sub">Sign in to access your inventory dashboard</div>

        {error && <div className="alert-banner error">{error}</div>}

        <form onSubmit={handleLogin}>
          <label className="login-label">Email Address</label>
          <input
            className="login-input"
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="you@medexpsi.com"
            required
            autoComplete="email"
          />
          <label className="login-label">Password</label>
          <input
            className="login-input"
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="Enter your password"
            style={{ letterSpacing: 0 }}
            required
            autoComplete="current-password"
          />
          <button className="login-btn" type="submit" disabled={loading}>
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
        <div className="login-help">Need access? Contact your administrator.</div>
      </div>
    </div>
  );
}

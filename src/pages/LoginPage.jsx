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

        {/* Header */}
        <div className="login-header">
          <div className="login-logo-text">MedEx</div>
          <div className="login-logo-sub">Inventory Counts</div>
        </div>

        {/* Body */}
        <div className="login-body">
          <div className="login-title">Welcome Back</div>
          <div className="login-sub">Sign in to access your inventory dashboard</div>

          {error && (
            <div className="alert-banner error" style={{ marginBottom: 20 }}>
              {error}
            </div>
          )}

          <form onSubmit={handleLogin}>
            <div className="input-group">
              <label className="input-label">Email Address</label>
              <input
                className="input"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                autoComplete="email"
              />
            </div>

            <div className="input-group">
              <label className="input-label">Password</label>
              <input
                className="input"
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢"
                required
                autoComplete="current-password"
              />
            </div>

            <button className="login-btn" type="submit" disabled={loading}>
              {loading ? 'Signing inâ€¦' : 'Sign In'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

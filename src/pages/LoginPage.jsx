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
    <div style={{
      minHeight: '100vh',
      background: '#F7F9FB',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 20,
    }}>
      <div style={{
        background: 'white',
        borderRadius: 20,
        padding: '44px 40px',
        width: '100%',
        maxWidth: 500,
        boxShadow: '0 4px 24px rgba(0,118,187,0.10), 0 1px 4px rgba(0,118,187,0.08)',
        border: '1.5px solid #cce6f5',
      }}>

        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 8 }}>
          <div style={{ fontSize: 64, fontWeight: 800, letterSpacing: '-2px', lineHeight: 1 }}>
            <span style={{ color: '#0076BB' }}>Med</span><span style={{ color: '#EEAF24' }}>Ex</span>
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#7A909F', letterSpacing: '0.18em', textTransform: 'uppercase', marginTop: 6 }}>
            Inventory Counts
          </div>
        </div>

        {/* Gold divider */}
        <div style={{ width: 40, height: 3, background: '#EEAF24', borderRadius: 2, margin: '18px auto 28px' }} />

        {/* Headline */}
        <div style={{ fontSize: 28, fontWeight: 700, color: '#1A2B38', letterSpacing: '-0.6px', textAlign: 'center', marginBottom: 6 }}>
          Welcome Back
        </div>
        <div style={{ fontSize: 16, color: '#7A909F', textAlign: 'center', marginBottom: 32 }}>
          Sign in to access your inventory dashboard
        </div>

        {error && (
          <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#dc2626', marginBottom: 16 }}>
            {error}
          </div>
        )}

        {/* Email */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#7A909F', letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 8 }}>
            Email Address
          </label>
          <input
            type="email"
            placeholder="you@medexpsi.com"
            value={email}
            onChange={e => setEmail(e.target.value)}
            autoComplete="email"
            style={{
              width: '100%', background: '#F2F5F8',
              border: '1.5px solid #E1E8EE', borderRadius: 8,
              padding: '14px 16px', color: '#1A2B38',
              fontSize: 16, fontFamily: 'inherit', outline: 'none',
              transition: 'border-color 0.2s',
            }}
            onFocus={e => e.target.style.borderColor = '#0076BB'}
            onBlur={e => e.target.style.borderColor = '#E1E8EE'}
          />
        </div>

        {/* Password */}
        <div style={{ marginBottom: 24 }}>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#7A909F', letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 8 }}>
            Password
          </label>
          <input
            type="password"
            placeholder="Enter your password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleLogin(e)}
            autoComplete="current-password"
            style={{
              width: '100%', background: '#F2F5F8',
              border: '1.5px solid #E1E8EE', borderRadius: 8,
              padding: '14px 16px', color: '#1A2B38',
              fontSize: 16, fontFamily: 'inherit', outline: 'none',
              transition: 'border-color 0.2s',
            }}
            onFocus={e => e.target.style.borderColor = '#0076BB'}
            onBlur={e => e.target.style.borderColor = '#E1E8EE'}
          />
        </div>

        {/* Sign in button */}
        <button
          onClick={handleLogin}
          disabled={loading || !email || !password}
          style={{
            width: '100%', padding: '16px',
            background: loading || !email || !password ? '#7A909F' : '#0076BB',
            border: 'none', borderRadius: 8,
            color: 'white', fontSize: 18, fontWeight: 700,
            cursor: loading || !email || !password ? 'not-allowed' : 'pointer',
            fontFamily: 'inherit', letterSpacing: '-0.2px',
            transition: 'background 0.2s',
            boxShadow: '0 4px 12px rgba(0,118,187,0.25)',
          }}
          onMouseEnter={e => { if (!loading && email && password) e.target.style.background = '#005a8e'; }}
          onMouseLeave={e => { if (!loading && email && password) e.target.style.background = '#0076BB'; }}
        >
          {loading ? 'Signing in...' : 'Sign In'}
        </button>

        <div style={{ textAlign: 'center', marginTop: 20, fontSize: 14, color: '#7A909F' }}>
          Need access? Contact your administrator.
        </div>
      </div>
    </div>
  );
}

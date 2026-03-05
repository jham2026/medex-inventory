import { useState } from 'react';
import { useAuth } from '../components/AuthContext';
import { useToast } from '../components/ToastContext';

export default function LoginPage() {
  const { signIn } = useAuth();
  const toast = useToast();
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading]   = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    try {
      await signIn(email.trim(), password);
    } catch (err) {
      toast.error(err.message || 'Login failed. Check your email and password.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center',
      justifyContent: 'center', background: 'linear-gradient(135deg, #14526A 0%, #1B6B8A 100%)',
      padding: '16px'
    }}>
      <div style={{ width: '100%', maxWidth: '380px' }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <div style={{ fontSize: '32px', fontWeight: 'bold', color: 'white' }}>
            MedEx<span style={{ color: '#F5A623' }}>PSI</span>
          </div>
          <div style={{ color: 'rgba(255,255,255,0.75)', fontSize: '14px', marginTop: '4px' }}>
            Inventory Control System
          </div>
        </div>

        {/* Card */}
        <div className="card">
          <div style={{
            background: '#14526A', padding: '14px 20px',
            borderRadius: '4px 4px 0 0'
          }}>
            <h2 style={{ color: 'white', fontSize: '16px' }}>Sign In</h2>
          </div>
          <div className="card-body">
            <form onSubmit={handleSubmit}>
              <div className="input-group">
                <label className="input-label">Email Address</label>
                <input
                  className="input" type="email" required
                  value={email} onChange={e => setEmail(e.target.value)}
                  placeholder="you@medexpsi.com" autoFocus
                />
              </div>
              <div className="input-group">
                <label className="input-label">Password</label>
                <input
                  className="input" type="password" required
                  value={password} onChange={e => setPassword(e.target.value)}
                  placeholder="Enter your password"
                />
              </div>
              <button
                className="btn btn-primary btn-full btn-lg"
                type="submit" disabled={loading}
                style={{ marginTop: '8px' }}
              >
                {loading ? 'Signing in...' : 'Sign In'}
              </button>
            </form>
          </div>
        </div>

        <div style={{ textAlign: 'center', marginTop: '16px', color: 'rgba(255,255,255,0.5)', fontSize: '12px' }}>
          MedEx PSI © {new Date().getFullYear()}
        </div>
      </div>
    </div>
  );
}

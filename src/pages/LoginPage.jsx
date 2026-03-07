import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../components/AuthContext';

export default function LoginPage() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      await signIn(email, password);
      navigate('/');
    } catch (err) {
      setError('Invalid email or password. Please try again.');
      setPassword('');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div style={{ fontSize: 36, fontWeight: 800, lineHeight: 1, marginBottom: 4 }}>
          <span style={{ color: '#FFD040' }}>Med</span><span style={{ color: '#FFD040' }}>Ex</span>
        </div>
        <div style={{ fontSize: 10, letterSpacing: 3, color: '#1565C0', textTransform: 'uppercase', marginBottom: 6, fontWeight: 800 }}>
          Inventory Counts
        </div>
        <div style={{ width: 32, height: 2, background: '#FFD040', margin: '12px auto 20px' }} />
        <div style={{ fontSize: 20, fontWeight: 700, color: '#1a1a2e', marginBottom: 4 }}>Welcome Back</div>
        <div style={{ fontSize: 13, color: '#8FA3BF', marginBottom: 24 }}>Sign in to access your inventory dashboard</div>

        {error && (
          <div style={{ background: '#FEE2E2', color: '#DC2626', border: '1px solid #FECACA', borderRadius: 8, padding: '10px 14px', fontSize: 13, marginBottom: 16, textAlign: 'left' }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div style={{ fontSize: 10, letterSpacing: 1.5, textTransform: 'uppercase', color: '#6B7A8D', textAlign: 'left', marginBottom: 6, fontWeight: 600 }}>Email Address</div>
          <input
            className="login-input"
            type="email"
            placeholder="you@medexpsi.com"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
          />
          <div style={{ fontSize: 10, letterSpacing: 1.5, textTransform: 'uppercase', color: '#6B7A8D', textAlign: 'left', marginBottom: 6, fontWeight: 600 }}>Password</div>
          <input
            className="login-input"
            type="password"
            placeholder="Enter your password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
          />
          <button className="login-btn" type="submit" disabled={loading}>
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <div style={{ fontSize: 12, color: '#9BA6B4', marginTop: 14 }}>Need access? Contact your administrator.</div>
      </div>
    </div>
  );
}

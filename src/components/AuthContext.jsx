import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { logAudit } from '../hooks/useAudit';

const AuthContext = createContext(null);

const IDLE_TIMEOUT_MS  = 60 * 60 * 1000; // 60 minutes
const WARN_BEFORE_MS   =  2 * 60 * 1000; // warn 2 minutes before logout
const WARN_AT_MS       = IDLE_TIMEOUT_MS - WARN_BEFORE_MS; // 58 minutes

const IDLE_EVENTS = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'click'];

export function AuthProvider({ children }) {
  const [user, setUser]           = useState(null);
  const [profile, setProfile]     = useState(null);
  const [loading, setLoading]     = useState(true);
  const [showWarning, setShowWarning] = useState(false);

  // Keep a ref to profile so signOut callback can always access latest value
  useEffect(() => { profileRef.current = profile; }, [profile]);
  const [countdown, setCountdown] = useState(120); // seconds remaining shown in warning

  const idleTimer    = useRef(null);
  const profileRef   = useRef(null);
  const warnTimer    = useRef(null);
  const countdownRef = useRef(null);

  async function loadProfile(userId) {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();
    setProfile(data);
    return data;
  }

  const signOut = useCallback(async (reason = 'USER_LOGOUT') => {
    clearTimers();
    setShowWarning(false);
    // Log before clearing profile
    const currentProfile = profileRef.current;
    if (currentProfile) {
      await logAudit(currentProfile, reason, 'auth', { target_name: currentProfile.full_name });
    }
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
    sessionStorage.removeItem('adminTab');
  }, []);

  function clearTimers() {
    if (idleTimer.current)    clearTimeout(idleTimer.current);
    if (warnTimer.current)    clearTimeout(warnTimer.current);
    if (countdownRef.current) clearInterval(countdownRef.current);
  }

  const resetIdleTimer = useCallback(() => {
    if (!user) return;
    clearTimers();
    setShowWarning(false);

    // Warn at 58 minutes
    warnTimer.current = setTimeout(() => {
      setShowWarning(true);
      setCountdown(120);
      // Count down every second
      countdownRef.current = setInterval(() => {
        setCountdown(prev => {
          if (prev <= 1) {
            clearInterval(countdownRef.current);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }, WARN_AT_MS);

    // Sign out at 60 minutes
    idleTimer.current = setTimeout(() => {
      signOut('SESSION_TIMEOUT');
    }, IDLE_TIMEOUT_MS);
  }, [user, signOut]);

  // Attach/detach activity listeners when user changes
  useEffect(() => {
    if (!user) { clearTimers(); return; }
    resetIdleTimer();
    IDLE_EVENTS.forEach(e => window.addEventListener(e, resetIdleTimer, { passive: true }));
    return () => {
      clearTimers();
      IDLE_EVENTS.forEach(e => window.removeEventListener(e, resetIdleTimer));
    };
  }, [user, resetIdleTimer]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) loadProfile(session.user.id).finally(() => setLoading(false));
      else setLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) loadProfile(session.user.id);
      else setProfile(null);
    });
    return () => subscription.unsubscribe();
  }, []);

  async function signIn(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    const prof = await loadProfile(data.user.id);
    await logAudit(prof, 'USER_LOGIN', 'auth', { target_name: data.user.email });
    window.history.replaceState(null, '', '/');
    return data;
  }

  function stayLoggedIn() {
    setShowWarning(false);
    resetIdleTimer();
  }

  const formatCountdown = (secs) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return m > 0 ? m + ':' + String(s).padStart(2, '0') : s + 's';
  };

  return (
    <AuthContext.Provider value={{ user, profile, loading, signIn, signOut }}>
      {children}

      {/* â”€â”€ Idle warning modal â”€â”€ */}
      {showWarning && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 99999,
          background: 'rgba(0,0,0,0.55)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: 'Inter, -apple-system, sans-serif',
        }}>
          <div style={{
            background: 'white', borderRadius: 16, padding: '36px 32px',
            maxWidth: 420, width: '90vw', textAlign: 'center',
            boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
          }}>
            {/* Icon */}
            <div style={{
              width: 56, height: 56, borderRadius: '50%',
              background: '#FEF3C7', margin: '0 auto 16px',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="#D97706" strokeWidth="2"/>
                <path d="M12 7v5l3 3" stroke="#D97706" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            </div>

            {/* Countdown ring */}
            <div style={{
              fontSize: 42, fontWeight: 800, color: countdown <= 30 ? '#EF4444' : '#D97706',
              lineHeight: 1, marginBottom: 8, transition: 'color 0.3s',
            }}>
              {formatCountdown(countdown)}
            </div>

            <div style={{ fontSize: 18, fontWeight: 700, color: '#1E293B', marginBottom: 8 }}>
              Still there?
            </div>
            <div style={{ fontSize: 14, color: '#64748B', lineHeight: 1.6, marginBottom: 28 }}>
              You have been idle for 58 minutes. For security, you will be signed out automatically.
            </div>

            <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
              <button
                onClick={signOut}
                style={{
                  padding: '10px 22px', borderRadius: 8, border: '1.5px solid #E2E8F0',
                  background: 'white', color: '#475569', fontSize: 14, fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Sign Out Now
              </button>
              <button
                onClick={stayLoggedIn}
                style={{
                  padding: '10px 22px', borderRadius: 8, border: 'none',
                  background: '#0076BB', color: 'white', fontSize: 14, fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Stay Signed In
              </button>
            </div>
          </div>
        </div>
      )}

    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);

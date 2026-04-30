import React, { useState, useEffect } from 'react';
import { signInWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth';
import { useNavigate } from 'react-router-dom';
import { auth } from '../../firebase';
import { useAuth } from '../../contexts/AuthContext';

const LOGO_STX = 'https://www.supportedtravelx.com.au/wp-content/uploads/STX-Logo-Transparent-min-1024x434-1.png';

const VALUE_PROPS = [
  {
    icon: '✈️',
    title: 'End-to-end trip management',
    desc: 'Plan, approve, and track all travel across sectors — flights, accommodation, transfers and more.',
  },
  {
    icon: '♿',
    title: 'Built for disability support',
    desc: 'Accessibility-aware traveller profiles, configurable cost centres, and support for unique participant needs.',
  },
  {
    icon: '📊',
    title: 'Real-time analytics',
    desc: 'Spend by destination, accommodation compliance, hotel popularity, and booking-window tracking — all in one place.',
  },
  {
    icon: '🔐',
    title: 'Configurable approval workflows',
    desc: 'Set approval requirements per trip type so the right people sign off on every booking before it proceeds.',
  },
];

export default function LoginPage() {
  const [email,     setEmail]     = useState('');
  const [password,  setPassword]  = useState('');
  const [error,     setError]     = useState('');
  const [loading,   setLoading]   = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [showReset, setShowReset] = useState(false);
  const navigate = useNavigate();
  const { currentUser } = useAuth();

  useEffect(() => {
    document.title = 'Sign In — STX Connect';
  }, []);

  useEffect(() => {
    if (currentUser) navigate('/dashboard', { replace: true });
  }, [currentUser, navigate]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch {
      setError('Invalid email or password.');
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await sendPasswordResetEmail(auth, email);
      setResetSent(true);
    } catch {
      setError('Could not send reset email. Check the address and try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex">

      {/* ── Left panel — value proposition ─────────────────────────────── */}
      <div className="hidden lg:flex lg:w-[55%] bg-slate-900 flex-col justify-between p-14 relative overflow-hidden">
        {/* Subtle radial glow */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              'radial-gradient(ellipse at 15% 85%, rgba(13,148,136,0.18) 0%, transparent 55%),' +
              'radial-gradient(ellipse at 85% 15%, rgba(13,148,136,0.10) 0%, transparent 50%)',
          }}
        />

        <div className="relative z-10">
          <img src={LOGO_STX} alt="STX" className="h-9 object-contain mb-14" style={{ filter: 'brightness(10) saturate(0)' }} />

          <h1 className="text-[2.6rem] font-extrabold text-white leading-tight tracking-tight mb-5">
            Corporate travel,<br />
            purpose-built for<br />
            <span className="text-teal-400">disability support.</span>
          </h1>
          <p className="text-slate-400 text-lg leading-relaxed mb-14 max-w-md">
            A single platform to manage bookings, approvals, and compliance across your entire organisation.
          </p>

          <div className="space-y-7">
            {VALUE_PROPS.map(p => (
              <div key={p.title} className="flex gap-5 items-start">
                <div className="w-11 h-11 rounded-xl bg-teal-500/15 border border-teal-500/20 flex items-center justify-center flex-shrink-0 text-xl">
                  {p.icon}
                </div>
                <div>
                  <p className="text-white font-semibold text-sm mb-1">{p.title}</p>
                  <p className="text-slate-400 text-sm leading-relaxed">{p.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <p className="relative z-10 text-slate-600 text-xs">
          STX Corporate is a product of{' '}
          <a
            href="https://www.supportedtravelx.com.au"
            target="_blank"
            rel="noreferrer"
            className="text-slate-500 hover:text-slate-300 transition-colors"
          >
            Supported Travel eXperiences
          </a>
        </p>
      </div>

      {/* ── Right panel — sign-in form ──────────────────────────────────── */}
      <div className="flex-1 flex items-center justify-center p-8 bg-white">
        <div className="w-full max-w-sm">

          {/* Mobile logo (only visible < lg) */}
          <div className="lg:hidden flex justify-center mb-10">
            <img src={LOGO_STX} alt="STX" className="h-10 object-contain" />
          </div>

          <h2 className="text-2xl font-bold text-gray-900 mb-1">
            {showReset ? 'Reset password' : 'Sign in'}
          </h2>
          <p className="text-sm text-gray-700 mb-8">STX Corporate Travel Portal</p>

          {resetSent ? (
            <div className="text-center py-8">
              <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4 text-2xl">
                ✓
              </div>
              <p className="text-gray-800 font-semibold mb-1">Reset email sent</p>
              <p className="text-sm text-gray-700 mb-6">
                Check your inbox for a link to set a new password.
              </p>
              <button
                onClick={() => { setShowReset(false); setResetSent(false); }}
                className="text-teal-600 text-sm font-medium hover:underline"
              >
                ← Back to sign in
              </button>
            </div>
          ) : (
            <form onSubmit={showReset ? handleReset : handleLogin} className="space-y-5" noValidate>
              <div>
                <label htmlFor="login-email" className="block text-sm font-medium text-gray-700 mb-1.5">
                  Email address
                </label>
                <input
                  id="login-email"
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  aria-required="true"
                  aria-invalid={!!error}
                  aria-describedby={error ? 'login-error' : undefined}
                  className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 placeholder:text-gray-500 focus:border-transparent"
                  placeholder="you@organisation.com.au"
                />
              </div>

              {!showReset && (
                <div>
                  <label htmlFor="login-password" className="block text-sm font-medium text-gray-700 mb-1.5">
                    Password
                  </label>
                  <input
                    id="login-password"
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    required
                    aria-required="true"
                    aria-invalid={!!error}
                    aria-describedby={error ? 'login-error' : undefined}
                    className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 placeholder:text-gray-500 focus:border-transparent"
                    placeholder="••••••••"
                  />
                </div>
              )}

              <div aria-live="polite" aria-atomic="true">
                {error && (
                  <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                    <p id="login-error" role="alert" className="text-red-700 text-sm">{error}</p>
                  </div>
                )}
              </div>

              <button
                type="submit" disabled={loading}
                className="w-full bg-teal-600 text-white py-3 rounded-xl text-sm font-semibold hover:bg-teal-700 disabled:opacity-50 transition-colors"
              >
                {loading ? 'Please wait…' : showReset ? 'Send reset email' : 'Sign in'}
              </button>

              <p className="text-center text-sm">
                <button
                  type="button"
                  onClick={() => { setShowReset(!showReset); setError(''); }}
                  className="text-teal-600 font-medium hover:underline"
                >
                  {showReset ? '← Back to sign in' : 'Forgot password?'}
                </button>
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

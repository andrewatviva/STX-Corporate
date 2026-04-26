import React, { useState, useEffect } from 'react';
import { signInWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth';
import { useNavigate } from 'react-router-dom';
import { auth } from '../../firebase';
import { useAuth } from '../../contexts/AuthContext';

const LOGO_STX = 'https://www.supportedtravelx.com.au/wp-content/uploads/STX-Logo-Transparent-min-1024x434-1.png';

export default function LoginPage() {
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState('');
  const navigate = useNavigate();
  const { currentUser } = useAuth();

  // If already signed in, go straight to dashboard
  useEffect(() => {
    if (currentUser) navigate('/dashboard', { replace: true });
  }, [currentUser, navigate]);
  const [loading, setLoading]   = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [showReset, setShowReset] = useState(false);

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
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-lg p-8 w-full max-w-sm">
        <div className="flex justify-center mb-6">
          <img src={LOGO_STX} alt="STX" className="h-12 object-contain" />
        </div>
        <h1 className="text-xl font-bold text-gray-800 text-center mb-1">Corporate Travel Portal</h1>
        <p className="text-sm text-gray-500 text-center mb-6">Sign in to your account</p>

        {resetSent ? (
          <div className="text-center">
            <p className="text-green-600 text-sm mb-4">Password reset email sent. Check your inbox.</p>
            <button onClick={() => { setShowReset(false); setResetSent(false); }}
              className="text-blue-600 text-sm underline">Back to sign in</button>
          </div>
        ) : (
          <form onSubmit={showReset ? handleReset : handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input
                type="email" value={email} onChange={e => setEmail(e.target.value)} required
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="you@example.com"
              />
            </div>
            {!showReset && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
                <input
                  type="password" value={password} onChange={e => setPassword(e.target.value)} required
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="••••••••"
                />
              </div>
            )}
            {error && <p className="text-red-600 text-sm">{error}</p>}
            <button
              type="submit" disabled={loading}
              className="w-full bg-blue-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {loading ? 'Please wait…' : showReset ? 'Send reset email' : 'Sign in'}
            </button>
            <p className="text-center text-sm">
              <button type="button" onClick={() => { setShowReset(!showReset); setError(''); }}
                className="text-blue-600 underline">
                {showReset ? 'Back to sign in' : 'Forgot password?'}
              </button>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}

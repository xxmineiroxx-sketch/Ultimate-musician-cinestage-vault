import React, { useState, useRef, useEffect } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { SYNC_URL, syncHeaders } from '../config/syncConfig';

export default function VerifyScreen() {
  const navigate = useNavigate();
  const location = useLocation();

  const emailFromState = location.state?.email || '';
  const [email, setEmail] = useState(emailFromState);
  const [digits, setDigits] = useState(['', '', '', '', '', '']);
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const inputRefs = useRef([]);

  // Auto-focus first box on mount
  useEffect(() => {
    inputRefs.current[0]?.focus();
  }, []);

  const code = digits.join('');

  const handleDigitChange = (index, value) => {
    // Only allow single digit 0-9
    const char = value.replace(/\D/g, '').slice(-1);
    const next = [...digits];
    next[index] = char;
    setDigits(next);

    // Advance focus
    if (char && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
    if (e.key === 'ArrowLeft' && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
    if (e.key === 'ArrowRight' && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handlePaste = (e) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (!pasted) return;
    const next = [...digits];
    for (let i = 0; i < pasted.length; i++) {
      next[i] = pasted[i];
    }
    setDigits(next);
    const focusIndex = Math.min(pasted.length, 5);
    inputRefs.current[focusIndex]?.focus();
  };

  const handleVerify = async (e) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');

    if (!email.trim()) {
      setError('Email address is missing. Please go back and register again.');
      return;
    }
    if (code.length < 6) {
      setError('Please enter the full 6-digit code.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${SYNC_URL}/sync/auth/verify`, {
        method: 'POST',
        headers: syncHeaders(),
        body: JSON.stringify({ email: email.trim().toLowerCase(), code }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.message || data.error || 'Invalid or expired code. Please try again.');
        return;
      }

      navigate('/login', { state: { successMessage: 'Email verified! You can now sign in.' } });
    } catch (err) {
      setError('Network error. Please check your connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setError('');
    setSuccessMsg('');

    if (!email.trim()) {
      setError('Email address is missing. Please go back and register again.');
      return;
    }

    setResending(true);
    try {
      const res = await fetch(`${SYNC_URL}/sync/auth/resend-verification`, {
        method: 'POST',
        headers: syncHeaders(),
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.message || data.error || 'Failed to resend code. Please try again.');
        return;
      }

      setSuccessMsg('A new code has been sent to your email.');
      setDigits(['', '', '', '', '', '']);
      inputRefs.current[0]?.focus();
    } catch (err) {
      setError('Network error. Please check your connection and try again.');
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#020617] flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="text-4xl mb-2 select-none">🎵</div>
          <h1 className="text-white text-2xl font-bold">Ultimate Musician</h1>
          <p className="text-slate-400 text-xs mt-1 tracking-widest uppercase">Team Platform</p>
        </div>

        {/* Card */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-2xl">
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-indigo-600/20 border border-indigo-600/40 mb-4">
              <svg className="w-6 h-6 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
            <h2 className="text-white text-xl font-semibold">Verify Your Email</h2>
            <p className="text-slate-400 text-sm mt-2">
              We sent a 6-digit code to
            </p>
            {email ? (
              <p className="text-indigo-300 text-sm font-medium mt-0.5 break-all">{email}</p>
            ) : (
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                className="mt-2 w-full bg-slate-800 border border-slate-700 text-white placeholder-slate-500 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition text-center"
              />
            )}
          </div>

          {error && (
            <div className="bg-red-900/40 border border-red-700 text-red-300 text-sm rounded-lg px-4 py-3 mb-5">
              {error}
            </div>
          )}

          {successMsg && (
            <div className="bg-green-900/40 border border-green-700 text-green-300 text-sm rounded-lg px-4 py-3 mb-5">
              {successMsg}
            </div>
          )}

          <form onSubmit={handleVerify} noValidate>
            {/* 6-digit code inputs */}
            <div className="flex justify-center gap-2 mb-7" onPaste={handlePaste}>
              {digits.map((digit, i) => (
                <input
                  key={i}
                  ref={(el) => (inputRefs.current[i] = el)}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={digit}
                  onChange={(e) => handleDigitChange(i, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(i, e)}
                  className="w-12 h-14 bg-slate-800 border border-slate-700 text-white text-xl font-bold text-center rounded-lg focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 transition caret-transparent"
                  aria-label={`Digit ${i + 1}`}
                />
              ))}
            </div>

            <button
              type="submit"
              disabled={loading || code.length < 6}
              className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-800 disabled:cursor-not-allowed text-white font-semibold rounded-lg px-4 py-3 text-sm transition flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  Verifying…
                </>
              ) : (
                'Verify Email'
              )}
            </button>
          </form>

          <div className="text-center mt-5">
            <p className="text-slate-400 text-sm">
              Didn't receive the code?{' '}
              <button
                type="button"
                onClick={handleResend}
                disabled={resending}
                className="text-indigo-400 hover:text-indigo-300 font-medium transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {resending ? 'Sending…' : 'Resend code'}
              </button>
            </p>
            <Link to="/login" className="text-slate-500 hover:text-slate-400 text-xs mt-3 inline-block transition">
              Back to Sign In
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

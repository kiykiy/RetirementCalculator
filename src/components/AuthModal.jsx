import { useState } from 'react'
import { supabase } from '../lib/supabase.js'

function Spinner() {
  return (
    <svg className="animate-spin w-4 h-4 text-gray-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  )
}

function GoogleIcon() {
  return (
    <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
  )
}

// ── AuthCard ──────────────────────────────────────────────────────────────────
// Inline login/signup card — rendered as a dropdown from the account icon.
export default function AuthCard({ onClose }) {
  const [mode,          setMode]          = useState('signin')
  const [email,         setEmail]         = useState('')
  const [password,      setPassword]      = useState('')
  const [loading,       setLoading]       = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [error,         setError]         = useState('')
  const [msg,           setMsg]           = useState('')

  async function handleGoogle() {
    setError('')
    setGoogleLoading(true)
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    })
    if (error) { setError(error.message); setGoogleLoading(false) }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setMsg('')
    setLoading(true)
    try {
      if (mode === 'signup') {
        const { error } = await supabase.auth.signUp({ email, password })
        if (error) throw error
        setMsg('Check your email for a confirmation link.')
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
        onClose() // session update via onAuthStateChange will also close, but be explicit
      }
    } catch (err) {
      setError(err.message ?? 'Something went wrong.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-4 space-y-3">

      {/* Header */}
      <div>
        <p className="text-xs font-semibold text-gray-800 dark:text-gray-100">Sign in</p>
        <p className="text-[11px] text-gray-400 mt-0.5">Data syncs across devices when signed in.</p>
      </div>

      {/* Google SSO */}
      <button
        type="button"
        onClick={handleGoogle}
        disabled={googleLoading}
        className="w-full flex items-center justify-center gap-2.5 py-2 px-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-xs font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
      >
        {googleLoading ? <Spinner /> : <GoogleIcon />}
        {googleLoading ? 'Redirecting…' : 'Continue with Google'}
      </button>

      {/* Divider */}
      <div className="flex items-center gap-2">
        <div className="flex-1 border-t border-gray-100 dark:border-gray-800" />
        <span className="text-[10px] text-gray-300 dark:text-gray-700 uppercase tracking-widest">or</span>
        <div className="flex-1 border-t border-gray-100 dark:border-gray-800" />
      </div>

      {/* Mode toggle */}
      <div className="flex rounded-lg bg-gray-100 dark:bg-gray-800 p-0.5 gap-0.5">
        {['signin', 'signup'].map(m => (
          <button
            key={m}
            type="button"
            onClick={() => { setMode(m); setError(''); setMsg('') }}
            className={`flex-1 text-[11px] font-medium py-1 rounded-md transition-all ${
              mode === m
                ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            {m === 'signin' ? 'Sign In' : 'Create Account'}
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="space-y-2">
        <div>
          <label className="block text-[11px] font-medium text-gray-500 dark:text-gray-400 mb-1">Email</label>
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="w-full px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-xs text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition"
          />
        </div>
        <div>
          <label className="block text-[11px] font-medium text-gray-500 dark:text-gray-400 mb-1">Password</label>
          <input
            type="password"
            required
            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder={mode === 'signup' ? 'Min. 6 characters' : '••••••••'}
            className="w-full px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-xs text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition"
          />
        </div>

        {error && (
          <p className="text-[11px] text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 border border-red-100 dark:border-red-900/50 rounded-lg px-2.5 py-1.5">{error}</p>
        )}
        {msg && (
          <p className="text-[11px] text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-100 dark:border-emerald-900/50 rounded-lg px-2.5 py-1.5">{msg}</p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full flex items-center justify-center gap-2 py-1.5 px-3 rounded-lg bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-xs font-medium hover:bg-gray-700 dark:hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition"
        >
          {loading ? <Spinner /> : (mode === 'signin' ? 'Sign In' : 'Create Account')}
        </button>
      </form>
    </div>
  )
}

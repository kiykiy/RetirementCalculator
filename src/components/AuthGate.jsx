import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase.js'

// ── Spinner ────────────────────────────────────────────────────────────────────
function Spinner() {
  return (
    <svg className="animate-spin w-5 h-5 text-brand-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  )
}

// ── Google icon ───────────────────────────────────────────────────────────────
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

// ── Login / Signup form ────────────────────────────────────────────────────────
function AuthForm({ onGuest }) {
  const [mode,        setMode]        = useState('signin') // 'signin' | 'signup'
  const [email,       setEmail]       = useState('')
  const [password,    setPassword]    = useState('')
  const [loading,     setLoading]     = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [error,       setError]       = useState('')
  const [msg,         setMsg]         = useState('')

  async function handleGoogle() {
    setError('')
    setGoogleLoading(true)
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    })
    if (error) { setError(error.message); setGoogleLoading(false) }
    // On success the page redirects — no need to setGoogleLoading(false)
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
      }
    } catch (err) {
      setError(err.message ?? 'Something went wrong.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-950 p-4">
      <div className="w-full max-w-sm">

        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-12 h-12 rounded-2xl bg-gray-900 dark:bg-white flex items-center justify-center shadow-md mb-4">
            <span className="text-lg font-black text-white dark:text-gray-900 tracking-tighter leading-none">&gt;&gt;</span>
          </div>
          <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-50 tracking-tight">Forward Planner</h1>
          <p className="text-xs text-gray-400 mt-0.5">Retirement &amp; Budget Simulator</p>
        </div>

        {/* Card */}
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm p-6 space-y-4">

          {/* Google SSO button */}
          <button
            type="button"
            onClick={handleGoogle}
            disabled={googleLoading}
            className="w-full flex items-center justify-center gap-2.5 py-2.5 px-4 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition shadow-sm"
          >
            {googleLoading ? <Spinner /> : <GoogleIcon />}
            {googleLoading ? 'Redirecting…' : 'Continue with Google'}
          </button>

          {/* Divider */}
          <div className="flex items-center gap-3">
            <div className="flex-1 border-t border-gray-100 dark:border-gray-800" />
            <span className="text-[10px] text-gray-300 dark:text-gray-700 uppercase tracking-widest">or</span>
            <div className="flex-1 border-t border-gray-100 dark:border-gray-800" />
          </div>

          {/* Tab toggle */}
          <div className="flex rounded-lg bg-gray-100 dark:bg-gray-800 p-0.5 gap-0.5">
            {['signin', 'signup'].map(m => (
              <button
                key={m}
                type="button"
                onClick={() => { setMode(m); setError(''); setMsg('') }}
                className={`flex-1 text-xs font-medium py-1.5 rounded-md transition-all ${
                  mode === m
                    ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                }`}
              >
                {m === 'signin' ? 'Sign In' : 'Create Account'}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Email</label>
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Password</label>
              <input
                type="password"
                required
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder={mode === 'signup' ? 'Min. 6 characters' : '••••••••'}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition"
              />
            </div>

            {/* Error / success messages */}
            {error && (
              <p className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 border border-red-100 dark:border-red-900/50 rounded-lg px-3 py-2">{error}</p>
            )}
            {msg && (
              <p className="text-xs text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-100 dark:border-emerald-900/50 rounded-lg px-3 py-2">{msg}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 py-2 px-4 rounded-lg bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-sm font-medium hover:bg-gray-700 dark:hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition"
            >
              {loading ? <Spinner /> : (mode === 'signin' ? 'Sign In' : 'Create Account')}
            </button>
          </form>

          {/* Divider */}
          <div className="flex items-center gap-3">
            <div className="flex-1 border-t border-gray-100 dark:border-gray-800" />
            <div className="flex-1 border-t border-gray-100 dark:border-gray-800" />
          </div>

          {/* Guest mode */}
          <button
            type="button"
            onClick={onGuest}
            className="w-full py-2 px-4 rounded-lg border border-gray-200 dark:border-gray-700 text-xs font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600 transition"
          >
            Continue without account
          </button>
        </div>

        <p className="text-center text-[11px] text-gray-400 mt-4">
          Your data is saved securely to the cloud when signed in.
        </p>
      </div>
    </div>
  )
}

// ── AuthGate ───────────────────────────────────────────────────────────────────
// Renders children(session, signOut) once auth is resolved.
// children is a render-prop function: (session, onSignOut) => <App />

export default function AuthGate({ children }) {
  // undefined = still loading, null = no session, object = active session
  const [session,   setSession]   = useState(undefined)
  const [guestMode, setGuestMode] = useState(false)

  useEffect(() => {
    // Get current session immediately
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session ?? null)
    })

    // Listen for sign-in / sign-out events
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session ?? null)
    })

    return () => subscription.unsubscribe()
  }, [])

  async function handleSignOut() {
    await supabase.auth.signOut()
    setGuestMode(false)
    // session will be set to null by onAuthStateChange
  }

  // Still resolving session from Supabase
  if (session === undefined) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-950">
        <Spinner />
      </div>
    )
  }

  // Authenticated or guest — show the app
  if (session || guestMode) {
    return children(session, handleSignOut)
  }

  // Not authenticated — show login form
  return <AuthForm onGuest={() => setGuestMode(true)} />
}

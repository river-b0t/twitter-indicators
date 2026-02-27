'use client'
import { useState } from 'react'

export default function LoginPage() {
  const [password, setPassword] = useState('')
  const [error, setError] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(false)
    const res = await fetch('/api/login', {
      method: 'POST',
      body: JSON.stringify({ password }),
      headers: { 'Content-Type': 'application/json' },
    })
    if (res.ok) {
      window.location.href = '/'
    } else {
      setError(true)
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-full max-w-sm px-4">
        <div className="text-center mb-8">
          <h1 className="font-mono text-base tracking-widest uppercase text-foreground">Market Digest</h1>
          <p className="font-mono text-xs text-muted-foreground mt-2">Enter password to continue</p>
        </div>
        <div className="border border-border rounded-xl p-8 bg-card shadow-sm">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1.5">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring transition-colors"
                placeholder="Enter password"
                autoFocus
              />
            </div>
            {error && (
              <p className="text-sm text-destructive">Incorrect password. Try again.</p>
            )}
            <button
              type="submit"
              disabled={loading || !password}
              className="w-full bg-primary text-primary-foreground text-sm font-medium py-2 rounded-lg hover:opacity-90 transition-opacity disabled:opacity-40"
            >
              {loading ? 'Checking...' : 'Enter'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}

import { useEffect, useState } from 'react'

type Health = {
  status: string
  message: string
}

function App() {
  const [health, setHealth] = useState<Health | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/health')
      .then((res) => {
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
        return res.json() as Promise<Health>
      })
      .then(setHealth)
      .catch((err: Error) => setError(err.message))
  }, [])

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-semibold text-slate-900">
          abridge-hackathon
        </h1>

        <p className="mt-6 text-sm text-slate-500">Backend status</p>
        {error ? (
          <p className="mt-1 font-mono text-sm text-red-600">
            unreachable — {error}
          </p>
        ) : health ? (
          <p className="mt-1 font-mono text-sm text-emerald-600">
            {health.status} — {health.message}
          </p>
        ) : (
          <p className="mt-1 font-mono text-sm text-slate-400">loading…</p>
        )}
      </div>
    </main>
  )
}

export default App

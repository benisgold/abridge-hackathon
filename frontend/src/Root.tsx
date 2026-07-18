import { useEffect, useState } from 'react'
import App from './App.tsx'
import { LandingPage } from './components/LandingPage.tsx'

type View = 'landing' | 'app'

// The landing page lives at the root and the tool at `#/app`. Using the hash
// (rather than a real path like `/app`) keeps everything served from the root
// document, so a refresh never hits the dev server's 404 for an unknown path.
function viewFromHash(): View {
  return window.location.hash.startsWith('#/app') ? 'app' : 'landing'
}

export function Root() {
  const [view, setView] = useState<View>(viewFromHash)

  useEffect(() => {
    const sync = () => setView(viewFromHash())
    window.addEventListener('hashchange', sync)
    window.addEventListener('popstate', sync)
    return () => {
      window.removeEventListener('hashchange', sync)
      window.removeEventListener('popstate', sync)
    }
  }, [])

  function go(next: View) {
    const hash = next === 'app' ? '#/app' : '#/'
    // Always rewrite the full URL to the root path + hash, so we never end up
    // at something like `/app#/app`, which the dev server can't serve.
    window.history.pushState(null, '', `/${hash}`)
    setView(next)
    window.scrollTo({ top: 0 })
  }

  if (view === 'app') {
    return <App onBackHome={() => go('landing')} />
  }
  return <LandingPage onLaunch={() => go('app')} />
}

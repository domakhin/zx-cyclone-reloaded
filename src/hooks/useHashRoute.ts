import { useEffect, useState } from 'react'

type Route = 'play' | 'editor'

function parseRoute(): Route {
  const hash = location.hash.replace(/^#\/?/, '').toLowerCase()
  if (hash.startsWith('editor')) return 'editor'
  return 'play'
}

export function useHashRoute(): Route {
  const [route, setRoute] = useState<Route>(parseRoute)

  useEffect(() => {
    if (!location.hash) {
      location.hash = '#/play'
    }
    const onChange = () => setRoute(parseRoute())
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])

  return route
}

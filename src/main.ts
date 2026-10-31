import './style.css'
import { createEditorPage, type EditorPage } from './pages/editor'
import { createPlayPage, type PlayPage } from './pages/play'

type Route = 'play' | 'editor'

type Page = PlayPage | EditorPage

function parseRoute(): Route {
  const hash = location.hash.replace(/^#\/?/, '').toLowerCase()
  if (hash.startsWith('editor')) return 'editor'
  return 'play'
}

function mountApp() {
  const app = document.querySelector<HTMLDivElement>('#app')
  if (!app) throw new Error('#app missing')

  app.innerHTML = `
    <div class="app-shell">
      <header class="topbar">
        <a class="brand" href="#/play">Cyclone Reloaded</a>
        <nav class="nav">
          <a href="#/play" data-route="play">Play</a>
          <a href="#/editor" data-route="editor">Editor</a>
        </nav>
      </header>
      <main class="main" data-role="main"></main>
      <footer class="footer">
        <span>Original Cyclone © Vortex Software / Costa Panayi — supply your own legal dump.</span>
        <span>Emulator: JSSpeccy 3 (GPLv3)</span>
      </footer>
    </div>
  `

  const main = app.querySelector<HTMLElement>('[data-role="main"]')!
  const navLinks = app.querySelectorAll<HTMLAnchorElement>('.nav a')

  let page: Page | null = null

  const setActiveNav = (route: Route) => {
    navLinks.forEach((link) => {
      link.classList.toggle('active', link.dataset.route === route)
    })
  }

  const render = () => {
    const route = parseRoute()
    setActiveNav(route)
    page?.destroy()
    page = route === 'editor' ? createEditorPage() : createPlayPage()
    main.replaceChildren(page.root)
  }

  window.addEventListener('hashchange', render)

  if (!location.hash) {
    location.hash = '#/play'
  } else {
    render()
  }
}

mountApp()

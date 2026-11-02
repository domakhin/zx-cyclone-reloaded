import { EditorPage } from './pages/EditorPage'
import { PlayPage } from './pages/PlayPage'
import { useHashRoute } from './hooks/useHashRoute'

export function App() {
  const route = useHashRoute()
  const onPlay = route === 'play'

  return (
    <div className="grid min-h-dvh grid-rows-[auto_1fr_auto] bg-black">
      <header className="flex items-center justify-between gap-4 border-b border-line bg-surface px-5 py-3.5">
        <a
          href="#/play"
          className="font-bold tracking-wide text-ink no-underline hover:text-accent"
        >
          Cyclone Reloaded
        </a>
        <nav className="flex gap-1.5">
          <a
            href="#/play"
            className={`rounded-md px-3 py-1.5 no-underline ${
              onPlay
                ? 'bg-panel text-ink'
                : 'text-muted hover:bg-panel hover:text-ink'
            }`}
          >
            Play
          </a>
          <a
            href="#/editor"
            className={`rounded-md px-3 py-1.5 no-underline ${
              !onPlay
                ? 'bg-panel text-ink'
                : 'text-muted hover:bg-panel hover:text-ink'
            }`}
          >
            Editor
          </a>
        </nav>
      </header>

      <main
        className={
          onPlay
            ? 'flex min-h-0 flex-col overflow-hidden p-0'
            : 'min-h-0 bg-black p-5'
        }
      >
        {/* Keep Play mounted so the emulator does not reset. */}
        <div className={onPlay ? 'flex min-h-0 flex-1 flex-col' : 'hidden'}>
          <PlayPage active={onPlay} />
        </div>
        {!onPlay && <EditorPage />}
      </main>

      {!onPlay && (
        <footer className="flex flex-wrap justify-between gap-x-6 gap-y-3 border-t border-line bg-surface px-5 py-3 text-xs text-muted">
          <span>
            Original Cyclone © Vortex Software / Costa Panayi — supply your own
            legal dump.
          </span>
          <span>Emulator: JSSpeccy 3 (GPLv3)</span>
        </footer>
      )}
    </div>
  )
}

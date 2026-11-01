import { useEffect, useRef, useState } from 'react'
import {
  extractMapFromTap,
  loadStockMap,
  mapStats,
  paintTerrainMap,
  MAP_HEIGHT,
  MAP_WIDTH,
  type MapViewMode,
  type TerrainMap,
} from '../lib/cycloneMap'
import { loadGameImage } from '../lib/gameStore'

const CELL_SCALE = 4

export function EditorPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [map, setMap] = useState<TerrainMap | null>(null)
  const [mode, setMode] = useState<MapViewMode>('heightfield')
  const [status, setStatus] = useState('Loading map…')
  const [stats, setStats] = useState('')
  const [note, setNote] = useState('')

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const image = await loadGameImage()
        if (cancelled) return

        if (image?.kind === 'tap') {
          try {
            const next = extractMapFromTap(image.data, image.fileName)
            if (!cancelled) setMap(next)
            return
          } catch (err) {
            console.warn('TAP extract failed, falling back to stock map', err)
          }
        }

        const stock = await loadStockMap()
        if (cancelled) return
        setMap(stock)
        if (image && image.kind !== 'tap') {
          setNote(
            `Saved image is ${image.kind.toUpperCase()} — showing stock TAP extract. Load a .TAP on Play to extract from your dump.`,
          )
        }
      } catch (err) {
        if (cancelled) return
        const msg = err instanceof Error ? err.message : String(err)
        setStatus(`Failed to load map: ${msg}`)
        setNote(
          'Place public/levels/stock-map-128.bin or load CYCLONE.TAP on the Play tab.',
        )
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!map) return
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return

    paintTerrainMap(ctx, map, CELL_SCALE, mode)
    const s = mapStats(map)
    setStatus(`Source: ${map.source}`)
    setStats(
      `${map.width}×${map.height} · sea ${s.sea} · land ${s.land} · struct ${s.structure}`,
    )
    setNote(
      mode === 'overview'
        ? 'Overview-style: same 128×128 cells, flattened like the in-game map screen (no labels yet)'
        : `Heightfield · cell scale ${CELL_SCALE}px · this is the real flyable grid`,
    )
  }, [map, mode])

  return (
    <section>
      <header className="mb-4">
        <h1 className="mb-1.5 text-[1.6rem] font-semibold text-ink">
          Map editor
        </h1>
        <p className="max-w-3xl text-muted leading-snug">
          Flyable terrain grid at{' '}
          <code className="font-mono text-[0.9em] text-accent">$9300</code>{' '}
          (128×128). The in-game map screen is a separate labelled schematic —
          same island layout, but islands drawn small with extra ocean for
          labels.
        </p>
      </header>

      <div className="mb-4 flex flex-wrap items-center gap-2.5">
        <span className="font-mono text-sm text-muted">{status}</span>
        <span className="font-mono text-sm text-muted">{stats}</span>
        <label className="ml-auto inline-flex items-center gap-2 text-sm text-muted">
          View
          <select
            className="rounded-md border border-line bg-panel px-2 py-1.5 text-ink"
            value={mode}
            onChange={(e) => setMode(e.target.value as MapViewMode)}
          >
            <option value="heightfield">Heightfield (edit)</option>
            <option value="overview">Overview-style</option>
          </select>
        </label>
      </div>

      <div className="grid items-start gap-4 md:grid-cols-[220px_1fr]">
        <aside className="rounded-lg border border-line bg-surface px-4 py-3.5">
          <h2 className="mb-3 text-sm uppercase tracking-wider text-muted">
            Layers
          </h2>
          <ul className="mb-3 grid gap-1.5 text-muted">
            <li>
              <label className="flex items-center gap-2">
                <input type="radio" name="layer" value="terrain" defaultChecked />
                Terrain + structures
              </label>
            </li>
            <li>
              <label className="flex items-center gap-2 opacity-50">
                <input type="radio" name="layer" value="buildings" disabled />
                Buildings (in-map)
              </label>
            </li>
            <li>
              <label className="flex items-center gap-2 opacity-50">
                <input type="radio" name="layer" value="helipads" disabled />
                Helipads (in-map)
              </label>
            </li>
            <li>
              <label className="flex items-center gap-2 opacity-50">
                <input type="radio" name="layer" value="crates" disabled />
                Crates (dynamic)
              </label>
            </li>
            <li>
              <label className="flex items-center gap-2 opacity-50">
                <input type="radio" name="layer" value="refugees" disabled />
                Refugees (dynamic)
              </label>
            </li>
          </ul>

          {mode === 'heightfield' ? (
            <div className="mb-3 grid gap-1.5 text-sm text-muted">
              <div>
                <Swatch className="bg-[rgb(8,20,50)]" /> Sea
              </div>
              <div>
                <Swatch className="bg-[rgb(110,135,100)]" /> Land (by height)
              </div>
              <div>
                <Swatch className="bg-[rgb(220,40,40)]" /> Structure ($8x)
              </div>
              <div>
                <Swatch className="bg-[rgb(40,200,60)]" /> Structure rim ($9x)
              </div>
            </div>
          ) : (
            <div className="mb-3 grid gap-1.5 text-sm text-muted">
              <div>
                <Swatch className="bg-white" /> Sea
              </div>
              <div>
                <Swatch className="bg-[rgb(40,200,40)]" /> Land / structures
              </div>
            </div>
          )}

          <p className="text-sm text-muted">
            Paint / patch tools come next. Preview is read-only.
          </p>
        </aside>

        <div className="grid justify-items-center gap-2 rounded-lg border border-line bg-surface p-3">
          <canvas
            ref={canvasRef}
            width={MAP_WIDTH * CELL_SCALE}
            height={MAP_HEIGHT * CELL_SCALE}
            aria-label="Cyclone terrain map"
            className="max-w-full border border-line bg-[#0b1c2c] [image-rendering:pixelated]"
            style={{ width: 'min(100%, 512px)', height: 'auto' }}
          />
          <p className="text-center text-sm text-muted">{note}</p>
        </div>
      </div>
    </section>
  )
}

function Swatch({ className }: { className: string }) {
  return (
    <span
      className={`mr-1.5 inline-block h-3.5 w-3.5 align-[-0.1rem] border border-line ${className}`}
    />
  )
}

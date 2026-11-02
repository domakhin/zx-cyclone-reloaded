import { useEffect, useRef, useState } from 'react'
import {
  extractMapFromTap,
  formatAtlasPeek,
  loadStockMap,
  mapStats,
  paintTerrainMap,
  peekAtlasUnderCursor,
  pickWorldCell,
  windowsForMap,
  MAP_HEIGHT,
  MAP_WIDTH,
  MMAP_HEIGHT,
  MMAP_WIDTH,
  SECTOR_SIZE,
  WORLD_HEIGHT,
  WORLD_SECTORS,
  WORLD_WIDTH,
  type MapViewMode,
  type TerrainMap,
} from '../lib/cycloneMap'
import { loadGameImage } from '../lib/gameStore'

type FocusSector = { sx: number; sy: number }

function scaleForMode(mode: MapViewMode): number {
  // World is 768×768 — keep 1px/cell; M-map 2× Spectrum; atlas 4px/cell.
  if (mode === 'world') return 1
  if (mode === 'mmap') return 2
  return 4
}

function canvasSize(mode: MapViewMode, scale: number): { w: number; h: number } {
  if (mode === 'world') {
    return { w: WORLD_WIDTH * scale, h: WORLD_HEIGHT * scale }
  }
  if (mode === 'mmap') {
    return { w: MMAP_WIDTH * scale, h: MMAP_HEIGHT * scale }
  }
  return { w: MAP_WIDTH * scale, h: MAP_HEIGHT * scale }
}

export function EditorPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [map, setMap] = useState<TerrainMap | null>(null)
  const [mode, setMode] = useState<MapViewMode>('world')
  const [showWindows, setShowWindows] = useState(true)
  const [focus, setFocus] = useState<FocusSector | null>({ sx: 0, sy: 0 })
  const [hover, setHover] = useState('—')
  const [status, setStatus] = useState('Loading map…')
  const [stats, setStats] = useState('')
  const [note, setNote] = useState('')

  const scale = scaleForMode(mode)

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

    const { w, h } = canvasSize(mode, scale)
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w
      canvas.height = h
    }

    const windows = windowsForMap(map)
    paintTerrainMap(ctx, map, {
      scale,
      mode,
      focusSector: mode === 'world' ? focus : null,
      showSectorGrid: mode === 'world',
      showIslandWindows: mode === 'world' && showWindows,
      islandWindows: windows,
    })

    const s = mapStats(map)
    const peak = windows.find((w) => w.name === 'PEAK')
    const peakSec = peak
      ? `${(((peak.xMin + peak.xMax) / 2) >> 7)},${(((peak.yMin + peak.yMax) / 2) >> 7)}`
      : '?'
    setStatus(`Source: ${map.source}`)
    setStats(
      `atlas ${map.width}×${map.height} · world ${WORLD_WIDTH}×${WORLD_HEIGHT} (${WORLD_SECTORS}×${WORLD_SECTORS}×${SECTOR_SIZE}) · sea ${s.sea} · land ${s.land} · struct ${s.structure} · PEAK sec ${peakSec}`,
    )

    if (mode === 'world') {
      setNote(
        `Sparse ${WORLD_WIDTH}×${WORLD_HEIGHT} — solid = AABB; dashed lines = +6/+7/+8/+9 blit edge thresholds (not island bounds); cross = mapPtr origin.`,
      )
    } else if (mode === 'mmap') {
      setNote(
        'In-game M map — silhouettes from atlas×4:1 at $F230+0c screen addresses; labels at +10 (patched with island moves).',
      )
    } else if (mode === 'overview') {
      setNote(
        'Overview-style flatten of the dense atlas (in-game M screen is a labelled schematic of the sparse world).',
      )
    } else {
      setNote(
        `Dense atlas ${MAP_WIDTH}×${MAP_HEIGHT} at $9300 · scale ${scale}px · packed islands; world view applies F230 window mapping.`,
      )
    }
  }, [map, mode, scale, focus, showWindows])

  const onCanvasMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas || !map) return
    const hit = pickWorldCell(canvas, e.clientX, e.clientY, scale, mode)
    if (!hit) {
      setHover('—')
      return
    }
    if (mode === 'mmap') {
      setHover(`screen (${hit.localX},${hit.localY})`)
      return
    }
    const peek = peekAtlasUnderCursor(
      map,
      mode,
      hit.globalX,
      hit.globalY,
      windowsForMap(map),
    )
    const cell = peek ? formatAtlasPeek(peek) : 'atlas —'
    if (mode === 'world') {
      setHover(
        `sector (${hit.sx},${hit.sy}) · local (${hit.localX},${hit.localY}) · global (${hit.globalX},${hit.globalY}) · ${cell}`,
      )
    } else {
      setHover(`local (${hit.localX},${hit.localY}) · ${cell}`)
    }
  }

  const onCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas || mode !== 'world') return
    const hit = pickWorldCell(canvas, e.clientX, e.clientY, scale, mode)
    if (!hit) return
    setFocus({ sx: hit.sx, sy: hit.sy })
  }

  return (
    <section className="mx-auto max-w-[1100px]">
      <header className="mb-5">
        <h1 className="mb-1.5 text-[1.6rem] font-semibold text-ink">
          World map
        </h1>
        <p className="max-w-3xl text-muted leading-snug">
          Dense island atlas at{' '}
          <code className="font-mono text-[0.9em] text-accent">$9300</code> is{' '}
          <strong className="font-semibold text-ink">
            {MAP_WIDTH}×{MAP_HEIGHT}
          </strong>
          ; sparse world is{' '}
          <strong className="font-semibold text-ink">
            {WORLD_WIDTH}×{WORLD_HEIGHT}
          </strong>{' '}
          ({WORLD_SECTORS}×{WORLD_SECTORS} sectors of {SECTOR_SIZE}). Atlas→world
          uses the 14 <code className="font-mono text-[0.9em] text-accent">$F230</code> island
          windows (not 36 copies of the atlas).
        </p>
      </header>

      <div className="mb-4 flex flex-wrap items-center gap-2.5">
        <span className="font-mono text-sm text-muted">{status}</span>
        <label className="ml-auto inline-flex items-center gap-2 text-sm text-muted">
          View
          <select
            className="rounded-md border border-line bg-panel px-2 py-1.5 text-ink"
            value={mode}
            onChange={(e) => setMode(e.target.value as MapViewMode)}
          >
            <option value="world">World 768×768 (sectors)</option>
            <option value="mmap">In-game M map</option>
            <option value="tile">Atlas 128×150 (packed)</option>
            <option value="overview">Overview-style atlas</option>
          </select>
        </label>
        {mode === 'world' && (
          <label className="inline-flex items-center gap-2 text-sm text-muted">
            <input
              type="checkbox"
              checked={showWindows}
              onChange={(e) => setShowWindows(e.target.checked)}
            />
            F230 boxes
          </label>
        )}
      </div>

      <p className="mb-4 font-mono text-sm text-muted">{stats}</p>

      <div className="grid items-start gap-4 lg:grid-cols-[240px_1fr]">
        <aside className="rounded-lg border border-line bg-surface px-4 py-3.5">
          <h2 className="mb-3 text-sm uppercase tracking-wider text-muted">
            Playfield
          </h2>
          <dl className="mb-4 grid gap-2 text-sm text-muted">
            <div className="flex justify-between gap-2">
              <dt>World</dt>
              <dd className="font-mono text-ink">
                {WORLD_WIDTH}×{WORLD_HEIGHT}
              </dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt>Sectors</dt>
              <dd className="font-mono text-ink">
                {WORLD_SECTORS}×{WORLD_SECTORS}×{SECTOR_SIZE}
              </dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt>Atlas</dt>
              <dd className="font-mono text-ink">
                {MAP_WIDTH}×{MAP_HEIGHT}
              </dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt>Focus sector</dt>
              <dd className="font-mono text-ink">
                {focus ? `${focus.sx},${focus.sy}` : '—'}
              </dd>
            </div>
            <div className="grid gap-0.5">
              <dt>Cursor</dt>
              <dd
                className="break-words font-mono text-[0.75rem] leading-snug text-ink"
                title={hover}
              >
                {hover}
              </dd>
            </div>
          </dl>

          <h2 className="mb-2 text-sm uppercase tracking-wider text-muted">
            Sector grid
          </h2>
          <div
            className="mb-4 grid gap-0.5"
            style={{
              gridTemplateColumns: `repeat(${WORLD_SECTORS}, minmax(0, 1fr))`,
            }}
          >
            {Array.from({ length: WORLD_SECTORS * WORLD_SECTORS }, (_, i) => {
              const sx = i % WORLD_SECTORS
              const sy = Math.floor(i / WORLD_SECTORS)
              const active = focus?.sx === sx && focus?.sy === sy
              return (
                <button
                  key={`${sx}-${sy}`}
                  type="button"
                  title={`Sector (${sx},${sy})`}
                  aria-pressed={active}
                  onClick={() => {
                    setFocus({ sx, sy })
                    setMode('world')
                  }}
                  className={`aspect-square rounded-sm border text-[10px] font-mono ${
                    active
                      ? 'border-accent bg-accent/20 text-ink'
                      : 'border-line bg-panel text-muted hover:border-accent-dim hover:text-ink'
                  }`}
                >
                  {sx},{sy}
                </button>
              )
            })}
          </div>

          <h2 className="mb-3 text-sm uppercase tracking-wider text-muted">
            Legend
          </h2>
          <div className="mb-3 grid gap-1.5 text-sm text-muted">
            {mode === 'overview' || mode === 'mmap' ? (
              <>
                <div>
                  <Swatch className="bg-white" /> Sea / paper
                </div>
                <div>
                  <Swatch className="bg-[rgb(0,215,0)]" /> Land silhouette
                </div>
              </>
            ) : (
              <>
                <div>
                  <Swatch className="bg-[rgb(8,20,50)]" /> Sea
                </div>
                <div>
                  <Swatch className="bg-[rgb(110,135,100)]" /> Land (by height)
                </div>
              </>
            )}
            <div>
              <Swatch className="bg-[rgb(200,40,140)]" /> Solid struct ($8x / $8C)
            </div>
            <div className="pl-4 text-xs text-muted">
              House on BASE · rocky peak mass on PEAK (same bytes)
            </div>
            <div>
              <Swatch className="bg-[rgb(160,70,90)]" /> Struct detail ($9x)
            </div>
            <div>
              <Swatch className="bg-[rgb(235,235,245)]" /> Helipad ($82–$86)
            </div>
            <div>
              <Swatch className="bg-[rgb(240,200,40)]" /> Path ($9D/$9E)
            </div>
            <div>
              <Swatch className="bg-[rgb(20,110,50)]" /> Tree dark ($B2–$CF)
            </div>
            <div>
              <Swatch className="bg-[rgb(230,160,40)]" /> Tree yellow ($D0–$E3)
            </div>
            <div>
              <Swatch className="bg-[rgb(250,250,255)]" /> Pillar / rare ($E4+)
            </div>
            <div>
              <Swatch className="bg-[rgb(160,100,60)]" /> Other prop ($A0–$B1)
            </div>
            <div>
              <Swatch className="bg-[rgb(110,135,100)]" /> Land elev 0–3 (green ramp)
            </div>
          </div>

          <p className="text-sm text-muted leading-snug">
            Paint / TAP patch tools next. Preview is read-only — one tile feeds
            every sector.
          </p>
        </aside>

        <div className="grid justify-items-center gap-2 rounded-lg border border-line bg-surface p-3">
          <canvas
            ref={canvasRef}
            width={canvasSize(mode, scale).w}
            height={canvasSize(mode, scale).h}
            aria-label="Cyclone world map"
            className="max-w-full cursor-crosshair border border-line bg-[#0b1c2c] [image-rendering:pixelated]"
            style={{
              width: mode === 'world' ? 'min(100%, 768px)' : 'min(100%, 512px)',
              height: 'auto',
              maxHeight: mode === 'world' ? undefined : '90vh',
            }}
            onMouseMove={onCanvasMove}
            onMouseLeave={() => setHover('—')}
            onClick={onCanvasClick}
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

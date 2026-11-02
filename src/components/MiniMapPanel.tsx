import { useEffect, useRef } from 'react'
import type { EmulatorHandle } from '../lib/jsspeccy'
import {
  MMAP_HEIGHT,
  paintInGameMap,
  windowsForMap,
  type TerrainMap,
} from '../lib/cycloneMap'
import {
  MINIMAP_PEEK,
  overviewCellToMmapPixel,
  readMinimapActors,
  worldToMmapPixel,
} from '../lib/ramProbe'

type Props = {
  emu: EmulatorHandle | null
  map: TerrainMap | null
  active: boolean
}

/** Crop Spectrum paper past island labels (full M-map is 256 wide). */
const VIEW_WIDTH = 208
const POLL_MS = 100
const PEEK_TIMEOUT_MS = 1500
const CYCLONE_ICON_SRC = `${import.meta.env.BASE_URL}favicon.png`
const CYCLONE_ICON_SIZE = 12

function inView(x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < VIEW_WIDTH && y < MMAP_HEIGHT
}

function drawHIcon(ctx: CanvasRenderingContext2D, cx: number, cy: number) {
  ctx.fillStyle = '#e01010'
  ctx.strokeStyle = '#e01010'
  ctx.font = '900 12px monospace'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.lineWidth = 1.5
  ctx.strokeText('H', cx, cy)
  ctx.fillText('H', cx, cy)
}

function drawCycloneIcon(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement | null,
  cx: number,
  cy: number,
) {
  if (img?.complete && img.naturalWidth > 0) {
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(
      img,
      cx - CYCLONE_ICON_SIZE / 2,
      cy - CYCLONE_ICON_SIZE / 2,
      CYCLONE_ICON_SIZE,
      CYCLONE_ICON_SIZE,
    )
    return
  }
  ctx.strokeStyle = '#e01010'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.arc(cx, cy, CYCLONE_ICON_SIZE / 2, 0, Math.PI * 2)
  ctx.stroke()
}

export function MiniMapPanel({ emu, map, active }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const baseRef = useRef<HTMLCanvasElement | null>(null)
  const cycloneIconRef = useRef<HTMLImageElement | null>(null)
  const busyRef = useRef(false)
  const emuRef = useRef(emu)
  emuRef.current = emu

  useEffect(() => {
    const img = new Image()
    img.src = CYCLONE_ICON_SRC
    cycloneIconRef.current = img
  }, [])

  useEffect(() => {
    if (!map) {
      baseRef.current = null
      return
    }
    const base = document.createElement('canvas')
    base.width = VIEW_WIDTH
    base.height = MMAP_HEIGHT
    const ctx = base.getContext('2d')
    if (!ctx) return
    paintInGameMap(ctx, map, windowsForMap(map), {
      scale: 1,
      border: false,
      width: VIEW_WIDTH,
    })
    baseRef.current = base

    const canvas = canvasRef.current
    const live = canvas?.getContext('2d')
    if (canvas && live) {
      canvas.width = base.width
      canvas.height = base.height
      live.imageSmoothingEnabled = false
      live.drawImage(base, 0, 0)
    }
  }, [map])

  useEffect(() => {
    if (!active) return

    const tick = async () => {
      const handle = emuRef.current
      const base = baseRef.current
      const canvas = canvasRef.current
      if (!handle || !base || !canvas || busyRef.current) return

      busyRef.current = true
      try {
        const raw = await Promise.race([
          handle.peekMemory(MINIMAP_PEEK),
          new Promise<never>((_, reject) =>
            window.setTimeout(
              () => reject(new Error('peek timeout')),
              PEEK_TIMEOUT_MS,
            ),
          ),
        ])
        if (raw.error) return

        const actors = readMinimapActors(raw.ranges ?? [])

        const ctx = canvas.getContext('2d')
        if (!ctx) return
        ctx.imageSmoothingEnabled = false
        ctx.clearRect(0, 0, canvas.width, canvas.height)
        ctx.drawImage(base, 0, 0)

        if (actors.heli) {
          const p = worldToMmapPixel(actors.heli.globalX, actors.heli.globalY)
          if (inView(p.x, p.y)) drawHIcon(ctx, p.x, p.y)
        }

        if (actors.cycloneCell) {
          const p = overviewCellToMmapPixel(
            actors.cycloneCell.x,
            actors.cycloneCell.y,
          )
          if (inView(p.x, p.y)) {
            drawCycloneIcon(ctx, cycloneIconRef.current, p.x + 4, p.y + 4)
          }
        }
      } catch {
        // peek failed — keep last frame
      } finally {
        busyRef.current = false
      }
    }

    void tick()
    const id = window.setInterval(() => void tick(), POLL_MS)
    return () => window.clearInterval(id)
  }, [active, map])

  if (!map) return null

  return (
    <aside className="pointer-events-auto overflow-hidden rounded-lg shadow-lg">
      <canvas
        ref={canvasRef}
        width={VIEW_WIDTH}
        height={MMAP_HEIGHT}
        aria-label="Cyclone mini-map"
        className="block [image-rendering:pixelated]"
        style={{ width: VIEW_WIDTH, height: MMAP_HEIGHT }}
      />
    </aside>
  )
}

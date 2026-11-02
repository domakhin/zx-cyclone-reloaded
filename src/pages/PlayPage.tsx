import { useCallback, useEffect, useRef, useState } from 'react'
import { FileButton, Button } from '../components/ui'
import { MiniMapPanel } from '../components/MiniMapPanel'
import {
  gameImageObjectUrl,
  loadGameImage,
  saveGameImage,
  type StoredGameImage,
} from '../lib/gameStore'
import { installCycloneKeymap } from '../lib/cycloneKeymap'
import { mountEmulator, type EmulatorHandle } from '../lib/jsspeccy'
import {
  extractMapFromTap,
  loadStockMap,
  type TerrainMap,
} from '../lib/cycloneMap'

function viewportSize(): { w: number; h: number } {
  const vv = window.visualViewport
  return {
    w: Math.floor(vv?.width ?? window.innerWidth),
    h: Math.floor(vv?.height ?? window.innerHeight),
  }
}

type Props = {
  active: boolean
}

export function PlayPage({ active }: Props) {
  const pageRef = useRef<HTMLElement>(null)
  const hostRef = useRef<HTMLDivElement>(null)
  const toolbarRef = useRef<HTMLDivElement>(null)
  const emuRef = useRef<EmulatorHandle | null>(null)
  const objectUrlRef = useRef<string | null>(null)
  // Keep fit/load callbacks stable across Play↔Editor so the mount effect
  // does not destroy+reload the emulator when `active` flips.
  const activeRef = useRef(active)
  activeRef.current = active
  const [image, setImage] = useState<StoredGameImage | null>(null)
  const [running, setRunning] = useState(true)
  const [emu, setEmu] = useState<EmulatorHandle | null>(null)
  const [terrain, setTerrain] = useState<TerrainMap | null>(null)
  const [showMap, setShowMap] = useState(true)

  const revokeUrl = () => {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current.split('#')[0]!)
      objectUrlRef.current = null
    }
  }

  const loadTerrainFromImage = useCallback(async (next: StoredGameImage) => {
    try {
      if (next.kind === 'tap') {
        setTerrain(extractMapFromTap(next.data, next.fileName))
        return
      }
      setTerrain(await loadStockMap())
    } catch (err) {
      console.warn('Mini-map terrain extract failed', err)
      try {
        setTerrain(await loadStockMap())
      } catch {
        setTerrain(null)
      }
    }
  }, [])

  const fitEmu = useCallback(() => {
    const emu = emuRef.current
    const host = hostRef.current
    if (!emu || !host || !activeRef.current) return

    const vp = viewportSize()
    let w = Math.floor(host.clientWidth)
    let h = Math.floor(host.clientHeight)

    if (w < 32) w = vp.w
    if (h < 32) {
      // Play hides the site footer; only header + toolbar shrink the host.
      const topbar =
        document.querySelector('header')?.getBoundingClientRect().height ?? 0
      const toolbar = toolbarRef.current?.getBoundingClientRect().height ?? 0
      h = Math.max(120, Math.floor(vp.h - topbar - toolbar))
    }

    w = Math.min(w, vp.w)
    h = Math.min(h, vp.h)
    emu.fitBox(w, h)
  }, [])

  const scheduleFit = useCallback(() => {
    requestAnimationFrame(() => {
      fitEmu()
      requestAnimationFrame(() => fitEmu())
    })
  }, [fitEmu])

  useEffect(() => {
    if (!active) return
    scheduleFit()
  }, [active, scheduleFit])

  // Arrow/Space → O/P/X/M while Play is visible (Cyclone stock keys).
  useEffect(() => {
    if (!active || !pageRef.current) return
    return installCycloneKeymap(pageRef.current, {
      keyDown: (key) => emuRef.current?.keyDown(key),
      keyUp: (key) => emuRef.current?.keyUp(key),
    })
  }, [active])

  useEffect(() => {
    const onResize = () => scheduleFit()
    window.addEventListener('resize', onResize)
    window.addEventListener('orientationchange', onResize)
    window.visualViewport?.addEventListener('resize', onResize)
    window.visualViewport?.addEventListener('scroll', onResize)

    const host = hostRef.current
    const ro =
      typeof ResizeObserver !== 'undefined' && host
        ? new ResizeObserver(() => scheduleFit())
        : null
    if (host) ro?.observe(host)

    return () => {
      window.removeEventListener('resize', onResize)
      window.removeEventListener('orientationchange', onResize)
      window.visualViewport?.removeEventListener('resize', onResize)
      window.visualViewport?.removeEventListener('scroll', onResize)
      ro?.disconnect()
    }
  }, [scheduleFit])

  const loadIntoEmu = useCallback(async (next: StoredGameImage) => {
    const host = hostRef.current
    if (!host) return

    emuRef.current?.destroy()
    emuRef.current = null
    setEmu(null)
    revokeUrl()
    objectUrlRef.current = gameImageObjectUrl(next)
    void loadTerrainFromImage(next)

    const isTape =
      next.kind === 'tap' || next.kind === 'tzx' || next.kind === 'zip'

    const nextEmu = await mountEmulator(host, {
      openUrl: objectUrlRef.current,
      autoLoadTapes: isTape,
      tapeAutoLoadMode: 'default',
    })
    emuRef.current = nextEmu
    setEmu(nextEmu)

    await new Promise<void>((resolve) => {
      nextEmu.instance.onReady(() => resolve())
      window.setTimeout(() => resolve(), 0)
    })

    scheduleFit()
    setRunning(true)
  }, [scheduleFit, loadTerrainFromImage])

  // Mount once — PlayPage stays mounted (hidden) while on Editor.
  // loadIntoEmu is stable (does not depend on `active`), so route switches
  // do not tear down the emulator.
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const saved = await loadGameImage()
        if (cancelled || !saved) return
        setImage(saved)
        await loadIntoEmu(saved)
      } catch (err) {
        console.error(err)
      }
    })()
    return () => {
      cancelled = true
      revokeUrl()
      emuRef.current?.destroy()
      emuRef.current = null
      setEmu(null)
    }
  }, [loadIntoEmu])

  const onFile = async (file: File | undefined) => {
    if (!file) return
    try {
      const next = await saveGameImage(file)
      setImage(next)
      await loadIntoEmu(next)
    } catch (err) {
      console.error(err)
    }
  }

  const hasImage = Boolean(image)

  return (
    <section ref={pageRef} className="flex min-h-0 flex-1 flex-col">
      <div
        ref={toolbarRef}
        className="flex flex-wrap items-stretch gap-2.5 px-[max(0.75rem,env(safe-area-inset-left))] py-2.5 pr-[max(0.75rem,env(safe-area-inset-right))]"
      >
        <FileButton
          inputProps={{
            accept: '.tap,.tzx,.z80,.sna,.szx,.zip',
            onChange: (e) => {
              const file = e.target.files?.[0]
              e.target.value = ''
              void onFile(file)
            },
          }}
        >
          Load game image
        </FileButton>
        <Button
          className="min-w-10 px-3"
          disabled={!hasImage}
          aria-label={running ? 'Pause' : 'Play'}
          title={running ? 'Pause' : 'Play'}
          aria-pressed={!running}
          onClick={() => {
            const emu = emuRef.current
            if (!emu) return
            const nowRunning = emu.togglePause()
            setRunning(nowRunning)
            hostRef.current?.focus()
          }}
        >
          {running ? (
            <svg
              width="12"
              height="12"
              viewBox="0 0 12 12"
              aria-hidden="true"
              className="fill-current"
            >
              <rect x="2" y="1" width="3" height="10" rx="0.5" />
              <rect x="7" y="1" width="3" height="10" rx="0.5" />
            </svg>
          ) : (
            <svg
              width="12"
              height="12"
              viewBox="0 0 12 12"
              aria-hidden="true"
              className="fill-current"
            >
              <path d="M3 1.5v9l8-4.5z" />
            </svg>
          )}
        </Button>
        <Button
          aria-pressed={showMap}
          title={showMap ? 'Hide mini-map' : 'Show mini-map'}
          onClick={() => setShowMap((v) => !v)}
        >
          Map
        </Button>
      </div>

      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
        <div
          ref={hostRef}
          tabIndex={0}
          aria-label="Spectrum emulator"
          className="flex min-h-0 min-w-0 flex-1 items-center justify-center overflow-hidden bg-black outline-none [&_canvas]:block [&_canvas]:[image-rendering:pixelated] [&_>div]:m-auto"
          title="Spectrum border cropped — 256×192 playfield fills the view"
        />
      </div>

      {showMap && active && (
        <div className="pointer-events-none fixed top-0 right-0 z-[200] max-w-[min(100vw,20rem)] p-1">
          <MiniMapPanel emu={emu} map={terrain} active={active} />
        </div>
      )}
    </section>
  )
}

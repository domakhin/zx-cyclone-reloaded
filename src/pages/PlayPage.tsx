import { useCallback, useEffect, useRef, useState } from 'react'
import { FileButton, Button } from '../components/ui'
import { MiniMapPanel } from '../components/MiniMapPanel'
import { SoftKeys, SoftNumberKeys } from '../components/SoftKeys'
import { TouchStick } from '../components/TouchStick'
import {
  gameImageObjectUrl,
  loadGameImage,
  saveGameImage,
  type StoredGameImage,
} from '../lib/gameStore'
import { installCycloneKeymap, type SpectrumKey } from '../lib/cycloneKeymap'
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
  const touchRef = useRef<HTMLDivElement>(null)
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
      // Play hides the site footer; header + toolbar + touch stick shrink the host.
      const topbar =
        document.querySelector('header')?.getBoundingClientRect().height ?? 0
      const toolbar = toolbarRef.current?.getBoundingClientRect().height ?? 0
      const touch = touchRef.current?.getBoundingClientRect().height ?? 0
      h = Math.max(120, Math.floor(vp.h - topbar - toolbar - touch))
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

  const onSpectrumKeyDown = useCallback((key: SpectrumKey) => {
    emuRef.current?.keyDown(key)
  }, [])

  const onSpectrumKeyUp = useCallback((key: SpectrumKey) => {
    emuRef.current?.keyUp(key)
  }, [])

  // Arrow/Space → O/P/X/M while Play is visible (Cyclone stock keys).
  useEffect(() => {
    if (!active || !pageRef.current) return
    return installCycloneKeymap(pageRef.current, {
      keyDown: onSpectrumKeyDown,
      keyUp: onSpectrumKeyUp,
    })
  }, [active, onSpectrumKeyDown, onSpectrumKeyUp])

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
          className="min-w-10 px-3"
          aria-label="Load game image"
          title="Load game image"
          inputProps={{
            accept: '.tap,.tzx,.z80,.sna,.szx,.zip',
            onChange: (e) => {
              const file = e.target.files?.[0]
              e.target.value = ''
              void onFile(file)
            },
          }}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 14 14"
            aria-hidden="true"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.25"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M2.25 1.75h7.75L11.75 3.5v8.75H2.25V1.75z" />
            <path d="M4.25 12.25v-4.5h5.5v4.5M4.25 1.75v3.25h5V1.75" />
          </svg>
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
          className="min-w-10 px-3"
          aria-label={showMap ? 'Hide mini-map' : 'Show mini-map'}
          aria-pressed={showMap}
          title={showMap ? 'Hide mini-map' : 'Show mini-map'}
          onClick={() => setShowMap((v) => !v)}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 14 14"
            aria-hidden="true"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.25"
            strokeLinecap="round"
          >
            <circle cx="7" cy="7" r="5.25" />
            <ellipse cx="7" cy="7" rx="2.25" ry="5.25" />
            <path d="M1.75 7h10.5M2.6 4.25h8.8M2.6 9.75h8.8" />
          </svg>
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

      <div
        ref={touchRef}
        className="flex shrink-0 items-center justify-between gap-4 border-t border-line bg-surface px-[max(1rem,env(safe-area-inset-left))] py-3 pr-[max(1rem,env(safe-area-inset-right))] pb-[max(0.75rem,env(safe-area-inset-bottom))]"
      >
        <TouchStick onKeyDown={onSpectrumKeyDown} onKeyUp={onSpectrumKeyUp} />
        <SoftNumberKeys onKeyDown={onSpectrumKeyDown} onKeyUp={onSpectrumKeyUp} />
        <SoftKeys onKeyDown={onSpectrumKeyDown} onKeyUp={onSpectrumKeyUp} />
      </div>

      {showMap && active && (
        <div className="pointer-events-none fixed top-0 right-0 z-[200] max-w-[min(100vw,20rem)] p-1">
          <MiniMapPanel emu={emu} map={terrain} active={active} />
        </div>
      )}
    </section>
  )
}

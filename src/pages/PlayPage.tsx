import { useCallback, useEffect, useRef, useState } from 'react'
import { FileButton, Button } from '../components/ui'
import {
  clearGameImage,
  gameImageObjectUrl,
  loadGameImage,
  saveGameImage,
  type StoredGameImage,
} from '../lib/gameStore'
import { installCycloneKeymap } from '../lib/cycloneKeymap'
import { mountEmulator, type EmulatorHandle } from '../lib/jsspeccy'

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
  const [image, setImage] = useState<StoredGameImage | null>(null)
  const [running, setRunning] = useState(true)

  const revokeUrl = () => {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current.split('#')[0]!)
      objectUrlRef.current = null
    }
  }

  const fitEmu = useCallback(() => {
    const emu = emuRef.current
    const host = hostRef.current
    if (!emu || !host || !active) return

    const vp = viewportSize()
    let w = Math.floor(host.clientWidth)
    let h = Math.floor(host.clientHeight)

    if (w < 32) w = vp.w
    if (h < 32) {
      const topbar =
        document.querySelector('header')?.getBoundingClientRect().height ?? 0
      const footer =
        document.querySelector('footer')?.getBoundingClientRect().height ?? 0
      const toolbar = toolbarRef.current?.getBoundingClientRect().height ?? 0
      h = Math.max(120, Math.floor(vp.h - topbar - footer - toolbar))
    }

    w = Math.min(w, vp.w)
    h = Math.min(h, vp.h)
    emu.fitBox(w, h)
  }, [active])

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

  const loadIntoEmu = useCallback(
    async (next: StoredGameImage) => {
      const host = hostRef.current
      if (!host) return

      emuRef.current?.destroy()
      emuRef.current = null
      revokeUrl()
      objectUrlRef.current = gameImageObjectUrl(next)

      const isTape =
        next.kind === 'tap' || next.kind === 'tzx' || next.kind === 'zip'

      const emu = await mountEmulator(host, {
        openUrl: objectUrlRef.current,
        autoLoadTapes: isTape,
        tapeAutoLoadMode: 'default',
      })
      emuRef.current = emu

      await new Promise<void>((resolve) => {
        emu.instance.onReady(() => resolve())
        window.setTimeout(() => resolve(), 0)
      })

      scheduleFit()
      setRunning(true)
    },
    [scheduleFit],
  )

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
        className="flex flex-wrap items-center gap-2.5 px-[max(0.75rem,env(safe-area-inset-left))] py-2.5 pr-[max(0.75rem,env(safe-area-inset-right))]"
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
          disabled={!hasImage}
          onClick={() => {
            if (image) void loadIntoEmu(image)
          }}
        >
          Reload into emulator
        </Button>
        <Button
          disabled={!hasImage}
          onClick={() => {
            void (async () => {
              await clearGameImage()
              setImage(null)
              revokeUrl()
              emuRef.current?.destroy()
              emuRef.current = null
              setRunning(true)
            })()
          }}
        >
          Clear saved image
        </Button>
        <Button
          className="min-w-10 tracking-wide"
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
          {running ? '||' : '>'}
        </Button>
      </div>

      <div
        ref={hostRef}
        tabIndex={0}
        aria-label="Spectrum emulator"
        className="flex min-h-0 min-w-0 flex-1 items-center justify-center overflow-hidden bg-black outline-none [&_canvas]:block [&_canvas]:max-w-full [&_canvas]:[image-rendering:pixelated] [&_>div]:m-auto [&_>div]:max-h-full [&_>div]:max-w-full"
      />
    </section>
  )
}

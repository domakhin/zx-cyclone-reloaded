export type PeekMemoryRange = { start: number; length: number }

export type PeekMemoryResponse = {
  ranges: Array<{ start: number; length: number; data: Uint8Array }>
  pc?: number
  halted?: boolean
  registers?: Record<string, number>
  error?: string
}

export type JSSpeccyInstance = {
  setZoom: (zoom: number) => void
  enterFullscreen: () => void
  exitFullscreen: () => void
  toggleFullscreen: () => void
  setMachine: (machine: number) => void
  openFileDialog: () => void
  openUrl: (url: string) => void
  loadSnapshotFromStruct: (snapshot: unknown) => void
  onReady: (callback: () => void) => void
  /** Patched onto vendored JSSpeccy — pause/resume emulation. */
  start: () => void
  pause: () => void
  isRunning: () => boolean
  /** Patched — Spectrum matrix key via keyboardHandler. */
  keyDown: (key: { row: number; mask: number }) => void
  keyUp: (key: { row: number; mask: number }) => void
  /** Patched — Z80 address-space peek via worker `o.peek`. */
  peekMemory: (
    ranges: PeekMemoryRange[] | PeekMemoryRange,
  ) => Promise<PeekMemoryResponse>
  exit: () => void
}

export type JSSpeccyOptions = {
  autoStart?: boolean
  autoLoadTapes?: boolean
  tapeAutoLoadMode?: 'default' | 'usr0'
  machine?: 48 | 128 | 5
  openUrl?: string | string[]
  zoom?: number
  sandbox?: boolean
  tapeTrapsEnabled?: boolean
  keyboardEnabled?: boolean
  uiEnabled?: boolean
  keyboardMap?: string
}

/** Query busts browser cache after vendored peekMemory patches. */
const SCRIPT_SRC = '/jsspeccy/jsspeccy.js?peek=1'
/**
 * Active Spectrum bitmap (JSSpeccy framebuffer is 320×240 with border).
 * Zoom so 256×192 fills the host; border is clipped by overflow:hidden.
 */
const SCREEN_WIDTH = 256
const SCREEN_HEIGHT = 192

let scriptPromise: Promise<void> | null = null

function jsspeccyFactoryHasPeek(): boolean {
  return (
    typeof window.JSSpeccy === 'function' &&
    Function.prototype.toString
      .call(window.JSSpeccy)
      .includes('peekMemory')
  )
}

function loadJSSpeccyScript(): Promise<void> {
  if (jsspeccyFactoryHasPeek()) {
    return Promise.resolve()
  }
  if (scriptPromise) {
    return scriptPromise
  }

  scriptPromise = new Promise((resolve, reject) => {
    // Drop any unpatched build still in the page (HMR / prior session).
    document
      .querySelectorAll<HTMLScriptElement>('script[src*="jsspeccy/jsspeccy.js"]')
      .forEach((el) => el.remove())

    const script = document.createElement('script')
    script.src = SCRIPT_SRC
    script.async = true
    script.onload = () => {
      if (!jsspeccyFactoryHasPeek()) {
        scriptPromise = null
        reject(new Error('JSSpeccy loaded without peekMemory patch'))
        return
      }
      resolve()
    }
    script.onerror = () => {
      scriptPromise = null
      reject(new Error('Failed to load JSSpeccy'))
    }
    document.head.appendChild(script)
  })

  return scriptPromise
}

function zoomToFitBox(widthPx: number, heightPx: number): number {
  // Size so the 256×192 playfield fills the host; 320×240 canvas overflows
  // and the border is cropped by the host's overflow:hidden.
  const zw = widthPx > 0 ? widthPx / SCREEN_WIDTH : 1
  const zh = heightPx > 0 ? heightPx / SCREEN_HEIGHT : zw
  return Math.max(0.05, Math.min(zw, zh))
}

export type EmulatorHandle = {
  instance: JSSpeccyInstance
  destroy: () => void
  fitBox: (widthPx: number, heightPx: number) => void
  isRunning: () => boolean
  togglePause: () => boolean
  keyDown: (key: { row: number; mask: number }) => void
  keyUp: (key: { row: number; mask: number }) => void
  peekMemory: (
    ranges: PeekMemoryRange[] | PeekMemoryRange,
  ) => Promise<PeekMemoryResponse>
}

export async function mountEmulator(
  container: HTMLElement,
  options: JSSpeccyOptions = {},
): Promise<EmulatorHandle> {
  await loadJSSpeccyScript()

  const defaults: JSSpeccyOptions = {
    machine: 128,
    zoom: 1,
    autoStart: true,
    autoLoadTapes: true,
    tapeAutoLoadMode: 'default',
    tapeTrapsEnabled: true,
    sandbox: true,
    uiEnabled: false,
  }

  const instance = window.JSSpeccy(container, { ...defaults, ...options })

  if (typeof instance.peekMemory !== 'function') {
    throw new Error(
      'JSSpeccy peekMemory missing — patched public/jsspeccy build not loaded. Hard-reload the page.',
    )
  }

  const isRunning = () => instance.isRunning()

  const handle: EmulatorHandle = {
    instance,
    fitBox: (widthPx, heightPx) => {
      instance.setZoom(zoomToFitBox(widthPx, heightPx))
    },
    isRunning,
    keyDown: (key) => instance.keyDown(key),
    keyUp: (key) => instance.keyUp(key),
    peekMemory: (ranges) => instance.peekMemory(ranges),
    togglePause: () => {
      if (isRunning()) {
        instance.pause()
        return false
      }
      instance.start()
      return true
    },
    destroy: () => {
      try {
        instance.exit()
      } catch {
        // ignore double-exit
      }
      if (
        (window as unknown as { __cycloneEmu?: EmulatorHandle }).__cycloneEmu ===
        handle
      ) {
        delete (window as unknown as { __cycloneEmu?: EmulatorHandle })
          .__cycloneEmu
      }
      container.replaceChildren()
    },
  }

  ;(window as unknown as { __cycloneEmu?: EmulatorHandle }).__cycloneEmu =
    handle
  return handle
}

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

const SCRIPT_SRC = '/jsspeccy/jsspeccy.js'
const SPECTRUM_WIDTH = 320
const SPECTRUM_HEIGHT = 240

let scriptPromise: Promise<void> | null = null

function loadJSSpeccyScript(): Promise<void> {
  if (typeof window.JSSpeccy === 'function') {
    return Promise.resolve()
  }
  if (scriptPromise) {
    return scriptPromise
  }

  scriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${SCRIPT_SRC}"]`,
    )
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true })
      existing.addEventListener(
        'error',
        () => reject(new Error('Failed to load JSSpeccy')),
        { once: true },
      )
      return
    }

    const script = document.createElement('script')
    script.src = SCRIPT_SRC
    script.async = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('Failed to load JSSpeccy'))
    document.head.appendChild(script)
  })

  return scriptPromise
}

function zoomToFitBox(widthPx: number, heightPx: number): number {
  const zw = widthPx > 0 ? widthPx / SPECTRUM_WIDTH : 1
  const zh = heightPx > 0 ? heightPx / SPECTRUM_HEIGHT : zw
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

  const isRunning = () => instance.isRunning()

  return {
    instance,
    fitBox: (widthPx, heightPx) => {
      instance.setZoom(zoomToFitBox(widthPx, heightPx))
    },
    isRunning,
    keyDown: (key) => instance.keyDown(key),
    keyUp: (key) => instance.keyUp(key),
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
      container.replaceChildren()
    },
  }
}

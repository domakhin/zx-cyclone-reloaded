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

let scriptPromise: Promise<void> | null = null

export function loadJSSpeccyScript(): Promise<void> {
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

export type EmulatorHandle = {
  instance: JSSpeccyInstance
  destroy: () => void
  openUrl: (url: string) => void
}

export async function mountEmulator(
  container: HTMLElement,
  options: JSSpeccyOptions = {},
): Promise<EmulatorHandle> {
  await loadJSSpeccyScript()

  const defaults: JSSpeccyOptions = {
    machine: 128,
    zoom: 3,
    autoStart: true,
    autoLoadTapes: true,
    tapeAutoLoadMode: 'default',
    tapeTrapsEnabled: true,
    sandbox: true,
    uiEnabled: true,
  }

  const instance = window.JSSpeccy(container, { ...defaults, ...options })

  return {
    instance,
    openUrl: (url: string) => instance.openUrl(url),
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

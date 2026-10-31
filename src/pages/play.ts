import {
  clearGameImage,
  gameImageObjectUrl,
  loadGameImage,
  saveGameImage,
  type StoredGameImage,
} from '../lib/gameStore'
import { mountEmulator, type EmulatorHandle } from '../lib/jsspeccy'

export type PlayPage = {
  root: HTMLElement
  destroy: () => void
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(2)} MB`
}

export function createPlayPage(): PlayPage {
  const root = document.createElement('section')
  root.className = 'page page-play'
  root.innerHTML = `
    <header class="page-header">
      <div>
        <h1>Play</h1>
        <p class="lede">Run your Cyclone TAP / Z80 in JSSpeccy 3 (Spectrum 128 by default). No game binary is shipped with this project.</p>
      </div>
    </header>

    <div class="toolbar">
      <label class="file-button">
        <input type="file" accept=".tap,.tzx,.z80,.sna,.szx,.zip" hidden />
        Load game image
      </label>
      <button type="button" data-action="reload" disabled>Reload into emulator</button>
      <button type="button" data-action="clear" disabled>Clear saved image</button>
      <span class="status" data-role="status">No image loaded</span>
    </div>

    <div class="emu-frame">
      <div class="emu-host" data-role="emu"></div>
      <p class="hint">Click the emulator area after load so keyboard focus reaches the Spectrum.</p>
    </div>
  `

  const fileInput = root.querySelector<HTMLInputElement>('input[type="file"]')!
  const statusEl = root.querySelector<HTMLElement>('[data-role="status"]')!
  const emuHost = root.querySelector<HTMLElement>('[data-role="emu"]')!
  const reloadBtn = root.querySelector<HTMLButtonElement>('[data-action="reload"]')!
  const clearBtn = root.querySelector<HTMLButtonElement>('[data-action="clear"]')!

  let emu: EmulatorHandle | null = null
  let objectUrl: string | null = null
  let current: StoredGameImage | null = null

  const setStatus = (text: string) => {
    statusEl.textContent = text
  }

  const revokeUrl = () => {
    if (objectUrl) {
      URL.revokeObjectURL(objectUrl.split('#')[0]!)
      objectUrl = null
    }
  }

  const updateButtons = () => {
    const has = Boolean(current)
    reloadBtn.disabled = !has
    clearBtn.disabled = !has
  }

  const loadIntoEmu = async (image: StoredGameImage) => {
    // Remount with openUrl so 128K auto-enters Tape Loader on boot.
    emu?.destroy()
    emu = null
    revokeUrl()
    objectUrl = gameImageObjectUrl(image)

    const isTape =
      image.kind === 'tap' || image.kind === 'tzx' || image.kind === 'zip'

    emu = await mountEmulator(emuHost, {
      openUrl: objectUrl,
      autoLoadTapes: isTape,
      tapeAutoLoadMode: 'default',
    })

    await new Promise<void>((resolve) => {
      emu!.instance.onReady(() => resolve())
      window.setTimeout(() => resolve(), 0)
    })

    setStatus(
      `${image.fileName} · ${formatBytes(image.data.byteLength)} · saved locally`,
    )
  }

  const setImage = async (image: StoredGameImage) => {
    current = image
    updateButtons()
    await loadIntoEmu(image)
  }

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0]
    fileInput.value = ''
    if (!file) return
    try {
      setStatus(`Saving ${file.name}…`)
      const image = await saveGameImage(file)
      await setImage(image)
    } catch (err) {
      console.error(err)
      setStatus(err instanceof Error ? err.message : 'Failed to load image')
    }
  })

  reloadBtn.addEventListener('click', async () => {
    if (!current) return
    try {
      await loadIntoEmu(current)
    } catch (err) {
      console.error(err)
      setStatus(err instanceof Error ? err.message : 'Reload failed')
    }
  })

  clearBtn.addEventListener('click', async () => {
    await clearGameImage()
    current = null
    updateButtons()
    revokeUrl()
    emu?.destroy()
    emu = null
    setStatus('No image loaded')
  })

  void (async () => {
    try {
      const saved = await loadGameImage()
      if (saved) {
        await setImage(saved)
      } else {
        setStatus('Choose a legal Cyclone TAP/Z80 to begin')
      }
    } catch (err) {
      console.error(err)
      setStatus('Could not restore saved image')
    }
  })()

  return {
    root,
    destroy: () => {
      revokeUrl()
      emu?.destroy()
      emu = null
    },
  }
}

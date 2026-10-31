import { loadGameImage } from '../lib/gameStore'

export type EditorPage = {
  root: HTMLElement
  destroy: () => void
}

export function createEditorPage(): EditorPage {
  const root = document.createElement('section')
  root.className = 'page page-editor'
  root.innerHTML = `
    <header class="page-header">
      <div>
        <h1>Map editor</h1>
        <p class="lede">Full level-pack editing lands after the Cyclone map format is reverse-engineered. This shell is ready for the canvas and object layers.</p>
      </div>
    </header>

    <div class="toolbar">
      <span class="status" data-role="base-status">Checking saved game image…</span>
    </div>

    <div class="editor-shell">
      <aside class="editor-panel">
        <h2>Layers</h2>
        <ul class="layer-list">
          <li><label><input type="radio" name="layer" value="terrain" checked disabled /> Terrain</label></li>
          <li><label><input type="radio" name="layer" value="buildings" disabled /> Buildings</label></li>
          <li><label><input type="radio" name="layer" value="helipads" disabled /> Helipads</label></li>
          <li><label><input type="radio" name="layer" value="crates" disabled /> Crates</label></li>
          <li><label><input type="radio" name="layer" value="refugees" disabled /> Refugees</label></li>
        </ul>
        <p class="hint">Tools unlock in Phase 3 once parse/encode exists.</p>
      </aside>
      <div class="editor-canvas-wrap">
        <canvas width="640" height="400" data-role="map" aria-label="Level map canvas placeholder"></canvas>
        <p class="hint centered" data-role="canvas-note">Map canvas placeholder — awaiting level format (Phase 1).</p>
      </div>
    </div>
  `

  const baseStatus = root.querySelector<HTMLElement>('[data-role="base-status"]')!
  const canvas = root.querySelector<HTMLCanvasElement>('[data-role="map"]')!
  const note = root.querySelector<HTMLElement>('[data-role="canvas-note"]')!

  const ctx = canvas.getContext('2d')
  if (ctx) {
    ctx.fillStyle = '#0b1c2c'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.strokeStyle = '#2a4a66'
    ctx.lineWidth = 1
    for (let x = 0; x < canvas.width; x += 16) {
      ctx.beginPath()
      ctx.moveTo(x + 0.5, 0)
      ctx.lineTo(x + 0.5, canvas.height)
      ctx.stroke()
    }
    for (let y = 0; y < canvas.height; y += 16) {
      ctx.beginPath()
      ctx.moveTo(0, y + 0.5)
      ctx.lineTo(canvas.width, y + 0.5)
      ctx.stroke()
    }
    ctx.fillStyle = '#7eb6d9'
    ctx.font = '14px "IBM Plex Mono", ui-monospace, monospace'
    ctx.fillText('Cyclone level grid — coming soon', 24, 32)
  }

  void (async () => {
    const image = await loadGameImage()
    if (image) {
      baseStatus.textContent = `Base image: ${image.fileName} (from Play tab / IndexedDB)`
      note.textContent =
        'Base image found. Extract/patch pipeline will use this file in later phases.'
    } else {
      baseStatus.textContent = 'No base image yet — load one on the Play tab first'
    }
  })()

  return {
    root,
    destroy: () => {
      // nothing persistent yet
    },
  }
}

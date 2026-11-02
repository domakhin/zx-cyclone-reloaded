/**
 * Cyclone stock controls: O/P left/right, X forward, M fire.
 * Inject Spectrum matrix keys directly (JSSpeccy KeyboardEvent keyCode is unreliable).
 */

type SpectrumKey = { row: number; mask: number }

/** Spectrum keyboard matrix positions (JSSpeccy Br table). */
const SPECTRUM_KEYS = {
  O: { row: 5, mask: 2 },
  P: { row: 5, mask: 1 },
  X: { row: 0, mask: 4 },
  M: { row: 7, mask: 4 },
  N: { row: 7, mask: 8 },
} as const satisfies Record<string, SpectrumKey>

type KeySink = {
  keyDown: (key: SpectrumKey) => void
  keyUp: (key: SpectrumKey) => void
}

const BY_KEY: Record<string, SpectrumKey> = {
  ArrowLeft: SPECTRUM_KEYS.O,
  ArrowRight: SPECTRUM_KEYS.P,
  ArrowUp: SPECTRUM_KEYS.X,
  Left: SPECTRUM_KEYS.O,
  Right: SPECTRUM_KEYS.P,
  Up: SPECTRUM_KEYS.X,
  ' ': SPECTRUM_KEYS.M,
  Spacebar: SPECTRUM_KEYS.M,
  Alt: SPECTRUM_KEYS.N,
}

const BY_CODE: Record<string, SpectrumKey> = {
  ArrowLeft: SPECTRUM_KEYS.O,
  ArrowRight: SPECTRUM_KEYS.P,
  ArrowUp: SPECTRUM_KEYS.X,
  Space: SPECTRUM_KEYS.M,
  AltLeft: SPECTRUM_KEYS.N,
  AltRight: SPECTRUM_KEYS.N,
}

const BY_KEYCODE: Record<number, SpectrumKey> = {
  37: SPECTRUM_KEYS.O,
  39: SPECTRUM_KEYS.P,
  38: SPECTRUM_KEYS.X,
  32: SPECTRUM_KEYS.M,
  18: SPECTRUM_KEYS.N,
}

function resolveMapped(e: KeyboardEvent): SpectrumKey | null {
  return (
    BY_KEY[e.key] ??
    BY_CODE[e.code] ??
    (e.keyCode ? BY_KEYCODE[e.keyCode] : undefined) ??
    null
  )
}

function shouldRemap(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return true
  return !target.closest('input, textarea, select, button, a, label')
}

/**
 * While installed on `root`, ArrowLeft/Right/Up, Space, and Alt drive O/P/X/M/N via `sink`.
 * Blocks JSSpeccy's default arrow = cursor-key mapping (and browser Alt menu focus).
 */
export function installCycloneKeymap(
  root: HTMLElement,
  sink: KeySink,
): () => void {
  const held = new Set<string>()

  const holdId = (e: KeyboardEvent, key: SpectrumKey) =>
    `${e.code || e.key}:${key.row}:${key.mask}`

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.metaKey || e.ctrlKey) return
    // Allow Alt itself → N; ignore other keys while Alt is used as a modifier.
    if (e.altKey && e.key !== 'Alt') return
    if (!shouldRemap(e.target)) return
    const key = resolveMapped(e)
    if (!key) return

    e.preventDefault()
    e.stopImmediatePropagation()

    const id = holdId(e, key)
    if (held.has(id)) return // ignore OS key repeat; Spectrum keys are level-held
    held.add(id)
    sink.keyDown(key)
  }

  const onKeyUp = (e: KeyboardEvent) => {
    if (e.metaKey || e.ctrlKey) return
    const key = resolveMapped(e)
    if (!key) return

    e.preventDefault()
    e.stopImmediatePropagation()

    const id = holdId(e, key)
    if (!held.has(id)) return
    held.delete(id)
    sink.keyUp(key)
  }

  const onBlur = () => {
    // Release any held remaps if the window loses focus.
    for (const id of held) {
      const [, row, mask] = id.split(':')
      sink.keyUp({ row: Number(row), mask: Number(mask) })
    }
    held.clear()
  }

  // Window capture runs before JSSpeccy's target listeners.
  window.addEventListener('keydown', onKeyDown, true)
  window.addEventListener('keyup', onKeyUp, true)
  window.addEventListener('blur', onBlur)

  // Also bind on root so we still work if something stops window propagation.
  root.addEventListener('keydown', onKeyDown, true)
  root.addEventListener('keyup', onKeyUp, true)

  return () => {
    onBlur()
    window.removeEventListener('keydown', onKeyDown, true)
    window.removeEventListener('keyup', onKeyUp, true)
    window.removeEventListener('blur', onBlur)
    root.removeEventListener('keydown', onKeyDown, true)
    root.removeEventListener('keyup', onKeyUp, true)
  }
}

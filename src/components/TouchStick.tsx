import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { SPECTRUM_KEYS, type SpectrumKey } from '../lib/cycloneKeymap'

type DirState = {
  left: boolean
  right: boolean
  up: boolean
}

const IDLE: DirState = { left: false, right: false, up: false }

const WELL = 120
const KNOB = 52
const MAX_TRAVEL = (WELL - KNOB) / 2
const DEADZONE = MAX_TRAVEL * 0.28

type Props = {
  onKeyDown: (key: SpectrumKey) => void
  onKeyUp: (key: SpectrumKey) => void
}

function dirsFromOffset(dx: number, dy: number): DirState {
  const dist = Math.hypot(dx, dy)
  if (dist < DEADZONE) return IDLE
  return {
    left: dx <= -DEADZONE,
    right: dx >= DEADZONE,
    // Screen Y grows downward; forward is up.
    up: dy <= -DEADZONE,
  }
}

function clampStick(dx: number, dy: number): { x: number; y: number } {
  const dist = Math.hypot(dx, dy)
  if (dist <= MAX_TRAVEL || dist === 0) return { x: dx, y: dy }
  const s = MAX_TRAVEL / dist
  return { x: dx * s, y: dy * s }
}

export function TouchStick({ onKeyDown, onKeyUp }: Props) {
  const wellRef = useRef<HTMLDivElement>(null)
  const activeRef = useRef(false)
  const dirsRef = useRef<DirState>(IDLE)
  const [knob, setKnob] = useState({ x: 0, y: 0 })
  const [pressed, setPressed] = useState(false)

  const syncKeys = useCallback(
    (next: DirState) => {
      const prev = dirsRef.current
      const pairs: Array<[keyof DirState, SpectrumKey]> = [
        ['left', SPECTRUM_KEYS.O],
        ['right', SPECTRUM_KEYS.P],
        ['up', SPECTRUM_KEYS.X],
      ]
      for (const [dir, key] of pairs) {
        if (next[dir] && !prev[dir]) onKeyDown(key)
        if (!next[dir] && prev[dir]) onKeyUp(key)
      }
      dirsRef.current = next
    },
    [onKeyDown, onKeyUp],
  )

  const release = useCallback(() => {
    activeRef.current = false
    setPressed(false)
    setKnob({ x: 0, y: 0 })
    syncKeys(IDLE)
  }, [syncKeys])

  const moveTo = useCallback(
    (clientX: number, clientY: number) => {
      const well = wellRef.current
      if (!well) return
      const rect = well.getBoundingClientRect()
      const cx = rect.left + rect.width / 2
      const cy = rect.top + rect.height / 2
      const rawX = clientX - cx
      const rawY = clientY - cy
      const { x, y } = clampStick(rawX, rawY)
      setKnob({ x, y })
      syncKeys(dirsFromOffset(x, y))
    },
    [syncKeys],
  )

  useEffect(() => {
    const onBlur = () => release()
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('blur', onBlur)
      release()
    }
  }, [release])

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    activeRef.current = true
    setPressed(true)
    moveTo(e.clientX, e.clientY)
  }

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!activeRef.current) return
    e.preventDefault()
    moveTo(e.clientX, e.clientY)
  }

  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!activeRef.current) return
    e.preventDefault()
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {
      // already released
    }
    release()
  }

  return (
    <div
      ref={wellRef}
      role="application"
      aria-label="Movement stick — left O, right P, forward X"
      className="relative touch-none select-none rounded-full border border-line bg-surface shadow-[inset_0_2px_8px_rgba(0,0,0,0.55)]"
      style={{ width: WELL, height: WELL }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <div
        className={`absolute left-1/2 top-1/2 rounded-full border border-line bg-panel ${
          pressed ? 'border-accent-dim' : ''
        }`}
        style={{
          width: KNOB,
          height: KNOB,
          transform: `translate(calc(-50% + ${knob.x}px), calc(-50% + ${knob.y}px))`,
          boxShadow: pressed
            ? '0 2px 6px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.08)'
            : '0 3px 8px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.1)',
        }}
      />
    </div>
  )
}

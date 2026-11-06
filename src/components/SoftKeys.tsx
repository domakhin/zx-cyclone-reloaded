import { useCallback, useEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react'
import { SPECTRUM_KEYS, type SpectrumKey } from '../lib/cycloneKeymap'

type Props = {
  onKeyDown: (key: SpectrumKey) => void
  onKeyUp: (key: SpectrumKey) => void
}

type SoftKeyDef = {
  id: string
  label: string
  ariaLabel: string
  key: SpectrumKey
}

const ACTION_KEYS: SoftKeyDef[] = [
  {
    id: 'm',
    label: 'M',
    ariaLabel: 'Fire — Spectrum M',
    key: SPECTRUM_KEYS.M,
  },
  {
    id: 'up',
    label: '▲',
    ariaLabel: 'Up — Spectrum 1',
    key: SPECTRUM_KEYS.ONE,
  },
  {
    id: 'n',
    label: 'N',
    ariaLabel: 'Spectrum N',
    key: SPECTRUM_KEYS.N,
  },
  {
    id: 'down',
    label: '▼',
    ariaLabel: 'Down — Spectrum Q',
    key: SPECTRUM_KEYS.Q,
  },
]

const NUMBER_KEYS: SoftKeyDef[] = [
  { id: '1', label: '1', ariaLabel: 'Spectrum 1', key: SPECTRUM_KEYS.ONE },
  { id: '2', label: '2', ariaLabel: 'Spectrum 2', key: SPECTRUM_KEYS.TWO },
  { id: '3', label: '3', ariaLabel: 'Spectrum 3', key: SPECTRUM_KEYS.THREE },
  { id: '4', label: '4', ariaLabel: 'Spectrum 4', key: SPECTRUM_KEYS.FOUR },
  { id: '5', label: '5', ariaLabel: 'Spectrum 5', key: SPECTRUM_KEYS.FIVE },
  { id: '6', label: '6', ariaLabel: 'Spectrum 6', key: SPECTRUM_KEYS.SIX },
]

function SoftKeyButton({
  def,
  onKeyDown,
  onKeyUp,
  className,
}: {
  def: SoftKeyDef
  onKeyDown: (key: SpectrumKey) => void
  onKeyUp: (key: SpectrumKey) => void
  className: string
}) {
  const heldRef = useRef(false)

  const release = useCallback(() => {
    if (!heldRef.current) return
    heldRef.current = false
    onKeyUp(def.key)
  }, [def.key, onKeyUp])

  useEffect(() => {
    const onBlur = () => release()
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('blur', onBlur)
      release()
    }
  }, [release])

  const onPointerDown = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    if (heldRef.current) return
    heldRef.current = true
    onKeyDown(def.key)
  }

  const onPointerUp = (e: ReactPointerEvent<HTMLButtonElement>) => {
    e.preventDefault()
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {
      // already released
    }
    release()
  }

  return (
    <button
      type="button"
      aria-label={def.ariaLabel}
      title={def.ariaLabel}
      className={className}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <span aria-hidden="true">{def.label}</span>
    </button>
  )
}

const actionBtnClass =
  'flex h-14 w-14 touch-none select-none items-center justify-center rounded-xl border border-line bg-panel text-lg text-ink shadow-[0_3px_8px_rgba(0,0,0,0.45),inset_0_1px_0_rgba(255,255,255,0.08)] active:border-accent-dim active:bg-surface'

const numberBtnClass =
  'flex h-9 w-9 touch-none select-none items-center justify-center rounded-lg border border-line bg-panel text-sm font-medium text-ink shadow-[0_2px_5px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.08)] active:border-accent-dim active:bg-surface'

export function SoftNumberKeys({ onKeyDown, onKeyUp }: Props) {
  return (
    <div
      className="flex flex-1 flex-wrap items-center justify-center gap-1.5"
      aria-label="Soft keys — Spectrum 1 to 6"
    >
      {NUMBER_KEYS.map((def) => (
        <SoftKeyButton
          key={def.id}
          def={def}
          className={numberBtnClass}
          onKeyDown={onKeyDown}
          onKeyUp={onKeyUp}
        />
      ))}
    </div>
  )
}

export function SoftKeys({ onKeyDown, onKeyUp }: Props) {
  return (
    <div
      className="grid grid-cols-2 gap-2.5"
      aria-label="Soft keys — up 1, down Q, M, N"
    >
      {ACTION_KEYS.map((def) => (
        <SoftKeyButton
          key={def.id}
          def={def}
          className={actionBtnClass}
          onKeyDown={onKeyDown}
          onKeyUp={onKeyUp}
        />
      ))}
    </div>
  )
}

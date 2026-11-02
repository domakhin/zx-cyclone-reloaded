import type { ButtonHTMLAttributes, InputHTMLAttributes, LabelHTMLAttributes } from 'react'

const btn =
  'inline-flex cursor-pointer appearance-none items-center justify-center rounded-md border border-line bg-panel px-3.5 py-2 font-sans text-ink hover:border-accent-dim disabled:cursor-not-allowed disabled:opacity-45'

export function Button({
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type="button" className={`${btn} ${className}`} {...props} />
}

export function FileButton({
  className = '',
  children,
  inputProps,
  ...labelProps
}: LabelHTMLAttributes<HTMLLabelElement> & {
  inputProps?: InputHTMLAttributes<HTMLInputElement>
}) {
  return (
    <label className={`${btn} ${className}`} {...labelProps}>
      <input type="file" className="hidden" {...inputProps} />
      {children}
    </label>
  )
}

/// <reference types="vite/client" />

import type { JSSpeccyInstance, JSSpeccyOptions } from './lib/jsspeccy'

declare global {
  interface Window {
    JSSpeccy: (
      container: HTMLElement,
      options?: JSSpeccyOptions,
    ) => JSSpeccyInstance
  }
}

export {}

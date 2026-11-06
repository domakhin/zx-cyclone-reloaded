const DB_NAME = 'zx-cyclone-reloaded'
const DB_VERSION = 1
const STORE = 'gameImages'

/** Shipped default load — Outer Ring patched Cyclone3. */
export const DEFAULT_TAP_FILE_NAME = 'CYCLONE-outer-ring.TAP'
export const DEFAULT_TAP_URL = `${import.meta.env.BASE_URL}taps/${DEFAULT_TAP_FILE_NAME}`

/** Prior bundled defaults — upgraded to Outer Ring on load. */
const PREVIOUS_SHIPPED_DEFAULTS = new Set([
  'CYCLONE.TAP',
  'CYCLONE-peak-1-2.TAP',
])

type GameImageKind = 'tap' | 'tzx' | 'z80' | 'sna' | 'szx' | 'zip' | 'unknown'

export type StoredGameImage = {
  id: 'base'
  fileName: string
  kind: GameImageKind
  updatedAt: number
  data: ArrayBuffer
}

function kindFromName(fileName: string): GameImageKind {
  const ext = fileName.split('.').pop()?.toLowerCase()
  switch (ext) {
    case 'tap':
      return 'tap'
    case 'tzx':
      return 'tzx'
    case 'z80':
      return 'z80'
    case 'sna':
      return 'sna'
    case 'szx':
      return 'szx'
    case 'zip':
      return 'zip'
    default:
      return 'unknown'
  }
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'))
  })
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'))
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'))
  })
}

async function putGameImage(record: StoredGameImage): Promise<void> {
  const db = await openDb()
  try {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(record)
    await txDone(tx)
  } finally {
    db.close()
  }
}

export async function saveGameImage(file: File): Promise<StoredGameImage> {
  const data = await file.arrayBuffer()
  const record: StoredGameImage = {
    id: 'base',
    fileName: file.name,
    kind: kindFromName(file.name),
    updatedAt: Date.now(),
    data,
  }
  await putGameImage(record)
  return record
}

async function readStoredGameImage(): Promise<StoredGameImage | null> {
  const db = await openDb()
  try {
    const tx = db.transaction(STORE, 'readonly')
    const req = tx.objectStore(STORE).get('base')
    const record = await new Promise<StoredGameImage | undefined>(
      (resolve, reject) => {
        req.onsuccess = () => resolve(req.result as StoredGameImage | undefined)
        req.onerror = () =>
          reject(req.error ?? new Error('IndexedDB get failed'))
      },
    )
    await txDone(tx)
    return record ?? null
  } finally {
    db.close()
  }
}

async function fetchDefaultTap(): Promise<StoredGameImage> {
  const res = await fetch(DEFAULT_TAP_URL)
  if (!res.ok) {
    throw new Error(`Failed to load default TAP (${res.status}): ${DEFAULT_TAP_URL}`)
  }
  const data = await res.arrayBuffer()
  const record: StoredGameImage = {
    id: 'base',
    fileName: DEFAULT_TAP_FILE_NAME,
    kind: 'tap',
    updatedAt: Date.now(),
    data,
  }
  await putGameImage(record)
  return record
}

/**
 * Load the saved game image, or seed IndexedDB from the shipped Outer Ring TAP.
 * Also upgrades older bundled defaults (stock / peak-1-2) to Outer Ring.
 * User-picked custom dumps are left alone.
 */
export async function loadGameImage(): Promise<StoredGameImage | null> {
  const saved = await readStoredGameImage()
  if (saved) {
    if (saved.fileName === DEFAULT_TAP_FILE_NAME) return saved
    if (!PREVIOUS_SHIPPED_DEFAULTS.has(saved.fileName)) return saved
  }
  try {
    return await fetchDefaultTap()
  } catch (err) {
    console.warn('Default TAP unavailable', err)
    return saved
  }
}

export function gameImageObjectUrl(image: StoredGameImage): string {
  const mime =
    image.kind === 'zip'
      ? 'application/zip'
      : 'application/octet-stream'
  // JSSpeccy picks the opener from the URL string (endsWith .tap/.z80/…).
  // Blob URLs are bare UUIDs, so append the real filename as a hash fragment.
  const base = URL.createObjectURL(new Blob([image.data], { type: mime }))
  const safeName = image.fileName.replace(/[/\\?#]/g, '_')
  return `${base}#/${safeName}`
}

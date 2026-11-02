const DB_NAME = 'zx-cyclone-reloaded'
const DB_VERSION = 1
const STORE = 'gameImages'

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

export async function saveGameImage(file: File): Promise<StoredGameImage> {
  const data = await file.arrayBuffer()
  const record: StoredGameImage = {
    id: 'base',
    fileName: file.name,
    kind: kindFromName(file.name),
    updatedAt: Date.now(),
    data,
  }

  const db = await openDb()
  try {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(record)
    await txDone(tx)
  } finally {
    db.close()
  }

  return record
}

export async function loadGameImage(): Promise<StoredGameImage | null> {
  const db = await openDb()
  try {
    const tx = db.transaction(STORE, 'readonly')
    const req = tx.objectStore(STORE).get('base')
    const record = await new Promise<StoredGameImage | undefined>((resolve, reject) => {
      req.onsuccess = () => resolve(req.result as StoredGameImage | undefined)
      req.onerror = () => reject(req.error ?? new Error('IndexedDB get failed'))
    })
    await txDone(tx)
    return record ?? null
  } finally {
    db.close()
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

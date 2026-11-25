// Dexie.js initialization helper
// Ensures DB is ready before use

let dbPromise = null

export async function initializeDB() {
  if (dbPromise) return dbPromise

  dbPromise = (async () => {
    const { default: Dexie } = await import('https://cdn.jsdelivr.net/npm/dexie@4.0.8/dist/dexie.min.js')

    const db = new Dexie('llm-price-monitor')
    db.version(1).stores({
      prices: '++id, modelId, providerId, timestamp, pricing, source',
      metadata: 'key, value'
    })

    // Initialize metadata
    await db.metadata.put({ key: 'version', value: 1 })
    await db.metadata.put({ key: 'created', value: new Date().toISOString() })

    return db
  })()

  return dbPromise
}

export async function getDB() {
  return initializeDB()
}
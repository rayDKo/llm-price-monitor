// Prices Store - IndexedDB (Dexie) for price history and caching
// Handles price fetching, history storage, TTL

import { fetcherRegistry } from '../fetchers/registry.js'

const DB_NAME = 'llm-price-monitor'

let db = null
let providersStore = null
let modelsStore = null

export function createPricesStore() {
  return {
    init: initializeDB,
    fetchAll,
    fetchForModels,
    getHistory,
    getAll,
    getLatest,
    clear,
    clearByProvider,
    savePrice
  }
}

async function initializeDB() {
  if (db) return db

  const { default: Dexie } = await import('https://cdn.jsdelivr.net/npm/dexie@4.0.8/dist/dexie.min.js')

  db = new Dexie(DB_NAME)
  db.version(1).stores({
    prices: '++id, modelId, providerId, timestamp, pricing, source',
    metadata: 'key, value'
  })

  return db
}

async function fetchAll() {
  await initializeDB()
  const providers = providersStore?.list || []
  const selectedModels = modelsStore?.selected || new Set()

  for (const provider of providers) {
    const models = (modelsStore?.available || []).filter(m => m.provider_id === provider.id && selectedModels.has(m.id))
    if (models.length) {
      await fetchForModels(provider, models)
    }
  }
}

async function fetchForModels(provider, models) {
  const fetcher = fetcherRegistry.get(provider.fetcherType)
  if (!fetcher) {
    console.warn(`No fetcher for ${provider.fetcherType}`)
    return
  }

  try {
    const prices = await fetcher.fetchPrices(provider.config, models)
    const now = new Date().toISOString()

    for (const { modelId, pricing, source } of prices) {
      await savePrice(modelId, provider.id, pricing, source, now)
      // Update model in memory
      const model = modelsStore?.available?.find(m => m.id === modelId)
      if (model) {
        model.pricing = pricing
        model.updated_at = now
        model.source = source
        model.priceChanged = model.previousPricing &&
          (model.previousPricing.input !== pricing.input || model.previousPricing.output !== pricing.output)
        model.previousPricing = { ...pricing }
      }
    }

    // Check alerts
    await checkAlerts(prices, now)

    modelsStore?.saveAvailable?.()
  } catch (err) {
    console.error(`Failed to fetch prices for ${provider.id}:`, err)
    throw err
  }
}

async function savePrice(modelId, providerId, pricing, source, timestamp) {
  await initializeDB()
  await db.prices.add({
    modelId,
    providerId,
    timestamp,
    pricing,
    source
  })
  // TTL cleanup (keep 90 days)
  const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()
  await db.prices.where('timestamp').below(cutoff).delete()
}

async function getHistory(modelId, range) {
  await initializeDB()
  const now = new Date()
  let cutoff
  switch (range) {
    case '7d': cutoff = new Date(now - 7 * 24 * 60 * 60 * 1000); break
    case '30d': cutoff = new Date(now - 30 * 24 * 60 * 60 * 1000); break
    case '90d': cutoff = new Date(now - 90 * 24 * 60 * 60 * 1000); break
    default: cutoff = new Date(now - 30 * 24 * 60 * 60 * 1000)
  }
  return db.prices
    .where('modelId')
    .equals(modelId)
    .and(p => new Date(p.timestamp) >= cutoff)
    .sortBy('timestamp')
}

async function getAll() {
  await initializeDB()
  return db.prices.toArray()
}

async function getLatest(modelId) {
  await initializeDB()
  return db.prices.where('modelId').equals(modelId).last()
}

async function clear() {
  await initializeDB()
  await db.prices.clear()
}

async function clearByProvider(providerId) {
  await initializeDB()
  await db.prices.where('providerId').equals(providerId).delete()
}

async function checkAlerts(prices, timestamp) {
  if (!modelsStore?.alerts?.size) return
  if (Notification.permission !== 'granted') return

  for (const { modelId, pricing } of prices) {
    if (!modelsStore.alerts.has(modelId)) continue
    const previous = await getLatest(modelId)
    if (!previous) continue

    const prevInput = previous.pricing?.input
    const prevOutput = previous.pricing?.output
    const newInput = pricing.input
    const newOutput = pricing.output

    const changed = (prevInput !== newInput) || (prevOutput !== newOutput)
    if (!changed) continue

    const model = modelsStore.available.find(m => m.id === modelId)
    if (!model) continue

    const provider = providersStore?.get(model.provider_id)
    const providerName = provider?.name || model.provider_id

    new Notification(`Цена изменилась: ${model.name}`, {
      body: `${providerName}: вход $${prevInput}→$${newInput}, выход $${prevOutput}→$${newOutput}`,
      icon: '/favicon.svg',
      tag: `price-change-${modelId}`
    })
  }
}

// Set cross-references (called from main.js after all stores created)
export function setStoresRefs(pStore, mStore) {
  providersStore = pStore
  modelsStore = mStore
}
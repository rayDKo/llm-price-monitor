// Models Store - Manages available models and user selection
// Fetches models from providers, persists selection to localStorage

import { fetcherRegistry } from '../fetchers/registry.js'

const STORAGE_KEY = 'llm-monitor:models'
const SELECTION_KEY = 'llm-monitor:selection'
const ALERTS_KEY = 'llm-monitor:alerts'

let available = []
let selected = new Set()
let alerts = new Set()
let loaded = false
let providersStore = null
let pricesStore = null

export function createModelsStore(providers, prices) {
  providersStore = providers
  pricesStore = prices

  return {
    get available() { return available },
    get selected() { return selected },
    get alerts() { return alerts },
    get loaded() { return loaded },
    load,
    refreshAll,
    refreshProvider,
    toggleSelection,
    setAlert,
    getByProvider,
    getActive,
    clear
  }
}

async function load() {
  if (loaded) return
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      available = JSON.parse(stored)
    }
    const selStored = localStorage.getItem(SELECTION_KEY)
    if (selStored) {
      selected = new Set(JSON.parse(selStored))
    }
    const alertStored = localStorage.getItem(ALERTS_KEY)
    if (alertStored) {
      alerts = new Set(JSON.parse(alertStored))
    }
  } catch (e) {
    console.error('Failed to load models:', e)
  }
  loaded = true
}

function saveAvailable() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(available))
  window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY }))
}

function saveSelection() {
  localStorage.setItem(SELECTION_KEY, JSON.stringify(Array.from(selected)))
  window.dispatchEvent(new StorageEvent('storage', { key: SELECTION_KEY }))
}

function saveAlerts() {
  localStorage.setItem(ALERTS_KEY, JSON.stringify(Array.from(alerts)))
  window.dispatchEvent(new StorageEvent('storage', { key: ALERTS_KEY }))
}

async function refreshAll() {
  for (const provider of providersStore.list) {
    await refreshProvider(provider.id)
  }
}

async function refreshProvider(providerId) {
  const provider = providersStore.get(providerId)
  if (!provider) return

  const fetcher = fetcherRegistry.get(provider.fetcherType)
  if (!fetcher) {
    console.warn(`No fetcher for type: ${provider.fetcherType}`)
    return
  }

  try {
    const models = await fetcher.fetchModels(provider.config)
    const now = new Date().toISOString()
    for (const model of models) {
      model.provider_id = providerId
      model.fetched_at = now
    }
    // Merge with existing (keep selection/alerts)
    const existingMap = new Map(available.filter(m => m.provider_id === providerId).map(m => [m.id, m]))
    for (const model of models) {
      const existing = existingMap.get(model.id)
      if (existing) {
        Object.assign(existing, model)
      } else {
        available.push(model)
      }
    }
    // Remove models no longer returned by API
    available = available.filter(m => m.provider_id !== providerId || models.some(nm => nm.id === m.id))
    saveAvailable()
  } catch (err) {
    console.error(`Failed to fetch models for ${providerId}:`, err)
    throw err
  }
}

function toggleSelection(modelId) {
  if (selected.has(modelId)) {
    selected.delete(modelId)
  } else {
    selected.add(modelId)
  }
  saveSelection()
}

function setAlert(modelId, enabled) {
  if (enabled) {
    alerts.add(modelId)
  } else {
    alerts.delete(modelId)
  }
  saveAlerts()
}

function getByProvider(providerId) {
  return available.filter(m => m.provider_id === providerId)
}

function getActive(providerId) {
  return available.filter(m => m.provider_id === providerId && selected.has(m.id))
}

async function clear() {
  available = []
  selected.clear()
  alerts.clear()
  saveAvailable()
  saveSelection()
  saveAlerts()
}
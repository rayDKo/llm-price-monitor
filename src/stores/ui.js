// UI Store - Theme, config, toasts persistence

const STORAGE_KEY = 'llm-monitor:ui'

let config = {
  refreshInterval: 30, // minutes, 0 = disabled
  theme: 'system' // light, dark, system
}
let dark = false
let loaded = false

export function createUIStore() {
  return {
    get config() { return config },
    get dark() { return dark },
    get loaded() { return loaded },
    load,
    updateConfig,
    setDark,
    reset
  }
}

async function load() {
  if (loaded) return
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      config = { ...config, ...JSON.parse(stored) }
    }
  } catch (e) {
    console.error('Failed to load UI config:', e)
  }
  dark = config.theme === 'dark' || (config.theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  loaded = true
}

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config))
  window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY }))
}

function updateConfig(updates) {
  config = { ...config, ...updates }
  save()
  return config
}

function setDark(value) {
  dark = value
  document.documentElement.classList.toggle('dark', value)
  document.documentElement.setAttribute('data-theme', value ? 'dark' : 'light')
}

function reset() {
  config = { refreshInterval: 30, theme: 'system' }
  save()
  setDark(false)
}
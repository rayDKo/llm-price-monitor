// Scheduler Store - Auto-refresh with visibility API support

let intervalId = null
let refreshing = false
let lastUpdate = null
let lastUpdateText = 'никогда'
let paused = false
let providersStore = null
let modelsStore = null
let pricesStore = null
let uiStore = null

export function createSchedulerStore(providers, models, prices, ui) {
  providersStore = providers
  modelsStore = models
  pricesStore = prices
  uiStore = ui

  return {
    get refreshing() { return refreshing },
    get lastUpdateText() { return lastUpdateText },
    start,
    stop,
    pause,
    resume,
    setInterval,
    runOnce
  }
}

function start(minutes) {
  stop()
  if (minutes > 0) {
    intervalId = setInterval(() => {
      if (!paused && !document.hidden) runOnce()
    }, minutes * 60 * 1000)
    // Run once on start
    setTimeout(() => { if (!paused) runOnce() }, 1000)
  }
}

function stop() {
  if (intervalId) {
    clearInterval(intervalId)
    intervalId = null
  }
}

function pause() {
  paused = true
}

function resume() {
  paused = false
}

function setInterval(minutes) {
  start(minutes)
}

async function runOnce() {
  if (refreshing) return
  refreshing = true
  const startTime = Date.now()

  try {
    await pricesStore.fetchAll()
    lastUpdate = new Date().toISOString()
    updateLastUpdateText()
  } catch (err) {
    console.error('Scheduled refresh failed:', err)
  } finally {
    refreshing = false
  }
}

function updateLastUpdateText() {
  if (!lastUpdate) {
    lastUpdateText = 'никогда'
    return
  }
  const diff = Date.now() - new Date(lastUpdate).getTime()
  if (diff < 60000) lastUpdateText = 'только что'
  else if (diff < 3600000) lastUpdateText = Math.floor(diff / 60000) + ' мин назад'
  else if (diff < 86400000) lastUpdateText = Math.floor(diff / 3600000) + ' ч назад'
  else lastUpdateText = new Date(lastUpdate).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}
// LLM Price Monitor - Main Application Entry Point
// Initializes Alpine stores, sets up global event handlers

import { createProvidersStore } from './stores/providers.js'
import { createModelsStore } from './stores/models.js'
import { createPricesStore } from './stores/prices.js'
import { createUIStore } from './stores/ui.js'
import { createSchedulerStore } from './stores/scheduler.js'
import { initializeDB } from './utils/dexie.js'
import { setStoresRefs } from './stores/prices.js'

// Global stores registry
const stores = {}

// Initialize everything in an async IIFE to avoid top-level await
async function initializeApp() {
  // Initialize IndexedDB
  await initializeDB()

  // Create stores in dependency order
  stores.prices = createPricesStore()
  stores.providers = createProvidersStore(stores.prices)
  stores.models = createModelsStore(stores.providers, stores.prices)
  stores.ui = createUIStore()
  stores.scheduler = createSchedulerStore(stores.providers, stores.models, stores.prices, stores.ui)

  // Make stores globally accessible for inline handlers
  window.stores = stores

  // Connect cross-references
  setStoresRefs(stores.providers, stores.models)
}

// Start initialization immediately
initializeApp()

// Alpine app component
function app() {
  return {
    // Loading state
    loading: true,
    loadingMessage: 'Инициализация...',

    // Active provider
    activeProviderId: null,

    // Model selection modal
    showModelModal: false,
    modelSearch: '',
    showOnlySelected: false,

    // History modal
    showHistoryModal: false,
    historyModel: null,
    historyRange: '30d',
    historyRanges: [
      { value: '7d', label: '7 дней' },
      { value: '30d', label: '30 дней' },
      { value: '90d', label: '90 дней' }
    ],
    historyChart: null,

    // Config modal
    showConfigModal: false,
    config: {
      refreshInterval: 30,
      theme: 'system'
    },
    refreshIntervals: [
      { value: 5, label: '5 мин' },
      { value: 15, label: '15 мин' },
      { value: 30, label: '30 мин' },
      { value: 60, label: '1 час' },
      { value: 0, label: 'Выкл' }
    ],

    // Provider modal
    showProviderModal: false,
    editingProvider: null,
    providerForm: {
      name: '',
      fetcherType: 'openrouter',
      config: {}
    },

    // Toasts
    toasts: [],
    toastId: 0,

    // Computed getters (proxied to stores)
    get providers() { return stores.providers?.list || [] },
    get availableModels() { return stores.models?.available || [] },
    get selectedModelIds() { return stores.models?.selected || new Set() },
    get selectedModelCount() { return (stores.models?.selected || new Set()).size },
    get refreshing() { return stores.scheduler?.refreshing || false },
    get dark() { return stores.ui?.dark || false },
    get lastUpdateText() { return stores.scheduler?.lastUpdateText || 'никогда' },
    get filteredModels() {
      let models = this.availableModels
      if (this.modelSearch) {
        const q = this.modelSearch.toLowerCase()
        models = models.filter(m => m.name.toLowerCase().includes(q) || m.id.toLowerCase().includes(q))
      }
      if (this.showOnlySelected) {
        models = models.filter(m => this.selectedModelIds.has(m.id))
      }
      return models
    },

    async init() {
      this.loadingMessage = 'Загрузка настроек...'
      await stores.ui?.load()
      this.config.refreshInterval = stores.ui?.config?.refreshInterval || 30
      this.config.theme = stores.ui?.config?.theme || 'system'
      this.applyTheme()

      this.loadingMessage = 'Загрузка провайдеров...'
      await stores.providers?.load()

      this.loadingMessage = 'Загрузка моделей...'
      await stores.models?.load()

      this.loadingMessage = 'Запуск планировщика...'
      stores.scheduler?.start(this.config.refreshInterval)

      // Set first provider as active
      if (stores.providers?.list?.length > 0 && !this.activeProviderId) {
        this.activeProviderId = stores.providers.list[0].id
      }

      this.loading = false

      // Listen for storage changes (multi-tab sync)
      window.addEventListener('storage', (e) => {
        if (e.key === 'llm-monitor:providers') stores.providers?.load()
        if (e.key === 'llm-monitor:models') stores.models?.load()
        if (e.key === 'llm-monitor:ui') stores.ui?.load()
      })

      // Visibility change - pause/resume scheduler
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) stores.scheduler?.pause()
        else stores.scheduler?.resume()
      })

      // Request notification permission
      if (Notification.permission === 'default') {
        Notification.requestPermission()
      }
    },

    // Theme
    applyTheme() {
      const theme = this.config.theme
      const isDark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
      stores.ui?.setDark(isDark)
      document.documentElement.classList.toggle('dark', isDark)
      document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light')
    },
    toggleTheme() {
      const themes = ['light', 'dark', 'system']
      const idx = themes.indexOf(this.config.theme)
      this.config.theme = themes[(idx + 1) % 3]
      stores.ui?.updateConfig({ theme: this.config.theme })
      this.applyTheme()
    },

    // Providers
    setActiveProvider(id) {
      this.activeProviderId = id
    },
    getModelCount(providerId) {
      return stores.models?.getByProvider(providerId)?.length || 0
    },
    openProviderModal(provider = null) {
      this.editingProvider = provider
      if (provider) {
        this.providerForm = {
          name: provider.name,
          fetcherType: provider.fetcherType,
          config: { ...provider.config }
        }
      } else {
        this.providerForm = { name: '', fetcherType: 'openrouter', config: {} }
      }
      this.showProviderModal = true
    },
    closeProviderModal() {
      this.showProviderModal = false
      this.editingProvider = null
      this.providerForm = { name: '', fetcherType: 'openrouter', config: {} }
    },
    onFetcherTypeChange() {
      this.providerForm.config = {}
    },
    async saveProvider() {
      if (this.editingProvider) {
        await stores.providers?.update(this.editingProvider.id, this.providerForm)
        this.showToast('Провайдер обновлён', 'success')
      } else {
        await stores.providers?.add(this.providerForm)
        this.showToast('Провайдер добавлен', 'success')
      }
      this.closeProviderModal()
    },
    async deleteProvider(id) {
      if (!confirm('Удалить провайдера и все его модели?')) return
      await stores.providers?.remove(id)
      if (this.activeProviderId === id) {
        this.activeProviderId = stores.providers?.list?.[0]?.id || null
      }
      this.showToast('Провайдер удалён', 'success')
    },

    // Models
    openModelModal() {
      this.modelSearch = ''
      this.showOnlySelected = false
      this.showModelModal = true
    },
    closeModelModal() {
      this.showModelModal = false
      this.modelSearch = ''
    },
    isModelSelected(modelId) {
      return this.selectedModelIds.has(modelId)
    },
    toggleModelSelection(modelId) {
      stores.models?.toggleSelection(modelId)
    },
    getActiveModels() {
      return stores.models?.getActive(this.activeProviderId) || []
    },

    // Price History
    async showPriceHistory(model) {
      this.historyModel = model
      this.historyRange = '30d'
      this.showHistoryModal = true
      await this.renderHistoryChart()
    },
    closeHistoryModal() {
      this.showHistoryModal = false
      this.historyModel = null
      if (this.historyChart) {
        this.historyChart.destroy()
        this.historyChart = null
      }
    },
    setHistoryRange(range) {
      this.historyRange = range
      this.renderHistoryChart()
    },
    async renderHistoryChart() {
      if (!this.historyModel) return
      const history = await stores.prices?.getHistory(this.historyModel.id, this.historyRange)
      const ctx = document.getElementById('historyChart')?.getContext('2d')
      if (!ctx) return

      if (this.historyChart) this.historyChart.destroy()

      const labels = history.map(h => new Date(h.timestamp).toLocaleDateString('ru-RU', { month: 'short', day: 'numeric' }))
      const inputData = history.map(h => h.pricing?.input || null)
      const outputData = history.map(h => h.pricing?.output || null)

      this.historyChart = new Chart(ctx, {
        type: 'line',
        data: {
          labels,
          datasets: [
            {
              label: 'Вход $/1M',
              data: inputData,
              borderColor: 'rgb(59, 130, 246)',
              backgroundColor: 'rgba(59, 130, 246, 0.1)',
              tension: 0.3,
              fill: true,
              pointRadius: 3
            },
            {
              label: 'Выход $/1M',
              data: outputData,
              borderColor: 'rgb(16, 185, 129)',
              backgroundColor: 'rgba(16, 185, 129, 0.1)',
              tension: 0.3,
              fill: true,
              pointRadius: 3
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          plugins: {
            legend: { position: 'top' },
            tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: $${ctx.raw?.toFixed(4) || '—'}` } }
          },
          scales: {
            y: { beginAtZero: false, title: { display: true, text: '$ за 1M токенов' } }
          }
        }
      })
    },

    // Alerts
    async toggleModelAlert(model) {
      const enabled = !model.alertEnabled
      await stores.models?.setAlert(model.id, enabled)
      this.showToast(enabled ? 'Алерт включён' : 'Алерт выключен', 'success')
    },

    // Refresh
    async refreshAll() {
      await stores.scheduler?.runOnce()
      this.showToast('Цены обновлены', 'success')
    },

    // Export
    async exportCSV() {
      const data = this.getActiveModels().map(m => ({
        Provider: stores.providers?.get(m.provider_id)?.name || m.provider_id,
        Model: m.name,
        'Model ID': m.id,
        'Input $/1M': m.pricing?.input || '',
        'Output $/1M': m.pricing?.output || '',
        Context: m.context_length || '',
        Updated: m.updated_at ? new Date(m.updated_at).toLocaleString('ru-RU') : '',
        Source: m.source || ''
      }))
      this.downloadFile('llm-prices-' + new Date().toISOString().split('T')[0] + '.csv',
        this.toCSV(data), 'text/csv')
    },
    async exportJSON() {
      const data = {
        exported: new Date().toISOString(),
        providers: stores.providers?.list || [],
        models: this.getActiveModels(),
        prices: await stores.prices?.getAll()
      }
      this.downloadFile('llm-prices-' + new Date().toISOString().split('T')[0] + '.json',
        JSON.stringify(data, null, 2), 'application/json')
    },
    toCSV(arr) {
      if (!arr.length) return ''
      const headers = Object.keys(arr[0])
      const rows = arr.map(obj => headers.map(h => {
        const val = obj[h]
        return typeof val === 'string' && (val.includes(',') || val.includes('"') || val.includes('\n'))
          ? '"' + val.replace(/"/g, '""') + '"'
          : val
      }).join(','))
      return [headers.join(','), ...rows].join('\n')
    },
    downloadFile(filename, content, mime) {
      const blob = new Blob([content], { type: mime })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      a.click()
      URL.revokeObjectURL(url)
    },

    // Config modal
    openConfigModal() {
      this.config.refreshInterval = stores.ui?.config?.refreshInterval || 30
      this.config.theme = stores.ui?.config?.theme || 'system'
      this.showConfigModal = true
    },
    closeConfigModal() {
      this.showConfigModal = false
    },

    // Data management
    exportConfig() {
      const config = {
        version: 1,
        exported: new Date().toISOString(),
        providers: stores.providers?.list || [],
        selectedModels: Array.from(stores.models?.selected || []),
        ui: stores.ui?.config || {}
      }
      this.downloadFile('llm-monitor-config-' + new Date().toISOString().split('T')[0] + '.json',
        JSON.stringify(config, null, 2), 'application/json')
    },
    importConfig() {
      document.getElementById('config-import')?.click()
    },
    async handleConfigImport(e) {
      const file = e.target.files[0]
      if (!file) return
      try {
        const text = await file.text()
        const config = JSON.parse(text)
        if (config.providers) {
          for (const p of config.providers) {
            await stores.providers?.add(p)
          }
        }
        if (config.selectedModels) {
          stores.models.selected = new Set(config.selectedModels)
          await stores.models?.saveSelection()
        }
        if (config.ui) {
          await stores.ui?.updateConfig(config.ui)
          this.config.refreshInterval = stores.ui?.config?.refreshInterval || 30
          this.config.theme = stores.ui?.config?.theme || 'system'
          this.applyTheme()
          stores.scheduler?.setInterval(this.config.refreshInterval)
        }
        this.showToast('Конфигурация импортирована', 'success')
      } catch (err) {
        this.showToast('Ошибка импорта: ' + err.message, 'error')
      }
      e.target.value = ''
    },
    async clearAllData() {
      if (!confirm('Точно удалить ВСЕ данные? Это необратимо.')) return
      if (!confirm('Последний шанс: уверены?')) return
      await stores.providers?.clear()
      await stores.models?.clear()
      await stores.prices?.clear()
      await stores.ui?.reset()
      this.activeProviderId = null
      this.config.refreshInterval = 30
      this.config.theme = 'system'
      this.applyTheme()
      stores.scheduler?.setInterval(30)
      this.showToast('Все данные очищены', 'success')
    },

    // Utils
    formatPrice(price) {
      if (price === undefined || price === null || price === '') return '—'
      const num = Number(price)
      if (isNaN(num)) return '—'
      if (num === 0) return 'Бесплатно'
      if (num < 0.0001) return num.toFixed(6)
      if (num < 0.001) return num.toFixed(5)
      if (num < 0.01) return num.toFixed(4)
      if (num < 1) return num.toFixed(3)
      return num.toFixed(2)
    },
    formatNumber(num) {
      if (!num) return '—'
      return (num / 1000).toFixed(0)
    },
    formatDate(iso) {
      const d = new Date(iso)
      const now = new Date()
      const diff = now - d
      if (diff < 60000) return 'только что'
      if (diff < 3600000) return Math.floor(diff / 60000) + ' мин назад'
      if (diff < 86400000) return Math.floor(diff / 3600000) + ' ч назад'
      return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
    },

    // Toasts
    showToast(message, type = 'info') {
      const id = ++this.toastId
      this.toasts.push({ id, message, type })
      setTimeout(() => this.removeToast(id), 5000)
    },
    removeToast(id) {
      const idx = this.toasts.findIndex(t => t.id === id)
      if (idx !== -1) this.toasts.splice(idx, 1)
    }
  }
}

// Make app globally available for Alpine
window.app = app
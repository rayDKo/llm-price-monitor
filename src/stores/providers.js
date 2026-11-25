// Providers Store - Manages provider configurations
// Persists to localStorage

export function createProvidersStore(pricesStore) {
  const STORAGE_KEY = 'llm-monitor:providers'

  // Default providers (OpenRouter + Ollama)
  const DEFAULT_PROVIDERS = [
    {
      id: 'openrouter',
      name: 'OpenRouter',
      fetcherType: 'openrouter',
      config: {},
      builtin: true
    },
    {
      id: 'ollama',
      name: 'Ollama (Local)',
      fetcherType: 'ollama',
      config: { baseUrl: 'http://localhost:11434' },
      builtin: true
    }
  ]

  let list = []
  let loaded = false

  async function load() {
    if (loaded) return
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        list = JSON.parse(stored)
      } else {
        list = [...DEFAULT_PROVIDERS]
        await save()
      }
    } catch (e) {
      console.error('Failed to load providers:', e)
      list = [...DEFAULT_PROVIDERS]
    }
    // Ensure builtins exist
    for (const def of DEFAULT_PROVIDERS) {
      if (!list.find(p => p.id === def.id)) {
        list.unshift(def)
      }
    }
    loaded = true
  }

  function save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
    window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY }))
  }

  function generateId(name) {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
  }

  async function add(form) {
    await load()
    const id = generateId(form.name)
    if (list.find(p => p.id === id)) {
      throw new Error('Провайдер с таким именем уже существует')
    }
    const provider = {
      id,
      name: form.name,
      fetcherType: form.fetcherType,
      config: form.config || {},
      createdAt: new Date().toISOString()
    }
    list.unshift(provider)
    await save()
    return provider
  }

  async function update(id, form) {
    await load()
    const idx = list.findIndex(p => p.id === id)
    if (idx === -1) throw new Error('Провайдер не найден')
    if (list[idx].builtin) throw new Error('Нельзя редактировать встроенные провайдеры')
    list[idx] = { ...list[idx], name: form.name, fetcherType: form.fetcherType, config: form.config || {}, updatedAt: new Date().toISOString() }
    await save()
    return list[idx]
  }

  async function remove(id) {
    await load()
    const idx = list.findIndex(p => p.id === id)
    if (idx === -1) throw new Error('Провайдер не найден')
    if (list[idx].builtin) throw new Error('Нельзя удалить встроенные провайдеры')
    list.splice(idx, 1)
    await save()
    // Clean up prices for this provider
    await pricesStore.clearByProvider(id)
  }

  async function clear() {
    list = [...DEFAULT_PROVIDERS]
    await save()
  }

  function get(id) {
    return list.find(p => p.id === id)
  }

  return {
    get list() { return list },
    get loaded() { return loaded },
    load,
    add,
    update,
    remove,
    clear,
    get
  }
}
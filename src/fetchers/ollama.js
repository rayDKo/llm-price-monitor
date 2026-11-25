// Ollama Fetcher - Fetches local models from Ollama API
// No pricing (free local inference), but tracks available models

export const ollamaFetcher = {
  async fetchModels(config) {
    const baseUrl = config?.baseUrl || 'http://localhost:11434'
    const response = await fetch(`${baseUrl}/api/tags`)
    if (!response.ok) throw new Error(`Ollama API: ${response.status}`)
    const data = await response.json()

    return (data.models || []).map(model => ({
      id: model.name,
      name: model.name,
      context_length: model.details?.parameter_size ? parseInt(model.details.parameter_size) * 1000 : undefined,
      pricing: { input: 0, output: 0 }, // Free local
      details: model.details
    }))
  },

  async fetchPrices(config, models) {
    // Ollama models are free, just verify they're still available
    const baseUrl = config?.baseUrl || 'http://localhost:11434'
    const response = await fetch(`${baseUrl}/api/tags`)
    if (!response.ok) throw new Error(`Ollama API: ${response.status}`)
    const data = await response.json()

    const availableModels = new Set((data.models || []).map(m => m.name))
    const results = []

    for (const model of models) {
      if (availableModels.has(model.id)) {
        results.push({
          modelId: model.id,
          pricing: { input: 0, output: 0 },
          source: 'api'
        })
      }
    }

    return results
  }
}
// OpenRouter Fetcher - Fetches models and pricing from OpenRouter API
// No API key required for public endpoints

export const openRouterFetcher = {
  async fetchModels(config) {
    const response = await fetch('https://openrouter.ai/api/v1/models')
    if (!response.ok) throw new Error(`OpenRouter API: ${response.status}`)
    const data = await response.json()

    return data.data.map(model => ({
      id: model.id,
      name: model.name || model.id,
      context_length: model.context_length,
      pricing: model.pricing ? {
        input: parseFloat(model.pricing.prompt) * 1_000_000 || 0,
        output: parseFloat(model.pricing.completion) * 1_000_000 || 0
      } : undefined,
      description: model.description
    }))
  },

  async fetchPrices(config, models) {
    // OpenRouter includes pricing in models endpoint, but we can re-fetch for updates
    const response = await fetch('https://openrouter.ai/api/v1/models')
    if (!response.ok) throw new Error(`OpenRouter API: ${response.status}`)
    const data = await response.json()

    const modelMap = new Map(data.data.map(m => [m.id, m]))
    const results = []

    for (const model of models) {
      const apiModel = modelMap.get(model.id)
      if (apiModel?.pricing) {
        results.push({
          modelId: model.id,
          pricing: {
            input: parseFloat(apiModel.pricing.prompt) * 1_000_000 || 0,
            output: parseFloat(apiModel.pricing.completion) * 1_000_000 || 0
          },
          source: 'api'
        })
      }
    }

    return results
  }
}
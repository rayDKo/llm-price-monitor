// Generic HTML Fetcher - Scrapes pricing from any webpage using CSS selectors
// Configured per-provider via provider.config

export const genericFetcher = {
  async fetchModels(config) {
    if (!config?.url || !config?.rowSelector) {
      throw new Error('Generic fetcher requires url and rowSelector in config')
    }

    const html = await fetchHtml(config.url)
    const doc = new DOMParser().parseFromString(html, 'text/html')
    const rows = doc.querySelectorAll(config.rowSelector)

    const models = []
    for (const row of rows) {
      const name = extractText(row, config.nameSelector)
      const inputPrice = parsePrice(extractText(row, config.inputPriceSelector))
      const outputPrice = parsePrice(extractText(row, config.outputPriceSelector))
      const context = config.contextSelector ? extractText(row, config.contextSelector) : null

      if (name) {
        models.push({
          id: slugify(name),
          name,
          context_length: context ? parseContext(context) : undefined,
          pricing: (inputPrice !== null || outputPrice !== null) ? {
            input: inputPrice || 0,
            output: outputPrice || 0
          } : undefined
        })
      }
    }

    return models
  },

  async fetchPrices(config, models) {
    if (!config?.url || !config?.rowSelector) {
      throw new Error('Generic fetcher requires url and rowSelector in config')
    }

    const html = await fetchHtml(config.url)
    const doc = new DOMParser().parseFromString(html, 'text/html')
    const rows = doc.querySelectorAll(config.rowSelector)

    const results = []
    const modelMap = new Map(models.map(m => [m.id, m]))

    for (const row of rows) {
      const name = extractText(row, config.nameSelector)
      if (!name) continue

      const modelId = slugify(name)
      if (!modelMap.has(modelId)) continue

      const inputPrice = parsePrice(extractText(row, config.inputPriceSelector))
      const outputPrice = parsePrice(extractText(row, config.outputPriceSelector))

      if (inputPrice !== null || outputPrice !== null) {
        results.push({
          modelId,
          pricing: {
            input: inputPrice || 0,
            output: outputPrice || 0
          },
          source: 'scraped'
        })
      }
    }

    return results
  }
}

async function fetchHtml(url) {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; LLM-Price-Monitor/1.0)'
    }
  })
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`)
  return response.text()
}

function extractText(parent, selector) {
  if (!selector) return null
  const el = parent.querySelector(selector)
  return el ? el.textContent.trim() : null
}

function parsePrice(text) {
  if (!text) return null
  // Extract first number from text (handles $0.001, 0.001/1K, etc.)
  const match = text.match(/[\d,]+\.?\d*/)
  if (!match) return null
  return parseFloat(match[0].replace(/,/g, ''))
}

function parseContext(text) {
  if (!text) return undefined
  const match = text.match(/(\d+(?:[\.,]\d+)?)\s*[kK]/)
  if (match) return parseFloat(match[1].replace(',', '.')) * 1000
  const numMatch = text.match(/(\d+)/)
  if (numMatch) return parseInt(numMatch[1])
  return undefined
}

function slugify(text) {
  return text.toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .substring(0, 100)
}
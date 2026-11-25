// Fetcher Registry - Maps fetcher types to implementations

import { openRouterFetcher } from './openrouter.js'
import { ollamaFetcher } from './ollama.js'
import { genericFetcher } from './generic.js'

export const fetcherRegistry = new Map([
  ['openrouter', openRouterFetcher],
  ['ollama', ollamaFetcher],
  ['generic', genericFetcher]
])

export function registerFetcher(type, fetcher) {
  fetcherRegistry.set(type, fetcher)
}

export function getFetcher(type) {
  return fetcherRegistry.get(type)
}

export function getAvailableFetchers() {
  return Array.from(fetcherRegistry.keys())
}
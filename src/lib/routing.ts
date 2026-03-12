import type { PresentationNode } from '../data/scene'

export function normalizePhrase(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function findPhrasePositions(haystack: string, phrase: string) {
  const normalizedHaystack = normalizePhrase(haystack)
  const normalizedPhrase = normalizePhrase(phrase)

  if (!normalizedHaystack || !normalizedPhrase) {
    return []
  }

  const haystackWords = normalizedHaystack.split(' ')
  const phraseWords = normalizedPhrase.split(' ')
  const positions: number[] = []

  for (let index = 0; index <= haystackWords.length - phraseWords.length; index += 1) {
    const isMatch = phraseWords.every(
      (word, wordIndex) => haystackWords[index + wordIndex] === word,
    )

    if (isMatch) {
      positions.push(index)
    }
  }

  return positions
}

export function findNodeByIntent(nodes: PresentationNode[], intent: string) {
  const normalizedIntent = normalizePhrase(intent)

  if (!normalizedIntent) {
    return null
  }

  let bestMatch:
    | {
        keyword: string
        node: PresentationNode
        score: number
      }
    | null = null

  for (const node of nodes) {
    for (const keyword of node.keywords) {
      const normalizedKeyword = normalizePhrase(keyword)

      if (!normalizedKeyword || !normalizedIntent.includes(normalizedKeyword)) {
        continue
      }

      const score = normalizedKeyword.length

      if (!bestMatch || score > bestMatch.score) {
        bestMatch = {
          keyword,
          node,
          score,
        }
      }
    }
  }

  return bestMatch
}

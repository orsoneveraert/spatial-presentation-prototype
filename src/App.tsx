import { startTransition, useDeferredValue, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import './App.css'
import { PresentationStage } from './components/PresentationStage'
import {
  frenchTriggerWords,
  presentationNodes,
  speechCommandHints,
} from './data/scene'
import { useWhisperTriggerRouter } from './hooks/useWhisperTriggerRouter'
import type { PresentationNode } from './data/scene'
import { findNodeByIntent, normalizePhrase } from './lib/routing'

const overviewKeywords = [
  'overview',
  'zoom out',
  'reset',
  'center',
  'ensemble',
  'vue d ensemble',
  'vue generale',
  'retour',
  'centre',
  'dezoom',
  'de zoom',
  'dezoome',
  'va en arriere',
  'en arriere',
  'prend du recul',
  'prends du recul',
  'prendre du recul',
  'recul',
]

const nextPageKeywords = [
  'suivante',
  'suivant',
  'prochaine',
  'prochain',
  'apres',
  'après',
] as const

const previousPageKeywords = [
  'arriere',
  'arrière',
  'precedente',
  'précédente',
  'precedent',
  'précédent',
] as const

const pageNumberAliases = [
  ['01', ['1', '01', 'un', 'une', 'premier', 'premiere']],
  ['02', ['2', '02', 'deux', 'second', 'seconde']],
  ['03', ['3', '03', 'trois']],
  ['04', ['4', '04', 'quatre']],
  ['05', ['5', '05', 'cinq']],
  ['06', ['6', '06', 'six']],
  ['07', ['7', '07', 'sept']],
  ['08', ['8', '08', 'huit']],
  ['09', ['9', '09', 'neuf']],
  ['10', ['10', 'dix']],
  ['11', ['11', 'onze']],
  ['12', ['12', 'douze']],
  ['13', ['13', 'treize']],
  ['14', ['14', 'quatorze']],
  ['15', ['15', 'quinze']],
  ['16', ['16', 'seize']],
  ['17', ['17', 'dix sept', 'dix-sept']],
  ['18', ['18', 'dix huit', 'dix-huit']],
] as const

const pagePhraseToPageNumber = new Map(
  pageNumberAliases.flatMap(([pageNumber, aliases]) =>
    aliases.map((alias) => [normalizePhrase(alias).replace(/-/g, ' '), pageNumber] as const),
  ),
)

const pageTokenFillers = new Set(['la', 'le', 'les', 'numero', 'num', 'n', 'no', 'de', 'du'])

const voiceCommandTargets: PresentationNode[] = [
  {
    id: 'command-next-page',
    eyebrow: '',
    title: 'Page Suivante',
    subtitle: '',
    keywords: [...nextPageKeywords],
    kind: 'board',
    pageNumber: '',
    x: -9999,
    y: -9999,
  },
  {
    id: 'command-previous-page',
    eyebrow: '',
    title: 'Page Arriere',
    subtitle: '',
    keywords: [...previousPageKeywords],
    kind: 'board',
    pageNumber: '',
    x: -9999,
    y: -9999,
  },
]

function App() {
  const [activeNodeId, setActiveNodeId] = useState<string | null>(null)
  const [manualCommand, setManualCommand] = useState('')
  const [lastIntent, setLastIntent] = useState('Dites une forme de "aller", "regarder" ou "page", puis un concept comme "page de garde", "sommaire", "pomodoro" ou "page 18".')
  const [isPanelOpen, setIsPanelOpen] = useState(false)
  const lastDirectCommandRef = useRef<{ signature: string; timestamp: number } | null>(null)
  const voiceTargets = useMemo(() => [...presentationNodes, ...voiceCommandTargets], [])

  const commitSelection = (nextNodeId: string | null, reason: string) => {
    startTransition(() => {
      setActiveNodeId(nextNodeId)
      setLastIntent(reason)
    })
  }

  const moveSelection = (direction: 'next' | 'previous', reason: string) => {
    const currentIndex = activeNodeId
      ? presentationNodes.findIndex((node) => node.id === activeNodeId)
      : -1
    const fallbackIndex = direction === 'next' ? 0 : presentationNodes.length - 1
    const lastIndex = presentationNodes.length - 1
    const rawNextIndex =
      currentIndex === -1
        ? fallbackIndex
        : currentIndex + (direction === 'next' ? 1 : -1)
    const nextIndex = Math.max(0, Math.min(lastIndex, rawNextIndex))
    const nextNode = presentationNodes[nextIndex]

    if (!nextNode) {
      return
    }

    if (currentIndex !== -1 && nextIndex === currentIndex) {
      setLastIntent(direction === 'next' ? 'Derniere page atteinte.' : 'Premiere page atteinte.')
      return
    }

    commitSelection(nextNode.id, reason)
  }

  const matchesOneOf = (intent: string, keywords: readonly string[]) =>
    keywords.some((keyword) => intent.includes(normalizePhrase(keyword)))

  const findNodeByPageReference = (intent: string) => {
    const words = intent.replace(/-/g, ' ').split(' ').filter(Boolean)

    for (let index = 0; index < words.length; index += 1) {
      if (words[index] !== 'page') {
        continue
      }

      const referenceWords: string[] = []

      for (let cursor = index + 1; cursor < words.length && referenceWords.length < 4; cursor += 1) {
        const token = words[cursor]

        if (pageTokenFillers.has(token)) {
          continue
        }

        referenceWords.push(token)
      }

      for (let length = Math.min(referenceWords.length, 4); length >= 1; length -= 1) {
        const pageNumber = pagePhraseToPageNumber.get(referenceWords.slice(0, length).join(' '))

        if (!pageNumber) {
          continue
        }

        return presentationNodes.find((node) => node.pageNumber === pageNumber) ?? null
      }
    }

    return null
  }

  const shouldSkipDirectCommand = (signature: string) => {
    const now = Date.now()
    const lastDirectCommand = lastDirectCommandRef.current

    if (
      lastDirectCommand &&
      lastDirectCommand.signature === signature &&
      now - lastDirectCommand.timestamp < 4000
    ) {
      return true
    }

    lastDirectCommandRef.current = { signature, timestamp: now }
    return false
  }

  const runIntent = (rawIntent: string) => {
    const normalizedIntent = normalizePhrase(rawIntent)

    if (!normalizedIntent) {
      return
    }

    if (matchesOneOf(normalizedIntent, overviewKeywords)) {
      commitSelection(null, `Commande vocale: ${normalizedIntent}`)
      return
    }

    if (normalizedIntent.includes('page') && matchesOneOf(normalizedIntent, nextPageKeywords)) {
      moveSelection('next', `Commande vocale: ${normalizedIntent}`)
      return
    }

    if (normalizedIntent.includes('page') && matchesOneOf(normalizedIntent, previousPageKeywords)) {
      moveSelection('previous', `Commande vocale: ${normalizedIntent}`)
      return
    }

    const pageNode = findNodeByPageReference(normalizedIntent)

    if (pageNode) {
      commitSelection(pageNode.id, `Page ${pageNode.pageNumber} reconnue.`)
      return
    }

    const match = findNodeByIntent(presentationNodes, normalizedIntent)

    if (match) {
      commitSelection(match.node.id, `Direction reconnue: ${match.keyword}.`)
      return
    }

    setLastIntent(`Aucune page ne correspond a: ${normalizedIntent}`)
  }

  const voice = useWhisperTriggerRouter({
    armingWords: [...frenchTriggerWords],
    nodes: voiceTargets,
    onMatch: ({ keyword, node }) => {
      if (node.id === 'command-next-page') {
        moveSelection('next', `Le moteur a entendu une gachette, puis ${keyword}.`)
        return
      }

      if (node.id === 'command-previous-page') {
        moveSelection('previous', `Le moteur a entendu une gachette, puis ${keyword}.`)
        return
      }

      commitSelection(
        node.id,
        `Le moteur a entendu une gachette, puis ${keyword}.`,
      )
    },
  })

  const deferredTranscript = useDeferredValue(voice.windowTranscript || voice.transcript)

  useEffect(() => {
    if (!voice.isListening) {
      return
    }

    const normalizedTranscript = normalizePhrase(voice.windowTranscript || voice.transcript)

    if (!normalizedTranscript) {
      return
    }

    const pageNode = findNodeByPageReference(normalizedTranscript)

    if (pageNode) {
      const signature = `page:${pageNode.pageNumber}:${normalizedTranscript}`

      if (!shouldSkipDirectCommand(signature)) {
        commitSelection(pageNode.id, `Le moteur a entendu la page ${pageNode.pageNumber}.`)
      }

      return
    }

    if (matchesOneOf(normalizedTranscript, overviewKeywords)) {
      const signature = `overview:${normalizedTranscript}`

      if (!shouldSkipDirectCommand(signature)) {
        commitSelection(null, `Commande vocale: ${normalizedTranscript}`)
      }
    }
  }, [voice.isListening, voice.transcript, voice.windowTranscript])

  const handleManualSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    runIntent(manualCommand)
    setManualCommand('')
  }

  return (
    <div className="app-shell">
      <main className="workspace">
        <PresentationStage
          activeNodeId={activeNodeId}
          nodes={presentationNodes}
          onNodeSelect={(nodeId) =>
            commitSelection(nodeId, `Cadre ${presentationNodes.find((node) => node.id === nodeId)?.title ?? 'actif'}.`)
          }
          onOverview={() => commitSelection(null, 'Retour a l ensemble.')}
        />
      </main>

      <button
        aria-expanded={isPanelOpen}
        aria-label={isPanelOpen ? 'Hide settings' : 'Show settings'}
        className={`menu-toggle ${isPanelOpen ? 'menu-toggle--open' : ''}`}
        onClick={() => setIsPanelOpen((open) => !open)}
        type="button"
      >
        <span />
        <span />
        <span />
      </button>

      <aside className={`hud hud--panel ${isPanelOpen ? 'hud--panel-open' : ''}`}>
        <section className="panel-section">
          <p className="eyebrow">Speech Router</p>
          <div className="voice-status">
            <button
              className="control-button"
              onClick={() => {
                if (voice.isListening) {
                  voice.stop()
                  return
                }

                void voice.start()
              }}
              type="button"
              disabled={!voice.supported}
            >
              {voice.isListening ? 'Arreter la voix' : 'Demarrer la voix'}
            </button>
            <span className={`status-chip status-chip--${voice.supported ? (voice.isListening ? 'live' : 'idle') : 'off'}`}>
              {voice.supported ? (voice.isListening ? (voice.triggerState === 'armed' ? 'Armee' : 'Veille') : 'Pret') : 'Indisponible'}
            </span>
            <span className={`status-chip ${voice.isServiceReady ? 'status-chip--live' : ''}`}>
              {voice.isServiceReady ? 'Moteur en ligne' : 'Moteur hors ligne'}
            </span>
          </div>
          <p className="panel-copy">{voice.error ?? lastIntent}</p>
          <p className="panel-transcript">{deferredTranscript || 'Aucune transcription pour le moment.'}</p>
        </section>

        <section className="panel-section">
          <p className="eyebrow">Gachette</p>
          <p className="panel-copy">
            Une seule gachette: toutes les formes de <em>aller</em>, de <em>regarder</em>, plus le mot <em>page</em>. Des qu&apos;une gachette est entendue, la direction doit arriver dans les 10 secondes.
          </p>
          <p className="panel-copy panel-copy--dense">
            {frenchTriggerWords.join(' / ')}
          </p>
        </section>

        <section className="panel-section">
          <p className="eyebrow">Direction</p>
          <p className="panel-copy">
            La gachette expire apres 10 secondes si aucun mot directeur n&apos;arrive. Vous pouvez dire un concept de page comme <em>page de garde</em>, <em>pomodoro</em>, <em>boite a outils</em>, <em>resonance stochastique</em>, ou bien <em>page suivante</em>, <em>page arriere</em>, <em>va en arriere</em>, <em>de-zoom</em>, <em>prend du recul</em> et <em>va a la page 18</em>.
          </p>
        </section>

        <section className="panel-section">
          <p className="eyebrow">Saisie Manuelle</p>
          <form className="command-form" onSubmit={handleManualSubmit}>
            <input
              aria-label="Type a command"
              className="command-input"
              onChange={(event) => setManualCommand(event.target.value)}
              placeholder='Essayez "page 18", "page suivante", "de-zoom" ou "regarde page de garde"'
              value={manualCommand}
            />
            <button className="control-button" type="submit">
              Aller
            </button>
          </form>
        </section>

        <section className="panel-section">
          <p className="eyebrow">Concepts De Pages</p>
          <div className="keyword-grid">
            {speechCommandHints.map((hint) => (
              <button
                key={hint.nodeId}
                className={`keyword-card ${activeNodeId === hint.nodeId ? 'keyword-card--active' : ''}`}
                onClick={() => commitSelection(hint.nodeId, `Cadre ${hint.label} active depuis le panneau.`)}
                type="button"
              >
                <span>{hint.label}</span>
                <small>{hint.keywords.join(' / ')}</small>
              </button>
            ))}
            <button className="keyword-card" onClick={() => commitSelection(null, 'Retour a l ensemble.')} type="button">
              <span>Ensemble</span>
              <small>{overviewKeywords.join(' / ')}</small>
            </button>
            <button className="keyword-card" onClick={() => moveSelection('next', 'Page suivante depuis le panneau.')} type="button">
              <span>Page Suivante</span>
              <small>{nextPageKeywords.join(' / ')}</small>
            </button>
            <button className="keyword-card" onClick={() => moveSelection('previous', 'Page arriere depuis le panneau.')} type="button">
              <span>Page Arriere</span>
              <small>{previousPageKeywords.join(' / ')}</small>
            </button>
          </div>
        </section>
      </aside>
    </div>
  )
}

export default App

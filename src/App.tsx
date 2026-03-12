import { startTransition, useDeferredValue, useState, type FormEvent } from 'react'
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
  'dezoome',
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
  const [lastIntent, setLastIntent] = useState('Dites une forme de "aller", "regarder" ou "page", puis un concept de temps ou "suivante / arriere".')
  const [isPanelOpen, setIsPanelOpen] = useState(false)
  const voiceTargets = [...presentationNodes, ...voiceCommandTargets]

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

  const runIntent = (rawIntent: string) => {
    const normalizedIntent = normalizePhrase(rawIntent)

    if (!normalizedIntent) {
      return
    }

    if (overviewKeywords.some((keyword) => normalizedIntent.includes(keyword))) {
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
        moveSelection('next', `WhisperX a entendu une gachette, puis ${keyword}.`)
        return
      }

      if (node.id === 'command-previous-page') {
        moveSelection('previous', `WhisperX a entendu une gachette, puis ${keyword}.`)
        return
      }

      commitSelection(
        node.id,
        `WhisperX a entendu une gachette, puis ${keyword}.`,
      )
    },
  })

  const deferredTranscript = useDeferredValue(voice.windowTranscript || voice.transcript)

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
          <p className="eyebrow">WhisperX Router</p>
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
              {voice.isServiceReady ? 'WhisperX en ligne' : 'WhisperX hors ligne'}
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
            La gachette expire apres 10 secondes si aucun mot directeur n&apos;arrive. Vous pouvez dire un concept de temps, ou bien <em>page suivante</em> / <em>page arriere</em>.
          </p>
        </section>

        <section className="panel-section">
          <p className="eyebrow">Saisie Manuelle</p>
          <form className="command-form" onSubmit={handleManualSubmit}>
            <input
              aria-label="Type a command"
              className="command-input"
              onChange={(event) => setManualCommand(event.target.value)}
              placeholder='Essayez "page suivante", "regarde aube" ou "ensemble"'
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

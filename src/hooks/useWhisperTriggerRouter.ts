import { useEffect, useMemo, useRef, useState } from 'react'
import { apiUrl } from '../config/runtime'
import type { PresentationNode } from '../data/scene'
import { findPhrasePositions, normalizePhrase } from '../lib/routing'

type TriggerState = 'idle' | 'armed'

type VoiceEvent =
  | {
      kind: 'arming'
      keyword: string
      orderIndex: number
      timestamp: number
    }
  | {
      kind: 'target'
      keyword: string
      node: PresentationNode
      orderIndex: number
      timestamp: number
    }

type TranscriptChunk = {
  text: string
  timestamp: number
}

type WhisperTranscriptionResponse = {
  language?: string | null
  transcript: string
}

type VoiceMatch = {
  keyword: string
  node: PresentationNode
  transcriptWindow: string
}

type UseWhisperTriggerRouterOptions = {
  armingWords: string[]
  chunkMs?: number
  nodes: PresentationNode[]
  onMatch: (match: VoiceMatch) => void
  windowMs?: number
}

type UseWhisperTriggerRouterState = {
  error: string | null
  isListening: boolean
  isServiceReady: boolean
  start: () => Promise<void>
  stop: () => void
  supported: boolean
  transcript: string
  triggerState: TriggerState
  windowTranscript: string
}

function isMediaCaptureSupported() {
  return (
    typeof window !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    Boolean(navigator.mediaDevices?.getUserMedia) &&
    typeof MediaRecorder !== 'undefined'
  )
}

function chooseMimeType() {
  if (typeof MediaRecorder === 'undefined') {
    return undefined
  }

  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
  ]

  return candidates.find((candidate) => MediaRecorder.isTypeSupported(candidate))
}

function deriveTriggerState(
  events: VoiceEvent[],
  armingWords: string[],
) {
  const sorted = [...events].sort((left, right) => left.orderIndex - right.orderIndex)
  const normalizedArming = new Set(armingWords.map((word) => normalizePhrase(word)))
  const armingEvent = sorted.find(
    (event) =>
      event.kind === 'arming' &&
      normalizedArming.has(event.keyword),
  )

  if (!armingEvent) {
    return 'idle'
  }

  return 'armed'
}

function evaluateTriggerWindow(
  events: VoiceEvent[],
  armingWords: string[],
  transcriptWindow: string,
) {
  const sorted = [...events].sort((left, right) => left.orderIndex - right.orderIndex)
  const normalizedArming = new Set(armingWords.map((word) => normalizePhrase(word)))
  const armingEvent = [...sorted]
    .reverse()
    .find(
    (event) =>
      event.kind === 'arming' &&
      normalizedArming.has(event.keyword),
  )

  if (!armingEvent) {
    return null
  }

  const targetEvent = sorted.find(
    (event) => event.kind === 'target' && event.orderIndex > armingEvent.orderIndex,
  )

  if (!targetEvent || targetEvent.kind !== 'target') {
    return null
  }

  return {
    keyword: targetEvent.keyword,
    node: targetEvent.node,
    transcriptWindow,
  }
}

function extractEvents(
  transcript: string,
  timestamp: number,
  armingWords: string[],
  nodes: PresentationNode[],
) {
  const normalizedTranscript = normalizePhrase(transcript)

  if (!normalizedTranscript) {
    return []
  }

  const events: VoiceEvent[] = []

  armingWords.forEach((keyword) => {
    const normalizedKeyword = normalizePhrase(keyword)

    if (!normalizedKeyword) {
      return
    }

    for (const position of findPhrasePositions(normalizedTranscript, normalizedKeyword)) {
      events.push({
        kind: 'arming',
        keyword: normalizedKeyword,
        orderIndex: position,
        timestamp: timestamp + position / 1000,
      })
    }
  })

  for (const node of nodes) {
    for (const keyword of node.keywords) {
      const normalizedKeyword = normalizePhrase(keyword)

      if (!normalizedKeyword) {
        continue
      }

      for (const position of findPhrasePositions(normalizedTranscript, normalizedKeyword)) {
        events.push({
          kind: 'target',
          keyword: normalizedKeyword,
          node,
          orderIndex: position,
          timestamp: timestamp + position / 1000,
        })
      }
    }
  }

  return events.sort((left, right) => left.orderIndex - right.orderIndex)
}

async function pingService() {
  const response = await fetch(apiUrl('/api/health'))

  if (!response.ok) {
    return false
  }

  const payload = (await response.json()) as { ok?: boolean }
  return payload.ok === true
}

export function useWhisperTriggerRouter({
  armingWords,
  chunkMs = 4000,
  nodes,
  onMatch,
  windowMs = 10000,
}: UseWhisperTriggerRouterOptions): UseWhisperTriggerRouterState {
  const onMatchRef = useRef(onMatch)
  const queueRef = useRef<Blob[]>([])
  const processingRef = useRef(false)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const transcriptChunksRef = useRef<TranscriptChunk[]>([])
  const eventsRef = useRef<VoiceEvent[]>([])
  const [error, setError] = useState<string | null>(null)
  const [isListening, setIsListening] = useState(false)
  const [isServiceReady, setIsServiceReady] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [windowTranscript, setWindowTranscript] = useState('')
  const [triggerState, setTriggerState] = useState<TriggerState>('idle')
  const supported = isMediaCaptureSupported()
  const normalizedArming = useMemo(
    () => armingWords.map((word) => normalizePhrase(word)).filter(Boolean),
    [armingWords],
  )

  useEffect(() => {
    onMatchRef.current = onMatch
  }, [onMatch])

  const stop = () => {
    recorderRef.current?.stop()
    recorderRef.current = null
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    queueRef.current = []
    processingRef.current = false
    setIsListening(false)
  }

  const processQueue = async () => {
    if (processingRef.current || queueRef.current.length === 0) {
      return
    }

    processingRef.current = true

    while (queueRef.current.length > 0) {
      const audioBlob = queueRef.current.shift()

      if (!audioBlob || audioBlob.size < 1024) {
        continue
      }

      const formData = new FormData()
      formData.append('file', audioBlob, 'chunk.webm')

      let response: Response

      try {
        response = await fetch(apiUrl('/api/transcribe'), {
          mode: 'cors',
          body: formData,
          method: 'POST',
          headers: {
            Accept: 'application/json',
          },
        })
      } catch {
        setError('Le service WhisperX est inaccessible. Lancez le backend puis recommencez.')
        setIsServiceReady(false)
        stop()
        break
      }

      if (!response.ok) {
        setError('WhisperX n a pas pu transcrire le dernier extrait audio.')
        setIsServiceReady(false)
        continue
      }

      setIsServiceReady(true)

      const payload = (await response.json()) as WhisperTranscriptionResponse
      const normalizedTranscript = normalizePhrase(payload.transcript)

      if (!normalizedTranscript) {
        continue
      }

      const timestamp = Date.now()
      setTranscript(normalizedTranscript)

      const nextChunks = [
        ...transcriptChunksRef.current,
        {
          text: normalizedTranscript,
          timestamp,
        },
      ].filter((chunk) => timestamp - chunk.timestamp <= windowMs)

      transcriptChunksRef.current = nextChunks
      const nextWindowTranscript = nextChunks.map((chunk) => chunk.text).join(' ').trim()
      setWindowTranscript(nextWindowTranscript)

      const nextEvents = [
        ...eventsRef.current.filter((event) => timestamp - event.timestamp <= windowMs),
        ...extractEvents(normalizedTranscript, timestamp, normalizedArming, nodes),
      ].filter((event) => timestamp - event.timestamp <= windowMs)

      eventsRef.current = nextEvents
      setTriggerState(deriveTriggerState(nextEvents, normalizedArming))

      const match = evaluateTriggerWindow(
        nextEvents,
        normalizedArming,
        nextWindowTranscript,
      )

      if (match) {
        onMatchRef.current(match)
        transcriptChunksRef.current = []
        eventsRef.current = []
        setWindowTranscript('')
        setTriggerState('idle')
      }
    }

    processingRef.current = false
  }

  const start = async () => {
    if (!supported) {
      setError('La capture audio n est pas disponible dans ce navigateur.')
      return
    }

    if (normalizedArming.length === 0) {
      setError('Au moins une gachette est necessaire.')
      return
    }

    try {
      const serviceReady = await pingService()
      setIsServiceReady(serviceReady)

      if (!serviceReady) {
        setError('Le backend WhisperX est hors ligne. Lancez d abord le service Python.')
        return
      }
    } catch {
      setIsServiceReady(false)
      setError('Le backend WhisperX est hors ligne. Lancez d abord le service Python.')
      return
    }

    transcriptChunksRef.current = []
    eventsRef.current = []
    setWindowTranscript('')
    setTriggerState('idle')

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        },
      })
      const mimeType = chooseMimeType()
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream)

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          queueRef.current.push(event.data)
          void processQueue()
        }
      }

      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop())

        if (streamRef.current === stream) {
          streamRef.current = null
        }
      }

      recorderRef.current = recorder
      streamRef.current = stream
      setError(null)
      setIsListening(true)
      recorder.start(chunkMs)
    } catch {
      setError('L acces au microphone a ete bloque.')
      setIsListening(false)
    }
  }

  useEffect(() => {
    let active = true

    void pingService()
      .then((ready) => {
        if (active) {
          setIsServiceReady(ready)
        }
      })
      .catch(() => {
        if (active) {
          setIsServiceReady(false)
        }
      })

    return () => {
      active = false
      stop()
    }
  }, [])

  return {
    error,
    isListening,
    isServiceReady,
    start,
    stop,
    supported,
    transcript,
    triggerState,
    windowTranscript,
  }
}

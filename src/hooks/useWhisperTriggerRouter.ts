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

type MatchMemory = {
  keyword: string
  nodeId: string
  timestamp: number
}

type AudioContextWindow = Window &
  typeof globalThis & {
    webkitAudioContext?: typeof AudioContext
  }

function getAudioContextConstructor() {
  if (typeof window === 'undefined') {
    return null
  }

  const audioWindow = window as AudioContextWindow
  return audioWindow.AudioContext ?? audioWindow.webkitAudioContext ?? null
}

function isMediaCaptureSupported() {
  return (
    typeof window !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    Boolean(navigator.mediaDevices?.getUserMedia) &&
    getAudioContextConstructor() !== null
  )
}

function floatTo16BitPcm(view: DataView, offset: number, input: Float32Array) {
  let pointer = offset

  for (let index = 0; index < input.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, input[index]))
    view.setInt16(pointer, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true)
    pointer += 2
  }
}

function encodeWav(samples: Float32Array, sampleRate: number) {
  const buffer = new ArrayBuffer(44 + samples.length * 2)
  const view = new DataView(buffer)
  const writeString = (offset: number, value: string) => {
    for (let index = 0; index < value.length; index += 1) {
      view.setUint8(offset + index, value.charCodeAt(index))
    }
  }

  writeString(0, 'RIFF')
  view.setUint32(4, 36 + samples.length * 2, true)
  writeString(8, 'WAVE')
  writeString(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  writeString(36, 'data')
  view.setUint32(40, samples.length * 2, true)
  floatTo16BitPcm(view, 44, samples)

  return new Blob([buffer], { type: 'audio/wav' })
}

function collectLatestSamples(chunks: Float32Array[], desiredSamples: number) {
  if (desiredSamples <= 0 || chunks.length === 0) {
    return new Float32Array()
  }

  const slices: Float32Array[] = []
  let remaining = desiredSamples

  for (let index = chunks.length - 1; index >= 0 && remaining > 0; index -= 1) {
    const chunk = chunks[index]

    if (chunk.length <= remaining) {
      slices.push(chunk)
      remaining -= chunk.length
      continue
    }

    slices.push(chunk.subarray(chunk.length - remaining))
    remaining = 0
  }

  const orderedSlices = slices.reverse()
  const totalLength = orderedSlices.reduce((sum, chunk) => sum + chunk.length, 0)
  const merged = new Float32Array(totalLength)
  let offset = 0

  orderedSlices.forEach((chunk) => {
    merged.set(chunk, offset)
    offset += chunk.length
  })

  return merged
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
  chunkMs = 2500,
  nodes,
  onMatch,
  windowMs = 10000,
}: UseWhisperTriggerRouterOptions): UseWhisperTriggerRouterState {
  const onMatchRef = useRef(onMatch)
  const streamRef = useRef<MediaStream | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null)
  const processorNodeRef = useRef<ScriptProcessorNode | null>(null)
  const sinkNodeRef = useRef<GainNode | null>(null)
  const analysisIntervalRef = useRef<number | null>(null)
  const analysisInFlightRef = useRef(false)
  const pendingAnalysisRef = useRef(false)
  const isRunningRef = useRef(false)
  const sampleRateRef = useRef(0)
  const audioChunksRef = useRef<Float32Array[]>([])
  const bufferedSamplesRef = useRef(0)
  const lastMatchRef = useRef<MatchMemory | null>(null)
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

  const clearAnalysisInterval = () => {
    if (analysisIntervalRef.current !== null) {
      window.clearInterval(analysisIntervalRef.current)
      analysisIntervalRef.current = null
    }
  }

  const clearAudioBuffer = () => {
    audioChunksRef.current = []
    bufferedSamplesRef.current = 0
  }

  const trimAudioBuffer = () => {
    const sampleRate = sampleRateRef.current

    if (!sampleRate) {
      return
    }

    const maxBufferedSamples = Math.ceil(sampleRate * Math.max(windowMs * 1.5, windowMs + 4000) / 1000)

    while (bufferedSamplesRef.current > maxBufferedSamples && audioChunksRef.current.length > 0) {
      const overflow = bufferedSamplesRef.current - maxBufferedSamples
      const firstChunk = audioChunksRef.current[0]

      if (firstChunk.length <= overflow) {
        audioChunksRef.current.shift()
        bufferedSamplesRef.current -= firstChunk.length
        continue
      }

      audioChunksRef.current[0] = firstChunk.subarray(overflow)
      bufferedSamplesRef.current -= overflow
    }
  }

  const appendAudioSamples = (samples: Float32Array) => {
    if (samples.length === 0) {
      return
    }

    const copy = new Float32Array(samples)
    audioChunksRef.current.push(copy)
    bufferedSamplesRef.current += copy.length
    trimAudioBuffer()
  }

  const teardownAudioGraph = () => {
    processorNodeRef.current?.disconnect()
    sourceNodeRef.current?.disconnect()
    sinkNodeRef.current?.disconnect()

    processorNodeRef.current = null
    sourceNodeRef.current = null
    sinkNodeRef.current = null

    if (audioContextRef.current) {
      void audioContextRef.current.close().catch(() => undefined)
      audioContextRef.current = null
    }
  }

  const stop = () => {
    isRunningRef.current = false
    analysisInFlightRef.current = false
    pendingAnalysisRef.current = false
    clearAnalysisInterval()
    teardownAudioGraph()
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    sampleRateRef.current = 0
    clearAudioBuffer()
    setIsListening(false)
    setTriggerState('idle')
  }

  const analyzeWindow = async () => {
    if (!isRunningRef.current) {
      return
    }

    if (analysisInFlightRef.current) {
      pendingAnalysisRef.current = true
      return
    }

    const sampleRate = sampleRateRef.current

    if (!sampleRate || bufferedSamplesRef.current === 0) {
      return
    }

    const desiredSamples = Math.min(
      bufferedSamplesRef.current,
      Math.ceil(sampleRate * windowMs / 1000),
    )
    const minimumSamples = Math.ceil(sampleRate * 1.5)

    if (desiredSamples < minimumSamples) {
      return
    }

    analysisInFlightRef.current = true
    pendingAnalysisRef.current = false

    const wavBlob = encodeWav(
      collectLatestSamples(audioChunksRef.current, desiredSamples),
      sampleRate,
    )

    const formData = new FormData()
    formData.append('file', wavBlob, 'window.wav')

    try {
      const response = await fetch(apiUrl('/api/transcribe'), {
        mode: 'cors',
        body: formData,
        method: 'POST',
        headers: {
          Accept: 'application/json',
        },
      })

      if (!response.ok) {
        setError('Un extrait audio a ete ignore. L ecoute continue.')
        setIsServiceReady(true)
        return
      }

      setIsServiceReady(true)
      setError(null)

      const payload = (await response.json()) as WhisperTranscriptionResponse
      const normalizedTranscript = normalizePhrase(payload.transcript)
      const timestamp = Date.now()

      setTranscript(normalizedTranscript)
      setWindowTranscript(normalizedTranscript)

      if (!normalizedTranscript) {
        setTriggerState('idle')
        return
      }

      const events = extractEvents(
        normalizedTranscript,
        timestamp,
        normalizedArming,
        nodes,
      )

      setTriggerState(deriveTriggerState(events, normalizedArming))

      const match = evaluateTriggerWindow(
        events,
        normalizedArming,
        normalizedTranscript,
      )

      if (!match) {
        return
      }

      const lastMatch = lastMatchRef.current
      const isDuplicate =
        lastMatch !== null &&
        lastMatch.nodeId === match.node.id &&
        lastMatch.keyword === match.keyword &&
        timestamp - lastMatch.timestamp < 4000

      if (isDuplicate) {
        return
      }

      lastMatchRef.current = {
        keyword: match.keyword,
        nodeId: match.node.id,
        timestamp,
      }
      onMatchRef.current(match)
      setTriggerState('idle')
    } catch {
      setError('Le moteur vocal est inaccessible. Lancez le backend puis recommencez.')
      setIsServiceReady(false)
      stop()
    } finally {
      analysisInFlightRef.current = false

      if (pendingAnalysisRef.current && isRunningRef.current) {
        void analyzeWindow()
      }
    }
  }

  const start = async () => {
    if (!supported) {
      setError('La capture audio continue n est pas disponible dans ce navigateur.')
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
        setError('Le backend vocal est hors ligne. Lancez d abord le service local.')
        return
      }
    } catch {
      setIsServiceReady(false)
      setError('Le backend vocal est hors ligne. Lancez d abord le service local.')
      return
    }

    const AudioContextConstructor = getAudioContextConstructor()

    if (!AudioContextConstructor) {
      setError('La capture audio continue n est pas disponible dans ce navigateur.')
      return
    }

    clearAudioBuffer()
    lastMatchRef.current = null
    setTranscript('')
    setWindowTranscript('')
    setTriggerState('idle')

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      })
      const audioContext = new AudioContextConstructor()

      if (audioContext.state === 'suspended') {
        await audioContext.resume()
      }

      const source = audioContext.createMediaStreamSource(stream)
      const processor = audioContext.createScriptProcessor(4096, 1, 1)
      const sink = audioContext.createGain()

      sink.gain.value = 0
      processor.onaudioprocess = (event) => {
        appendAudioSamples(event.inputBuffer.getChannelData(0))
      }

      source.connect(processor)
      processor.connect(sink)
      sink.connect(audioContext.destination)

      streamRef.current = stream
      audioContextRef.current = audioContext
      sourceNodeRef.current = source
      processorNodeRef.current = processor
      sinkNodeRef.current = sink
      sampleRateRef.current = audioContext.sampleRate
      isRunningRef.current = true
      pendingAnalysisRef.current = false
      analysisInFlightRef.current = false
      setError(null)
      setIsListening(true)

      analysisIntervalRef.current = window.setInterval(() => {
        void analyzeWindow()
      }, chunkMs)
    } catch {
      stop()
      setError('L acces au microphone a ete bloque.')
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
      isRunningRef.current = false
      analysisInFlightRef.current = false
      pendingAnalysisRef.current = false
      clearAnalysisInterval()
      teardownAudioGraph()
      streamRef.current?.getTracks().forEach((track) => track.stop())
      streamRef.current = null
      sampleRateRef.current = 0
      clearAudioBuffer()
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

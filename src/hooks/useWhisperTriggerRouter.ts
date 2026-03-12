import { useEffect, useMemo, useRef, useState } from 'react'
import { apiUrl, assetUrl } from '../config/runtime'
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

export type TranscriptHistoryEntry = {
  id: number
  keywords: string[]
  timestamp: number
  transcript: string
}

type UseWhisperTriggerRouterState = {
  error: string | null
  isListening: boolean
  isServiceReady: boolean
  start: () => Promise<void>
  stop: () => void
  supported: boolean
  transcript: string
  transcriptHistory: TranscriptHistoryEntry[]
  triggerState: TriggerState
  windowTranscript: string
}

type MatchMemory = {
  keyword: string
  nodeId: string
  timestamp: number
}

type ArmedState = {
  expiresAt: number
  keyword: string
}

type AudioContextWindow = Window &
  typeof globalThis & {
    webkitAudioContext?: typeof AudioContext
  }

const TARGET_SAMPLE_RATE = 16000
const MIN_ANALYSIS_MS = 850
const SILENCE_CHECK_MS = 850
const SILENCE_RMS_THRESHOLD = 0.004
const WORKLET_NAME = 'voice-capture-processor'
const ARMED_EXPIRY_MS = 10000
const IDLE_WINDOW_MS = 6500
const MAX_HISTORY_ENTRIES = 8

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

function downsampleSamples(
  input: Float32Array,
  sourceSampleRate: number,
  targetSampleRate: number,
) {
  if (!input.length || sourceSampleRate <= targetSampleRate) {
    return input
  }

  const ratio = sourceSampleRate / targetSampleRate
  const targetLength = Math.max(1, Math.round(input.length / ratio))
  const output = new Float32Array(targetLength)
  let outputIndex = 0
  let sourceIndex = 0

  while (outputIndex < targetLength) {
    const nextSourceIndex = Math.min(input.length, Math.round((outputIndex + 1) * ratio))
    let sum = 0
    let count = 0

    for (let index = sourceIndex; index < nextSourceIndex; index += 1) {
      sum += input[index]
      count += 1
    }

    output[outputIndex] = count > 0 ? sum / count : input[Math.min(sourceIndex, input.length - 1)]
    outputIndex += 1
    sourceIndex = nextSourceIndex
  }

  return output
}

function computeRms(samples: Float32Array) {
  if (!samples.length) {
    return 0
  }

  let total = 0

  for (let index = 0; index < samples.length; index += 1) {
    total += samples[index] * samples[index]
  }

  return Math.sqrt(total / samples.length)
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
  chunkMs = 1450,
  nodes,
  onMatch,
  windowMs = 11000,
}: UseWhisperTriggerRouterOptions): UseWhisperTriggerRouterState {
  const onMatchRef = useRef(onMatch)
  const streamRef = useRef<MediaStream | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null)
  const workletNodeRef = useRef<AudioWorkletNode | null>(null)
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
  const armedStateRef = useRef<ArmedState | null>(null)
  const historyCounterRef = useRef(0)
  const [error, setError] = useState<string | null>(null)
  const [isListening, setIsListening] = useState(false)
  const [isServiceReady, setIsServiceReady] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [transcriptHistory, setTranscriptHistory] = useState<TranscriptHistoryEntry[]>([])
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

  const syncTriggerState = () => {
    const activeArming =
      armedStateRef.current && armedStateRef.current.expiresAt > Date.now()
        ? armedStateRef.current
        : null

    armedStateRef.current = activeArming
    setTriggerState(activeArming ? 'armed' : 'idle')
  }

  const pushTranscriptHistory = (nextTranscript: string, keywords: string[], timestamp: number) => {
    if (!nextTranscript) {
      return
    }

    setTranscriptHistory((currentHistory) => {
      const nextKeywords = [...new Set(keywords)].sort()
      const latestEntry = currentHistory[0]

      if (
        latestEntry &&
        latestEntry.transcript === nextTranscript &&
        latestEntry.keywords.join('|') === nextKeywords.join('|')
      ) {
        return [
          {
            ...latestEntry,
            timestamp,
          },
          ...currentHistory.slice(1),
        ]
      }

      historyCounterRef.current += 1

      return [
        {
          id: historyCounterRef.current,
          keywords: nextKeywords,
          timestamp,
          transcript: nextTranscript,
        },
        ...currentHistory,
      ].slice(0, MAX_HISTORY_ENTRIES)
    })
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

  const attachScriptProcessor = (
    audioContext: AudioContext,
    source: MediaStreamAudioSourceNode,
    sink: GainNode,
  ) => {
    const processor = audioContext.createScriptProcessor(4096, 1, 1)

    processor.onaudioprocess = (event) => {
      appendAudioSamples(event.inputBuffer.getChannelData(0))
    }

    source.connect(processor)
    processor.connect(sink)
    processorNodeRef.current = processor
    workletNodeRef.current = null
  }

  const attachAudioWorklet = async (
    audioContext: AudioContext,
    source: MediaStreamAudioSourceNode,
    sink: GainNode,
  ) => {
    await audioContext.audioWorklet.addModule(assetUrl('audio/voice-capture-worklet.js'))

    const workletNode = new AudioWorkletNode(audioContext, WORKLET_NAME, {
      channelCount: 1,
      numberOfInputs: 1,
      numberOfOutputs: 1,
    })

    workletNode.port.onmessage = (event: MessageEvent<{ buffer?: ArrayBuffer; type?: string }>) => {
      if (event.data?.type !== 'samples' || !event.data.buffer) {
        return
      }

      appendAudioSamples(new Float32Array(event.data.buffer))
    }

    source.connect(workletNode)
    workletNode.connect(sink)
    workletNodeRef.current = workletNode
    processorNodeRef.current = null
  }

  const teardownAudioGraph = () => {
    if (workletNodeRef.current) {
      workletNodeRef.current.port.onmessage = null
      workletNodeRef.current.disconnect()
    }

    processorNodeRef.current?.disconnect()
    sourceNodeRef.current?.disconnect()
    sinkNodeRef.current?.disconnect()

    workletNodeRef.current = null
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
    armedStateRef.current = null
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

    const activeWindowMs =
      armedStateRef.current && armedStateRef.current.expiresAt > Date.now()
        ? windowMs
        : Math.min(windowMs, IDLE_WINDOW_MS)
    const desiredSamples = Math.min(
      bufferedSamplesRef.current,
      Math.ceil(sampleRate * activeWindowMs / 1000),
    )
    const minimumSamples = Math.ceil(sampleRate * MIN_ANALYSIS_MS / 1000)

    if (desiredSamples < minimumSamples) {
      return
    }

    analysisInFlightRef.current = true
    pendingAnalysisRef.current = false

    const windowSamples = collectLatestSamples(audioChunksRef.current, desiredSamples)
    const silenceCheckSamples = collectLatestSamples(
      audioChunksRef.current,
      Math.min(desiredSamples, Math.ceil(sampleRate * SILENCE_CHECK_MS / 1000)),
    )

    if (computeRms(silenceCheckSamples) < SILENCE_RMS_THRESHOLD) {
      syncTriggerState()
      analysisInFlightRef.current = false

      if (pendingAnalysisRef.current && isRunningRef.current) {
        pendingAnalysisRef.current = false
      }

      return
    }

    const wavSampleRate = Math.min(sampleRate, TARGET_SAMPLE_RATE)
    const wavSamples = downsampleSamples(windowSamples, sampleRate, wavSampleRate)
    const wavBlob = encodeWav(wavSamples, wavSampleRate)

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
        syncTriggerState()
        return
      }

      const events = extractEvents(
        normalizedTranscript,
        timestamp,
        normalizedArming,
        nodes,
      )
      const latestArmingEvent = [...events]
        .reverse()
        .find((event): event is Extract<VoiceEvent, { kind: 'arming' }> => event.kind === 'arming')
      const uniqueKeywords = [...new Set(events.map((event) => event.keyword))]

      pushTranscriptHistory(normalizedTranscript, uniqueKeywords, timestamp)

      let activeArming =
        armedStateRef.current && armedStateRef.current.expiresAt > timestamp
          ? armedStateRef.current
          : null

      if (latestArmingEvent) {
        activeArming = {
          expiresAt: timestamp + ARMED_EXPIRY_MS,
          keyword: latestArmingEvent.keyword,
        }
        armedStateRef.current = activeArming
      } else {
        armedStateRef.current = activeArming
      }

      setTriggerState(activeArming ? 'armed' : 'idle')

      if (!activeArming) {
        return
      }

      const targetEvents = events.filter(
        (event): event is Extract<VoiceEvent, { kind: 'target' }> => event.kind === 'target',
      )
      const candidateTargets = latestArmingEvent
        ? targetEvents.filter((event) => event.orderIndex > latestArmingEvent.orderIndex)
        : targetEvents
      const targetEvent = candidateTargets[0]

      if (!targetEvent) {
        return
      }

      const match = {
        keyword: targetEvent.keyword,
        node: targetEvent.node,
        transcriptWindow: normalizedTranscript,
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
      armedStateRef.current = null
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
    armedStateRef.current = null
    setTranscript('')
    setTranscriptHistory([])
    setWindowTranscript('')
    setTriggerState('idle')

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: TARGET_SAMPLE_RATE,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      })
      const audioContext = new AudioContextConstructor({
        latencyHint: 'interactive',
      })

      if (audioContext.state === 'suspended') {
        await audioContext.resume()
      }

      const source = audioContext.createMediaStreamSource(stream)
      const sink = audioContext.createGain()

      sink.gain.value = 0
      sink.connect(audioContext.destination)

      if (typeof AudioWorkletNode !== 'undefined' && audioContext.audioWorklet) {
        try {
          await attachAudioWorklet(audioContext, source, sink)
        } catch {
          attachScriptProcessor(audioContext, source, sink)
        }
      } else {
        attachScriptProcessor(audioContext, source, sink)
      }

      streamRef.current = stream
      audioContextRef.current = audioContext
      sourceNodeRef.current = source
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

      window.setTimeout(() => {
        if (isRunningRef.current) {
          void analyzeWindow()
        }
      }, Math.max(900, Math.min(chunkMs, 1200)))
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
    transcriptHistory,
    triggerState,
    windowTranscript,
  }
}

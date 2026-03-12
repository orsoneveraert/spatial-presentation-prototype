const POST_CHUNK_SIZE = 2048

class VoiceCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super()
    this.pendingChunks = []
    this.pendingLength = 0
  }

  flush() {
    if (this.pendingLength === 0) {
      return
    }

    const merged = new Float32Array(this.pendingLength)
    let offset = 0

    for (const chunk of this.pendingChunks) {
      merged.set(chunk, offset)
      offset += chunk.length
    }

    this.port.postMessage({ type: 'samples', buffer: merged.buffer }, [merged.buffer])
    this.pendingChunks = []
    this.pendingLength = 0
  }

  process(inputs, outputs) {
    const input = inputs[0]
    const output = outputs[0]

    if (output) {
      for (let channelIndex = 0; channelIndex < output.length; channelIndex += 1) {
        output[channelIndex].fill(0)
      }
    }

    if (!input || !input[0] || input[0].length === 0) {
      return true
    }

    this.pendingChunks.push(new Float32Array(input[0]))
    this.pendingLength += input[0].length

    if (this.pendingLength >= POST_CHUNK_SIZE) {
      this.flush()
    }

    return true
  }
}

registerProcessor('voice-capture-processor', VoiceCaptureProcessor)

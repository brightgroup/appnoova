/** PCMU (G.711 μ-law) ↔ PCM para puente Telnyx ↔ Gemini Live. */

const ULAW_DECODE = new Int16Array(256);
const ULAW_ENCODE_BIAS = 0x84;

(function initUlaw() {
  for (let i = 0; i < 256; i++) {
    let u = ~i;
    const sign = u & 0x80;
    const exponent = (u >> 4) & 0x07;
    const mantissa = u & 0x0f;
    let sample = ((mantissa << 3) + ULAW_ENCODE_BIAS) << exponent;
    sample -= ULAW_ENCODE_BIAS;
    ULAW_DECODE[i] = sign ? -sample : sample;
  }
})();

function linearToUlaw(sample: number): number {
  const sign = sample < 0 ? 0x80 : 0;
  if (sample < 0) sample = -sample;
  sample += ULAW_ENCODE_BIAS;
  if (sample > 0x7fff) sample = 0x7fff;

  let exponent = 7;
  for (let expMask = 0x4000; (sample & expMask) === 0 && exponent > 0; exponent--, expMask >>= 1) {
    /* find exponent */
  }
  const mantissa = (sample >> (exponent + 3)) & 0x0f;
  return ~(sign | (exponent << 4) | mantissa) & 0xff;
}

export const TELNYX_OUTBOUND_CODEC = "L16" as const;
export const TELNYX_OUTBOUND_SAMPLE_RATE = 16000;
/** 20 ms @ 16 kHz L16 mono = 640 bytes */
export const TELNYX_OUTBOUND_FRAME_BYTES = 640;

export function parsePcmRate(mimeType?: string): number {
  const m = mimeType?.match(/rate=(\d+)/);
  return m ? parseInt(m[1], 10) : 24000;
}

export function pcmBase64ToFloat32(b64: string): Float32Array {
  const buf = Buffer.from(b64, "base64");
  const len = Math.floor(buf.length / 2);
  const out = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    out[i] = buf.readInt16LE(i * 2) / 32768;
  }
  return out;
}

export function float32ToInt16(buf: Float32Array): Int16Array {
  const out = new Int16Array(buf.length);
  for (let i = 0; i < buf.length; i++) {
    const s = Math.max(-1, Math.min(1, buf[i]));
    out[i] = s < 0 ? Math.round(s * 0x8000) : Math.round(s * 0x7fff);
  }
  return out;
}

export function resampleFloat32ToRate(input: Float32Array, inputRate: number, targetRate: number): Int16Array {
  if (inputRate === targetRate) return float32ToInt16(input);

  const ratio = inputRate / targetRate;
  const outLen = Math.floor(input.length / ratio);
  const out = new Int16Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const idx = Math.min(Math.floor(i * ratio), input.length - 1);
    const s = Math.max(-1, Math.min(1, input[idx]));
    out[i] = s < 0 ? Math.round(s * 0x8000) : Math.round(s * 0x7fff);
  }
  return out;
}

function applyPcmGain(samples: Int16Array, gain = 1.8): Int16Array {
  const out = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    out[i] = Math.max(-32768, Math.min(32767, Math.round(samples[i] * gain)));
  }
  return out;
}

export function int16ToPcmBase64(samples: Int16Array): string {
  const buf = Buffer.alloc(samples.length * 2);
  for (let i = 0; i < samples.length; i++) {
    buf.writeInt16LE(samples[i], i * 2);
  }
  return buf.toString("base64");
}

export function pcmuBase64ToPcm16(base64: string): Int16Array {
  const bytes = Buffer.from(base64, "base64");
  const out = new Int16Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) {
    out[i] = ULAW_DECODE[bytes[i]];
  }
  return out;
}

export function upsample8kTo16k(input: Int16Array): Int16Array {
  const out = new Int16Array(input.length * 2);
  for (let i = 0; i < input.length; i++) {
    const s = input[i];
    const next = i < input.length - 1 ? input[i + 1] : s;
    out[i * 2] = s;
    out[i * 2 + 1] = Math.round((s + next) / 2);
  }
  return out;
}

export function telnyxInboundToGemini(pcmuPayload: string): string {
  const pcm8k = pcmuBase64ToPcm16(pcmuPayload);
  const pcm16k = applyPcmGain(upsample8kTo16k(pcm8k), 2.2);
  return int16ToPcmBase64(pcm16k);
}

/** Gemini PCM → L16 16 kHz para Telnyx bidirectional RTP. */
export function geminiOutboundToTelnyx(pcmBase64: string, mimeType?: string): string {
  const inputRate = parsePcmRate(mimeType);
  const float32 = pcmBase64ToFloat32(pcmBase64);
  const pcm16k = applyPcmGain(resampleFloat32ToRate(float32, inputRate, TELNYX_OUTBOUND_SAMPLE_RATE));
  return int16ToPcmBase64(pcm16k);
}

/** Silencio L16 (20 ms @ 16 kHz). */
export function telnyxSilencePayload20ms(): string {
  return Buffer.alloc(TELNYX_OUTBOUND_FRAME_BYTES, 0).toString("base64");
}

/** Divide payload en frames de ~20 ms para Telnyx. */
export function chunkOutboundPayload(base64: string, frameBytes = TELNYX_OUTBOUND_FRAME_BYTES): string[] {
  const bytes = Buffer.from(base64, "base64");
  if (bytes.length === 0) return [];

  const chunks: string[] = [];
  for (let i = 0; i < bytes.length; i += frameBytes) {
    const slice = bytes.subarray(i, Math.min(i + frameBytes, bytes.length));
    if (slice.length < frameBytes) {
      const padded = Buffer.alloc(frameBytes, 0);
      slice.copy(padded);
      chunks.push(padded.toString("base64"));
    } else {
      chunks.push(slice.toString("base64"));
    }
  }
  return chunks;
}

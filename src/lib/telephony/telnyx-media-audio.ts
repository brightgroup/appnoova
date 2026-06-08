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

export function pcmuBase64ToPcm16(base64: string): Int16Array {
  const bytes = Buffer.from(base64, "base64");
  const out = new Int16Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) {
    out[i] = ULAW_DECODE[bytes[i]];
  }
  return out;
}

export function pcm16ToPcmuBase64(samples: Int16Array): string {
  const bytes = Buffer.alloc(samples.length);
  for (let i = 0; i < samples.length; i++) {
    bytes[i] = linearToUlaw(samples[i]);
  }
  return bytes.toString("base64");
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

export function downsampleTo8k(input: Int16Array, inputRate: number): Int16Array {
  if (inputRate === 8000) return input;
  const ratio = inputRate / 8000;
  const outLen = Math.floor(input.length / ratio);
  const out = new Int16Array(outLen);
  for (let i = 0; i < outLen; i++) {
    out[i] = input[Math.min(Math.floor(i * ratio), input.length - 1)];
  }
  return out;
}

export function int16ToPcmBase64(samples: Int16Array): string {
  return Buffer.from(samples.buffer, samples.byteOffset, samples.byteLength).toString("base64");
}

export function pcmBase64ToInt16(base64: string): Int16Array {
  const buf = Buffer.from(base64, "base64");
  return new Int16Array(buf.buffer, buf.byteOffset, buf.byteLength / 2);
}

export function telnyxInboundToGemini(pcmuPayload: string): string {
  const pcm8k = pcmuBase64ToPcm16(pcmuPayload);
  const pcm16k = upsample8kTo16k(pcm8k);
  return int16ToPcmBase64(pcm16k);
}

export function geminiOutboundToTelnyx(pcmBase64: string, mimeType?: string): string {
  const rateMatch = mimeType?.match(/rate=(\d+)/);
  const rate = rateMatch ? parseInt(rateMatch[1], 10) : 24000;
  const pcm = pcmBase64ToInt16(pcmBase64);
  const pcm8k = downsampleTo8k(pcm, rate);
  return pcm16ToPcmuBase64(pcm8k);
}

/** PCMU silencio (20 ms @ 8 kHz) para mantener vivo el stream RTP de Telnyx. */
export function telnyxSilencePayload20ms(): string {
  return Buffer.alloc(160, 0xff).toString("base64");
}

/** Divide un payload PCMU en frames de ~20 ms para Telnyx. */
export function chunkPcmuPayload(base64: string, frameBytes = 160): string[] {
  const bytes = Buffer.from(base64, "base64");
  if (bytes.length <= frameBytes) return [base64];

  const chunks: string[] = [];
  for (let i = 0; i < bytes.length; i += frameBytes) {
    chunks.push(bytes.subarray(i, i + frameBytes).toString("base64"));
  }
  return chunks;
}

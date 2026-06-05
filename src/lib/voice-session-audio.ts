export function resampleTo16kPcm(input: Float32Array, inputRate: number): string {
  const targetRate = 16000;
  let samples: Int16Array;

  if (inputRate === targetRate) {
    samples = float32ToInt16(input);
  } else {
    const ratio = inputRate / targetRate;
    const outLen = Math.floor(input.length / ratio);
    samples = new Int16Array(outLen);
    for (let i = 0; i < outLen; i++) {
      const idx = Math.min(Math.floor(i * ratio), input.length - 1);
      const s = Math.max(-1, Math.min(1, input[idx]));
      samples[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
  }

  const bytes = new Uint8Array(samples.buffer);
  let b = "";
  for (let i = 0; i < bytes.length; i++) b += String.fromCharCode(bytes[i]);
  return btoa(b);
}

function float32ToInt16(buf: Float32Array): Int16Array {
  const out = new Int16Array(buf.length);
  for (let i = 0; i < buf.length; i++) {
    const s = Math.max(-1, Math.min(1, buf[i]));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
}

export function parsePcmRate(mimeType?: string): number {
  const m = mimeType?.match(/rate=(\d+)/);
  return m ? parseInt(m[1], 10) : 24000;
}

export function pcmBase64ToFloat32(b64: string): Float32Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const int16 = new Int16Array(bytes.buffer);
  const float32 = new Float32Array(int16.length);
  for (let i = 0; i < int16.length; i++) float32[i] = int16[i] / 0x8000;
  return float32;
}

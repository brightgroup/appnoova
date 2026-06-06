/** Codifica Float32 mono a WAV (16-bit PCM). */
export function encodeWav(float32: Float32Array, sampleRate: number): Blob {
  const numSamples = float32.length;
  const buffer = new ArrayBuffer(44 + numSamples * 2);
  const view = new DataView(buffer);

  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };

  writeStr(0, "RIFF");
  view.setUint32(4, 36 + numSamples * 2, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, "data");
  view.setUint32(40, numSamples * 2, true);

  let offset = 44;
  for (let i = 0; i < numSamples; i++) {
    const s = Math.max(-1, Math.min(1, float32[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    offset += 2;
  }

  return new Blob([buffer], { type: "audio/wav" });
}

export function getSupportedRecorderMime(): string {
  const types = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"];
  return types.find(t => MediaRecorder.isTypeSupported(t)) ?? "";
}

export function stopMediaRecorder(recorder: MediaRecorder | null, getChunks: () => Blob[]): Promise<Blob | null> {
  if (!recorder || recorder.state === "inactive") {
    const chunks = getChunks();
    return Promise.resolve(
      chunks.length ? new Blob(chunks, { type: recorder?.mimeType || "audio/webm" }) : null
    );
  }

  return new Promise((resolve) => {
    recorder.onstop = () => {
      const chunks = getChunks();
      resolve(
        chunks.length
          ? new Blob(chunks, { type: recorder.mimeType || "audio/webm" })
          : null
      );
    };
    try {
      if (recorder.state === "recording") recorder.requestData();
    } catch { /* ignore */ }
    setTimeout(() => {
      try {
        if (recorder.state !== "inactive") recorder.stop();
      } catch {
        resolve(null);
      }
    }, 100);
  });
}

export function downsamplePcm(input: Float32Array, fromRate: number, toRate: number): Float32Array {
  if (fromRate === toRate) return input;
  const ratio = fromRate / toRate;
  const outLen = Math.max(1, Math.floor(input.length / ratio));
  const out = new Float32Array(outLen);
  for (let i = 0; i < outLen; i++) {
    out[i] = input[Math.min(Math.floor(i * ratio), input.length - 1)];
  }
  return out;
}

export function mergePcmBuffers(buffers: Float32Array[]): Float32Array {
  const total = buffers.reduce((s, b) => s + b.length, 0);
  const merged = new Float32Array(total);
  let offset = 0;
  for (const buf of buffers) {
    merged.set(buf, offset);
    offset += buf.length;
  }
  return merged;
}

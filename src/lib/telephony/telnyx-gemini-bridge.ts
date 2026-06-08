import type { LiveServerMessage, Session } from "@google/genai";
import type { WebSocket } from "ws";
import { connectGeminiLive, takePrewarmedGemini } from "@/lib/telephony/gemini-live-connect";
import { isGoodbyeUtterance } from "@/lib/voice-goodbye-detection";
import {
  chunkPcmuPayload,
  geminiOutboundToTelnyx,
  telnyxInboundToGemini,
  telnyxSilencePayload20ms
} from "@/lib/telephony/telnyx-media-audio";
import { finalizePhoneTestCall } from "@/lib/telephony/finalize-phone-test-call";
import {
  registerActiveBridge,
  unregisterActiveBridge,
  type PendingBridgeSession
} from "@/lib/telephony/bridge-session-store";
import { updatePhoneTestCallSession, labelForPhase } from "@/lib/telephony/test-call-session";
import type { TranscriptEntry } from "@/types/voice-agent-call";

export class TelnyxGeminiBridge {
  private gemini: Session | null = null;
  private transcript: TranscriptEntry[] = [];
  private sessionStart = 0;
  private answeredAt = 0;
  private setupDone = false;
  private micBlocked = true;
  private closed = false;
  private closing = false;
  private goodbyeTriggered = false;
  private sentAudio = false;
  private silenceTimer: ReturnType<typeof setInterval> | null = null;
  private callControlId: string;

  constructor(
    private ws: WebSocket,
    private pending: PendingBridgeSession
  ) {
    this.callControlId = pending.callControlId;
  }

  async start(): Promise<void> {
    registerActiveBridge(this.callControlId, { close: r => this.close(r) });
    this.startSilenceKeepalive();

    const callbacks = {
      onmessage: (msg: LiveServerMessage) => this.onGeminiMessage(msg),
      onerror: (e: unknown) => console.error("[telnyx-gemini] error:", e),
      onclose: (code?: number, reason?: string) => {
        console.warn("[telnyx-gemini] cerrado", { callControlId: this.callControlId, code, reason });
        if (!this.closing) void this.close("Gemini Closed");
      }
    };

    this.gemini = await takePrewarmedGemini(this.callControlId, callbacks);
    if (!this.gemini) {
      this.gemini = await connectGeminiLive(this.pending, callbacks);
    }

    if (!this.gemini) {
      await this.close("Gemini Connect Failed");
    }
  }

  handleTelnyxFrame(raw: string) {
    if (this.closed) return;
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }

    const event = String(msg.event ?? "");
    if (event === "media") {
      const media = msg.media as { track?: string; payload?: string } | undefined;
      const track = media?.track;
      if (media?.payload && this.setupDone && this.gemini && !this.micBlocked && (!track || track === "inbound")) {
        const geminiAudio = telnyxInboundToGemini(media.payload);
        this.gemini.sendRealtimeInput({
          audio: { data: geminiAudio, mimeType: "audio/pcm;rate=16000" }
        });
      }
      return;
    }

    if (event === "stop") {
      void this.close("Stream Stopped");
    }
  }

  private startSilenceKeepalive() {
    this.stopSilenceKeepalive();
    const payload = telnyxSilencePayload20ms();
    this.silenceTimer = setInterval(() => {
      if (this.closed || this.sentAudio || this.ws.readyState !== 1) return;
      this.ws.send(JSON.stringify({ event: "media", media: { payload } }));
    }, 20);
  }

  private stopSilenceKeepalive() {
    if (this.silenceTimer) {
      clearInterval(this.silenceTimer);
      this.silenceTimer = null;
    }
  }

  private currentTimeSec(): number {
    if (!this.answeredAt) return 0;
    return Math.max(0, Math.floor((Date.now() - this.answeredAt) / 1000));
  }

  private appendTranscript(role: "user" | "agent", text: string) {
    if (!text.trim()) return;
    const time_sec = this.currentTimeSec();
    const last = this.transcript[this.transcript.length - 1];
    if (last?.role === role) {
      this.transcript[this.transcript.length - 1] = { role, text: last.text + text, time_sec };
    } else {
      this.transcript.push({ role, text, time_sec });
    }
  }

  private sendAudioToTelnyx(b64: string, mimeType?: string) {
    if (this.ws.readyState !== 1) return;
    const payload = geminiOutboundToTelnyx(b64, mimeType);
    for (const chunk of chunkPcmuPayload(payload)) {
      this.ws.send(JSON.stringify({ event: "media", media: { payload: chunk } }));
    }
    if (!this.sentAudio) {
      this.sentAudio = true;
      this.stopSilenceKeepalive();
      console.info("[telnyx-gemini] primer audio enviado a Telnyx", { callControlId: this.callControlId });
    }
  }

  private checkGoodbye() {
    if (this.goodbyeTriggered || this.transcript.length < 2) return;
    const last = this.transcript[this.transcript.length - 1];
    if (last && isGoodbyeUtterance(last.text)) {
      this.goodbyeTriggered = true;
      setTimeout(() => void this.close(last.role === "user" ? "User Ended" : "Agent Hangup"), 2500);
    }
  }

  private onGeminiMessage(msg: LiveServerMessage) {
    if (msg.setupComplete && !this.setupDone) {
      this.setupDone = true;
      this.sessionStart = Date.now();
      if (!this.answeredAt) this.answeredAt = Date.now();

      console.info("[telnyx-gemini] setupComplete", { callControlId: this.callControlId });

      void updatePhoneTestCallSession(this.callControlId, {
        phase: "connected",
        last_event: "gemini.setup_complete",
        status_label: labelForPhase("connected")
      });

      this.gemini?.sendClientContent({
        turns: [{ role: "user", parts: [{ text: "Inicia la llamada con un saludo breve en español colombiano." }] }],
        turnComplete: true
      });
    }

    const sc = msg.serverContent;
    if (!sc) return;

    if (sc.inputTranscription?.text && !this.micBlocked) {
      this.appendTranscript("user", sc.inputTranscription.text);
      void updatePhoneTestCallSession(this.callControlId, {
        phase: "connected",
        last_event: "gemini.listening",
        status_label: labelForPhase("connected")
      });
    }
    if (sc.outputTranscription?.text) {
      this.appendTranscript("agent", sc.outputTranscription.text);
      void updatePhoneTestCallSession(this.callControlId, {
        phase: "speaking",
        last_event: "gemini.speaking",
        status_label: labelForPhase("speaking")
      });
    }

    for (const part of sc.modelTurn?.parts ?? []) {
      if (part.inlineData?.data && part.inlineData.mimeType?.includes("audio")) {
        this.sendAudioToTelnyx(part.inlineData.data, part.inlineData.mimeType);
      }
    }

    if (sc.turnComplete) {
      this.micBlocked = false;
      this.checkGoodbye();
    }
  }

  markAnswered() {
    if (!this.answeredAt) {
      this.answeredAt = Date.now();
      void updatePhoneTestCallSession(this.callControlId, {
        phase: "answered",
        last_event: "call.answered",
        status_label: labelForPhase("answered")
      });
    }
  }

  async close(reason: string): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    this.closing = true;
    this.stopSilenceKeepalive();
    unregisterActiveBridge(this.callControlId);

    try {
      this.gemini?.close();
    } catch {
      /* ignore */
    }
    this.gemini = null;

    if (this.ws.readyState === 1) {
      try { this.ws.close(); } catch { /* ignore */ }
    }

    const durationSec = this.answeredAt
      ? Math.max(0, Math.floor((Date.now() - this.answeredAt) / 1000))
      : 0;

    console.info("[telnyx-gemini] cerrando puente", {
      callControlId: this.callControlId,
      reason,
      durationSec,
      transcriptLines: this.transcript.length,
      setupDone: this.setupDone,
      sentAudio: this.sentAudio
    });

    try {
      await finalizePhoneTestCall({
        callControlId: this.callControlId,
        transcript: this.transcript,
        disconnectReason: reason,
        durationSec
      });
    } catch (e) {
      console.error("[telnyx-gemini] finalize error:", e);
    }
  }
}

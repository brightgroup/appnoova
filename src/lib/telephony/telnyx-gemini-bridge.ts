import type { LiveServerMessage, Session } from "@google/genai";
import type { WebSocket } from "ws";
import { connectGeminiLive } from "@/lib/telephony/gemini-live-connect";
import { buildVoiceOutboundKickoffMessage, buildVoiceOutboundRespondKickoffMessage } from "@/lib/voice-accent-profile";
import { isGoodbyeUtterance } from "@/lib/voice-goodbye-detection";
import {
  chunkOutboundPayload,
  geminiOutboundToTelnyx,
  telnyxInboundToGemini,
  telnyxSilencePayload20ms
} from "@/lib/telephony/telnyx-media-audio";
import { finalizePhoneTestCall } from "@/lib/telephony/finalize-phone-test-call";
import { finalizeOutboundShortCall } from "@/lib/telephony/finalize-outbound-short-call";
import { telnyxHangup } from "@/lib/telephony/telnyx-call-control";
import {
  registerActiveBridge,
  unregisterActiveBridge,
  type PendingBridgeSession
} from "@/lib/telephony/bridge-session-store";
import { updatePhoneTestCallSession, labelForPhase } from "@/lib/telephony/test-call-session";
import { isVoicemailUtterance } from "@/lib/voice-voicemail-detection";
import type { TranscriptEntry } from "@/types/voice-agent-call";

export class TelnyxGeminiBridge {
  private gemini: Session | null = null;
  private transcript: TranscriptEntry[] = [];
  private sessionStart = 0;
  private answeredAt = 0;
  private setupDone = false;
  private listeningEnabled = false;
  private agentSpeaking = false;
  private closed = false;
  private closing = false;
  private goodbyeTriggered = false;
  private voicemailTriggered = false;
  private sentAudio = false;
  private inboundFrames = 0;
  private outboundChunksSent = 0;
  private silenceTimer: ReturnType<typeof setInterval> | null = null;
  private outboundQueue: string[] = [];
  private outboundTimer: ReturnType<typeof setInterval> | null = null;
  private listenEnableTimer: ReturnType<typeof setTimeout> | null = null;
  private preSetupInboundChunks: string[] = [];
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
    this.startOutboundPump();

    const callbacks = {
      onmessage: (msg: LiveServerMessage) => this.onGeminiMessage(msg),
      onerror: (e: unknown) => console.error("[telnyx-gemini] error:", e),
      onclose: (code?: number, reason?: string) => {
        console.warn("[telnyx-gemini] cerrado", { callControlId: this.callControlId, code, reason });
        if (!this.closing) void this.close("Gemini Closed");
      }
    };

    this.gemini = await connectGeminiLive(this.pending, callbacks);

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
      if (!media?.payload || !this.isUserInboundTrack(track)) return;

      const geminiAudio = telnyxInboundToGemini(media.payload);
      this.inboundFrames++;

      if (!this.setupDone || !this.gemini) {
        this.preSetupInboundChunks.push(geminiAudio);
        return;
      }

      if (this.canSendUserAudio()) {
        this.gemini.sendRealtimeInput({
          audio: { data: geminiAudio, mimeType: "audio/pcm;rate=16000" }
        });
      }
      return;
    }

    if (event === "stop") {
      void this.close("Stream Stopped");
      return;
    }

    if (event === "error") {
      console.error("[telnyx-ws] media error frame", msg);
    }
  }

  private isUserInboundTrack(track?: string): boolean {
    if (!track) return true;
    const normalized = track.toLowerCase();
    return normalized === "inbound" || normalized === "inbound_track";
  }

  private canSendUserAudio(): boolean {
    return Boolean(
      this.setupDone &&
      this.gemini &&
      !this.agentSpeaking &&
      this.outboundQueue.length === 0
    );
  }

  private scheduleListeningEnabled() {
    if (this.listenEnableTimer) {
      clearTimeout(this.listenEnableTimer);
      this.listenEnableTimer = null;
    }

    const waitForPlayback = () => {
      if (this.closed) return;
      if (this.outboundQueue.length > 0) {
        this.listenEnableTimer = setTimeout(waitForPlayback, 50);
        return;
      }
      this.listenEnableTimer = setTimeout(() => {
        this.listeningEnabled = true;
        console.info("[telnyx-gemini] escucha activa", {
          callControlId: this.callControlId,
          inboundFrames: this.inboundFrames
        });
      }, 400);
    };

    waitForPlayback();
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
    this.agentSpeaking = true;
    this.listeningEnabled = false;

    const payload = geminiOutboundToTelnyx(b64, mimeType);
    const chunks = chunkOutboundPayload(payload);
    if (chunks.length > 0) {
      this.outboundQueue.push(...chunks);
    }
  }

  private startOutboundPump() {
    if (this.outboundTimer) return;
    this.outboundTimer = setInterval(() => {
      if (this.closed || this.ws.readyState !== 1) return;
      const chunk = this.outboundQueue.shift();
      if (!chunk) return;

      this.ws.send(JSON.stringify({ event: "media", media: { payload: chunk } }));
      this.outboundChunksSent++;
      if (!this.sentAudio) {
        this.sentAudio = true;
        this.stopSilenceKeepalive();
        console.info("[telnyx-gemini] primer audio enviado a Telnyx", {
          callControlId: this.callControlId,
          bytes: Buffer.from(chunk, "base64").length
        });
      }
    }, 20);
  }

  private stopOutboundPump() {
    if (this.outboundTimer) {
      clearInterval(this.outboundTimer);
      this.outboundTimer = null;
    }
    this.outboundQueue = [];
  }

  private checkVoicemail(text: string) {
    if (this.voicemailTriggered || this.closed) return;
    if (!isVoicemailUtterance(text)) return;
    this.voicemailTriggered = true;
    console.info("[telnyx-gemini] buzón detectado en audio", { callControlId: this.callControlId, text });
    void this.closeAsVoicemail();
  }

  private async closeAsVoicemail(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    this.closing = true;
    this.stopSilenceKeepalive();
    this.stopOutboundPump();
    if (this.listenEnableTimer) clearTimeout(this.listenEnableTimer);
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

    try {
      await telnyxHangup(this.callControlId);
    } catch {
      /* ignore */
    }

    try {
      await finalizeOutboundShortCall({
        callControlId: this.callControlId,
        outcome: "voicemail",
        disconnectReason: "Buzón de voz detectado (Gemini)",
      });
    } catch (e) {
      console.error("[telnyx-gemini] finalize voicemail error:", e);
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

      // Escuchar el "aló" del interlocutor desde el inicio.
      this.listeningEnabled = true;

      const bufferedInbound = this.preSetupInboundChunks.splice(0);
      const userAlreadySpoke = bufferedInbound.length > 0;

      for (const chunk of bufferedInbound) {
        this.gemini?.sendRealtimeInput({
          audio: { data: chunk, mimeType: "audio/pcm;rate=16000" }
        });
      }

      const kickoff = userAlreadySpoke
        ? buildVoiceOutboundRespondKickoffMessage(this.pending.companyName)
        : buildVoiceOutboundKickoffMessage(this.pending.companyName);

      this.gemini?.sendClientContent({
        turns: [{
          role: "user",
          parts: [{ text: kickoff }],
        }],
        turnComplete: true
      });
    }

    const sc = msg.serverContent;
    if (!sc) return;

    if (sc.interrupted) {
      this.agentSpeaking = false;
      this.outboundQueue = [];
      this.scheduleListeningEnabled();
    }

    if (sc.inputTranscription?.text && this.listeningEnabled) {
      this.appendTranscript("user", sc.inputTranscription.text);
      this.checkVoicemail(sc.inputTranscription.text);
      if (this.voicemailTriggered) return;
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
      this.agentSpeaking = false;
      this.scheduleListeningEnabled();
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
    this.stopOutboundPump();
    if (this.listenEnableTimer) clearTimeout(this.listenEnableTimer);
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
      inboundFrames: this.inboundFrames,
      outboundChunksSent: this.outboundChunksSent,
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

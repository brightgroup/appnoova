import type { WebSocket } from "ws";
import { TelnyxGeminiBridge } from "@/lib/telephony/telnyx-gemini-bridge";
import { takePendingBridgeSession } from "@/lib/telephony/bridge-session-store";

const bridges = new WeakMap<WebSocket, TelnyxGeminiBridge>();

export function handleTelnyxMediaSocket(ws: WebSocket) {
  console.info("[telnyx-ws] connection opened");

  ws.on("message", raw => {
    const text = typeof raw === "string" ? raw : raw.toString("utf8");
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(text);
    } catch {
      return;
    }

    const event = String(msg.event ?? "");

    if (event === "start") {
      const start = msg.start as { call_control_id?: string } | undefined;
      const callControlId = start?.call_control_id;
      if (!callControlId) {
        console.warn("[telnyx-ws] start sin call_control_id");
        ws.close();
        return;
      }

      const pending = takePendingBridgeSession(callControlId);
      if (!pending) {
        console.warn("[telnyx-ws] sin sesión pendiente para", callControlId);
        ws.close();
        return;
      }

      const bridge = new TelnyxGeminiBridge(ws, pending);
      bridges.set(ws, bridge);
      bridge.markAnswered();
      void bridge.start();
      return;
    }

    const bridge = bridges.get(ws);
    if (bridge) bridge.handleTelnyxFrame(text);
  });

  ws.on("close", () => {
    const bridge = bridges.get(ws);
    if (bridge) void bridge.close("Stream Closed");
    console.info("[telnyx-ws] connection closed");
  });

  ws.on("error", err => {
    console.error("[telnyx-ws] error:", err);
    const bridge = bridges.get(ws);
    if (bridge) void bridge.close("Stream Error");
  });
}

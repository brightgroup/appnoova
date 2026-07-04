import { createServer } from "http";
import { existsSync, readdirSync, rmSync } from "fs";
import { join } from "path";
import { parse } from "url";
import next from "next";
import { WebSocketServer } from "ws";
import { handleTelnyxMediaSocket } from "./src/lib/telephony/telnyx-ws-handler";
import { startCampaignDialerScheduler } from "./src/lib/call-engine/dialer-scheduler";

/** Limpia caché dev corrupta (p. ej. restos de build en .next-dev). */
function clearStaleDevCache(): void {
  const distDir = process.env.NEXT_DIST_DIR || ".next-dev";
  const nextDir = join(process.cwd(), distDir);
  const cssDir = join(nextDir, "static", "css");
  const devLayoutCss = join(cssDir, "app", "layout.css");

  if (!existsSync(nextDir) || existsSync(devLayoutCss)) return;

  const hasBrokenDevCss =
    existsSync(cssDir) &&
    readdirSync(cssDir).some(name => /^[a-f0-9]{8,}\.css$/.test(name)) &&
    !existsSync(join(cssDir, "app"));

  if (hasBrokenDevCss) {
    rmSync(nextDir, { recursive: true, force: true });
    console.log(`> Cleared stale ${distDir} cache`);
  }
}

const dev = process.env.NODE_ENV !== "production";
if (dev) clearStaleDevCache();
const hostname = process.env.HOSTNAME || "0.0.0.0";
const port = parseInt(process.env.PORT || "8000", 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const server = createServer((req, res) => {
    const parsedUrl = parse(req.url!, true);
    handle(req, res, parsedUrl);
  });

  const wss = new WebSocketServer({ noServer: true });

  const wsPaths = new Set([
    "/telephony/ws/telnyx-media",
    "/api/telephony/ws/telnyx-media"
  ]);

  server.on("upgrade", (request, socket, head) => {
    const { pathname } = parse(request.url || "");
    if (pathname && wsPaths.has(pathname)) {
      wss.handleUpgrade(request, socket, head, ws => {
        handleTelnyxMediaSocket(ws);
      });
      return;
    }
    socket.destroy();
  });

  server.listen(port, hostname, () => {
    console.log(`> Noova ready on http://${hostname}:${port}`);
    console.log(`> Telnyx media WS: ws://${hostname}:${port}/api/telephony/ws/telnyx-media`);
    if (hostname === "0.0.0.0") {
      console.log(`> Local: http://127.0.0.1:${port}`);
    }
    startCampaignDialerScheduler();
  }).on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE") {
      console.error(`> Puerto ${port} en uso. Libéralo con: lsof -ti:${port} | xargs kill -9`);
      process.exit(1);
    }
    throw err;
  });
});

import { createServer } from "http";
import { parse } from "url";
import next from "next";
import { WebSocketServer } from "ws";
import { handleTelnyxMediaSocket } from "./src/lib/telephony/telnyx-ws-handler";

const dev = process.env.NODE_ENV !== "production";
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

  server.on("upgrade", (request, socket, head) => {
    const { pathname } = parse(request.url || "");
    if (pathname === "/telephony/ws/telnyx-media") {
      wss.handleUpgrade(request, socket, head, ws => {
        handleTelnyxMediaSocket(ws);
      });
      return;
    }
    socket.destroy();
  });

  server.listen(port, hostname, () => {
    console.log(`> Noova ready on http://${hostname}:${port}`);
    console.log(`> Telnyx media WS: ws://${hostname}:${port}/telephony/ws/telnyx-media`);
  });
});

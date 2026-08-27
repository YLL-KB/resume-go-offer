import "./env";
import { serve } from "@hono/node-server";
import app, { injectWebSocket } from "./app";

const port = Number(process.env.PORT ?? 8787);

const server = serve({ fetch: app.fetch, port }, (info) => {
  console.log(`[server] listening on http://localhost:${info.port}`);
});

injectWebSocket(server);

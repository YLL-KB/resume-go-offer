import { Hono } from "hono";

export const health = new Hono().get("/health", (c) =>
  c.json({ ok: true, time: new Date().toISOString() }),
);

import { Hono } from "hono";
import { health } from "./routes/health";
import { auth } from "./routes/auth";
import { requestLogger } from "./lib/logging/request-logger";

const app = new Hono();

app.route("/", health);

const api = new Hono();
api.use("*", requestLogger);
api.route("/auth", auth);

app.route("/api", api);

export default app;

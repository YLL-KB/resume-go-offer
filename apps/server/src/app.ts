import { Hono } from "hono";
import { health } from "./routes/health";
import { auth } from "./routes/auth";
import { chatRoutes } from "./routes/chat";
import { aiRoutes } from "./routes/ai";
import { pdfRoutes } from "./routes/pdf";
import { templatesRoutes } from "./routes/templates";
import { requestLogger } from "./lib/logging/request-logger";

const app = new Hono();

app.route("/", health);

const api = new Hono();
api.use("*", requestLogger);
api.route("/auth", auth);
api.route("/chat", chatRoutes);
api.route("/ai", aiRoutes);
api.route("/pdf", pdfRoutes);
api.route("/templates", templatesRoutes);

app.route("/api", api);

export default app;

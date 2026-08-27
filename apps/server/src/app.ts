import { Hono } from "hono";
import { health } from "./routes/health";
import { auth } from "./routes/auth";
import { chatRoutes } from "./routes/chat";
import { aiRoutes } from "./routes/ai";
import { pdfRoutes } from "./routes/pdf";
import { templatesRoutes } from "./routes/templates";
import { adminRoutes } from "./routes/admin";
import { permissionsRoutes } from "./routes/permissions";
import { applicationsRoutes } from "./routes/applications";
import { resumeRoutes } from "./routes/resume";
import { analysisRoutes } from "./routes/analysis";
import { byokRoutes } from "./routes/byok";
import { usageRoutes } from "./routes/usage";
import { interviewRoutes } from "./routes/interview";
import { interviewRealtimeHandler } from "./routes/interview-realtime";
import { createNodeWebSocket } from "@hono/node-ws";
import { requestLogger } from "./lib/logging/request-logger";

const app = new Hono();
const { upgradeWebSocket, injectWebSocket } = createNodeWebSocket({ app });

app.route("/health", health);

const api = new Hono();
api.use("*", requestLogger);
api.route("/health", health);
api.route("/auth", auth);
api.route("/chat", chatRoutes);
api.route("/ai", aiRoutes);
api.route("/pdf", pdfRoutes);
api.route("/templates", templatesRoutes);
api.route("/admin", adminRoutes);
api.route("/admin/permissions", permissionsRoutes);
api.route("/applications", applicationsRoutes);
api.route("/resume", resumeRoutes);
api.route("/analysis", analysisRoutes);
api.route("/user/ai-config", byokRoutes);
api.route("/user/usage", usageRoutes);
api.route("/interview", interviewRoutes);
api.get("/interview/:id/realtime", upgradeWebSocket(interviewRealtimeHandler));

app.route("/api", api);

export default app;
export { injectWebSocket };

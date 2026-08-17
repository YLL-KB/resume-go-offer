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
import { requestLogger } from "./lib/logging/request-logger";

const app = new Hono();

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

app.route("/api", api);

export default app;

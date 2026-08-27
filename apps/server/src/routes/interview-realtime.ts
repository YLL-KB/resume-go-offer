/**
 * 面试 Realtime WebSocket 端点 — 全双工语音面试。
 *
 * 前端连 /api/interview/:id/realtime，后端作为中间人：
 *   - onOpen：鉴权 + 校验会话归属 + 读简历/JD → 连智谱并下发 session.update
 *   - onMessage：前端音频事件（input_audio_buffer.append 等）→ 转发给智谱
 *   - 智谱事件：原样转发前端，同时拦截转写落库（candidate / interviewer）
 */

import type { Context } from "hono";
import type { WSContext } from "hono/ws";
import { getDb } from "../db";
import { interviewSessions, interviewMessages, resumes } from "../db/schema";
import { getAuthUserId } from "../lib/auth/utils";
import { eq, and } from "drizzle-orm";
import { safeJsonParse } from "../lib/ai";
import {
  startRealtimeSession,
  buildRealtimeInstructions,
  type RealtimeSession,
} from "../lib/ai/realtime";

export function interviewRealtimeHandler(c: Context) {
  const id = c.req.param("id")!;
  let realtime: RealtimeSession | null = null;

  return {
    async onOpen(_evt: unknown, ws: WSContext) {
      try {
        const { userId, isAnonymous } = await getAuthUserId(c.req.raw);
        if (isAnonymous) {
          ws.close(4001, "请先登录");
          return;
        }

        const db = getDb();
        const [session] = db
          .select()
          .from(interviewSessions)
          .where(and(eq(interviewSessions.id, id), eq(interviewSessions.userId, userId)))
          .limit(1)
          .all();
        if (!session) {
          ws.close(4004, "面试会话不存在");
          return;
        }
        if (session.status === "completed") {
          ws.close(4000, "面试已结束");
          return;
        }

        let resumeData: unknown = null;
        const [resume] = db
          .select()
          .from(resumes)
          .where(eq(resumes.id, session.resumeId))
          .limit(1)
          .all();
        if (resume) {
          try {
            resumeData = JSON.parse(resume.data);
          } catch {
            resumeData = resume.data;
          }
        }
        const jd = session.jd ? (safeJsonParse(session.jd) ?? session.jd) : null;

        const instructions = buildRealtimeInstructions(resumeData, jd);

        realtime = startRealtimeSession({
          instructions,
          onServerEvent: (event) => {
            try {
              ws.send(JSON.stringify(event));
            } catch {
              // 前端已断开，忽略
            }
          },
          onCandidateText: (text) => {
            try {
              db.insert(interviewMessages)
                .values({
                  id: crypto.randomUUID(),
                  sessionId: id,
                  role: "candidate",
                  content: text,
                  createdAt: new Date().toISOString(),
                })
                .run();
            } catch (err) {
              console.error("落库候选人消息失败", err);
            }
          },
          onInterviewerText: (text) => {
            try {
              db.insert(interviewMessages)
                .values({
                  id: crypto.randomUUID(),
                  sessionId: id,
                  role: "interviewer",
                  content: text,
                  createdAt: new Date().toISOString(),
                })
                .run();
            } catch (err) {
              console.error("落库面试官消息失败", err);
            }
          },
        });
      } catch (err) {
        console.error("Realtime 面试连接失败", err);
        try {
          ws.close(1011, "连接失败");
        } catch {
          // 忽略
        }
      }
    },

    onMessage(evt: { data: unknown }, _ws: WSContext) {
      if (!realtime) return;
      try {
        const data = typeof evt.data === "string" ? JSON.parse(evt.data) : evt.data;
        realtime.send(data);
      } catch {
        // 非法消息，忽略
      }
    },

    onClose() {
      realtime?.close();
      realtime = null;
    },
  };
}

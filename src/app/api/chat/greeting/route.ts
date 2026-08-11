/**
 * POST /api/chat/greeting
 *
 * 为新对话生成唯一的 AI 开场白，写入数据库后返回。
 * 每次调用生成的问候语都不同（temperature=1.0）。
 */

import { NextRequest, NextResponse } from "next/server";
import { ai } from "@/lib/ai";
import { getDb } from "@/lib/db";
import { conversations, messages } from "@/lib/db/schema";
import { getAuthUserId, ANON_COOKIE } from "@/lib/auth/utils";
import { eq } from "drizzle-orm";

const GREETING_PROMPT = `你是一位拥有10年经验的资深大厂HR兼金牌职业规划师，也是用户的简历顾问。
现在用户刚刚打开对话，请生成一段温暖、专业、热情的开场白来欢迎用户。

要求：
- 每次的措辞、语气、结构都要有变化，不能千篇一律
- 控制在60-120字之间
- 提到你可以帮用户做简历优化、职业规划、投递建议等
- 用自然的语气，不要太机械或模板化`;

export async function POST(request: NextRequest) {
  try {
    const db = getDb();
    const { userId, isAnonymous } = await getAuthUserId(request);

    // 匿名用户限制：最多 5 个对话
    if (isAnonymous) {
      const rows = await (db as ReturnType<typeof getDb>)
        .select()
        .from(conversations)
        .where(eq(conversations.userId, userId))
        .limit(5);
      if (rows.length >= Number(process.env.ANON_LIMIT || 5)) {
        return NextResponse.json(
          { error: "limit_reached", message: "未登录用户最多创建5个对话，请登录后继续使用" },
          { status: 403 }
        );
      }
    }

    const now = new Date().toISOString();

    // 1. 创建新对话
    const conversationId = crypto.randomUUID();
    await (db as ReturnType<typeof getDb>).insert(conversations).values({
      id: conversationId,
      userId,
      title: "新对话",
      createdAt: now,
      updatedAt: now,
    });

    // 2. 调用 AI 生成开场白
    const aiResponse = await ai.chat([
      { role: "system", content: GREETING_PROMPT },
      { role: "user", content: "请生成一段开场白" },
    ]);

    let greeting = "";
    const stream = aiResponse as AsyncIterable<{ choices: Array<{ delta: { content?: string } }> }>;
    for await (const chunk of stream) {
      greeting += chunk.choices[0]?.delta?.content ?? "";
    }

    // 3. 保存到数据库
    const messageId = crypto.randomUUID();
    await (db as ReturnType<typeof getDb>).insert(messages).values({
      id: messageId,
      conversationId,
      role: "assistant",
      content: greeting,
      createdAt: now,
    });

    const response = NextResponse.json({ conversationId, greeting });

    // 匿名用户：种持久化 Cookie
    if (isAnonymous) {
      response.headers.set(
        "Set-Cookie",
        `${ANON_COOKIE}=${userId}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=31536000`
      );
    }

    return response;
  } catch (err) {
    console.error("Greeting API error:", err);
    return NextResponse.json({ error: "生成开场白失败" }, { status: 500 });
  }
}

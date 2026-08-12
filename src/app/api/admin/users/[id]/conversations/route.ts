import { NextRequest, NextResponse } from "next/server";
import { withRequestLog } from "@/lib/logging/request-logger";
import { getDb } from "@/lib/db";
import { conversations, messages } from "@/lib/db/schema";
import { getAdminUser } from "@/lib/auth/admin";
import { eq, desc } from "drizzle-orm";

export const GET = withRequestLog(async (request: NextRequest,
  { params }: { params: Promise<{ id: string }> }) => {
  const admin = await getAdminUser(request);
  if (!admin) return NextResponse.json({ error: "无权限" }, { status: 403 });

  const { id } = await params;

  try {
    const db = getDb() as ReturnType<typeof getDb>;

    const userConversations = await db
      .select()
      .from(conversations)
      .where(eq(conversations.userId, id))
      .orderBy(desc(conversations.updatedAt))
      .all();

    const result = await Promise.all(
      userConversations.map(async (conv) => {
        const msgRows = await db
          .select()
          .from(messages)
          .where(eq(messages.conversationId, conv.id))
          .all();
        return {
          id: conv.id,
          title: conv.title,
          createdAt: conv.createdAt,
          updatedAt: conv.updatedAt,
          messageCount: msgRows.length,
        };
      })
    );

    return NextResponse.json({ conversations: result });
  } catch (err) {
    console.error("Admin conversations error:", err);
    return NextResponse.json({ error: "获取对话列表失败" }, { status: 500 });
  }
});

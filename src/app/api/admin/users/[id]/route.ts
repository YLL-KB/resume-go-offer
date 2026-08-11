import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { users, conversations, messages, resumes, applications } from "@/lib/db/schema";
import { getAdminUser } from "@/lib/auth/admin";
import { eq } from "drizzle-orm";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await getAdminUser(request);
  if (!admin) return NextResponse.json({ error: "无权限" }, { status: 403 });

  const { id } = await params;

  // 不能删除自己
  if (id === admin.id) {
    return NextResponse.json({ error: "不能删除自己" }, { status: 400 });
  }

  try {
    const db = getDb() as ReturnType<typeof getDb>;

    // 验证目标用户存在
    const [target] = await db.select().from(users).where(eq(users.id, id)).limit(1).all();
    if (!target) return NextResponse.json({ error: "用户不存在" }, { status: 404 });

    // 获取该用户所有对话 ID
    const userConversations = await db
      .select()
      .from(conversations)
      .where(eq(conversations.userId, id))
      .all();

    // 级联删除：messages → conversations → resumes → applications → user
    for (const conv of userConversations) {
      await db.delete(messages).where(eq(messages.conversationId, conv.id));
    }
    await db.delete(conversations).where(eq(conversations.userId, id));
    await db.delete(resumes).where(eq(resumes.userId, id));
    await db.delete(applications).where(eq(applications.userId, id));
    await db.delete(users).where(eq(users.id, id));

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Admin delete user error:", err);
    return NextResponse.json({ error: "删除用户失败" }, { status: 500 });
  }
}

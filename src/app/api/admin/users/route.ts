import { NextRequest, NextResponse } from "next/server";
import { withRequestLog } from "@/lib/logging/request-logger";
import { getDb } from "@/lib/db";
import { users, conversations } from "@/lib/db/schema";
import { getAdminUser } from "@/lib/auth/admin";
import { eq, desc } from "drizzle-orm";

export const GET = withRequestLog(async (request: NextRequest) => {
  const admin = await getAdminUser(request);
  if (!admin) return NextResponse.json({ error: "无权限" }, { status: 403 });

  try {
    const db = getDb() as ReturnType<typeof getDb>;
    const allUsers = await db.select().from(users).orderBy(desc(users.createdAt)).all();

    const result = await Promise.all(
      allUsers.map(async (u) => {
        const rows = await db
          .select()
          .from(conversations)
          .where(eq(conversations.userId, u.id))
          .all();
        return {
          id: u.id,
          name: u.name,
          email: u.email,
          avatarUrl: u.avatarUrl,
          githubLogin: u.githubLogin,
          createdAt: u.createdAt,
          conversationCount: rows.length,
        };
      })
    );

    return NextResponse.json({ users: result });
  } catch (err) {
    console.error("Admin users error:", err);
    return NextResponse.json({ error: "获取用户列表失败" }, { status: 500 });
  }
});

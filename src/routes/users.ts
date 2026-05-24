import { Router, type IRouter } from "express";
import { eq, desc, sql } from "drizzle-orm";
import { db, sessionsTable } from "@workspace/db";

const router: IRouter = Router();

router.get("/users", async (_req, res): Promise<void> => {
  const users = await db
    .select({
      discordUserId: sessionsTable.discordUserId,
      username: sessionsTable.username,
      displayName: sessionsTable.displayName,
      totalSessions: sql<number>`count(*)::int`,
      totalMinutes: sql<number>`coalesce(sum(${sessionsTable.totalMinutes}), 0)::int`,
      totalPauseMinutes: sql<number>`coalesce(sum(${sessionsTable.pauseMinutes}), 0)::int`,
      lastSeenAt: sql<string>`max(${sessionsTable.startedAt})`,
    })
    .from(sessionsTable)
    .groupBy(
      sessionsTable.discordUserId,
      sessionsTable.username,
      sessionsTable.displayName,
    )
    .orderBy(desc(sql`sum(${sessionsTable.totalMinutes})`));

  // Get current status for each user
  const activeSessionsByUser = await db
    .select({
      discordUserId: sessionsTable.discordUserId,
      status: sessionsTable.status,
    })
    .from(sessionsTable)
    .where(sql`${sessionsTable.status} IN ('active', 'paused')`);

  const activeMap = new Map(activeSessionsByUser.map((s) => [s.discordUserId, s.status]));

  const result = users.map((u) => ({
    ...u,
    currentStatus: activeMap.get(u.discordUserId) ?? null,
  }));

  res.json(result);
});

router.get("/users/:discordId", async (req, res): Promise<void> => {
  const discordId = Array.isArray(req.params.discordId)
    ? req.params.discordId[0]
    : req.params.discordId;

  const [user] = await db
    .select({
      discordUserId: sessionsTable.discordUserId,
      username: sessionsTable.username,
      displayName: sessionsTable.displayName,
      totalSessions: sql<number>`count(*)::int`,
      totalMinutes: sql<number>`coalesce(sum(${sessionsTable.totalMinutes}), 0)::int`,
      totalPauseMinutes: sql<number>`coalesce(sum(${sessionsTable.pauseMinutes}), 0)::int`,
      lastSeenAt: sql<string>`max(${sessionsTable.startedAt})`,
    })
    .from(sessionsTable)
    .where(eq(sessionsTable.discordUserId, discordId))
    .groupBy(
      sessionsTable.discordUserId,
      sessionsTable.username,
      sessionsTable.displayName,
    );

  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const [active] = await db
    .select({ status: sessionsTable.status })
    .from(sessionsTable)
    .where(
      sql`${sessionsTable.discordUserId} = ${discordId} AND ${sessionsTable.status} IN ('active', 'paused')`,
    );

  res.json({ ...user, currentStatus: active?.status ?? null });
});

router.get("/users/:discordId/sessions", async (req, res): Promise<void> => {
  const discordId = Array.isArray(req.params.discordId)
    ? req.params.discordId[0]
    : req.params.discordId;

  const sessions = await db
    .select()
    .from(sessionsTable)
    .where(eq(sessionsTable.discordUserId, discordId))
    .orderBy(desc(sessionsTable.startedAt));

  res.json(sessions);
});

export default router;

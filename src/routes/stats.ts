import { Router, type IRouter } from "express";
import { sql, desc } from "drizzle-orm";
import { db, sessionsTable } from "@workspace/db";

const router: IRouter = Router();

router.get("/stats/summary", async (_req, res): Promise<void> => {
  const [totals] = await db
    .select({
      totalUsers: sql<number>`count(distinct ${sessionsTable.discordUserId})::int`,
      totalSessions: sql<number>`count(*)::int`,
      activeSessions: sql<number>`count(*) filter (where ${sessionsTable.status} = 'active')::int`,
      pausedSessions: sql<number>`count(*) filter (where ${sessionsTable.status} = 'paused')::int`,
      totalMinutes: sql<number>`coalesce(sum(${sessionsTable.totalMinutes}), 0)::int`,
    })
    .from(sessionsTable);

  const [today] = await db
    .select({
      todaySessions: sql<number>`count(*)::int`,
      todayMinutes: sql<number>`coalesce(sum(${sessionsTable.totalMinutes}), 0)::int`,
    })
    .from(sessionsTable)
    .where(sql`${sessionsTable.startedAt} >= current_date`);

  res.json({
    totalUsers: totals?.totalUsers ?? 0,
    totalSessions: totals?.totalSessions ?? 0,
    activeSessions: totals?.activeSessions ?? 0,
    pausedSessions: totals?.pausedSessions ?? 0,
    totalHours: Math.round(((totals?.totalMinutes ?? 0) / 60) * 10) / 10,
    todaySessions: today?.todaySessions ?? 0,
    todayHours: Math.round(((today?.todayMinutes ?? 0) / 60) * 10) / 10,
  });
});

router.get("/stats/leaderboard", async (req, res): Promise<void> => {
  const limit = parseInt(String(req.query.limit ?? "10"), 10) || 10;

  const rows = await db
    .select({
      discordUserId: sessionsTable.discordUserId,
      username: sessionsTable.username,
      displayName: sessionsTable.displayName,
      totalMinutes: sql<number>`coalesce(sum(${sessionsTable.totalMinutes}), 0)::int`,
      totalSessions: sql<number>`count(*)::int`,
    })
    .from(sessionsTable)
    .groupBy(
      sessionsTable.discordUserId,
      sessionsTable.username,
      sessionsTable.displayName,
    )
    .orderBy(desc(sql`sum(${sessionsTable.totalMinutes})`))
    .limit(limit);

  const result = rows.map((r, i) => ({ rank: i + 1, ...r }));
  res.json(result);
});

router.get("/stats/daily", async (_req, res): Promise<void> => {
  const rows = await db
    .select({
      date: sql<string>`date(${sessionsTable.startedAt})::text`,
      sessions: sql<number>`count(*)::int`,
      minutes: sql<number>`coalesce(sum(${sessionsTable.totalMinutes}), 0)::int`,
    })
    .from(sessionsTable)
    .where(sql`${sessionsTable.startedAt} >= current_date - interval '30 days'`)
    .groupBy(sql`date(${sessionsTable.startedAt})`)
    .orderBy(sql`date(${sessionsTable.startedAt})`);

  const result = rows.map((r) => ({
    date: r.date,
    sessions: r.sessions,
    hours: Math.round((r.minutes / 60) * 10) / 10,
  }));

  res.json(result);
});

export default router;

import { Router, type IRouter } from "express";
import { eq, desc, and, sql } from "drizzle-orm";
import { db, sessionsTable } from "@workspace/db";
import {
  ListSessionsQueryParams,
  GetSessionParams,
} from "@workspace/api-zod";
import { logger } from "../lib/logger";

const router: IRouter = Router();

router.get("/sessions/active", async (_req, res): Promise<void> => {
  const sessions = await db
    .select()
    .from(sessionsTable)
    .where(sql`${sessionsTable.status} IN ('active', 'paused')`)
    .orderBy(desc(sessionsTable.startedAt));
  res.json(sessions);
});

router.get("/sessions", async (req, res): Promise<void> => {
  const parsed = ListSessionsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { userId, status, limit } = parsed.data;

  const conditions = [];
  if (userId) conditions.push(eq(sessionsTable.discordUserId, userId));
  if (status) conditions.push(eq(sessionsTable.status, status));

  const sessions = await db
    .select()
    .from(sessionsTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(sessionsTable.startedAt))
    .limit(limit ?? 50);

  res.json(sessions);
});

router.get("/sessions/:id", async (req, res): Promise<void> => {
  const params = GetSessionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [session] = await db
    .select()
    .from(sessionsTable)
    .where(eq(sessionsTable.id, params.data.id));

  if (!session) {
    res.status(404).json({ error: "Session not found" });
    return;
  }

  res.json(session);
});

export default router;

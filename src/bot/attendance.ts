import { eq, sql, gte } from "drizzle-orm";
import { db, sessionsTable, bankTransactionsTable } from "@workspace/db";
import { logger } from "../lib/logger";

function getWeekStart(): Date {
  const now = new Date();
  const day = now.getUTCDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  const daysFromMonday = (day + 6) % 7; // days since last Monday
  const monday = new Date(now);
  monday.setUTCDate(now.getUTCDate() - daysFromMonday);
  monday.setUTCHours(0, 0, 0, 0);
  return monday;
}

function minutesSince(date: Date): number {
  return Math.floor((Date.now() - date.getTime()) / 60000);
}

export async function handleIniciar(
  discordUserId: string,
  username: string,
  displayName: string,
): Promise<string> {
  // Check if there's already an active/paused session
  const [existing] = await db
    .select()
    .from(sessionsTable)
    .where(
      sql`${sessionsTable.discordUserId} = ${discordUserId} AND ${sessionsTable.status} IN ('active', 'paused')`,
    );

  if (existing) {
    if (existing.status === "active") {
      return `Você já tem uma sessão ativa desde <t:${Math.floor(new Date(existing.startedAt).getTime() / 1000)}:R>. Use \`/pausar\` ou \`/encerrar\`.`;
    }
    if (existing.status === "paused") {
      // Resume from pause
      const pauseDuration = existing.pausedAt
        ? minutesSince(new Date(existing.pausedAt))
        : 0;
      await db
        .update(sessionsTable)
        .set({
          status: "active",
          pausedAt: null,
          pauseMinutes: existing.pauseMinutes + pauseDuration,
        })
        .where(eq(sessionsTable.id, existing.id));
      return `Sessão retomada! Você estava pausado por ${pauseDuration} minuto(s).`;
    }
  }

  // Start a new session
  await db.insert(sessionsTable).values({
    discordUserId,
    username,
    displayName,
    status: "active",
  });

  return `Presença iniciada! Boa sessão, **${displayName || username}**! ✅`;
}

export async function handlePausar(discordUserId: string): Promise<string> {
  const [session] = await db
    .select()
    .from(sessionsTable)
    .where(
      sql`${sessionsTable.discordUserId} = ${discordUserId} AND ${sessionsTable.status} = 'active'`,
    );

  if (!session) {
    return "Você não tem nenhuma sessão ativa no momento. Use `/iniciar` para começar.";
  }

  await db
    .update(sessionsTable)
    .set({
      status: "paused",
      pausedAt: new Date(),
      totalMinutes: minutesSince(new Date(session.startedAt)) - session.pauseMinutes,
    })
    .where(eq(sessionsTable.id, session.id));

  return `Sessão pausada. Use \`/iniciar\` para retomar ou \`/encerrar\` para finalizar.`;
}

export async function handleEncerrar(discordUserId: string): Promise<string> {
  const [session] = await db
    .select()
    .from(sessionsTable)
    .where(
      sql`${sessionsTable.discordUserId} = ${discordUserId} AND ${sessionsTable.status} IN ('active', 'paused')`,
    );

  if (!session) {
    return "Você não tem nenhuma sessão ativa no momento. Use `/iniciar` para começar.";
  }

  const now = new Date();
  const totalElapsed = minutesSince(new Date(session.startedAt));
  const extraPause =
    session.status === "paused" && session.pausedAt
      ? minutesSince(new Date(session.pausedAt))
      : 0;
  const totalPause = session.pauseMinutes + extraPause;
  const netMinutes = Math.max(0, totalElapsed - totalPause);

  const hours = Math.floor(netMinutes / 60);
  const mins = netMinutes % 60;
  const timeStr = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;

  await db
    .update(sessionsTable)
    .set({
      status: "ended",
      endedAt: now,
      totalMinutes: netMinutes,
      pauseMinutes: totalPause,
    })
    .where(eq(sessionsTable.id, session.id));

  return `Sessão encerrada! Tempo registrado: **${timeStr}** (pausas: ${totalPause}m). Ótimo trabalho!`;
}

export async function handleHoras(
  requesterId: string,
  targetId: string,
  targetName: string,
): Promise<string> {
  const [stats] = await db
    .select({
      totalMinutes: sql<number>`coalesce(sum(${sessionsTable.totalMinutes}), 0)::int`,
      totalSessions: sql<number>`count(*)::int`,
    })
    .from(sessionsTable)
    .where(
      sql`${sessionsTable.discordUserId} = ${targetId} AND ${sessionsTable.status} = 'ended'`,
    );

  if (!stats || stats.totalSessions === 0) {
    const isSelf = requesterId === targetId;
    return isSelf
      ? "Você ainda não tem nenhuma sessão registrada. Use `/iniciar` para começar!"
      : `**${targetName}** ainda não tem sessões registradas.`;
  }

  const hours = Math.floor(stats.totalMinutes / 60);
  const mins = stats.totalMinutes % 60;
  const timeStr = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
  const isSelf = requesterId === targetId;
  const name = isSelf ? "Você" : `**${targetName}**`;

  return `${name} tem **${timeStr}** registradas em **${stats.totalSessions}** sessão(ões) concluída(s).`;
}

const ALLOWED_ROLES = ["admin", "lider", "líder"];

export async function handleAjustar(
  adminId: string,
  adminName: string,
  targetId: string,
  targetUsername: string,
  targetDisplayName: string,
  horasFloat: number,
  motivo: string,
  memberRoleNames: string[],
): Promise<string> {
  // Permission check — must have @Admin or @Lider role
  const hasPermission = memberRoleNames.some((r) =>
    ALLOWED_ROLES.includes(r.toLowerCase()),
  );

  if (!hasPermission) {
    return "Sem permissão. Apenas membros com cargo **@Admin** ou **@Lider** podem usar este comando.";
  }

  const minutes = Math.round(horasFloat * 60);

  if (minutes === 0) {
    return "O ajuste não pode ser zero. Informe um valor diferente de 0.";
  }

  const sign = minutes > 0 ? "+" : "";
  const absH = Math.floor(Math.abs(minutes) / 60);
  const absM = Math.abs(minutes) % 60;
  const timeStr = absH > 0 ? `${absH}h ${absM}m` : `${absM}m`;
  const action = minutes > 0 ? "adicionado" : "removido";

  const noteText = `[AJUSTE] ${sign}${timeStr} por @${adminName} (ID: ${adminId}) — motivo: ${motivo}`;

  const now = new Date();

  // Insert as a completed session so it flows into all existing aggregates
  await db.insert(sessionsTable).values({
    discordUserId: targetId,
    username: targetUsername,
    displayName: targetDisplayName || null,
    status: "ended",
    startedAt: now,
    endedAt: now,
    totalMinutes: minutes,
    pauseMinutes: 0,
    notes: noteText,
  });

  logger.info(
    { adminId, adminName, targetId, minutes, motivo },
    "Manual hours adjustment applied",
  );

  return (
    `Ajuste registrado com sucesso!\n` +
    `**Usuário:** ${targetDisplayName || targetUsername}\n` +
    `**Alteração:** ${sign}${timeStr} ${action}\n` +
    `**Motivo:** ${motivo}\n` +
    `**Registrado por:** @${adminName}`
  );
}

export async function handleExportar(
  periodo: string,
): Promise<{ attachment: import("discord.js").AttachmentBuilder; label: string }> {
  const { AttachmentBuilder } = await import("discord.js");
  const now = new Date();

  let start: Date | null = null;
  let end: Date | null = null;
  let label = "";

  if (periodo === "esta_semana") {
    start = getWeekStart();
    label = "esta_semana";
  } else if (periodo === "semana_passada") {
    end = getWeekStart();
    const prev = new Date(end);
    prev.setUTCDate(prev.getUTCDate() - 7);
    start = prev;
    label = "semana_passada";
  } else if (periodo === "este_mes") {
    start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    label = "este_mes";
  } else if (periodo === "mes_passado") {
    const firstOfThisMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    end = firstOfThisMonth;
    start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
    label = "mes_passado";
  } else {
    label = "total";
  }

  const conditions: import("drizzle-orm").SQL[] = [];
  if (start) conditions.push(sql`${sessionsTable.startedAt} >= ${start}`);
  if (end) conditions.push(sql`${sessionsTable.startedAt} < ${end}`);

  const sessions = await db
    .select()
    .from(sessionsTable)
    .where(conditions.length > 0 ? sql`${conditions[0]}${conditions[1] ? sql` AND ${conditions[1]}` : sql``}` : undefined)
    .orderBy(sessionsTable.startedAt);

  const escape = (v: string | number | null) => {
    if (v == null) return "";
    const s = String(v);
    return s.includes(",") || s.includes('"') || s.includes("\n")
      ? `"${s.replace(/"/g, '""')}"`
      : s;
  };

  const header = [
    "ID",
    "Discord ID",
    "Usuário",
    "Nome de Exibição",
    "Status",
    "Início",
    "Fim",
    "Minutos Líquidos",
    "Minutos de Pausa",
    "Horas Líquidas",
  ].join(",");

  const rows = sessions.map((s) => {
    const horas = (s.totalMinutes / 60).toFixed(2);
    return [
      s.id,
      s.discordUserId,
      s.username,
      s.displayName ?? "",
      s.status,
      new Date(s.startedAt).toISOString(),
      s.endedAt ? new Date(s.endedAt).toISOString() : "",
      s.totalMinutes,
      s.pauseMinutes,
      horas,
    ]
      .map(escape)
      .join(",");
  });

  const csv = [header, ...rows].join("\n");
  const buf = Buffer.from("\uFEFF" + csv, "utf-8"); // BOM for Excel UTF-8 compat
  const filename = `presenca_${label}_${now.toISOString().slice(0, 10)}.csv`;
  const attachment = new AttachmentBuilder(buf, { name: filename });

  return { attachment, label: filename };
}

export async function handleRanking(): Promise<{ embed: import("discord.js").EmbedBuilder }> {
  const { EmbedBuilder } = await import("discord.js");
  const weekStart = getWeekStart();

  // Fetch all sessions from this week
  const sessions = await db
    .select()
    .from(sessionsTable)
    .where(gte(sessionsTable.startedAt, weekStart));

  // Aggregate minutes per user, accounting for live active/paused sessions
  const userMap = new Map<
    string,
    { username: string; displayName: string | null; minutes: number }
  >();

  for (const s of sessions) {
    let minutes = 0;

    if (s.status === "ended") {
      minutes = s.totalMinutes;
    } else if (s.status === "active") {
      // Live: elapsed since start minus all accumulated pauses
      minutes = Math.max(0, minutesSince(new Date(s.startedAt)) - s.pauseMinutes);
    } else if (s.status === "paused" && s.pausedAt) {
      // Elapsed up to when it was paused
      minutes = Math.max(
        0,
        minutesSince(new Date(s.startedAt)) -
          s.pauseMinutes -
          minutesSince(new Date(s.pausedAt)),
      );
    }

    const existing = userMap.get(s.discordUserId);
    if (existing) {
      existing.minutes += minutes;
    } else {
      userMap.set(s.discordUserId, {
        username: s.username,
        displayName: s.displayName ?? null,
        minutes,
      });
    }
  }

  // Sort by minutes descending, take top 10
  const sorted = [...userMap.entries()]
    .sort((a, b) => b[1].minutes - a[1].minutes)
    .slice(0, 10);

  const medals = ["🥇", "🥈", "🥉"];
  const weekStartStr = weekStart.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "UTC",
  });

  const embed = new EmbedBuilder()
    .setTitle("Ranking Semanal de Presença")
    .setDescription(`Top 10 membros com mais horas registradas esta semana (a partir de ${weekStartStr})`)
    .setColor(0x5865f2)
    .setTimestamp();

  if (sorted.length === 0) {
    embed.addFields({ name: "Sem dados", value: "Nenhuma sessão registrada esta semana ainda." });
    return { embed };
  }

  const lines = sorted.map(([, data], i) => {
    const name = data.displayName || data.username;
    const h = Math.floor(data.minutes / 60);
    const m = data.minutes % 60;
    const timeStr = h > 0 ? `${h}h ${m}m` : `${m}m`;
    const medal = medals[i] ?? `**${i + 1}.**`;
    return `${medal} **${name}** — ${timeStr}`;
  });

  embed.addFields({ name: "\u200b", value: lines.join("\n") });
  embed.setFooter({ text: "Zera toda segunda-feira às 00:00 UTC" });

  return { embed };
}

// ─── Bank helpers ────────────────────────────────────────────────────────────

const WEEKLY_THRESHOLD_MINUTES = 15 * 60; // 15 h

function getWeekKey(date: Date): string {
  const d = new Date(date);
  const day = d.getUTCDay();
  const diff = (day + 6) % 7;
  d.setUTCDate(d.getUTCDate() - diff);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

async function calculateBankBalance(discordUserId: string): Promise<{
  depositedMinutes: number;
  usedMinutes: number;
  balanceMinutes: number;
  weekBreakdown: Array<{ weekStart: string; netMinutes: number; deposited: number }>;
}> {
  const weekStart = getWeekStart();

  // All ended sessions from completed weeks (before current Monday)
  const sessions = await db
    .select()
    .from(sessionsTable)
    .where(
      sql`${sessionsTable.discordUserId} = ${discordUserId}
          AND ${sessionsTable.status} = 'ended'
          AND ${sessionsTable.startedAt} < ${weekStart}`,
    );

  // Group by ISO week
  const weekMap = new Map<string, number>();
  for (const s of sessions) {
    const key = getWeekKey(new Date(s.startedAt));
    weekMap.set(key, (weekMap.get(key) ?? 0) + s.totalMinutes);
  }

  const weekBreakdown: Array<{ weekStart: string; netMinutes: number; deposited: number }> = [];
  let depositedMinutes = 0;

  for (const [key, total] of weekMap) {
    const net = Math.max(0, total);
    const deposited = Math.max(0, net - WEEKLY_THRESHOLD_MINUTES);
    depositedMinutes += deposited;
    if (deposited > 0) {
      weekBreakdown.push({ weekStart: key, netMinutes: net, deposited });
    }
  }

  // All withdrawals
  const [withdrawalRow] = await db
    .select({ total: sql<number>`coalesce(sum(${bankTransactionsTable.minutes}), 0)::int` })
    .from(bankTransactionsTable)
    .where(eq(bankTransactionsTable.discordUserId, discordUserId));

  const usedMinutes = withdrawalRow?.total ?? 0;

  return {
    depositedMinutes,
    usedMinutes,
    balanceMinutes: depositedMinutes - usedMinutes,
    weekBreakdown: weekBreakdown.sort((a, b) => a.weekStart.localeCompare(b.weekStart)),
  };
}

function fmtMin(minutes: number): string {
  const h = Math.floor(Math.abs(minutes) / 60);
  const m = Math.abs(minutes) % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

// ─── /bancohoras ──────────────────────────────────────────────────────────────

export async function handleBancoHoras(discordUserId: string): Promise<string> {
  const { depositedMinutes, usedMinutes, balanceMinutes, weekBreakdown } =
    await calculateBankBalance(discordUserId);

  const balance = fmtMin(balanceMinutes);
  const deposited = fmtMin(depositedMinutes);
  const used = fmtMin(usedMinutes);

  const lines: string[] = [
    `**Saldo atual:** ${balanceMinutes >= 0 ? `+${balance}` : `-${balance}`}`,
    `**Total acumulado:** ${deposited}`,
    `**Total utilizado:** ${used}`,
    ``,
    `*Regra: horas acima de 15h/semana vão pro banco.*`,
  ];

  if (weekBreakdown.length > 0) {
    lines.push(``, `**Semanas com excedente depositado:**`);
    for (const w of weekBreakdown.slice(-5)) {
      const date = new Date(w.weekStart).toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        timeZone: "UTC",
      });
      lines.push(`  Semana de ${date} — ${fmtMin(w.netMinutes)} trabalhadas → +${fmtMin(w.deposited)} no banco`);
    }
    if (weekBreakdown.length > 5) {
      lines.push(`  _(e mais ${weekBreakdown.length - 5} semana(s) anteriores)_`);
    }
  } else {
    lines.push(``, `_Nenhum excedente acumulado ainda. Trabalhe mais de 15h em uma semana para começar a juntar horas._`);
  }

  return lines.join("\n");
}

// ─── /usarbanco ───────────────────────────────────────────────────────────────

export async function handleUsarBanco(
  discordUserId: string,
  username: string,
  displayName: string,
  horasFloat: number,
  motivo: string,
): Promise<string> {
  const minutes = Math.round(horasFloat * 60);

  if (minutes <= 0) {
    return "Informe um valor positivo de horas para descontar.";
  }

  const { balanceMinutes } = await calculateBankBalance(discordUserId);

  if (minutes > balanceMinutes) {
    const balance = fmtMin(balanceMinutes);
    const requested = fmtMin(minutes);
    return (
      `Saldo insuficiente. Você tem **${balance}** no banco, mas está tentando usar **${requested}**.\n` +
      `Acumule mais horas acima de 15h/semana para aumentar seu saldo.`
    );
  }

  await db.insert(bankTransactionsTable).values({
    discordUserId,
    username,
    displayName: displayName || null,
    minutes,
    reason: motivo,
  });

  const newBalance = fmtMin(balanceMinutes - minutes);
  const used = fmtMin(minutes);

  logger.info({ discordUserId, minutes, motivo }, "Bank hours used");

  return (
    `Folga registrada com sucesso!\n` +
    `**Horas descontadas:** ${used}\n` +
    `**Motivo:** ${motivo}\n` +
    `**Novo saldo:** ${newBalance}`
  );
}

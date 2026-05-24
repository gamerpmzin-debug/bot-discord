import cron from "node-cron";
import { type Client, ChannelType, EmbedBuilder } from "discord.js";
import { logger } from "../lib/logger";
import { handleRanking } from "./attendance";

const CHANNEL_NAME = "ranking-semanal";
const TIMEZONE = "America/Sao_Paulo";

async function postWeeklySummary(client: Client): Promise<void> {
  const guildId = process.env.DISCORD_GUILD_ID;
  if (!guildId) {
    logger.warn("DISCORD_GUILD_ID not set — cannot post weekly summary");
    return;
  }

  let guild;
  try {
    guild = await client.guilds.fetch(guildId);
  } catch (err) {
    logger.error({ err }, "Failed to fetch guild for weekly summary");
    return;
  }

  // Fetch all channels and find #ranking-semanal
  const channels = await guild.channels.fetch();
  const channel = channels.find(
    (c) => c?.type === ChannelType.GuildText && c.name === CHANNEL_NAME,
  );

  if (!channel || channel.type !== ChannelType.GuildText) {
    logger.warn(
      { guildId, channelName: CHANNEL_NAME },
      `Channel #${CHANNEL_NAME} not found — create it in your server so the weekly summary can be posted`,
    );
    return;
  }

  try {
    const { embed } = await handleRanking();

    // Override title and footer to make it clear this is the final weekly result
    const finalEmbed = new EmbedBuilder(embed.data)
      .setTitle("Resumo Semanal de Presença — Resultado Final")
      .setDescription(
        embed.data.description +
          "\n\n*Este é o ranking final da semana. O contador zera à meia-noite!*",
      )
      .setColor(0xffd700);

    await channel.send({ embeds: [finalEmbed] });
    logger.info({ channelName: CHANNEL_NAME }, "Weekly summary posted successfully");
  } catch (err) {
    logger.error({ err }, "Failed to post weekly summary");
  }
}

export function startScheduler(client: Client): void {
  // Every Sunday at 23:59 Brasília time (America/Sao_Paulo)
  cron.schedule(
    "59 23 * * 0",
    async () => {
      logger.info("Running weekly summary job (Sunday 23:59 BRT)");
      await postWeeklySummary(client);
    },
    { timezone: TIMEZONE },
  );

  logger.info(
    { timezone: TIMEZONE, schedule: "Sunday 23:59" },
    "Weekly summary scheduler started",
  );
}

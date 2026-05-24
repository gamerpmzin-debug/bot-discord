import { Client, GatewayIntentBits, Events, type Interaction } from "discord.js";
import { logger } from "../lib/logger";
import { registerCommands } from "./commands";
import { handleIniciar, handlePausar, handleEncerrar, handleHoras, handleRanking, handleExportar, handleAjustar, handleBancoHoras, handleUsarBanco } from "./attendance";
import { startScheduler } from "./scheduler";

let botClient: Client | null = null;

export async function startBot(): Promise<void> {
  const token = process.env.DISCORD_TOKEN;
  if (!token) {
    logger.warn("DISCORD_TOKEN not set — Discord bot will not start");
    return;
  }

  try {
    await registerCommands();
  } catch (err) {
    logger.warn({ err }, "Could not register slash commands — make sure the bot was invited with the 'applications.commands' scope. Visit: https://discord.com/oauth2/authorize?client_id=" + process.env.DISCORD_CLIENT_ID + "&permissions=0&scope=bot%20applications.commands");
  }

  const client = new Client({
    intents: [GatewayIntentBits.Guilds],
  });

  client.once(Events.ClientReady, (c) => {
    logger.info({ tag: c.user.tag }, "Discord bot logged in");
    startScheduler(c);
  });

  client.on(Events.InteractionCreate, async (interaction: Interaction) => {
    if (!interaction.isChatInputCommand()) return;

    const { commandName, user } = interaction;
    const username = user.username;
    const displayName = interaction.guild?.members.cache.get(user.id)?.displayName ?? user.displayName ?? username;

    // /ranking is public; all others are ephemeral
    const isPublic = commandName === "ranking";
    await interaction.deferReply({ ephemeral: !isPublic });

    try {
      if (commandName === "iniciar") {
        const reply = await handleIniciar(user.id, username, displayName);
        await interaction.editReply({ content: reply });
      } else if (commandName === "pausar") {
        const reply = await handlePausar(user.id);
        await interaction.editReply({ content: reply });
      } else if (commandName === "encerrar") {
        const reply = await handleEncerrar(user.id);
        await interaction.editReply({ content: reply });
      } else if (commandName === "horas") {
        const targetUser = interaction.options.getUser("usuario");
        const targetId = targetUser?.id ?? user.id;
        const targetName = targetUser?.displayName ?? targetUser?.username ?? displayName;
        const reply = await handleHoras(user.id, targetId, targetName);
        await interaction.editReply({ content: reply });
      } else if (commandName === "ranking") {
        const { embed } = await handleRanking();
        await interaction.editReply({ embeds: [embed] });
      } else if (commandName === "ajustar") {
        const targetUser = interaction.options.getUser("usuario", true);
        const horasFloat = interaction.options.getNumber("horas", true);
        const motivo = interaction.options.getString("motivo", true);

        // Collect the caller's role names for permission check
        const { GuildMember } = await import("discord.js");
        const member = interaction.member;
        const roleNames: string[] =
          member instanceof GuildMember
            ? member.roles.cache.map((r) => r.name)
            : [];

        const targetMember = interaction.guild?.members.cache.get(targetUser.id);
        const targetDisplayName =
          targetMember?.displayName ?? targetUser.displayName ?? targetUser.username;

        const reply = await handleAjustar(
          user.id,
          displayName,
          targetUser.id,
          targetUser.username,
          targetDisplayName,
          horasFloat,
          motivo,
          roleNames,
        );
        await interaction.editReply({ content: reply });
      } else if (commandName === "bancohoras") {
        const reply = await handleBancoHoras(user.id);
        await interaction.editReply({ content: reply });
      } else if (commandName === "usarbanco") {
        const horasFloat = interaction.options.getNumber("horas", true);
        const motivo = interaction.options.getString("motivo", true);
        const reply = await handleUsarBanco(user.id, username, displayName, horasFloat, motivo);
        await interaction.editReply({ content: reply });
      } else if (commandName === "exportar") {
        const periodo = interaction.options.getString("periodo", true);
        const { attachment, label } = await handleExportar(periodo);
        await interaction.editReply({
          content: `Aqui está seu relatório: **${label}**`,
          files: [attachment],
        });
      } else {
        await interaction.editReply({ content: "Comando desconhecido." });
      }
    } catch (err) {
      logger.error({ err, commandName }, "Error handling slash command");
      await interaction.editReply({
        content: "Ocorreu um erro ao processar o comando. Tente novamente.",
      });
    }
  });

  await client.login(token);
  botClient = client;
}

export function getBotClient(): Client | null {
  return botClient;
}

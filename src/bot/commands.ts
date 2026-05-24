import { REST, Routes, SlashCommandBuilder } from "discord.js";
import { logger } from "../lib/logger";

const commands = [
  new SlashCommandBuilder()
    .setName("iniciar")
    .setDescription("Inicia sua sessão de presença")
    .toJSON(),
  new SlashCommandBuilder()
    .setName("pausar")
    .setDescription("Pausa sua sessão de presença ativa")
    .toJSON(),
  new SlashCommandBuilder()
    .setName("encerrar")
    .setDescription("Encerra sua sessão de presença")
    .toJSON(),
  new SlashCommandBuilder()
    .setName("horas")
    .setDescription("Consulta o total de horas registradas")
    .addUserOption((opt) =>
      opt
        .setName("usuario")
        .setDescription("Usuário para consultar (padrão: você mesmo)")
        .setRequired(false),
    )
    .toJSON(),
  new SlashCommandBuilder()
    .setName("ranking")
    .setDescription("Top 10 membros com mais horas na semana atual (seg–dom)")
    .toJSON(),
  new SlashCommandBuilder()
    .setName("ajustar")
    .setDescription("(Admin/Líder) Adiciona ou remove horas de um usuário")
    .addUserOption((opt) =>
      opt.setName("usuario").setDescription("Usuário a ajustar").setRequired(true),
    )
    .addNumberOption((opt) =>
      opt
        .setName("horas")
        .setDescription("Horas a adicionar (positivo) ou remover (negativo). Ex: 1.5 ou -2")
        .setRequired(true),
    )
    .addStringOption((opt) =>
      opt.setName("motivo").setDescription("Motivo do ajuste (fica registrado no log)").setRequired(true),
    )
    .toJSON(),
  new SlashCommandBuilder()
    .setName("bancohoras")
    .setDescription("Consulta seu saldo no banco de horas (horas extras acima de 15h/semana)")
    .toJSON(),
  new SlashCommandBuilder()
    .setName("usarbanco")
    .setDescription("Desconta horas do banco para tirar folga")
    .addNumberOption((opt) =>
      opt
        .setName("horas")
        .setDescription("Quantas horas descontar do banco. Ex: 8 (um dia), 4 (meio período)")
        .setRequired(true)
        .setMinValue(0.25),
    )
    .addStringOption((opt) =>
      opt
        .setName("motivo")
        .setDescription("Motivo da folga. Ex: Folga na sexta-feira")
        .setRequired(true),
    )
    .toJSON(),
  new SlashCommandBuilder()
    .setName("exportar")
    .setDescription("Gera um CSV com o relatório de horas do período escolhido")
    .addStringOption((opt) =>
      opt
        .setName("periodo")
        .setDescription("Período do relatório")
        .setRequired(true)
        .addChoices(
          { name: "Esta semana", value: "esta_semana" },
          { name: "Semana passada", value: "semana_passada" },
          { name: "Este mês", value: "este_mes" },
          { name: "Mês passado", value: "mes_passado" },
          { name: "Todo o período", value: "sempre" },
        ),
    )
    .toJSON(),
];

export async function registerCommands() {
  const token = process.env.DISCORD_TOKEN;
  const clientId = process.env.DISCORD_CLIENT_ID;
  const guildId = process.env.DISCORD_GUILD_ID;

  if (!token || !clientId) {
    throw new Error("DISCORD_TOKEN and DISCORD_CLIENT_ID must be set");
  }

  const rest = new REST({ version: "10" }).setToken(token);

  // Clear any old guild-scoped commands first to avoid duplicates
  if (guildId) {
    try {
      await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: [] });
      logger.info("Cleared old guild-scoped commands");
    } catch (err) {
      logger.warn({ err }, "Could not clear guild commands (non-fatal)");
    }
  }

  logger.info("Registering slash commands globally...");
  await rest.put(Routes.applicationCommands(clientId), { body: commands });
  logger.info("Global slash commands registered successfully (may take up to 1 hour to propagate)");
}

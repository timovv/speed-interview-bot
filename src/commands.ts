import { Guild, Message } from "discord.js";
import { abortRound, isRoundRunning, performRound } from "./manager";
import { clearHistory, getQueue, updateQueue } from "./queue";
import { getSettings, setSetting, Settings } from "./settings";

type Command = (
  args: string[],
  message: Message & { guild: Guild }
) => Promise<void>;

const queueCommand: Command = async (args, msg) => {
  const queue = getQueue(msg.guild);

  const usersInQueue = queue.queuedUsers
    .map((id) => msg.guild?.members.resolve(id))
    .filter(Boolean)
    .map((x) => x?.displayName);

  if (usersInQueue.length === 0) {
    await msg.channel.send("Nobody is in the queue!");
  } else {
    await msg.channel.send(
      `The following users are in the queue: ${usersInQueue.join(", ")}`
    );
  }
};

const setSettingCommand: Command = async (args, msg) => {
  const settingName = args[0];
  const settings = getSettings(msg.guild);
  const settingValue = JSON.parse(args.splice(1).join(" "));
  if (Object.keys(settings).includes(settingName)) {
    setSetting(msg.guild, settingName, settingValue);
    await msg.channel.send("Setting updated successfully.");
  } else {
    await msg.channel.send(
      `Setting ${settingName} does not exist. Note that settings are case-sensitive.`
    );
  }
};

const getSettingCommand: Command = async (args, msg) => {
  const settingName = args[0];
  const settings = getSettings(msg.guild);
  if (settingName in settings) {
    const setting = settings[settingName as keyof Settings];
    await msg.channel.send(
      `The value of ${settingName} is ${JSON.stringify(setting)}`
    );
  } else {
    await msg.channel.send(
      `Setting ${
        settingName ?? "(no setting provided)"
      } does not exist. The available settings are: ${Object.keys(
        settings
      ).join(", ")}`
    );
  }
};

const newRoundCommand: Command = async (args, msg) => {
  const { guild } = msg;
  if (isRoundRunning(guild)) {
    await msg.channel.send(
      "A round is already running, you can't run another."
    );
    return;
  }

  const { interviewTimeMins, feedbackTimeMins } = getSettings(guild);

  await msg.channel.send(
    `Starting a new round with ${interviewTimeMins} minutes of interview and ${feedbackTimeMins} minutes of feedback.`
  );
  await performRound(guild, interviewTimeMins, feedbackTimeMins);
  await msg.channel.send(
    "Round is finished. Type !newround again to start another round."
  );
};

const cancelCommand: Command = async (args, msg) => {
  abortRound(msg.guild);
  await msg.channel.send("Round cancelled.");
};

const clearHistoryCommand: Command = async (args, msg) => {
  updateQueue(msg.guild, (queue) => clearHistory(queue));
  await msg.channel.send("Cleared interviewer ↔ interviewee history mappings.");
};

type CommandInfo = {
  name: string;
  command: Command;
  isAdminOnly: boolean;
};

export const commands: CommandInfo[] = [
  {
    name: "queue",
    command: queueCommand,
    isAdminOnly: false,
  },
  {
    name: "get",
    command: getSettingCommand,
    isAdminOnly: true,
  },
  {
    name: "set",
    command: setSettingCommand,
    isAdminOnly: true,
  },
  {
    name: "newRound",
    command: newRoundCommand,
    isAdminOnly: true,
  },
  {
    name: "cancel",
    command: cancelCommand,
    isAdminOnly: true,
  },
  {
    name: "clearHistory",
    command: clearHistoryCommand,
    isAdminOnly: true,
  },
];

export const handleCommand = async (message: Message): Promise<void> => {
  if (message.guild === null) {
    return;
  }

  const content = message.cleanContent.split(" ");
  if (!content[0].startsWith("!")) {
    return;
  }

  const commandName = content[0].substring(1);
  const args = content.slice(1);

  const command = commands.find(
    (x) => x.name.toLowerCase() === commandName.toLowerCase()
  );
  const settings = getSettings(message.guild);
  const isAdmin = message.guild.members
    .resolve(message.author)
    ?.roles.cache.some((x) => x.name === settings.adminRole);
  if (command && (!command.isAdminOnly || isAdmin)) {
    await command.command(args, message as Message & { guild: Guild });
    return;
  }

  await message.channel.send(
    `Command not found. I support these commands: ${commands
      .map((command) => command.name)
      .join(", ")}.`
  );
};

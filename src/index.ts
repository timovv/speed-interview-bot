import Discord from "discord.js";
import dotenv from "dotenv";
dotenv.config();

const client = new Discord.Client();

const defaultSettings = {
  waitingRoomName: "Queue",
  interviewFinishedRoomName: "Yarns",
  interviewChannels: [...Array(10).keys()].map((_, i) => `Room ${i + 1}`),
  interviewerRole: "Interviewer",
  adminRole: "Exec",
};

type Settings = typeof defaultSettings;

const settings: { [guildId: string]: Settings } = {};

const getSettings = (guild: Discord.Guild): Settings =>
  settings[guild.id] ?? defaultSettings;

const queues: { [guildId: string]: string[] } = {};

const removeInterviewees = async (guild: Discord.Guild) => {
  const settings = getSettings(guild);
  const channels = guild.channels.cache.filter(
    (x) => settings?.interviewChannels.includes(x.name) ?? false
  );

  const interviewees = [
    ...channels
      .flatMap((channel) =>
        channel.members.filter((x) =>
          x.roles.cache.some((role) => role.name === settings?.interviewerRole)
        )
      )
      .values(),
  ];

  const doneChannel = guild.channels.cache.find(
    (channel) => channel.name === settings.interviewFinishedRoomName
  );

  if (!doneChannel) {
    console.log("Error: could not find finish room channel");
    return;
  }

  await Promise.all(
    interviewees.map(async (interviewee) => {
      interviewee.voice.setChannel(doneChannel);
      const dm = await interviewee.createDM();
      await dm.send(
        `Time's up! Your interview is now over, but you can head over to the ${settings.waitingRoomName} channel to queue up for another!`
      );
    })
  );
};

const availableInterviewChannels = (guild: Discord.Guild): string[] => {
  const settings = getSettings(guild);

  const interviewChannels = guild.channels.cache.filter((x) =>
    settings.interviewChannels.includes(x.name)
  );

  return interviewChannels
    .filter((channel) =>
      channel.members.some((member) =>
        member.roles.cache.some(
          (role) => role.name === settings.interviewerRole
        )
      )
    )
    .map((x) => x.id);
};

const allocateInterviewees = async (
  guild: Discord.Guild,
  messageChannel: Discord.TextChannel | Discord.DMChannel | Discord.NewsChannel
) => {
  const settings = getSettings(guild);

  const idsInWaitingRoom = [
    ...(guild.channels.cache
      .find((channel) => channel.name === settings.waitingRoomName)
      ?.members.mapValues((member) => member.id)
      .values() ?? []),
  ];

  if (!idsInWaitingRoom) {
    console.log(
      "Could not find the waiting room channel, or there was nobody there"
    );
    return;
  }

  // dequeue some people
  const channels = availableInterviewChannels(guild);

  if (channels.length === 0) {
    await messageChannel.send("Error: there are no available interviewers!");
    return;
  }

  const queue = [...queues[guild.id]];
  const idsToAllocate = queue.filter(idsInWaitingRoom.includes);

  await Promise.all(
    idsToAllocate.map(async (userId, i) => {
      const guildMember = guild.members.resolve(userId);
      if (!guildMember) {
        return;
      }

      const channel = guild.channels.resolve(channels[i]);
      if (!channel || channel.type !== "voice") {
        console.log("Couldn't find channel!");
        return;
      }

      await guildMember.voice.setChannel(channel);
      console.log(`Moved ${guildMember.nickname} to ${channel.name}`);
      queues[guild.id] = queue.filter((x) => x !== userId);
    })
  );
};

const enqueueUser = (guild: Discord.Guild, userId: string): number => {
  return queues[guild.id].push(userId);
};

const dequeueUser = (guild: Discord.Guild, userId: string) => {
  queues[guild.id] = queues[guild.id].filter((x) => x !== userId);
};

client.on("voiceStateUpdate", async (previous, next) => {
  const previousSettings = getSettings(previous.guild);
  const nextSettings = getSettings(next.guild);

  // add to waiting room
  if (
    previous.channel?.name !== nextSettings.waitingRoomName &&
    next.channel?.name === nextSettings.waitingRoomName &&
    next.member
  ) {
    const position = enqueueUser(next.guild, next.member.id);
    const dm = await next.member.createDM();
    await dm.send(
      `Welcome to the waiting room. You have been queued up and are now in position #${position}. To leave the queue, leave the waiting room at any time.`
    );
    return;
  }

  // remove from waiting room
  if (
    previous.channel?.name === previousSettings.waitingRoomName &&
    next.channel?.name !== previousSettings.waitingRoomName &&
    previous.member
  ) {
    dequeueUser(next.guild, previous.member.id);
    const dm = await previous.member.createDM();
    await dm.send(
      `You have been removed from the queue. Thanks for coming along!`
    );
    return;
  }
});

const setup = (guild: Discord.Guild) => {
  console.log(`Joined guild ${guild.name}`);
  if (!settings[guild.id]) {
    // update settings
    settings[guild.id] = JSON.parse(JSON.stringify(defaultSettings));
  }

  if (!queues[guild.id]) {
    queues[guild.id] = [];
  }

  const waitingRoomChannel = guild.channels.cache.find(
    (channel) => channel.name === settings[guild.id].waitingRoomName
  );
  if (waitingRoomChannel) {
    waitingRoomChannel.members.forEach((member) =>
      enqueueUser(guild, member.id)
    );
  }
};

client.on("guildCreate", setup);

client.on("message", async (msg) => {
  const msgContent = msg.cleanContent.split(" ");
  if (!msgContent[0]?.startsWith("!")) {
    return;
  }

  if (msg.type !== "DEFAULT" || !msg.guild) {
    return;
  }

  const command = msgContent[0].substring(1);
  const args = msgContent.slice(1);
  const serverSettings = settings[msg.guild.id];

  if (command === "queue") {
    const usersInQueue = queues[msg.guild.id]
      .map((id) => msg.guild?.members.resolve(id))
      .filter(Boolean)
      .map((x) => x?.nickname);

    if (usersInQueue.length === 0) {
      await msg.channel.send("Nobody is in the queue!");
    } else {
      await msg.channel.send(
        `The following users are in the queue: ${usersInQueue.join(", ")}`
      );
    }
    return;
  }

  const isAdmin =
    msg.guild.ownerID === msg.author.id ||
    msg.member?.roles.cache.some((x) => x.name === serverSettings.adminRole);
  if (!isAdmin) {
    await msg.channel.send("You do not have permission to use this command.");
    return;
  }

  if (command.toLowerCase() === "set") {
    // set the thing
    const settingName = args[0];
    const settingValue = JSON.parse(args.splice(1).join(" "));
    if (Object.keys(serverSettings).includes(settingName)) {
      serverSettings[settingName as keyof Settings] = settingValue;
      await msg.channel.send("Setting updated successfully.");
    } else {
      await msg.channel.send(
        `Setting ${settingName} does not exist. Note that settings are case-sensitive.`
      );
    }

    return;
  }

  if (command.toLowerCase() === "get") {
    const settingName = args[0];
    if (settingName in serverSettings) {
      const setting = serverSettings[settingName as keyof Settings];
      await msg.channel.send(
        `The value of ${settingName} is ${JSON.stringify(setting)}`
      );
    } else {
      await msg.channel.send(
        `Setting ${
          settingName ?? "(no setting provided)"
        } does not exist. The available settings are: ${Object.keys(
          serverSettings
        ).join(", ")}`
      );
    }
    return;
  }

  if (command.toLowerCase() === "newround") {
    await removeInterviewees(msg.guild);
    await allocateInterviewees(msg.guild, msg.channel);

    return;
  }
});

client.on("ready", () => {
  console.log("Bot is ready!");
  client.guilds.cache.forEach((guild) => setup(guild));
});

client.login(process.env["DISCORD_TOKEN"]);

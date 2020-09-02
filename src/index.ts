import Discord from "discord.js";
import dotenv from "dotenv";
import { handleCommand } from "./commands";
import { enqueueUser, getQueue, updateQueue, dequeueUser } from "./queue";
import { getSettings } from "./settings";
dotenv.config();

const client = new Discord.Client();

client.on("voiceStateUpdate", async (previous, next) => {
  const previousSettings = getSettings(previous.guild);
  const nextSettings = getSettings(next.guild);

  // add to waiting room
  if (
    previous.channel?.name !== nextSettings.waitingRoomName &&
    next.channel?.name === nextSettings.waitingRoomName &&
    next.member &&
    !next.member.roles.cache.some(
      (x) =>
        x.name === nextSettings.adminRole ||
        x.name === nextSettings.interviewerRole
    )
  ) {
    const queue = getQueue(next.guild);
    const [newQueue, position] = enqueueUser(queue, next.member.id);
    updateQueue(next.guild, newQueue);
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
    previous.member &&
    !previous.member.roles.cache.some(
      (x) =>
        x.name === previousSettings.adminRole ||
        x.name === previousSettings.interviewerRole
    )
  ) {
    const queue = getQueue(next.guild);
    updateQueue(next.guild, dequeueUser(queue, previous.member.id));
    const dm = await previous.member.createDM();
    await dm.send(
      `You have been removed from the queue. Thanks for coming along!`
    );
    return;
  }
});

const setup = (guild: Discord.Guild) => {
  console.log(`Joined guild ${guild.name}`);
  const { interviewerRole, adminRole } = getSettings(guild);

  const waitingRoomChannel = guild.channels.cache.find(
    (channel) => channel.name === getSettings(guild).waitingRoomName
  );
  if (waitingRoomChannel) {
    waitingRoomChannel.members
      .filter(
        (member) =>
          !member.roles.cache.some((x) =>
            [interviewerRole, adminRole].includes(x.name)
          )
      )
      .forEach((member) =>
        updateQueue(guild, enqueueUser(getQueue(guild), member.id)[0])
      );
  }
};

client.on("guildCreate", setup);

client.on("message", handleCommand);

client.on("ready", () => {
  console.log("Bot is ready!");
  client.guilds.cache.forEach((guild) => setup(guild));
});

client.login(process.env["DISCORD_TOKEN"]);

import Discord, { Client } from "discord.js";
import { handleCommand } from "./commands";
import { enqueueUser, getQueue, updateQueue, dequeueUser } from "./queue";
import { getSettings } from "./settings";

export const startBot = async (token: string): Promise<Client> => {
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
      getQueue(next.guild).queuedUsers.includes(previous.member.id)
    ) {
      updateQueue(next.guild, (queue) =>
        previous.member ? dequeueUser(queue, previous.member.id) : queue
      );
      const dm = await previous.member.createDM();
      if (
        !(
          next.channel &&
          getSettings(next.guild).interviewChannels.includes(next.channel.name)
        )
      ) {
        await dm.send(
          `You have been removed from the queue. Thanks for coming along!`
        );
      }
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
          updateQueue(guild, (queue) => enqueueUser(queue, member.id)[0])
        );
    }
  };

  client.on("guildCreate", setup);

  client.on("message", handleCommand);

  client.on("ready", () => {
    console.log("Bot is ready!");
    client.guilds.cache.forEach((guild) => setup(guild));
  });

  await client.login(token);
  return client;
};

import { Guild, GuildMember } from "discord.js";

import {
  allocateInterviewees,
  Allocation,
  filterQueue,
  getQueue,
  updateQueue,
} from "./queue";
import { getSettings } from "./settings";

const sendMessage = async (
  members: GuildMember | GuildMember[],
  message: string
): Promise<void> => {
  if (Array.isArray(members)) {
    await Promise.all(
      members.map(async (member) => {
        const dm = await member.createDM();
        await dm.send(message);
      })
    );
  } else {
    const dm = await members.createDM();
    await dm.send(message);
  }
};

const delayMultiplier = {
  milliseconds: 1,
  seconds: 1000,
  minutes: 1000 * 60,
};

type DelayUnit = keyof typeof delayMultiplier;

const delay = (timeSec: number, unit: DelayUnit) =>
  new Promise((resolve) =>
    setTimeout(resolve, timeSec * delayMultiplier[unit])
  );

const removeInterviewees = async (guild: Guild) => {
  const settings = getSettings(guild);
  const channels = guild.channels.cache.filter(
    (x) => settings?.interviewChannels.includes(x.name) ?? false
  );

  const interviewees = [
    ...channels
      .flatMap((channel) =>
        channel.members.filter((x) =>
          x.roles.cache.every((role) => role.name !== settings?.interviewerRole)
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
    })
  );
};

const createMove = async (
  guild: Guild
): Promise<[() => Promise<void>, Allocation] | null> => {
  // 1. find the interviewees
  const settings = getSettings(guild);

  const waitingRoom = guild.channels.cache.find(
    (x) => x.name === settings.waitingRoomName
  );

  if (!waitingRoom) {
    console.error("Could not find the waiting room.");
    return null;
  }

  const queue = filterQueue(
    getQueue(guild),
    (uid) => waitingRoom?.members.some((member) => member.id === uid) ?? false
  );

  const channels = settings.interviewChannels.map((name) =>
    guild.channels.cache.find(
      (channel) => channel.name === name && channel.type === "voice"
    )
  );

  const interviewerToChannel = new Map<string, string>(
    channels
      .map((channel) => [
        channel?.members.find((member) =>
          member.roles.cache.some(
            (role) => role.name === settings.interviewerRole
          )
        )?.id,
        channel?.id,
      ])
      .filter((x) => x[0] && x[1]) as [string, string][]
  );

  const allocation = allocateInterviewees(queue, [
    ...interviewerToChannel.keys(),
  ]);

  // update the queue
  updateQueue(guild, allocation.queue);

  return [
    async () => {
      await Promise.all(
        allocation.interviewAllocations.map(
          async ({ interviewerId, intervieweeId }) => {
            const interviewee = waitingRoom.members.get(intervieweeId);
            const channel = interviewerToChannel.get(interviewerId);
            if (channel) {
              await interviewee?.voice.setChannel(channel);
            } else {
              console.error("Interviewee left before they could be placed.");
            }
          }
        )
      );
    },
    allocation,
  ];
};

const roundRunningCheck: { [guildId: string]: boolean } = {};

export const isRoundRunning = (guild: Guild): boolean =>
  roundRunningCheck[guild.id] ?? false;

export const abortRound = (guild: Guild) =>
  (roundRunningCheck[guild.id] = false);

export const performRound = async (
  guild: Guild,
  interviewTimeMins: number,
  feedbackTimeMins: number
): Promise<void> => {
  if (roundRunningCheck[guild.id]) {
    return;
  }

  roundRunningCheck[guild.id] = true;

  await removeInterviewees(guild);
  const createMoveResult = await createMove(guild);
  if (createMoveResult === null) {
    return;
  }
  const [performMove, allocation] = createMoveResult;
  const interviewers = allocation.interviewAllocations
    .map((a) => guild.member(a.interviewerId))
    .filter(Boolean) as GuildMember[];
  const interviewees = allocation.interviewAllocations
    .map((a) => guild.member(a.intervieweeId))
    .filter(Boolean) as GuildMember[];
  const interviewersMissed = allocation.skippedInterviewers
    .map((m) => guild.member(m))
    .filter(Boolean) as GuildMember[];
  const intervieweesMissed = allocation.skippedUsers
    .map((m) => guild.member(m))
    .filter(Boolean) as GuildMember[];

  const preInterviewMoveDelay = delay(10, "seconds");
  await sendMessage(
    interviewees,
    "It's your turn for an interview! Get ready to turn your camera on. You'll be moved into the interview room in about 10 seconds."
  );
  await sendMessage(
    interviewers,
    "The next round is starting in about 10 seconds. Get ready!"
  );
  await sendMessage(
    intervieweesMissed,
    "You were in line for an interview, but unfortunately, I wasn't able to match you with an interviewer you haven't interviewed with already. You're at the front of the queue for the next round!"
  );
  await sendMessage(
    interviewersMissed,
    "A new round is starting, but unfortunately we couldn't allocate an interviewee to you for some reason. Sorry about that."
  );

  await preInterviewMoveDelay;
  if (!isRoundRunning(guild)) {
    return;
  }

  await performMove();
  await sendMessage(
    [...interviewees, ...interviewers],
    `GO! You have ${interviewTimeMins} minutes for the interview, with ${feedbackTimeMins} minutes for feedback at the end.`
  );

  await delay(interviewTimeMins, "minutes");
  if (!isRoundRunning(guild)) {
    await removeInterviewees(guild);
    return;
  }

  await sendMessage(
    [...interviewees, ...interviewers],
    `INTERVIEW OVER! You now have ${feedbackTimeMins} minutes to give feedback.`
  );
  await delay(feedbackTimeMins, "minutes");
  if (!isRoundRunning(guild)) {
    await removeInterviewees(guild);
    return;
  }
  await sendMessage(
    interviewees,
    "Feedback time is over. You will be moved to another room in 20 seconds."
  );
  await sendMessage(
    interviewers,
    "Feedback time is over. Your interviewee will be moved to another room in 20 seconds."
  );

  await delay(20, "seconds");
  await removeInterviewees(guild);
  roundRunningCheck[guild.id] = false;
};

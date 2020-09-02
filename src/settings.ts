import { Guild } from "discord.js";

const defaultSettings = {
  waitingRoomName: "Queue",
  interviewFinishedRoomName: "Post-interview",
  interviewChannels: [...Array(15).keys()].map((_, i) => `Room ${i + 1}`),
  interviewerRole: "Interviewer",
  adminRole: "Exec",
  interviewTimeMins: 7,
  feedbackTimeMins: 2,
};

let settings: { [guildId: string]: Settings } = {};

export type Settings = typeof defaultSettings;

export const getSettings = (guild: Guild): Settings =>
  settings[guild.id] ??
  (settings[guild.id] = JSON.parse(JSON.stringify(defaultSettings)));

export const setSetting = (guild: Guild, settingName: string, value: any) => {
  getSettings(guild);
  (settings[guild.id][settingName as keyof Settings] as any) = value;
};

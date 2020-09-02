import { Guild } from "discord.js";

export type UserQueue = {
  queuedUsers: string[];
  hasInterviewedWith: (userId: string, interviewerId: string) => boolean;
};

export type InterviewAllocation = {
  intervieweeId: string;
  interviewerId: string;
};

export type Allocation = {
  queue: UserQueue;
  interviewAllocations: InterviewAllocation[];
  skippedUsers: string[];
  skippedInterviewers: string[];
};

export const createQueue = (): UserQueue => ({
  queuedUsers: [],
  hasInterviewedWith: (_, __) => false,
});

export const filterQueue = (
  { queuedUsers, ...queue }: UserQueue,
  pred: (uid: string) => boolean
): UserQueue => ({ queuedUsers: queuedUsers.filter((x) => pred(x)), ...queue });

export const dequeueUser = (queue: UserQueue, userId: string) =>
  filterQueue(queue, (x) => x !== userId);

export const enqueueUser = (
  { queuedUsers, ...queue }: UserQueue,
  userId: string
): [UserQueue, number] => {
  const newQueue = {
    queuedUsers: [...queuedUsers.filter((x) => x !== userId), userId],
    ...queue,
  };
  return [newQueue, newQueue.queuedUsers.indexOf(userId) + 1];
};

export const allocateInterviewees = (
  queue: UserQueue,
  availableInterviewers: string[]
): Allocation => {
  let freeInterviewers = [...availableInterviewers];
  let queuedUsers = [...queue.queuedUsers];

  let allocations: InterviewAllocation[] = [];
  const skippedUsers = new Set<string>();

  while (freeInterviewers.length > 0 && queuedUsers.length > 0) {
    const [head, ...tail] = queuedUsers;
    queuedUsers = tail;
    const candidateInterviewers = freeInterviewers.filter(
      (interviewer) => !queue.hasInterviewedWith(head, interviewer)
    );

    if (candidateInterviewers.length === 0) {
      skippedUsers.add(head);
      continue;
    }

    const interviewer =
      candidateInterviewers[
        Math.floor(Math.random() * candidateInterviewers.length)
      ];
    freeInterviewers = freeInterviewers.filter((x) => x !== interviewer);
    allocations.push({ intervieweeId: head, interviewerId: interviewer });
  }

  return {
    queue: {
      ...queue,
      queuedUsers: queue.queuedUsers.slice(availableInterviewers.length),
      hasInterviewedWith: (userId, interviewerId) =>
        queue.hasInterviewedWith(userId, interviewerId) ||
        allocations.find((x) => x.intervieweeId === userId)?.interviewerId ===
          interviewerId,
    },
    interviewAllocations: allocations,
    skippedUsers: [...skippedUsers],
    skippedInterviewers: [...freeInterviewers],
  };
};

export const clearHistory = (queue: UserQueue): UserQueue => ({
  ...queue,
  hasInterviewedWith: (_, __) => false,
});

let queues: { [guildId: string]: UserQueue } = {};

export const getQueue = (guild: Guild) => {
  if (!queues[guild.id]) {
    queues[guild.id] = createQueue();
  }

  return queues[guild.id];
};

export const updateQueue = (guild: Guild, queue: UserQueue) => {
  queues[guild.id] = queue;
};

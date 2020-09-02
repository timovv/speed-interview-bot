Speed Interview Bot
===================

A bot for managing mock interview style events on Discord. Interviewees can line up for a timed mock interview, which has some time for feedback at the end.

The bot can be used to manage events with a group of interviewees and interviewers. Interviewees join a queue voice channel, and then every round, the interviewees at the top of the queue are assigned to interview with an interviewer they have not interviewed with before. The bot manages the queue, moves users into interview channels when it is their turn, and moves them out after a predetermined time when the interview is complete.

Commands
--------

| Command name | Admin only? | Arguments | Description
| ------------ | ----------- | --------- | -----------
| `!queue`     | no          |           | Shows who is currently in the queue in order of when they joined.
| `!get`       | yes         | `settingName (string)` | Gets the value of a setting. See settings, below.
| `!set`       | yes         | `settingName (string), ...JSON formatted setting value` | Sets a setting. Note that the value to set must be valid JSON (e.g. strings should be surrounded with quotes "")
| `!nextRound` | yes         |           | Starts a new interview round. If an interview round is already happening, does nothing.
| `!clearHistory` | yes      |           | Clears the history that ensures that no interviewee interviews with the same interviewer twice.

Settings
--------

There are a number of settings that can be changed using the `!get` and `!set` commands, described above. At this time, these settings do not persist anywhere and are lost when the bot restarts. Settings are per-server, so if the bot is running on multiple servers, each server will have independent settings.

Setting name | Type | Default value | Description
------------ | ---- | ------------- | -----------
`waitingRoomName` | `string` | `"Queue"` | The name of the waiting room where interviewees wait for their turn. This must be a voice channel. Interviewees join the voice channel to be queued up, and by leaving the channel they are removed from the queue.
`interviewFinishedRoomName` | `string` | `"Post-interview"` | The name of the channel where interviewees will be placed upon finishing an interview.
`interviewChannels` | `string[]` | `["Room 1", "Room 2", ..., "Room 15"]` | The voice channels the interviewers will reside in. Each interviewer should be allocated to one channel, but if there is an empty channel, that is also acceptable.
`interviewerRole` | `string` | `Interviewer` | The role given to interviewers. All interviewers must have this role for the bot to work.
`adminRole` | `string` | `Exec` | The role given to administrators. Administrators will be ignored if in the queue channel and will be able to run admin only commands.

Usage
-----

To start the bot, run `yarn install` in this directory followed by `yarn start`. Before running `yarn start`, you will need to populate `.env` with the `DISCORD_TOKEN` variable, which should be the application token provided by Discord's developer portal. If you don't wish to use `.env`, setting `DISCORD_TOKEN` as an environment variable will also suffice.


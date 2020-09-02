import dotenv from "dotenv";
import { startBot } from "./bot";

dotenv.config();

if (!process.env["DISCORD_TOKEN"]) {
  console.error(
    "DISCORD_TOKEN is not set. Configure the environment variable or set it in .env."
  );
  process.exit(1);
}

startBot(process.env["DISCORD_TOKEN"]);

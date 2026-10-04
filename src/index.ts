import { Command } from "commander";
import { version } from "./version.ts";
import { today } from "./today.ts";

const program = new Command();

program
  .name("otenki")
  .description("view your location weather")
  .version(String(version));

program
  .command("today")
  .argument("<Ido>")
  .argument("<Keido>")
  .action(async (Ido, Keido) => {
    await today(Ido, Keido);
  });

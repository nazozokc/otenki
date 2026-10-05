#!/usr/bin/env bun

import { Command, InvalidArgumentError } from "commander";
import { clearCache } from "./cache.ts";
import { monthly, tomorrow, weekly } from "./daily.ts";
import { MAX_FORECAST_DAYS } from "./forecast.ts";
import { locate } from "./locate.ts";
import { error as styleError } from "./style.ts";
import { today } from "./today.ts";
import { version } from "./version.ts";

const program = new Command();

program
  .name("otenki")
  .description("view weather for any place on earth")
  .version(await version(), "-V, --version", "print the version")
  .showHelpAfterError();

const withLocation =
  (run: (args: string[], options: { json?: boolean }) => Promise<void>) =>
  (args: string[], options: { json?: boolean }): Promise<void> =>
    run(args, options);

program
  .command("today")
  .description("current weather")
  .argument("<location...>", "place name or latitude longitude pair")
  .option("--json", "print raw JSON")
  .action(withLocation(today));

program
  .command("tomorrow")
  .description("tomorrow's weather")
  .argument("<location...>", "place name or latitude longitude pair")
  .option("--json", "print raw JSON")
  .action(withLocation(tomorrow));

program
  .command("weekly")
  .description("7 day forecast")
  .argument("<location...>", "place name or latitude longitude pair")
  .option("--json", "print raw JSON")
  .action(withLocation(weekly));

program
  .command("monthly")
  .description(
    `${MAX_FORECAST_DAYS} day forecast (the Forecast API caps forecast_days at ${MAX_FORECAST_DAYS})`,
  )
  .argument("<location...>", "place name or latitude longitude pair")
  .option("--json", "print raw JSON")
  .action(withLocation(monthly));

program
  .command("locate")
  .description("resolve a place name to latitude and longitude")
  .argument("<place...>", "place name")
  .option("--all", "list every candidate the geocoder returned")
  .option("--pick", "choose between candidates interactively with fzf")
  .option("--json", "print raw JSON")
  .action(locate);

program
  .command("cache")
  .description("manage the place name cache")
  .option("--clear", "drop every cached lookup")
  .action(async (options: { clear?: boolean }) => {
    if (options.clear !== true) {
      console.error("cache: --clear を指定してください");
      process.exit(1);
    }

    await clearCache();
    console.log("キャッシュを消去しました");
  });

program.parseAsync(process.argv).catch((failure: unknown) => {
  if (failure instanceof InvalidArgumentError) {
    console.error(styleError(`✗ ${failure.message}`));
    process.exit(1);
  }

  const message = failure instanceof Error ? failure.message : String(failure);

  console.error(styleError(`✗ ${message}`));
  process.exit(1);
});

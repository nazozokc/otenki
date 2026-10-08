#!/usr/bin/env bun

import { clearCache } from "./cache.ts";
import { dispatch } from "./cli.dispatch.ts";
import { type Command, UsageError } from "./cli.parse.ts";
import { type Config, loadConfig, stripNoConfig } from "./config.ts";
import { fortnight, tomorrow, weekly } from "./daily.ts";
import { locate } from "./locate.ts";
import { sanitizeText } from "./sanitize.ts";
import { error as styleError, setColorMode } from "./style.ts";
import { today } from "./today.ts";
import { version } from "./version.ts";

const json: Command["options"][number] = {
  flag: "json",
  description: "print raw JSON",
};

const LOCATION = {
  name: "location",
  description: "place name or latitude longitude pair",
};

const commands: Command[] = [
  {
    name: "today",
    description: "current weather",
    argument: LOCATION,
    options: [json],
    run: today,
  },
  {
    name: "tomorrow",
    description: "tomorrow's weather",
    argument: LOCATION,
    options: [json],
    run: tomorrow,
  },
  {
    name: "weekly",
    description: "7 day forecast",
    argument: LOCATION,
    options: [json],
    run: weekly,
  },
  {
    name: "fortnight",
    description: "14 day forecast",
    argument: LOCATION,
    options: [json],
    run: fortnight,
  },
  {
    name: "locate",
    description: "resolve a place name to latitude and longitude",
    argument: { name: "place", description: "place name" },
    options: [
      {
        flag: "all",
        description: "list every candidate the geocoder returned",
      },
      {
        flag: "pick",
        description: "choose between candidates interactively with fzf",
      },
      json,
    ],
    run: locate,
  },
  {
    name: "cache",
    description: "manage the place name cache",
    options: [{ flag: "clear", description: "drop every cached lookup" }],
    run: async (_args, flags) => {
      // A UsageError rather than process.exit: dispatch owns the exit code, and
      // exiting from inside it would skip the usage line the caller needs here.
      if (flags.clear !== true) {
        throw new UsageError("--clear を指定してください");
      }

      await clearCache();
      console.log("キャッシュを消去しました");
    },
  },
];

/**
 * A broken config file is the user's to fix, so it fails loudly and early with
 * the path in the message, before any network work can hide the cause.
 * `--no-config` skips the read entirely — the escape hatch for exactly that
 * moment, and for running the CLI as it behaves without a config file.
 */
const readConfig = async (skip: boolean): Promise<Config | null> => {
  if (skip) return {};

  try {
    return await loadConfig();
  } catch (failure: unknown) {
    const message = sanitizeText(
      failure instanceof Error ? failure.message : String(failure),
    );
    console.error(styleError(`✗ ${message}`));
    return null;
  }
};

const { argv, noConfig } = stripNoConfig(process.argv.slice(2));
const config = await readConfig(noConfig);

if (config === null) {
  process.exitCode = 1;
} else {
  // Before dispatch: every styled byte the run prints — including dispatch's
  // own errors — obeys the configured colour policy.
  setColorMode(config.color);
  process.exitCode = await dispatch(commands, argv, await version(), config);
}

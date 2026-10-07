#!/usr/bin/env bun

import { clearCache } from "./cache.ts";
import { dispatch } from "./cli.dispatch.ts";
import { type Command, UsageError } from "./cli.parse.ts";
import { fortnight, tomorrow, weekly } from "./daily.ts";
import { locate } from "./locate.ts";
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

process.exitCode = await dispatch(
  commands,
  process.argv.slice(2),
  await version(),
);

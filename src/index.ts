#!/usr/bin/env node

import { Command } from "commander";
import { today } from "./today.ts";

const program = new Command();

program.name("otenki").description("view your location weather");

program
  .command("today")
  .argument("<latitude>")
  .argument("<longitude>")
  .action(async (latitude, longitude) => {
    await today(Number(latitude), Number(longitude));
  });

program.parse();

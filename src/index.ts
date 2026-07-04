#!/usr/bin/env node
import { runCli } from "./cli.js";

runCli()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`imnotcnuser: ${message}\n`);
    process.exitCode = 1;
  });

#!/usr/bin/env node
import { runStdio } from "../src/mcp.js";

runStdio().catch((err) => {
  process.stderr.write(`cgemini-mcp: ${err?.message || err}\n`);
  process.exit(1);
});

#!/usr/bin/env node
import { tsImport } from "tsx/esm/api";

try {
  const { main } = await tsImport("./workflow.ts", import.meta.url);
  await main(process.argv.slice(2));
} catch (error) {
  console.error(`diffractr: ${error.message}`);
  process.exitCode = 1;
}

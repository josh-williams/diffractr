import { main } from "./workflow";

try {
  await main(process.argv.slice(2));
} catch (error) {
  console.error(
    `diffractr: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
}

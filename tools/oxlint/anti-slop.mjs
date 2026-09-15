import { tsImport } from "tsx/esm/api";

// Node 22.12 needs a loader for the vendored TypeScript plugin.
const { default: plugin } = await tsImport(
  "./anti-slop/index.ts",
  import.meta.url,
);

export default plugin;

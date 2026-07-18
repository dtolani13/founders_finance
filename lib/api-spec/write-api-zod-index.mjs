import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const target = fileURLToPath(
  new URL("../api-zod/src/index.ts", import.meta.url),
);
await writeFile(target, 'export * from "./generated/api";\n', "utf8");

const generatedFiles = [
  new URL("../api-client-react/src/generated/api.ts", import.meta.url),
  new URL("../api-client-react/src/generated/api.schemas.ts", import.meta.url),
  new URL("../api-zod/src/generated/api.ts", import.meta.url),
];

for (const file of generatedFiles) {
  const contents = await readFile(file, "utf8");
  await writeFile(file, `${contents.trimEnd()}\n`, "utf8");
}

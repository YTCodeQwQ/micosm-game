import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { defaultKataGoExecutable, defaultRapfiExecutable } from "../scripts/runtime-paths.mjs";

test("native AI defaults select executable names for Windows and Linux", () => {
  assert.equal(defaultKataGoExecutable("win32"), ".tools/katago/engine/katago.exe");
  assert.equal(defaultKataGoExecutable("linux"), ".tools/katago/engine/katago");
  assert.equal(defaultRapfiExecutable("win32"), ".tools/rapfi/engine/pbrain-rapfi-windows-avx2.exe");
  assert.equal(defaultRapfiExecutable("linux"), ".tools/rapfi/engine/pbrain-rapfi-linux-clang-avx2");
});

test("repository operations commands are shell-independent", async () => {
  const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  for (const name of ["ops:backup", "ops:backup:r2", "ops:restore", "ops:restore:r2"]) {
    assert.match(packageJson.scripts[name], /^node scripts\//);
    assert.doesNotMatch(packageJson.scripts[name], /powershell|cmd\.exe/i);
  }
});

test("Linux deployment assets cover both native AI services", async () => {
  const [katago, rapfi, guide, environment] = await Promise.all([
    readFile(new URL("../deploy/linux/micosm-katago.service", import.meta.url), "utf8"),
    readFile(new URL("../deploy/linux/micosm-rapfi.service", import.meta.url), "utf8"),
    readFile(new URL("../docs/LINUX_DEPLOYMENT.md", import.meta.url), "utf8"),
    readFile(new URL("../deploy/linux/ai.env.template", import.meta.url), "utf8"),
  ]);
  assert.match(katago, /scripts\/katago-service\.mjs/);
  assert.match(rapfi, /scripts\/rapfi-service\.mjs/);
  assert.match(guide, /systemd/);
  assert.match(environment, /KATAGO_SERVICE_TOKEN=/);
  assert.match(environment, /RAPFI_SERVICE_TOKEN=/);
});

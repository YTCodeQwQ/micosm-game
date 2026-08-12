import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export function argumentValue(name, fallback = "") {
  const exactIndex = process.argv.indexOf(`--${name}`);
  if (exactIndex >= 0) return process.argv[exactIndex + 1] || fallback;
  const prefix = `--${name}=`;
  const inline = process.argv.find((value) => value.startsWith(prefix));
  return inline ? inline.slice(prefix.length) : fallback;
}

export function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

export function timestamp() {
  return new Date().toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15);
}

export function run(command, args) {
  const result = spawnSync(command, args, { cwd: projectRoot, stdio: "inherit", shell: false });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} exited with code ${result.status}`);
}

export function runWrangler(args) {
  run(process.execPath, [resolve(projectRoot, "node_modules/wrangler/bin/wrangler.js"), ...args]);
}

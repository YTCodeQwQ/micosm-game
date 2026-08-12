import { mkdirSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { argumentValue, projectRoot, run, timestamp } from "./ops-common.mjs";

const remote = argumentValue("remote");
const bucket = argumentValue("bucket");
if (!remote || !bucket) throw new Error("Pass the rclone remote and bucket with --remote and --bucket.");

const target = resolve(projectRoot, argumentValue("output", "outputs/backups/r2"), timestamp());
mkdirSync(target, { recursive: true });
run("rclone", ["copy", `${remote}:${bucket}`, target, "--checksum", "--metadata", "--create-empty-src-dirs"]);

function countFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).reduce((count, entry) => (
    count + (entry.isDirectory() ? countFiles(resolve(directory, entry.name)) : 1)
  ), 0);
}

console.log(`R2 backup created: ${target} (${countFiles(target)} objects)`);

import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { argumentValue, hasFlag, projectRoot, run } from "./ops-common.mjs";

if (!hasFlag("confirm-restore")) {
  throw new Error("Restore is blocked. Re-run with --confirm-restore after checking the target bucket and backup directory.");
}

const remote = argumentValue("remote");
const bucket = argumentValue("bucket");
const source = resolve(projectRoot, argumentValue("directory"));
if (!remote || !bucket) throw new Error("Pass the rclone remote and bucket with --remote and --bucket.");
if (!argumentValue("directory") || !existsSync(source)) throw new Error("Pass an existing backup directory with --directory.");

run("rclone", ["copy", source, `${remote}:${bucket}`, "--checksum", "--metadata", "--create-empty-src-dirs"]);
console.log(`R2 restore completed for ${remote}:${bucket} from ${source}`);

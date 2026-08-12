import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { argumentValue, hasFlag, projectRoot, runWrangler } from "./ops-common.mjs";

if (!hasFlag("confirm-restore")) {
  throw new Error("Restore is blocked. Re-run with --confirm-restore after checking the target database and backup file.");
}

const database = argumentValue("database");
const backup = resolve(projectRoot, argumentValue("file"));
if (!database) throw new Error("Pass the target D1 database with --database.");
if (!argumentValue("file") || !existsSync(backup)) throw new Error("Pass an existing SQL export with --file.");

runWrangler(["d1", "execute", database, "--remote", "--file", backup]);
console.log(`D1 restore completed for ${database} from ${backup}`);

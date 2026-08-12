import { mkdirSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { argumentValue, projectRoot, runWrangler, timestamp } from "./ops-common.mjs";

const database = argumentValue("database", process.env.MICO_D1_DATABASE || "");
if (!database) throw new Error("Set MICO_D1_DATABASE or pass --database before creating a D1 backup.");

const outputDirectory = resolve(projectRoot, argumentValue("output", "outputs/backups"));
mkdirSync(outputDirectory, { recursive: true });
const target = resolve(outputDirectory, `micosm-${timestamp()}.sql`);

runWrangler(["d1", "export", database, "--remote", "--output", target]);
const size = statSync(target).size;
if (size < 64) throw new Error(`Backup file is unexpectedly small: ${size} bytes.`);
console.log(`D1 backup created: ${target} (${size} bytes)`);

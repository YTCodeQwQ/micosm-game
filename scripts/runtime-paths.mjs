import { isAbsolute, resolve } from "node:path";

export function configuredProjectPath(root, value, fallback) {
  const selected = value?.trim() || fallback;
  return isAbsolute(selected) ? selected : resolve(root, selected);
}

export function defaultKataGoExecutable(platform = process.platform) {
  return platform === "win32"
    ? ".tools/katago/engine/katago.exe"
    : ".tools/katago/engine/katago";
}

export function defaultRapfiExecutable(platform = process.platform) {
  return platform === "win32"
    ? ".tools/rapfi/engine/pbrain-rapfi-windows-avx2.exe"
    : ".tools/rapfi/engine/pbrain-rapfi-linux-clang-avx2";
}

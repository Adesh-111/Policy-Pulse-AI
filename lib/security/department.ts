import { createHash } from "node:crypto";

export function departmentCodeFromName(name: string) {
  const base = name
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9]+/g, "")
    .toUpperCase()
    .slice(0, 13) || "DEPT";
  const hash = createHash("sha256")
    .update(name.toLocaleLowerCase())
    .digest("hex")
    .slice(0, 6)
    .toUpperCase();
  return `${base}_${hash}`;
}

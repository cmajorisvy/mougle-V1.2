import fs from "node:fs";
import path from "node:path";

const schemaPath = path.resolve("shared/schema.ts");
const outPath = path.resolve("docs/database-tables.md");

const src = fs.readFileSync(schemaPath, "utf8");

interface Column {
  name: string;
  dbName: string;
  type: string;
  modifiers: string[];
}

interface Table {
  varName: string;
  dbName: string;
  columns: Column[];
}

const tables: Table[] = [];

const tableRegex = /export const (\w+)\s*=\s*pgTable\(\s*"([^"]+)"\s*,\s*\{([\s\S]*?)\n\}\s*\)/g;

let m: RegExpExecArray | null;
while ((m = tableRegex.exec(src)) !== null) {
  const varName = m[1];
  const dbName = m[2];
  const body = m[3];
  const columns: Column[] = [];

  const lines = body.split("\n");
  for (const rawLine of lines) {
    const line = rawLine.trim().replace(/,$/, "");
    if (!line || line.startsWith("//")) continue;

    const colMatch = line.match(/^(\w+)\s*:\s*(\w+)\s*\(\s*(?:"([^"]+)"\s*)?(.*)$/);
    if (!colMatch) continue;

    const name = colMatch[1];
    const type = colMatch[2];
    const dbCol = colMatch[3] ?? name;
    const tail = colMatch[4];

    const modifiers: string[] = [];
    if (tail.includes(".primaryKey()")) modifiers.push("PK");
    if (tail.includes(".notNull()")) modifiers.push("NOT NULL");
    if (tail.includes(".unique()")) modifiers.push("UNIQUE");
    if (/\.array\(\)/.test(tail)) modifiers.push("array");
    if (tail.includes(".defaultNow()")) {
      modifiers.push("default now()");
    } else {
      const defMatch = tail.match(/\.default\((.*?)\)(?:\.|$|,)/);
      if (defMatch) {
        let dv = defMatch[1].trim();
        if (dv.includes("gen_random_uuid")) dv = "uuid";
        else if (dv.length > 40) dv = dv.slice(0, 40) + "…";
        modifiers.push(`default ${dv}`);
      }
    }
    const refMatch = tail.match(/\.references\(\(\)\s*=>\s*([\w.]+)/);
    if (refMatch) modifiers.push(`-> ${refMatch[1]}`);

    columns.push({ name, dbName: dbCol, type, modifiers });
  }

  tables.push({ varName, dbName, columns });
}

const out: string[] = [];
out.push("# Mougle - Database Tables Reference");
out.push("");
out.push(`Auto-generated from \`shared/schema.ts\` by \`scripts/generate-db-tables-doc.ts\`. ${tables.length} tables. For a higher-level grouping see \`docs/database-schema.md\`.`);
out.push("");
out.push("## Index");
out.push("");
const cols = 4;
const sorted = [...tables].sort((a, b) => a.varName.localeCompare(b.varName));
for (let i = 0; i < sorted.length; i += cols) {
  const row = sorted.slice(i, i + cols).map((t) => `[\`${t.varName}\`](#${t.varName.toLowerCase()})`);
  out.push(row.join(" · "));
}
out.push("");
out.push("---");
out.push("");

for (const t of sorted) {
  out.push(`## ${t.varName}`);
  out.push("");
  out.push(`Postgres table: \`${t.dbName}\``);
  out.push("");
  out.push("| Column | DB Column | Type | Constraints |");
  out.push("|---|---|---|---|");
  for (const c of t.columns) {
    out.push(`| \`${c.name}\` | \`${c.dbName}\` | \`${c.type}\` | ${c.modifiers.join(", ") || "—"} |`);
  }
  out.push("");
}

fs.writeFileSync(outPath, out.join("\n"));
console.log(`Wrote ${outPath} with ${tables.length} tables.`);

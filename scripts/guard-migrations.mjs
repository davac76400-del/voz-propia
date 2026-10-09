// Guardia contra pérdida de videos: corre antes de cada build (y por lo tanto antes de cada publicación en Vercel).
// Si algo en las migraciones o en el código puede borrar videos, palabras o su memoria, el build se detiene.
//
//   node scripts/guard-migrations.mjs [carpeta-del-proyecto]
//
// Para permitir a propósito un cambio así, el archivo .sql debe llevar esta línea (queda a la vista en la revisión):
//   -- guardia: permitir-destruccion <motivo>
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const root = process.argv[2] ?? '.';
const problems = [];

const walk = (dir, ok) =>
  readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return name === 'node_modules' || name === 'dist' ? [] : walk(p, ok);
    return ok(name) ? [p] : [];
  });

/* ---------- Migraciones SQL ---------- */

const PROTEGIDO = /memoria|no_vaciar|programmer_|shared_phrases|programadores/i;
const PELIGROSAS = [
  [/^delete\s+from\b/, 'borra filas con DELETE'],
  [/^truncate\b/, 'vacía una tabla con TRUNCATE'],
  [/^drop\s+(table|schema)\b/, 'borra una tabla o un esquema'],
  [/^alter\s+table\b[\s\S]*\bdrop\s+column\b/, 'quita una columna'],
  [/^alter\s+table\b[\s\S]*\b(disable\s+trigger|disable\s+row\s+level)/, 'apaga un disparador o la seguridad de filas'],
  [/^drop\s+(trigger|function)\b/, 'quita un disparador o función de la memoria', PROTEGIDO],
  [/session_replication_role/, 'apaga los disparadores de la sesión'],
];

/** Sin comentarios ni textos entre comillas, para no confundir 'DELETE' (un texto) con la orden DELETE. */
const clean = (sql) =>
  sql
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/--[^\n]*/g, ' ')
    .replace(/'(?:[^']|'')*'/g, "''");

const sqlDir = join(root, 'supabase', 'migraciones');
let sqlFiles = [];
try {
  sqlFiles = walk(sqlDir, (n) => n.endsWith('.sql'));
} catch {
  /* sin carpeta de migraciones: nada que revisar */
}
for (const file of sqlFiles) {
  const raw = readFileSync(file, 'utf8');
  if (/^--\s*guardia:\s*permitir-destruccion\s+\S+/m.test(raw)) {
    console.warn(`guardia: ${relative(root, file)} permite destruir datos a propósito (lo declara en su primera línea de guardia).`);
    continue;
  }
  // Se parte por «;» y por «$$»: así también se revisa lo que está dentro de las funciones.
  for (const stmt of clean(raw).split(/;|\$\$/)) {
    const s = stmt.trim().toLowerCase().replace(/\s+/g, ' ');
    // Un renglón puede arrastrar el «begin»/«then» de una función; se revisa desde cada orden conocida.
    const starts = s.split(/\b(?:begin|then|else|loop)\b/).map((x) => x.trim());
    for (const part of starts) {
      for (const [re, why, only] of PELIGROSAS) {
        if (re.test(part) && (!only || only.test(part))) problems.push(`${relative(root, file)}: ${why} → «${part.slice(0, 90)}»`);
      }
    }
  }
}

/* ---------- Código de la app ---------- */

/** Quién puede tocar cada tabla desde la app (ruta con «/»). */
const BORRAN = { programmer_videos: 'src/core/supabase.ts', shared_phrases: 'src/core/shared-sync.ts', programmer_folders: 'src/core/supabase.ts' };
const SOLO_LEER = ['memoria_videos', 'memoria_palabras'];

for (const file of walk(join(root, 'src'), (n) => /\.(ts|js)$/.test(n))) {
  const rel = relative(root, file).split(sep).join('/');
  const code = readFileSync(file, 'utf8');
  for (const m of code.matchAll(/\.from\(\s*(['"`])([a-z_]+)\1\s*\)([^;]{0,400})/g)) {
    const [, , table, chain] = m;
    if (SOLO_LEER.includes(table) && /\.(delete|update|insert|upsert)\(/.test(chain)) {
      problems.push(`${rel}: la memoria («${table}») solo se lee desde la app, no se escribe ni se borra`);
    }
    if (table in BORRAN && /\.delete\(/.test(chain) && BORRAN[table] !== rel) {
      problems.push(`${rel}: borra «${table}» fuera de ${BORRAN[table]}. Los videos solo se borran con deleteClips() (queda copia en la memoria)`);
    }
  }
}

if (problems.length) {
  console.error('\nGUARDIA DE VIDEOS: el build se detuvo porque esto podría borrar videos o su memoria:\n');
  for (const p of problems) console.error('  ✗ ' + p);
  console.error('\nSi es a propósito, ponle a la migración la línea «-- guardia: permitir-destruccion <motivo>».\n');
  process.exit(1);
}
console.log(`guardia: ${sqlFiles.length} migraciones y el código revisados, nada que borre videos.`);

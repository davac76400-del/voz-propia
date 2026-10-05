import { execSync } from 'node:child_process';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { defineConfig, type Plugin } from 'vite';

// Archivos que no se precargan: se guardan en caché la primera vez que se usan.
// También los alfabetos de las tipografías que la app no usa (cirílico, griego, vietnamita).
const LAZY = [/nosimd/, /transformers/, /ort[-.].*\.(wasm|m?js)$/, /\.onnx$/, /-(cyrillic|cyrillic-ext|greek|greek-ext|vietnamese|hebrew)-/];

async function walk(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(p)));
    else out.push(p);
  }
  return out;
}

function serviceWorker(): Plugin {
  let outDir = 'dist';
  return {
    name: 'voz-propia-sw',
    apply: 'build',
    configResolved(c) {
      outDir = c.build.outDir;
    },
    async closeBundle() {
      const files = (await walk(outDir))
        .map((f) => relative(outDir, f).split('\\').join('/'))
        .filter((f) => f !== 'sw.js' && !LAZY.some((r) => r.test(f)));
      const version = Date.now().toString(36);
      const tpl = await readFile('src/sw.template.js', 'utf8');
      const sw = tpl
        .replace('__VERSION__', version)
        .replace('__PRECACHE__', JSON.stringify(['./', ...files]));
      await writeFile(join(outDir, 'sw.js'), sw);
      // /version.json dice qué commit está publicado, para comprobar que el link está al día.
      let commit = process.env.VERCEL_GIT_COMMIT_SHA ?? '';
      if (!commit) {
        try {
          commit = execSync('git rev-parse HEAD').toString().trim();
        } catch {
          commit = 'desconocido';
        }
      }
      await writeFile(join(outDir, 'version.json'), JSON.stringify({ commit: commit.slice(0, 7), construido: new Date().toISOString() }));
    },
  };
}

export default defineConfig({
  base: './',
  // La escena 3D del inicio (Three.js) va en su propio archivo y solo se carga en el inicio.
  build: { target: 'es2022', assetsInlineLimit: 0, chunkSizeWarningLimit: 600 },
  optimizeDeps: { exclude: ['onnxruntime-web'] },
  plugins: [serviceWorker()],
});

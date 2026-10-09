import { execSync } from 'node:child_process';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import JavaScriptObfuscator from 'javascript-obfuscator';
import { defineConfig, type Plugin } from 'vite';
import pkg from './package.json' with { type: 'json' };

// Archivos que no se precargan: se guardan en caché la primera vez que se usan.
// También los alfabetos de las tipografías que la app no usa (cirílico, griego, vietnamita).
const LAZY = [/nosimd/, /ort[-.].*\.(wasm|m?js)$/, /\.onnx$/, /-(cyrillic|cyrillic-ext|greek|greek-ext|vietnamese|hebrew)-/];

async function walk(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(p)));
    else out.push(p);
  }
  return out;
}

/**
 * Direcciones desde las que la app corre; en otra, la copia no arranca (src/guard.ts).
 * La primera es la oficial. Si algún día hay dominio propio, ponlo en la variable VOZ_PROPIA_HOSTS (separado por comas).
 */
const OFFICIAL_HOST = 'voz-propia-gilt.vercel.app';
const e = process.env;
const ALLOWED_HOSTS = [
  ...new Set(
    [e.VERCEL_PROJECT_PRODUCTION_URL || OFFICIAL_HOST, OFFICIAL_HOST, e.VERCEL_URL, e.VERCEL_BRANCH_URL, ...(e.VOZ_PROPIA_HOSTS ?? '').split(',')]
      .map((h) => h?.trim())
      .filter((h): h is string => !!h),
  ),
];

// Cuánto se ofusca el código propio. Sin aplanar el flujo ni inyectar código muerto: la lectura corre en cada cuadro
// de la cámara y no debe ir más lenta.
const OBFUSCATE = {
  compact: true,
  target: 'browser' as const,
  sourceType: 'module' as const,
  ignoreImports: true,
  stringArray: true,
  stringArrayEncoding: ['base64' as const],
  stringArrayThreshold: 0.8,
  stringArrayRotate: true,
  stringArrayShuffle: true,
  stringArrayWrappersCount: 2,
  identifierNamesGenerator: 'hexadecimal' as const,
  numbersToExpressions: false,
  splitStrings: false,
  controlFlowFlattening: false,
  deadCodeInjection: false,
  selfDefending: false,
  debugProtection: false,
  sourceMap: false,
  log: false,
};

/** Ofusca el código propio (src/) al construir. Las librerías de terceros quedan como están. Con NO_OBFUSCATE=1 se omite (para depurar). */
function protect(): Plugin {
  return {
    name: 'voz-propia-protect',
    apply: 'build',
    enforce: 'post',
    renderChunk(code, chunk) {
      if (e.NO_OBFUSCATE) return null;
      const third = chunk.moduleIds.some((id) => id.includes('node_modules') && !/\.css($|\?)/.test(id));
      if (third || !chunk.moduleIds.some((id) => id.includes('/src/'))) return null;
      return { code: JavaScriptObfuscator.obfuscate(code, OBFUSCATE).getObfuscatedCode(), map: null };
    },
  };
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
  define: { __APP_VERSION__: JSON.stringify(pkg.version), __ALLOWED_HOSTS__: JSON.stringify(ALLOWED_HOSTS) },
  // La escena 3D del inicio (Three.js) va en su propio archivo y solo se carga en el inicio.
  build: {
    target: 'es2022',
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 600,
    sourcemap: false,
    // Las librerías de terceros van en su propio archivo para ofuscar solo el código propio.
    rolldownOptions: {
      output: { codeSplitting: { groups: [{ name: 'vendor', test: /node_modules[\\/](@supabase|@mediapipe|lucide|tslib|iceberg-js)[\\/]/ }] } },
    },
  },
  optimizeDeps: { exclude: ['onnxruntime-web'] },
  plugins: [protect(), serviceWorker()],
});

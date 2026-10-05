/** `voz-me.mp4` o `me-voz.mp4` → «Me». Solo con la palabra `voz` para no confundir nombres como IMG-2026-WA0001. */
export function phraseFromFilename(fileName: string): string | null {
  const base = fileName.replace(/\.[^./\\]+$/, '').trim();
  const m = base.match(/^voz[-_ ]+(.+)$/i) ?? base.match(/^(.+?)[-_ ]+voz$/i);
  if (!m) return null;
  let phrase = m[1]
    .replace(/\s*\(\d+\)\s*$/, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const withoutCounter = phrase.replace(/\s+\d{1,2}$/, '').trim();
  if (withoutCounter) phrase = withoutCounter;
  if (!phrase) return null;
  return phrase.charAt(0).toUpperCase() + phrase.slice(1);
}

/** Cada video y cada frase de la app es UNA palabra. Devuelve el aviso si hay más de una, o null si está bien. */
export function oneWordProblem(text: string): string | null {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length <= 1) return null;
  return `Son ${words.length} palabras («${words.join(' ')}»). Sube cada palabra por separado: la app arma las frases sola.`;
}

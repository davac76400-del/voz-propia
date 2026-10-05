const capitalize = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

/**
 * El nombre de la palabra sale del nombre del archivo, y los contadores no cuentan:
 * `voz-me.mp4`, `me-voz.mp4`, `voz-piel2.mp4`, `cabeza2-voz.mp4`, `voz-cabeza 3.mp4` o `voz-me (1).mp4` → «Me», «Piel», «Cabeza».
 * Solo con la palabra `voz` para no confundir nombres como IMG-2026-WA0001.
 */
export function phraseFromFilename(fileName: string): string | null {
  const base = fileName.replace(/\.[^./\\]+$/, '').trim();
  const m = base.match(/^voz\d*[-_ ]+(.+)$/i) ?? base.match(/^(.+?)[-_ ]+voz\d*$/i);
  if (!m) return null;
  let phrase = m[1]
    .replace(/\(\s*\d+\s*\)/g, ' ')
    .replace(/[-_]+/g, ' ')
    .replace(/\b(copia|copy)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  // Contadores al final, pegados o separados: «piel2», «piel 2», «piel 02».
  for (let i = 0; i < 3; i++) {
    const next = phrase.replace(/\s*\d+$/, '').trim();
    if (!next || next === phrase) break;
    phrase = next;
  }
  if (!phrase || /^\d+$/.test(phrase)) return null;
  if (phrase === phrase.toUpperCase()) phrase = phrase.toLowerCase();
  return capitalize(phrase);
}

/** Clave para saber si dos nombres son la misma palabra: sin mayúsculas ni acentos. */
export const nameKey = (text: string) => text.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

/** Cada video y cada frase de la app es UNA palabra. Devuelve el aviso si hay más de una, o null si está bien. */
export function oneWordProblem(text: string): string | null {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length <= 1) return null;
  return `Son ${words.length} palabras («${words.join(' ')}»). Sube cada palabra por separado: la app arma las frases sola.`;
}

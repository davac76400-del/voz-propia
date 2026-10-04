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

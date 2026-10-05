/**
 * Modelo de lenguaje pequeño y local (sin internet): sabe qué palabras suelen ir juntas en frases cortas
 * de la vida diaria y cómo se escriben. Ayuda a elegir entre palabras que se ven parecidas en los labios
 * y arma la frase final con mayúsculas, comas y signos.
 */

const CORPUS = `
sí me duele
no me duele
me duele la cabeza
me duele el estómago
me duele mucho
me duele aquí
me duele la espalda
me duele el pecho
me duele la garganta
me duele un poco
sí me duele mucho
no me duele nada
tengo dolor
tengo sed
tengo hambre
tengo frío
tengo calor
tengo sueño
tengo miedo
tengo náuseas
tengo mucha sed
tengo mucho frío
tengo mucho calor
no tengo sed
no tengo hambre
no tengo dolor
quiero agua
quiero comer
quiero dormir
quiero descansar
quiero ir al baño
quiero a mi familia
quiero que venga el doctor
no quiero
no quiero comer
no quiero agua
sí quiero
sí quiero agua
necesito ayuda
necesito agua
necesito al doctor
necesito una enfermera
necesito ir al baño
necesito medicina
necesito descansar
no necesito nada
me siento mal
me siento bien
me siento mejor
me siento cansado
me siento triste
me siento solo
me siento nervioso
no me siento bien
estoy bien
estoy mal
estoy cansado
estoy cómodo
estoy incómodo
no estoy bien
sí estoy bien
sí
no
gracias
muchas gracias
por favor
sí por favor
no gracias
sí gracias
hola
adiós
buenos días
buenas noches
te quiero
te quiero mucho
te necesito
ayúdame por favor
ayúdame
llama al doctor
llama a mi familia
llama a la enfermera
trae agua
trae una cobija
apaga la luz
prende la luz
sube la cama
baja la cama
cámbiame de posición
dónde estoy
qué hora es
cuándo vienen
cuándo me voy a casa
puedes ayudarme
puedes venir
me puedes ayudar
me ayudas
ven aquí
espera un momento
más despacio
otra vez
un momento
sí entiendo
no entiendo
me duele me duele
`;

const strip = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zñ\s]/g, '')
    .trim();

/** Clave de una palabra para comparar: minúsculas y sin acentos. */
export const wordKey = (text: string) => strip(text);

const START = '<s>';
const uni = new Map<string, number>();
const bi = new Map<string, number>();
const follow = new Map<string, number>();
let total = 0;

for (const line of CORPUS.split('\n')) {
  const words = strip(line).split(/\s+/).filter(Boolean);
  if (!words.length) continue;
  let prev = START;
  for (const w of words) {
    uni.set(w, (uni.get(w) ?? 0) + 1);
    bi.set(`${prev} ${w}`, (bi.get(`${prev} ${w}`) ?? 0) + 1);
    follow.set(prev, (follow.get(prev) ?? 0) + 1);
    total++;
    prev = w;
  }
}
const V = uni.size + 1;

/**
 * Cuánto ayuda al oído que `word` venga después de `prev` (null = inicio de la frase).
 * Va de -0.3 (raro) a 0.7 (muy común); 0 si el modelo no conoce las palabras. Es una ayuda, no una orden:
 * una palabra que no se parece en los labios nunca gana solo por ir bien en la frase.
 */
export function bigramBonus(prev: string | null, word: string): number {
  const w = wordKey(word);
  if (!uni.has(w)) return 0;
  const p = prev ? wordKey(prev) : START;
  if (prev && !uni.has(p)) return 0;
  const prob = ((bi.get(`${p} ${w}`) ?? 0) + 0.05) / ((follow.get(p) ?? 0) + 0.05 * V);
  const base = (uni.get(w)! + 0.5) / (total + 0.5 * V);
  return Math.max(-0.3, Math.min(0.7, 0.16 * Math.log(prob / base) + 0.1));
}

const QUESTION = new Set(['que', 'como', 'donde', 'cuando', 'quien', 'cuanto', 'cuantos', 'cual', 'cuales', 'puedes', 'podrias', 'tienes', 'hay', 'vienen', 'vas']);
const NEGATES = new Set(['me', 'quiero', 'puedo', 'tengo', 'hay', 'se', 'estoy', 'necesito', 'entiendo', 'siento', 'duele', 'es', 'quieres']);

/**
 * Convierte las palabras leídas en la frase escrita: mayúscula al inicio, comas después de «sí»,
 * signos de pregunta y punto final. Devuelve un texto por palabra (la puntuación va pegada a ella),
 * así cada palabra se puede tocar para corregirla.
 */
export function composeSentence(words: string[]): string[] {
  const out = words.map((w) => w.trim());
  if (!out.length) return out;
  const keys = out.map(wordKey);
  if (out.length === 1) {
    out[0] = cap(out[0]);
    return out;
  }
  // «Sí, me duele»; «no» solo lleva coma cuando es una respuesta suelta («No, gracias»), no cuando niega («No me duele»).
  if (keys[0] === 'si') out[0] += ',';
  else if (keys[0] === 'no' && !NEGATES.has(keys[1]) && keys[1] !== 'tengo') out[0] += ',';
  const question = QUESTION.has(keys[0]);
  if (question) out[0] = `¿${out[0]}`;
  out[out.length - 1] += question ? '?' : '.';
  out[0] = cap(out[0]);
  return out;
}

const cap = (s: string) => s.replace(/^([¿¡]*)(\p{L})/u, (_, a: string, b: string) => a + b.toUpperCase());

/** Texto que se le dice a la voz: lo que quedó escrito, sin signos de apertura. */
export const spokenText = (tokens: string[]) => tokens.join(' ').replace(/[¿¡]/g, '');

import '@fontsource/anton/latin-400.css';
import { go } from '../../app/router';
import { state } from '../../app/state';
import { speakText } from '../../core/voice/speaker';
import { CATEGORY_LABEL, DEFAULT_PHRASES } from '../../data/default-phrases';
import { bindPalette, currentTheme, paletteHTML, type Theme } from '../components/theme';
import { esc, on, reducedMotion, rich, sleep } from '../dom';
import { icon } from '../icons';
import type { Field, Shape } from './ayuda-field';

/* ---------- Figuras que forman los puntos de fondo ---------- */

const SHAPES: Shape[] = [];
const sh = (s: Shape) => SHAPES.push(s) - 1;
const S = {
  lips: sh({ draw: 'lips' }),
  voz: sh({ text: 'VOZ' }),
  datos: sh({ text: 'DATOS' }),
  mx: sh({ text: '742 MIL' }),
  mundo: sh({ text: '200 MIL' }),
  traqueo: sh({ text: '198 MIL' }),
  ela: sh({ text: 'ELA' }),
  uci: sh({ text: 'SIN VOZ' }),
  dolor: sh({ text: '9 DE 10' }),
  corazon: sh({ draw: 'heart' }),
  onda: sh({ draw: 'wave' }),
  hola: sh({ text: 'HOLA' }),
  cero: sh({ text: '0 VIDEOS' }),
  tuvoz: sh({ text: 'TU VOZ' }),
  limites: sh({ text: 'SÍ Y NO' }),
  duda: sh({ text: '?' }),
  ruta: sh({ text: 'HOY' }),
};

/* ---------- Fuentes ---------- */

interface Source {
  id: string;
  short: string;
  name: string;
  url: string;
}

const SOURCES: Source[] = [
  { id: 'eic25', short: 'INEGI, Intercensal 2025', name: 'INEGI (22 de septiembre de 2026). Encuesta Intercensal 2025, comunicado de prensa 54/26: 130.9 millones de habitantes y 6.4 millones de personas con discapacidad.', url: 'https://www.inegi.org.mx/contenidos/saladeprensa/boletines/2026/ei/EIC2025-def_CP.pdf' },
  { id: 'eic25r', short: 'INEGI 2026', name: 'INEGI (2026). Encuesta Intercensal 2025, reporte de resultados 37/26: el 11.6% de las personas con discapacidad tiene dificultad para hablar o comunicarse.', url: 'https://www.inegi.org.mx/contenidos/saladeprensa/boletines/2026/ei/EIC2025-def_RR.pdf' },
  { id: 'gbd25', short: 'Estudio 2025', name: 'Carga mundial del cáncer de laringe de 1990 a 2021, con datos del Estudio de Carga Global de Enfermedad. Frontiers in Oncology, 2025.', url: 'https://www.frontiersin.org/articles/10.3389/fonc.2025.1617613/full' },
  { id: 'acs26', short: 'Sociedad Americana del Cáncer, 2026', name: 'American Cancer Society. Estadísticas clave del cáncer de laringe: estimaciones para 2026 (12,290 casos nuevos en Estados Unidos).', url: 'https://www.cancer.org/cancer/types/laryngeal-and-hypopharyngeal-cancer/about/key-statistics.html' },
  { id: 'traqueo', short: 'Estudio 2024', name: 'Incidencia y complicaciones de la traqueostomía: análisis de una base de datos nacional de seguros de Estados Unidos, 2010 a 2021 (publicado en 2024).', url: 'https://profiles.wustl.edu/en/publications/tracheostomy-incidence-and-complications-a-national-database-anal/' },
  { id: 'ela25', short: 'Revisión 2025', name: 'Whelan y colaboradores. Tratamiento del habla para la disartria en la esclerosis lateral amiotrófica: una revisión. Healthcare, 2025.', url: 'https://doi.org/10.3390/healthcare13192434' },
  { id: 'uci25', short: 'Brambilla y cols., 2025', name: 'Brambilla y colaboradores. Dificultades de comunicación en pacientes sin voz con ventilación mecánica en terapia intensiva. Nursing in Critical Care, 2025.', url: 'https://iris.unitn.it/handle/11572/478710' },
  { id: 'dolor24', short: 'Hospital Chợ Rẫy, 2024', name: 'Evaluación del dolor durante los cuidados de pacientes con ventilación mecánica en la terapia intensiva de neurocirugía del Hospital Chợ Rẫy (Vietnam): 295 pacientes, de noviembre de 2023 a junio de 2024.', url: 'https://vnras.com/danh-gia-muc-do-dau-khi-thuc-hien-thu-thuat-cua-nguoi-benh-tho-may-tai-khoa-hoi-suc-ngoai-than-kinh-benh-vien-cho-ray/' },
  { id: 'happ15', short: 'Happ y cols.', name: 'Happ y colaboradores. Pacientes con ventilador que pueden comunicarse, 2,671 pacientes. Heart & Lung.', url: 'https://healthmanagement.org/s/over-half-of-icu-patients-on-ventilators-able-to-communicate' },
];

const srcLinks = (ids: string[]) =>
  `<span class="a-srcs">${ids
    .map((id) => {
      const n = SOURCES.findIndex((s) => s.id === id) + 1;
      return `<a class="a-src" href="#a-fuentes" data-jump="a-fuentes">${icon('info', 15)}Fuente ${n}: ${SOURCES[n - 1].short}</a>`;
    })
    .join('')}</span>`;

/* ---------- Contenido (las ideas clave van entre *asteriscos*) ---------- */

interface Fact {
  shape: number;
  over: string;
  count: number | null;
  big?: string;
  unit: string;
  title: string;
  body: string;
  extra?: string;
  sources: string[];
  /** Resumen para la vista «en una mirada». */
  gu: string;
  gl: string;
}

const FACTS: Fact[] = [
  {
    shape: S.mx,
    over: 'México, 2025',
    count: 742,
    unit: 'mil personas',
    title: 'tienen mucha dificultad para hablar o comunicarse, o no pueden hacerlo.',
    body: 'Es lo que encontró la *Encuesta Intercensal 2025* de INEGI, publicada en *septiembre de 2026*: de *6.4 millones* de personas con discapacidad, el *11.6%* tiene dificultad para hablar o comunicarse. Detrás de cada número hay alguien que sí tiene qué decir.',
    extra: 'México tiene *130.9 millones* de habitantes. La encuesta se hizo del 6 de octubre al 14 de noviembre de 2025. Las 742 mil personas salen del 11.6% de 6.4 millones.',
    sources: ['eic25', 'eic25r'],
    gu: 'mil',
    gl: 'personas en México tienen mucha dificultad para hablar o no pueden (2025)',
  },
  {
    shape: S.mundo,
    over: 'El mundo',
    count: 200,
    unit: 'mil casos nuevos',
    title: 'de cáncer de laringe cada año.',
    body: 'Así lo calcula un estudio publicado en *2025*: más de *200 mil personas* al año reciben este diagnóstico. Solo en Estados Unidos se esperan *12,290 casos nuevos en 2026*. La cirugía de laringe puede quitar la voz, pero *los labios se siguen moviendo*.',
    sources: ['gbd25', 'acs26'],
    gu: 'mil',
    gl: 'casos nuevos de cáncer de laringe al año en el mundo',
  },
  {
    shape: S.traqueo,
    over: 'Traqueostomía',
    count: 198,
    unit: 'mil traqueostomías',
    title: 'entre 2010 y 2021, solo en una base de seguros de Estados Unidos.',
    body: 'Un estudio de 2024 contó *198 mil traqueostomías* en 11 años (Medicare, Medicaid y seguros privados). En el *10.3%* hubo alguna complicación en los 90 días siguientes. Con la cánula en el cuello, el aire ya no pasa por las cuerdas vocales y *la voz no sale*. *La boca sí se mueve*, y eso es lo que Voz Propia lee.',
    sources: ['traqueo'],
    gu: 'mil',
    gl: 'traqueostomías entre 2010 y 2021 en una base de seguros de EE. UU.',
  },
  {
    shape: S.ela,
    over: 'ELA',
    count: null,
    big: '80 a 95%',
    unit: '',
    title: 'de las personas con ELA llega a no poder comunicarse solo con su voz.',
    body: 'Lo recoge una revisión científica de *2025*. La esclerosis lateral amiotrófica debilita poco a poco los músculos, *también los del habla*.',
    extra: 'Mientras *los labios todavía se muevan*, Voz Propia puede acompañar esa etapa.',
    sources: ['ela25'],
    gu: '',
    gl: 'de las personas con ELA llega a no poder comunicarse con su voz',
  },
  {
    shape: S.uci,
    over: 'Terapia intensiva',
    count: null,
    big: 'Cada vez más',
    unit: '',
    title: 'pacientes con ventilador están despiertos, pero sin voz.',
    body: 'Un estudio de *2025* lo explica: hoy en terapia intensiva se usa *menos sedación*, así que muchos pacientes están *conscientes* mientras el tubo les impide hablar. En un estudio grande, *más de la mitad* (54% de 2,671 pacientes) podía comunicarse.',
    sources: ['uci25', 'happ15'],
    gu: '',
    gl: 'pacientes con ventilador están despiertos, pero sin voz',
  },
  {
    shape: S.dolor,
    over: 'El dolor',
    count: 9,
    unit: 'de cada 10',
    title: 'pacientes con ventilador sintieron dolor moderado o fuerte en un cuidado de rutina.',
    body: 'Un estudio con *295 pacientes* con ventilador, de 2023 a 2024, midió el dolor al aspirarles las secreciones: el *88.5%* tuvo dolor moderado o fuerte. Con el tubo, *no lo pueden decir*. Decir «me duele» *a tiempo lo cambia todo*.',
    sources: ['dolor24'],
    gu: 'de cada 10',
    gl: 'pacientes con ventilador sintieron dolor moderado o fuerte en un cuidado de rutina',
  },
];

const SUMMARY: [string, string, string][] = [
  ['Problema', 'help', 'Muchas personas *pierden la voz* por una traqueostomía, una cirugía de laringe, una intubación o una enfermedad. Pero *siguen moviendo los labios*.'],
  ['Solución', 'sparkles', '*Voz Propia* lee ese movimiento con la cámara del teléfono y *lo dice en voz alta*.'],
  ['Cómo', 'scan-face', 'Mira *cómo se mueven tus labios* y reconoce la palabra entre las que *prepara nuestro equipo*.'],
  ['Privacidad', 'shield-check', '*No graba ni envía video.* Funciona *sin internet*, dentro del teléfono.'],
  ['Hoy', 'check', 'Guía, página de datos y *modo programador* para preparar palabras. Las *primeras palabras están en preparación*.'],
  ['Sigue', 'arrow-right', '*Iniciar a utilizar* con la cámara, más palabras preparadas y cuentas para guardar tu perfil.'],
];

const PILLARS: [string, string, string][] = [
  ['scan-face', 'Lee tus labios', 'Con la cámara del teléfono, *mira cómo se mueven*.'],
  ['sparkles', 'Palabras preparadas', 'Las prepara *nuestro equipo*, con cuidado.'],
  ['volume', 'Habla en voz alta', 'La palabra suena al instante, con *la voz de tu teléfono*.'],
  ['wifi-off', 'Sin internet', 'Todo corre dentro del teléfono, *incluso sin señal*.'],
];

interface Who {
  id: string;
  tab: string;
  icon: string;
  title: string;
  body: string;
  before: string;
  after: string;
  points: string[];
  note?: string;
}

const WHO: Who[] = [
  {
    id: 'traqueo',
    tab: 'Traqueostomía',
    icon: 'wind',
    title: 'Respiras por la cánula, hablas con los labios.',
    body: 'La cánula desvía el aire y la voz no sale. *Tus labios siguen formando cada palabra*: Voz Propia las lee y las dice.',
    before: 'Pizarrón, señas o esperar a que alguien adivine.',
    after: 'Mueves los labios y *suena tu palabra*.',
    points: ['Sin tapar la cánula', 'Acostado o sentado', 'Frases para pedir lo urgente'],
    note: 'Funciona mientras puedas mover los labios.',
  },
  {
    id: 'laringe',
    tab: 'Laringectomía',
    icon: 'heart',
    title: 'Después de la cirugía, tu voz no se queda atrás.',
    body: 'Mientras aprendes otras formas de hablar, Voz Propia te da *una voz desde el primer día*, con la que tu familia eligió.',
    before: 'Días sin poder pedir lo más básico.',
    after: '*Una voz lista* desde el primer día.',
    points: ['Desde el primer día', 'Voz elegida por tu familia', 'Sin aparatos extra'],
  },
  {
    id: 'uci',
    tab: 'Terapia intensiva',
    icon: 'bed',
    title: 'Despierto, con tubo y sin poder decir «me duele».',
    body: 'En un cuarto de hospital sin señal, Voz Propia funciona igual: *todo corre dentro del teléfono*, sin internet.',
    before: 'Casi *9 de cada 10* sienten dolor en cuidados de rutina, sin poder decirlo.',
    after: 'Dices «Me duele» y *el equipo lo escucha*.',
    points: ['Funciona sin internet', 'Sí, no y dolor', 'Pregunta si duda'],
  },
  {
    id: 'ela',
    tab: 'ELA',
    icon: 'activity',
    title: 'Mientras puedas mover los labios, puedes seguir diciendo.',
    body: 'Con ELA el habla se debilita poco a poco. Voz Propia puede *acompañar esa etapa*. No reemplaza otras ayudas de comunicación.',
    before: 'Cada vez es más difícil que te entiendan.',
    after: 'Palabras *claras*, con la voz del teléfono.',
    points: ['Acompaña la etapa con labios', 'Palabras preparadas con cuidado', 'Complementa otras ayudas'],
    note: 'Cuando los labios ya no se muevan, harán falta otras ayudas.',
  },
  {
    id: 'salud',
    tab: 'Personal de salud',
    icon: 'stethoscope',
    title: 'Entender a la primera.',
    body: 'Cuando la persona puede decir lo que necesita, el equipo *responde más rápido* y con menos adivinanzas.',
    before: 'Preguntar una y otra vez, y leer gestos.',
    after: 'Recibir *la palabra exacta*: dolor, sed, falta de aire.',
    points: ['Frases básicas de hospital', 'Sin instalar equipos', 'Funciona sin internet'],
    note: 'Es una ayuda para comunicarse. No sustituye la valoración clínica.',
  },
  {
    id: 'familia',
    tab: 'Su familia',
    icon: 'hand-heart',
    title: 'Dejar de adivinar.',
    body: 'Señas, pizarrones y papelitos cansan y se malentienden. Con Voz Propia la familia escucha *la palabra exacta*.',
    before: 'Adivinar, preguntar una y otra vez.',
    after: 'Escuchar la palabra exacta, *sin adivinar*.',
    points: ['Menos frustración', 'Respuestas al instante', 'Nada se graba ni se envía'],
  },
];

interface Step {
  name: string;
  icon: string;
  title: string;
  body: string;
}

const STEPS: Step[] = [
  { name: 'Mira', icon: 'scan-face', title: 'Pones tu cara frente al teléfono.', body: 'La cámara te ve *solo mientras hablas*. *No graba video.*' },
  { name: 'Labios', icon: 'activity', title: 'Mueves los labios.', body: 'Dices la palabra *como siempre*, aunque no salga la voz. No hace falta exagerar.' },
  { name: 'Reconoce', icon: 'sparkles', title: 'Reconoce tu palabra.', body: 'Voz Propia *entiende qué dijiste* entre las palabras que preparó nuestro equipo.' },
  { name: 'Confirma', icon: 'help', title: 'Si duda, te pregunta.', body: 'Si dos palabras se parecen, *te muestra las opciones* y tú eliges. No adivina.' },
  { name: 'Voz', icon: 'volume', title: 'Suena al instante.', body: 'La palabra se dice *en voz alta* con la voz de tu teléfono, la que tu familia eligió.' },
];

const TAGS: [string, string][] = [
  ['wifi-off', 'Funciona sin internet'],
  ['shield-check', 'No graba video'],
  ['lock', 'Tus datos, solo en tu teléfono'],
  ['volume', 'Habla con la voz del teléfono'],
  ['download', 'Se instala como una app'],
  ['message-circle', 'Todo en español'],
];

const DEMO = ['Tengo sed', 'Me duele', 'Tengo frío', 'Llama a mi familia'];

const RATES: [string, number][] = [['Lenta', 0.8], ['Normal', 1], ['Rápida', 1.25]];
const PAIN = ['Sin dolor', 'Muy leve', 'Leve', 'Molesto', 'Molesto', 'Moderado', 'Moderado', 'Fuerte', 'Muy fuerte', 'Intenso', 'El peor dolor'];

interface Layer {
  name: string;
  icon: string;
  badge: string;
  saved: boolean;
  text: string;
}

const LAYERS: Layer[] = [
  { name: 'La cámara', icon: 'camera', badge: 'No se graba', saved: false, text: 'Ve tus labios solo mientras hablas. *El video no se graba ni se envía* a ningún lado.' },
  { name: 'Tu imagen', icon: 'scan-face', badge: 'No se guarda', saved: false, text: 'Se usa al momento para reconocer la palabra y *se descarta*.' },
  { name: 'Internet', icon: 'wifi-off', badge: 'No se envía', saved: false, text: 'Nada sale de tu teléfono. *Todo pasa ahí mismo*, incluso sin señal.' },
  { name: 'Tu teléfono', icon: 'lock', badge: 'Solo en tu dispositivo', saved: true, text: 'Lo que la app necesita para funcionar *vive solo en tu teléfono*.' },
];

const PROMISES: [string, string, string][] = [
  ['wifi-off', 'Sin internet', 'Todo corre dentro del teléfono.'],
  ['shield-check', 'Sin video guardado', 'Nada se graba ni se envía.'],
  ['sparkles', 'Palabras preparadas', 'Nuestro equipo cuida cada palabra.'],
  ['volume', 'Tu voz, tu decisión', 'Suena con la voz que tu familia eligió.'],
];

const MOMENTS: { tab: string; icon: string; before: string; after: string }[] = [
  { tab: 'De madrugada', icon: 'moon', before: 'Tienes sed y no hay nadie cerca. Intentas llamar, pero sin voz.', after: 'Mueves los labios: «Tengo sed». *El teléfono lo dice en voz alta.*' },
  { tab: 'Con el equipo médico', icon: 'stethoscope', before: 'Quieres decir que te duele y te responden con preguntas que no puedes contestar.', after: 'Dices «Me duele». Si dudan, *tú respondes «Sí» o «No»*.' },
  { tab: 'Con tu familia', icon: 'hand-heart', before: 'Tu familia adivina y tú niegas con la cabeza.', after: 'Dices «Gracias» o «Llama a mi familia», *con tu voz*.' },
];

const COMPARE: [string, string][] = [
  ['Escribir en un papel, con las manos cansadas', 'Mover los labios, como siempre'],
  ['Señas que se malentienden', 'La palabra exacta, en voz alta'],
  ['Esperar a que alguien adivine', 'Al instante, sin adivinar'],
  ['Apps que necesitan internet', 'Funciona en modo avión'],
];

const LIMITS: { tab: string; icon: string; items: string[] }[] = [
  {
    tab: 'Lo que hace hoy',
    icon: 'check',
    items: [
      'Lee tus labios con la cámara del teléfono.',
      'Dice la palabra *en voz alta*.',
      'Funciona *sin internet*.',
      'Si duda, *te pregunta* y tú eliges.',
      '*No graba ni envía video.*',
    ],
  },
  {
    tab: 'Lo que todavía no',
    icon: 'x',
    items: [
      'Entender cualquier frase: *solo las palabras preparadas*.',
      'Leer labios tapados con cubrebocas o con la mano.',
      'Funcionar bien con poca luz: *mejor con luz de frente*.',
      'Reemplazar la atención del personal de salud.',
      'Guardar tu perfil en una cuenta (*muy pronto*).',
    ],
  },
];

const EASY: [string, string][] = [
  ['type', 'Letras grandes y buen contraste'],
  ['hand', 'Botones grandes, fáciles de tocar'],
  ['user', 'Sin cuenta para empezar'],
  ['message-circle', 'Todo en español'],
  ['wifi-off', 'Funciona sin internet'],
  ['eye', 'Un paso a la vez'],
];

const FAQ: [string, string][] = [
  ['¿Necesita internet?', '*No.* Después de abrirla por primera vez con internet, todo corre dentro del teléfono, incluso en un cuarto de hospital sin señal.'],
  ['¿Guarda mi video?', '*No.* La cámara no graba ni envía video. Tu imagen se usa al momento y se descarta.'],
  ['¿Qué pasa si se equivoca?', 'Si no está segura, *te muestra las opciones y tú eliges*. Con poca seguridad, te pide confirmar antes de hablar.'],
  ['¿Cuántas palabras entiende?', 'Las que prepara nuestro equipo. *Las primeras están en preparación* y se irán sumando.'],
  ['¿Quién prepara las palabras?', '*Nuestro equipo.* Prepara y revisa cada palabra con cuidado. La persona usuaria no tiene que crear nada.'],
  ['¿Funciona con cubrebocas o con la mano en la boca?', '*No.* Necesita ver tus labios. Sin cubrebocas y sin tapar la boca.'],
  ['¿Qué luz necesita?', 'Mejor con *buena luz de frente*, no por detrás. El teléfono a la altura de tu cara, a un brazo de distancia.'],
  ['¿Qué tan rápido es?', '*Casi al instante.* La palabra suena en cuanto terminas de decirla.'],
  ['¿Se puede instalar en el teléfono?', '*Sí.* Es una app web: se puede instalar desde el navegador y abrirse como cualquier app.'],
  ['¿Es un dispositivo médico?', '*No.* Es una ayuda para comunicarse. No reemplaza la atención del personal de salud.'],
];

const TERMS: [string, string][] = [
  ['Traqueostomía', 'Una abertura en el cuello, con una cánula, por donde entra el aire. Si el aire no pasa por las cuerdas vocales, *la voz no sale*.'],
  ['Laringectomía', 'Cirugía que quita la laringe, donde están las cuerdas vocales. Se hace, por ejemplo, por *cáncer de laringe*.'],
  ['Intubación', 'Un tubo que pasa por la boca hasta la tráquea para ayudar a respirar. *Con él no se puede hablar.*'],
  ['ELA', 'Esclerosis lateral amiotrófica. Enfermedad que *debilita poco a poco los músculos*, incluidos los del habla.'],
  ['Disartria', 'Dificultad para pronunciar por *debilidad de los músculos del habla*.'],
  ['Afonía', 'Pérdida de la voz: la persona *mueve la boca*, pero el sonido no sale.'],
];

const ROUTE: { when: string; icon: string; items: string[] }[] = [
  { when: 'Hoy', icon: 'check', items: ['Guía de cómo funciona', 'Página de datos y fuentes', 'Modo programador para preparar palabras', 'Funciona sin internet'] },
  { when: 'Muy pronto', icon: 'lock', items: ['Iniciar a utilizar con la cámara', 'Inicio de sesión y cuenta'] },
  { when: 'Después', icon: 'sparkles', items: ['Más palabras preparadas', 'Pruebas con personal de salud y familias'] },
];

const NAV: [string, string][] = [
  ['a-top', 'Inicio'],
  ['a-resumen', 'Resumen'],
  ['a-que', 'Qué es'],
  ['a-datos', 'Datos'],
  ['a-quien', 'A quién ayuda'],
  ['a-como', 'Cómo funciona'],
  ['a-demo', 'Pruébalo'],
  ['a-palabras', 'Palabras'],
  ['a-priv', 'Privacidad'],
  ['a-ayuda', 'Cómo te ayuda'],
  ['a-limites', 'Alcances y límites'],
  ['a-faq', 'Preguntas'],
  ['a-ruta', 'Ruta'],
  ['a-fuentes', 'Fuentes'],
];

/* ---------- Plantilla ---------- */

function template() {
  const facts = FACTS.map(
    (d, i) => `
    <section class="a-sec a-data" id="a-f${i}" data-nav="a-datos" data-shape="${d.shape}" aria-labelledby="a-d${i}">
      <div class="a-copy">
        <p class="a-over">[ 0${i + 1} · ${d.over} ]</p>
        <h3 class="a-num" id="a-d${i}">${d.count === null ? `<b class="a-num__txt">${d.big}</b>` : `<b data-count="${d.count}">0</b>`}${d.unit ? `<span>${d.unit}</span>` : ''}</h3>
        <p class="a-title">${d.title}</p>
        <p class="a-body">${rich(d.body)}</p>
        ${d.extra ? `<p class="a-extra">${icon('info', 18)}<span>${rich(d.extra)}</span></p>` : ''}
        ${srcLinks(d.sources)}
      </div>
    </section>`,
  ).join('');

  const glance = FACTS.map(
    (d, i) => `<li><button class="a-gl" type="button" data-jump="a-f${i}">
      <b>${d.count === null ? d.big : `<span data-count="${d.count}">0</span> ${d.gu}`}</b>
      <span>${d.gl}</span><i aria-hidden="true">${icon('arrow-right', 16, 2.4)}</i>
    </button></li>`,
  ).join('');

  const summary = SUMMARY.map(
    ([t, ic, d]) => `<li class="a-sum__i"><span class="a-sum__ic">${icon(ic, 22, 1.9)}</span><small>${t}</small><p>${rich(d)}</p></li>`,
  ).join('');

  const pillars = PILLARS.map(
    ([ic, t, d]) => `<li class="a-pillar"><span class="a-pillar__ic">${icon(ic, 24, 1.9)}</span><h3>${t}</h3><p>${rich(d)}</p></li>`,
  ).join('');

  const whoTabs = WHO.map(
    (w, i) => `<button class="a-tab" type="button" role="tab" id="a-tab-${w.id}" aria-controls="a-who-panel" aria-selected="${i === 0}" tabindex="${i === 0 ? 0 : -1}" data-who="${i}">${icon(w.icon, 18)}<span>${w.tab}</span></button>`,
  ).join('');

  const stepNav = STEPS.map(
    (s, i) => `<button class="a-sn" type="button" role="tab" id="a-sn-${i}" aria-controls="a-step-panel" aria-selected="${i === 0}" tabindex="${i === 0 ? 0 : -1}" data-step="${i}"><b>${i + 1}</b><span>${s.name}</span></button>`,
  ).join('');

  const tags = TAGS.map(([ic, t]) => `<li>${icon(ic, 16)}<span>${t}</span></li>`).join('');

  const demoChips = DEMO.map((t, i) => `<button class="a-chip" type="button" data-demo="${i}" aria-pressed="false">${t}</button>`).join('');
  const demoRows = DEMO.map((t) => `<div class="a-row"><span>${t}</span><div class="a-track"><i></i></div><b>0%</b></div>`).join('');

  const cats = Array.from(new Set(DEFAULT_PHRASES.map((p) => p.category)));
  const catTabs = cats
    .map((c, i) => `<button class="a-tab a-tab--sm" type="button" role="tab" id="a-cat-${c}" aria-controls="a-cat-panel" aria-selected="${i === 0}" tabindex="${i === 0 ? 0 : -1}" data-cat="${i}"><span>${CATEGORY_LABEL[c]}</span></button>`)
    .join('');

  const layerTabs = LAYERS.map(
    (l, i) => `<button class="a-layer" type="button" role="tab" id="a-ly-${i}" aria-controls="a-layer-panel" aria-selected="${i === 0}" tabindex="${i === 0 ? 0 : -1}" data-layer="${i}"><span class="a-layer__ic">${icon(l.icon, 20)}</span><span>${l.name}</span>${i < LAYERS.length - 1 ? `<i class="a-layer__arrow" aria-hidden="true">${icon('chevron-right', 16)}</i>` : ''}</button>`,
  ).join('');

  const promises = PROMISES.map(
    ([ic, t, d]) => `<li class="a-promise"><span class="a-promise__ic">${icon(ic, 22, 1.9)}</span><div><h3>${t}</h3><p>${d}</p></div></li>`,
  ).join('');

  const momentTabs = MOMENTS.map(
    (m, i) => `<button class="a-tab a-tab--sm" type="button" role="tab" id="a-mo-${i}" aria-controls="a-moment-panel" aria-selected="${i === 0}" tabindex="${i === 0 ? 0 : -1}" data-moment="${i}">${icon(m.icon, 16)}<span>${m.tab}</span></button>`,
  ).join('');

  const compare = COMPARE.map(
    ([a, b]) => `<li><span class="a-cmp__before">${icon('x', 18, 2.4)}${a}</span><span class="a-cmp__after">${icon('check', 18, 2.6)}${b}</span></li>`,
  ).join('');

  const stats = [
    ['0', 'videos guardados'],
    ['0', 'aparatos extra'],
    ['1', 'teléfono, nada más'],
    ['11', 'niveles de dolor para elegir'],
  ]
    .map(([v, l]) => `<li><b data-count="${v}">0</b><span>${l}</span></li>`)
    .join('');

  const limTabs = LIMITS.map(
    (l, i) => `<button class="a-tab a-tab--sm" type="button" role="tab" id="a-lim-${i}" aria-controls="a-lim-panel" aria-selected="${i === 0}" tabindex="${i === 0 ? 0 : -1}" data-lim="${i}">${icon(l.icon, 16, 2.4)}<span>${l.tab}</span></button>`,
  ).join('');

  const easy = EASY.map(([ic, t]) => `<li>${icon(ic, 18)}<span>${t}</span></li>`).join('');

  const faq = FAQ.map(([q, a]) => `<details class="a-q"><summary>${q}<i aria-hidden="true">${icon('chevron-right', 20, 2.4)}</i></summary><p>${rich(a)}</p></details>`).join('');

  const termTabs = TERMS.map(([t], i) => `<button class="a-term" type="button" aria-pressed="${i === 0}" data-term="${i}">${t}</button>`).join('');

  const route = ROUTE.map(
    (r) => `<li class="a-rt"><h3>${icon(r.icon, 18, 2.4)}${r.when}</h3><ul>${r.items.map((t) => `<li>${t}</li>`).join('')}</ul></li>`,
  ).join('');

  const sources = SOURCES.map((s) => `<li><a href="${s.url}" target="_blank" rel="noopener noreferrer">${s.name}${icon('external', 14)}</a></li>`).join('');

  const idx = NAV.map(([id, t], i) => `<li><button type="button" data-jump="${id}" data-idx-item="${id}"><b>${String(i + 1).padStart(2, '0')}</b>${t}</button></li>`).join('');

  return `
  <div class="ayuda" data-ayuda-page>
    <div class="a-stage" aria-hidden="true"><canvas></canvas></div>
    <i class="a-progress" aria-hidden="true"></i>
    ${paletteHTML()}
    <button class="a-idx-btn" type="button" data-idx aria-expanded="false" aria-controls="a-idx">${icon('layout-grid', 18)}<span>Índice</span></button>
    <nav class="a-idx" id="a-idx" aria-label="Índice de la página" hidden><p>Ir a…</p><ol>${idx}</ol></nav>

    <section class="a-sec a-hero" id="a-top" data-nav="a-top" data-shape="${S.lips}" aria-labelledby="a-hero-t">
      <div class="a-copy">
        <p class="a-over">[ Cómo funciona y cómo te ayuda ]</p>
        <h1 class="a-h1" id="a-hero-t">Perdieron la voz.<br><em>No las palabras.</em></h1>
        <p class="a-body a-body--lead">Datos reales, a quién ayuda Voz Propia y cómo puede cambiar su día a día.</p>
        <div class="a-actions">
          <button class="a-btn a-btn--main" type="button" data-jump="a-datos">${icon('arrow-down', 18, 2.4)}<span>Ver los datos</span></button>
          <button class="a-btn" type="button" data-jump="a-demo">${icon('play', 18, 2.2)}<span>Probar la demo</span></button>
          <button class="a-btn" type="button" data-jump="a-faq">${icon('help', 18, 2.2)}<span>Preguntas</span></button>
          <button class="a-btn" type="button" data-to-tools>${icon('lightbulb', 18, 2.2)}<span>Consejos de uso</span></button>
        </div>
        <p class="a-hint">${icon('pointer', 16)} Mueve el mouse o toca la pantalla: los puntos te siguen. Haz clic y suéltalo.</p>
      </div>
    </section>

    <section class="a-sec a-dense" id="a-resumen" data-nav="a-resumen" data-shape="${S.lips}" aria-labelledby="a-sum-t">
      <div class="a-copy a-copy--wide">
        <p class="a-over">[ Resumen ]</p>
        <h2 class="a-h2" id="a-sum-t">El proyecto en una pantalla.</h2>
        <ul class="a-sum">${summary}</ul>
      </div>
    </section>

    <section class="a-sec a-dense" id="a-que" data-nav="a-que" data-shape="${S.voz}" aria-labelledby="a-que-t">
      <div class="a-copy a-copy--wide">
        <p class="a-over">[ Qué es ]</p>
        <h2 class="a-h2" id="a-que-t">Una voz que vive en tu teléfono.</h2>
        <p class="a-body">${rich('Voz Propia lee *el movimiento de tus labios* y lo dice en voz alta. Es para quien *perdió la voz*, pero todavía puede mover la boca.')}</p>
        <ul class="a-pillars">${pillars}</ul>
      </div>
    </section>

    <section class="a-sec a-dense" id="a-datos" data-nav="a-datos" data-shape="${S.datos}" aria-labelledby="a-dat-t">
      <div class="a-copy a-copy--wide">
        <p class="a-over">[ Datos ]</p>
        <h2 class="a-h2" id="a-dat-t">Los números, en una mirada.</h2>
        <p class="a-body">Cifras reales de México y del mundo. Toca una para ver el detalle y su fuente.</p>
        <ul class="a-glance">${glance}</ul>
      </div>
    </section>

    ${facts}

    <section class="a-sec a-dense" id="a-quien" data-nav="a-quien" data-shape="${S.corazon}" aria-labelledby="a-who-t">
      <div class="a-copy a-copy--wide">
        <p class="a-over">[ A quién ayuda ]</p>
        <h2 class="a-h2" id="a-who-t">Hecha para quien todavía mueve los labios.</h2>
        <div class="a-tabs" role="tablist" aria-label="A quién ayuda">${whoTabs}</div>
        <div class="a-panel" id="a-who-panel" role="tabpanel" aria-labelledby="a-tab-${WHO[0].id}" data-who-panel></div>
      </div>
    </section>

    <section class="a-sec a-dense" id="a-como" data-nav="a-como" data-shape="${S.onda}" aria-labelledby="a-how-t">
      <div class="a-copy a-copy--wide">
        <p class="a-over">[ Cómo funciona ]</p>
        <h2 class="a-h2" id="a-how-t">Cinco pasos, menos de un segundo.</h2>
        <div class="a-stepper">
          <div class="a-stepper__nav" role="tablist" aria-label="Pasos">${stepNav}</div>
          <div class="a-panel a-panel--step" id="a-step-panel" role="tabpanel" aria-labelledby="a-sn-0" data-step-panel></div>
          <div class="a-stepper__ctl">
            <button class="a-round" type="button" data-step-prev aria-label="Paso anterior">${icon('chevron-left', 20, 2.4)}</button>
            <i class="a-bar" aria-hidden="true"><b data-step-bar></b></i>
            <button class="a-round" type="button" data-step-next aria-label="Paso siguiente">${icon('chevron-right', 20, 2.4)}</button>
          </div>
        </div>
        <h3 class="a-h3">Lo que la hace distinta</h3>
        <ul class="a-tags">${tags}</ul>
      </div>
    </section>

    <section class="a-sec a-dense" id="a-demo" data-nav="a-demo" data-shape="${S.lips}" aria-labelledby="a-demo-t">
      <div class="a-copy a-copy--wide">
        <p class="a-over">[ Pruébalo ]</p>
        <h2 class="a-h2" id="a-demo-t">Míralo leer.</h2>
        <div class="a-demo">
          <div class="a-demo__top"><h3>Elige una palabra</h3><span class="a-live" data-live>${icon('scan-face', 16)} Esperando</span></div>
          <p class="a-demo__p">Toca una palabra: así compara tu movimiento con las que preparamos y elige la más parecida.</p>
          <div class="a-chips" role="group" aria-label="Palabras de ejemplo">${demoChips}</div>
          <div class="a-rows" aria-live="polite">${demoRows}</div>
          <p class="a-said" data-said hidden></p>
          <p class="a-note">Ejemplo ilustrativo: aquí no se usa la cámara.</p>
        </div>
      </div>
    </section>

    <section class="a-sec a-dense" id="a-palabras" data-nav="a-palabras" data-shape="${S.hola}" aria-labelledby="a-pal-t">
      <div class="a-copy a-copy--wide">
        <p class="a-over">[ Palabras ]</p>
        <h2 class="a-h2" id="a-pal-t">Las que prepara el equipo.</h2>
        <p class="a-body">${rich('Estas son las frases que más piden las personas sin voz en un hospital. *Nuestro equipo las está preparando una por una.* Toca una para escucharla.')}</p>
        <div class="a-tabs" role="tablist" aria-label="Categorías de palabras">${catTabs}</div>
        <div class="a-panel a-panel--words" id="a-cat-panel" role="tabpanel" aria-labelledby="a-cat-${cats[0]}" data-cat-panel></div>
        <p class="a-note">Todavía no están todas listas. Cuando una esté lista, aparece en la guía.</p>
        <h3 class="a-h3">Escala de dolor</h3>
        <p class="a-body">${rich('Toca un número del 0 al 10 y se dice *en voz alta*: así se puede decir *cuánto duele*, sin explicar.')}</p>
        <div class="a-pain" role="group" aria-label="Escala de dolor del 0 al 10">${Array.from({ length: 11 }, (_, n) => `<button class="a-pn" type="button" data-pain="${n}" style="--k:${n / 10}" aria-pressed="false">${n}</button>`).join('')}</div>
        <p class="a-pain__out" data-pain-out aria-live="polite">Elige un número.</p>
        <h3 class="a-h3">Velocidad de la voz</h3>
        <div class="a-tabs" role="group" aria-label="Velocidad de la voz">${RATES.map(([t], i) => `<button class="a-tab a-tab--sm" type="button" data-rate="${i}" aria-pressed="${i === 1}">${icon('volume', 16)}<span>${t}</span></button>`).join('')}</div>
      </div>
    </section>

    <section class="a-sec a-dense" id="a-priv" data-nav="a-priv" data-shape="${S.cero}" aria-labelledby="a-priv-t">
      <div class="a-copy a-copy--wide">
        <p class="a-over">[ Privacidad ]</p>
        <h2 class="a-h2" id="a-priv-t">Tu cara se queda contigo.</h2>
        <p class="a-body">${rich('Toca cada paso para ver qué pasa con tu imagen y *qué se guarda*.')}</p>
        <div class="a-layers" role="tablist" aria-label="Qué pasa con tu imagen">${layerTabs}</div>
        <div class="a-panel a-panel--layer" id="a-layer-panel" role="tabpanel" aria-labelledby="a-ly-0" data-layer-panel></div>
        <ul class="a-promises">${promises}</ul>
      </div>
    </section>

    <section class="a-sec a-dense" id="a-ayuda" data-nav="a-ayuda" data-shape="${S.tuvoz}" aria-labelledby="a-cmp-t">
      <div class="a-copy a-copy--wide">
        <p class="a-over">[ Cómo te ayuda ]</p>
        <h2 class="a-h2" id="a-cmp-t">Antes y con Voz Propia.</h2>
        <div class="a-switch" role="radiogroup" aria-label="Comparar">
          <button type="button" role="radio" aria-checked="false" data-cmp="0">Sin Voz Propia</button>
          <button type="button" role="radio" aria-checked="true" data-cmp="1">Con Voz Propia</button>
        </div>
        <ul class="a-cmp__list" data-cmp-list data-on="1">${compare}</ul>
        <h3 class="a-h3">Un momento cualquiera</h3>
        <div class="a-tabs" role="tablist" aria-label="Momentos">${momentTabs}</div>
        <div class="a-panel a-panel--moment" id="a-moment-panel" role="tabpanel" aria-labelledby="a-mo-0" data-moment-panel></div>
        <p class="a-note">Ejemplos ilustrativos.</p>
        <ul class="a-app">${stats}</ul>
      </div>
    </section>

    <section class="a-sec a-dense" id="a-limites" data-nav="a-limites" data-shape="${S.limites}" aria-labelledby="a-lim-t">
      <div class="a-copy a-copy--wide">
        <p class="a-over">[ Alcances y límites ]</p>
        <h2 class="a-h2" id="a-lim-t">Lo que hace, y lo que todavía no.</h2>
        <p class="a-body">${rich('Decir con claridad *hasta dónde llega* también es parte de cuidar a quien la usa.')}</p>
        <div class="a-tabs" role="tablist" aria-label="Alcances y límites">${limTabs}</div>
        <div class="a-panel a-panel--lim" id="a-lim-panel" role="tabpanel" aria-labelledby="a-lim-0" data-lim-panel></div>
        <h3 class="a-h3">Pensada para ser fácil</h3>
        <ul class="a-easy">${easy}</ul>
      </div>
    </section>

    <section class="a-sec a-dense" id="a-faq" data-nav="a-faq" data-shape="${S.duda}" aria-labelledby="a-faq-t">
      <div class="a-copy a-copy--wide">
        <p class="a-over">[ Preguntas ]</p>
        <h2 class="a-h2" id="a-faq-t">Lo que más se pregunta.</h2>
        <div class="a-faq">${faq}</div>
        <h3 class="a-h3">Palabras que conviene conocer</h3>
        <div class="a-terms" role="group" aria-label="Glosario">${termTabs}</div>
        <p class="a-def" data-term-panel aria-live="polite"></p>
      </div>
    </section>

    <section class="a-sec a-dense" id="a-ruta" data-nav="a-ruta" data-shape="${S.ruta}" aria-labelledby="a-rt-t">
      <div class="a-copy a-copy--wide">
        <p class="a-over">[ Ruta ]</p>
        <h2 class="a-h2" id="a-rt-t">Dónde estamos y lo que sigue.</h2>
        <ul class="a-route">${route}</ul>
      </div>
    </section>

    <section class="a-sec a-end" data-nav="a-fuentes" data-shape="${S.voz}" aria-labelledby="a-end-t">
      <div class="a-copy">
        <p class="a-over">[ Empieza ]</p>
        <h2 class="a-h2" id="a-end-t">Tus labios ya saben hablar.</h2>
        <p class="a-body">Toca «Iniciar a usar» para ver, pantalla por pantalla, cómo se usa.</p>
        <div class="a-actions">
          <button class="a-cta" type="button" data-to-guide>${icon('user', 20)}<span>Iniciar a usar</span>${icon('arrow-right', 20)}</button>
          <button class="a-btn" type="button" data-to-tools>${icon('lightbulb', 18, 2.2)}<span>Consejos de uso</span></button>
          <button class="a-btn" type="button" data-jump="a-top">${icon('arrow-up', 18, 2.4)}<span>Volver arriba</span></button>
        </div>
      </div>
    </section>

    <section class="a-sources" id="a-fuentes" aria-labelledby="a-src-t">
      <h2 id="a-src-t">Fuentes</h2>
      <ol>${sources}</ol>
      <p>Las cifras describen a toda la población con esas condiciones. Voz Propia está pensada para quienes de ellas todavía pueden mover los labios. Es una ayuda para comunicarse, no un dispositivo médico.</p>
    </section>
  </div>`;
}

/* ---------- Vista ---------- */

export function ayudaView(root: HTMLElement) {
  root.innerHTML = template();
  const el = root.querySelector<HTMLElement>('[data-ayuda-page]')!;
  const stage = el.querySelector<HTMLElement>('.a-stage')!;
  const still = reducedMotion();
  if (still) el.classList.add('is-static');
  const ac = new AbortController();
  const { signal } = ac;
  let field: Field | null = null;
  let disposed = false;
  let active = 0;

  void (async () => {
    try {
      const { createField } = await import('./ayuda-field');
      if (disposed) return;
      field = createField(stage, stage.querySelector('canvas')!, SHAPES, { reducedMotion: still, palette: currentTheme() });
      field.setShape(active);
      el.classList.add('has-field');
    } catch {
      el.classList.add('no-webgl');
    }
  })();

  const offPalette = bindPalette(el);
  addEventListener('palette', (e) => field?.setPalette((e as CustomEvent<Theme>).detail), { signal });

  /* ---------- Sección al centro: cambia la figura de los puntos y marca el índice ---------- */

  const idxItems = Array.from(el.querySelectorAll<HTMLElement>('[data-idx-item]'));
  const secs = Array.from(el.querySelectorAll<HTMLElement>('[data-shape]'));
  const center = new IntersectionObserver(
    (entries) => {
      for (const en of entries) {
        if (!en.isIntersecting) continue;
        const t = en.target as HTMLElement;
        active = Number(t.dataset.shape);
        field?.setShape(active);
        idxItems.forEach((b) => b.classList.toggle('is-on', b.dataset.idxItem === t.dataset.nav));
      }
    },
    { rootMargin: '-48% 0px -48% 0px' },
  );
  secs.forEach((s) => center.observe(s));

  const srcBox = el.querySelector<HTMLElement>('.a-sources')!;
  const tail = new IntersectionObserver(([en]) => field?.setVisible(!en.isIntersecting || en.intersectionRatio < 0.5), { threshold: [0, 0.5] });
  tail.observe(srcBox);

  /* ---------- Barra de avance ---------- */

  const bar = el.querySelector<HTMLElement>('.a-progress')!;
  let raf = 0;
  const onScroll = () => {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      const max = document.documentElement.scrollHeight - innerHeight;
      bar.style.setProperty('--sp', max > 0 ? (scrollY / max).toFixed(4) : '0');
    });
  };
  addEventListener('scroll', onScroll, { passive: true, signal });
  onScroll();

  /* ---------- Aparición y conteo de cifras ---------- */

  const fmt = new Intl.NumberFormat('es-MX');
  const countUp = (b: HTMLElement) => {
    const to = Number(b.dataset.count);
    if (still || to <= 1) {
      b.textContent = fmt.format(to);
      return;
    }
    const t0 = performance.now();
    const tick = (now: number) => {
      const k = Math.min(1, (now - t0) / 1400);
      b.textContent = fmt.format(Math.round(to * (1 - (1 - k) ** 3)));
      if (k < 1 && !disposed) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };
  const reveal = new IntersectionObserver(
    (entries) => {
      for (const en of entries) {
        if (!en.isIntersecting) continue;
        en.target.classList.add('is-in');
        en.target.querySelectorAll<HTMLElement>('[data-count]').forEach(countUp);
        reveal.unobserve(en.target);
      }
    },
    { threshold: 0.08 },
  );
  el.querySelectorAll('.a-copy, .a-sources').forEach((n) => reveal.observe(n));

  /* ---------- Pestañas con teclado ---------- */

  const offs: (() => void)[] = [];
  const tabs = (attr: string, show: (i: number) => void) => {
    const all = () => Array.from(el.querySelectorAll<HTMLElement>(`[data-${attr}]`));
    const set = (i: number, focus = false) => {
      const list = all();
      list.forEach((t, n) => {
        t.setAttribute('aria-selected', String(n === i));
        t.tabIndex = n === i ? 0 : -1;
      });
      if (focus) list[i]?.focus();
      show(i);
    };
    offs.push(on(el, 'click', `[data-${attr}]`, (_, b) => set(Number(b.dataset[attr]))));
    offs.push(
      on(el, 'keydown', `[data-${attr}]`, (e, b) => {
        const n = all().length;
        const i = Number(b.dataset[attr]);
        const next = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? (i + 1) % n : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? (i - 1 + n) % n : -1;
        if (next < 0) return;
        e.preventDefault();
        set(next, true);
      }),
    );
    return set;
  };
  const swap = (p: HTMLElement) => {
    p.classList.remove('is-swap');
    void p.offsetWidth;
    p.classList.add('is-swap');
  };

  /* A quién ayuda */
  const whoPanel = el.querySelector<HTMLElement>('[data-who-panel]')!;
  const setWho = tabs('who', (i) => {
    const w = WHO[i];
    whoPanel.setAttribute('aria-labelledby', `a-tab-${w.id}`);
    whoPanel.innerHTML = `
      <span class="a-panel__ic">${icon(w.icon, 28, 1.8)}</span>
      <h3>${w.title}</h3>
      <p>${rich(w.body)}</p>
      <div class="a-ba">
        <div class="a-ba__b"><small>Antes</small><span>${rich(w.before)}</span></div>
        <div class="a-ba__a"><small>Con Voz Propia</small><span>${rich(w.after)}</span></div>
      </div>
      <ul>${w.points.map((p) => `<li>${icon('check', 16, 2.6)}${p}</li>`).join('')}</ul>
      ${w.note ? `<p class="a-panel__note">${icon('info', 16)}${w.note}</p>` : ''}`;
    swap(whoPanel);
  });
  setWho(0);

  /* Cómo funciona: pasos */
  const stepPanel = el.querySelector<HTMLElement>('[data-step-panel]')!;
  const stepBar = el.querySelector<HTMLElement>('[data-step-bar]')!;
  let stepIdx = 0;
  const setStep = tabs('step', (i) => {
    stepIdx = i;
    const s = STEPS[i];
    stepPanel.setAttribute('aria-labelledby', `a-sn-${i}`);
    stepPanel.innerHTML = `
      <span class="a-panel__ic a-panel__ic--lg">${icon(s.icon, 34, 1.8)}</span>
      <p class="a-panel__n">Paso ${i + 1} de ${STEPS.length}</p>
      <h3>${s.title}</h3>
      <p>${rich(s.body)}</p>`;
    stepBar.style.setProperty('--p', String((i + 1) / STEPS.length));
    swap(stepPanel);
  });
  setStep(0);
  offs.push(on(el, 'click', '[data-step-next]', () => setStep((stepIdx + 1) % STEPS.length)));
  offs.push(on(el, 'click', '[data-step-prev]', () => setStep((stepIdx - 1 + STEPS.length) % STEPS.length)));

  /* Velocidad de la voz (solo en esta página) */
  let rate = 1;
  const say = (t: string) => speakText(t, { ...state.settings, rate: rate * state.settings.rate });
  offs.push(
    on(el, 'click', '[data-rate]', (_, b) => {
      rate = RATES[Number(b.dataset.rate)][1];
      el.querySelectorAll<HTMLElement>('[data-rate]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      void say('Así suena mi voz.');
    }),
    on(el, 'click', '[data-pain]', (_, b) => {
      const n = Number(b.dataset.pain);
      el.querySelectorAll<HTMLElement>('[data-pain]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      el.querySelector<HTMLElement>('[data-pain-out]')!.innerHTML = `${icon('volume', 18)} <b>${n}</b> de 10: ${PAIN[n]}`;
      void say(`Mi dolor es ${n} de 10. ${PAIN[n]}.`);
    }),
  );

  /* Palabras: se escuchan al tocarlas */
  const cats = Array.from(new Set(DEFAULT_PHRASES.map((p) => p.category)));
  const catPanel = el.querySelector<HTMLElement>('[data-cat-panel]')!;
  const setCat = tabs('cat', (i) => {
    const c = cats[i];
    catPanel.setAttribute('aria-labelledby', `a-cat-${c}`);
    catPanel.innerHTML = `<div class="a-says">${DEFAULT_PHRASES.filter((p) => p.category === c)
      .map((p) => `<button class="a-say" type="button" data-say="${esc(p.text)}"><span class="a-say__ic">${icon(p.icon, 20)}</span><span>${esc(p.text)}</span>${icon('volume', 18)}</button>`)
      .join('')}</div>`;
    swap(catPanel);
  });
  setCat(0);
  offs.push(
    on(el, 'click', '[data-say]', (_, b) => {
      b.classList.add('is-saying');
      void say(b.dataset.say!).finally(() => b.classList.remove('is-saying'));
    }),
  );

  /* Privacidad por capas */
  const layerPanel = el.querySelector<HTMLElement>('[data-layer-panel]')!;
  const setLayer = tabs('layer', (i) => {
    const l = LAYERS[i];
    layerPanel.setAttribute('aria-labelledby', `a-ly-${i}`);
    layerPanel.innerHTML = `
      <span class="a-badge ${l.saved ? 'a-badge--on' : ''}">${icon(l.saved ? 'lock' : 'shield-check', 16, 2.2)}${l.badge}</span>
      <h3>${l.name}</h3>
      <p>${rich(l.text)}</p>`;
    swap(layerPanel);
  });
  setLayer(0);

  /* Momentos */
  const momentPanel = el.querySelector<HTMLElement>('[data-moment-panel]')!;
  const setMoment = tabs('moment', (i) => {
    const m = MOMENTS[i];
    momentPanel.setAttribute('aria-labelledby', `a-mo-${i}`);
    momentPanel.innerHTML = `
      <div class="a-ba">
        <div class="a-ba__b"><small>Antes</small><span>${rich(m.before)}</span></div>
        <div class="a-ba__a"><small>Con Voz Propia</small><span>${rich(m.after)}</span></div>
      </div>`;
    swap(momentPanel);
  });
  setMoment(0);

  /* Alcances y límites */
  const limPanel = el.querySelector<HTMLElement>('[data-lim-panel]')!;
  const setLim = tabs('lim', (i) => {
    const l = LIMITS[i];
    limPanel.setAttribute('aria-labelledby', `a-lim-${i}`);
    limPanel.classList.toggle('is-no', i === 1);
    limPanel.innerHTML = `<ul class="a-ticks">${l.items.map((t) => `<li>${icon(l.icon, 18, 2.6)}<span>${rich(t)}</span></li>`).join('')}</ul>`;
    swap(limPanel);
  });
  setLim(0);

  /* Glosario */
  const termPanel = el.querySelector<HTMLElement>('[data-term-panel]')!;
  const showTerm = (i: number) => {
    el.querySelectorAll<HTMLElement>('[data-term]').forEach((b, n) => b.setAttribute('aria-pressed', String(n === i)));
    termPanel.innerHTML = `<b>${TERMS[i][0]}.</b> ${rich(TERMS[i][1])}`;
    swap(termPanel);
  };
  showTerm(0);
  offs.push(on(el, 'click', '[data-term]', (_, b) => showTerm(Number(b.dataset.term))));

  /* ---------- Demostración: elige una palabra y mira cómo «lee» ---------- */

  const rowsEl = Array.from(el.querySelectorAll<HTMLElement>('.a-row'));
  const said = el.querySelector<HTMLElement>('[data-said]')!;
  const live = el.querySelector<HTMLElement>('[data-live]')!;
  let demoRun = 0;
  const runDemo = async (pick: number) => {
    const run = ++demoRun;
    el.querySelectorAll<HTMLElement>('[data-demo]').forEach((b, n) => b.setAttribute('aria-pressed', String(n === pick)));
    said.hidden = true;
    live.classList.add('is-on');
    live.innerHTML = `${icon('scan-face', 16)} Leyendo labios…`;
    const top = 88 + Math.round(Math.random() * 8);
    const scores = DEMO.map(() => 0);
    scores[pick] = top;
    let left = 100 - top;
    const others = DEMO.map((_, n) => n).filter((n) => n !== pick);
    others.forEach((n, k) => {
      const v = k === others.length - 1 ? left : Math.round((100 - top) * [0.6, 0.3][k]);
      scores[n] = v;
      left -= v;
    });
    rowsEl.forEach((r) => {
      r.style.setProperty('--w', '0');
      r.querySelector('b')!.textContent = '0%';
      r.classList.remove('is-top');
    });
    await sleep(still ? 0 : 450);
    if (run !== demoRun || disposed) return;
    rowsEl.forEach((r, n) => {
      r.style.setProperty('--w', String(scores[n] / 100));
      r.querySelector('b')!.textContent = `${scores[n]}%`;
      r.classList.toggle('is-top', n === pick);
    });
    await sleep(still ? 0 : 900);
    if (run !== demoRun || disposed) return;
    live.classList.remove('is-on');
    live.innerHTML = `${icon('check', 16, 2.6)} Listo`;
    said.hidden = false;
    said.innerHTML = `${icon('volume', 20)} Dice: <b>«${DEMO[pick]}»</b>`;
    void say(DEMO[pick]);
  };

  /* ---------- Índice y saltos ---------- */

  const idx = el.querySelector<HTMLElement>('.a-idx')!;
  const idxBtn = el.querySelector<HTMLElement>('[data-idx]')!;
  const openIdx = (open: boolean) => {
    idx.hidden = !open;
    idxBtn.setAttribute('aria-expanded', String(open));
    if (open) idx.querySelector<HTMLElement>('.is-on, button')?.focus();
  };
  addEventListener(
    'pointerdown',
    (e) => {
      if (!idx.hidden && !(e.target as Element).closest('.a-idx, [data-idx]')) openIdx(false);
    },
    { signal },
  );
  addEventListener(
    'keydown',
    (e) => {
      if (e.key === 'Escape' && !idx.hidden) {
        openIdx(false);
        idxBtn.focus();
      }
    },
    { signal },
  );

  offs.push(
    on(el, 'click', '[data-idx]', () => openIdx(Boolean(idx.hidden))),
    on(el, 'click', '[data-demo]', (_, b) => void runDemo(Number(b.dataset.demo))),
    on(el, 'click', '[data-cmp]', (_, b) => {
      el.querySelectorAll<HTMLElement>('[data-cmp]').forEach((x) => x.setAttribute('aria-checked', String(x === b)));
      el.querySelector<HTMLElement>('[data-cmp-list]')!.dataset.on = b.dataset.cmp!;
    }),
    on(el, 'click', '[data-jump]', (e, a) => {
      e.preventDefault();
      openIdx(false);
      el.querySelector(`#${a.dataset.jump}`)?.scrollIntoView({ behavior: still ? 'auto' : 'smooth', block: 'start' });
    }),
    on(el, 'click', '[data-to-guide]', () => go('guia')),
    on(el, 'click', '[data-to-tools]', () => go('consejos')),
  );

  return () => {
    disposed = true;
    offPalette();
    ac.abort();
    offs.forEach((off) => off());
    cancelAnimationFrame(raf);
    center.disconnect();
    tail.disconnect();
    reveal.disconnect();
    field?.dispose();
  };
}

import { go } from '../../app/router';
import { esc } from '../dom';
import { icon } from '../icons';

const OWN: string[] = [
  'La lectura de labios: cómo se normalizan los puntos de la boca para que funcione con otra persona o cámara, y cómo se comparan las tomas.',
  'El decodificador que separa una frase en palabras y escoge la mejor combinación.',
  'El modelo de frases en español y lo que la app aprende de qué palabras van juntas.',
  'El entrenamiento que mide cada palabra al subir ejemplos y aparta los ejemplos dudosos.',
  'La revisión de patrones: en un video con la misma palabra repetida, agrupa las repeticiones que se ven iguales y usa solo las que se repiten varias veces. Solo mira los labios; el audio no se usa.',
  'Las cuentas con correo, usuario y contraseña de 4 números, y todo el diseño, las animaciones y los textos.',
];

const AI_DID: string[] = [
  'Escribió y revisó la mayor parte del código de la app: la interfaz, las cuentas, la lectura de labios, el entrenamiento y las pruebas.',
  'Propuso soluciones a los errores que fueron saliendo y ayudó a redactar los textos.',
  'Buscó datos y fuentes para la página «Cómo funciona y cómo te ayuda».',
];

const TEAM_DID: string[] = [
  'Decidió qué problema resolver, para quién y cómo debía verse y sentirse.',
  'Dirigió el trabajo paso a paso, probó cada resultado y pidió correcciones.',
  'Prepara los ejemplos con los que se entrena la app y es responsable del resultado.',
];

const THIRD: [string, string, string][] = [
  ['MediaPipe Face Landmarker (Google)', 'Encuentra los puntos de la cara y la boca en la cámara. Es un modelo ya entrenado por Google.', 'Apache 2.0'],
  ['ONNX Runtime Web (Microsoft)', 'Prepara el uso de un modelo opcional. Hoy no se incluye ninguno.', 'MIT'],
  ['Three.js', 'Las escenas en 3D del inicio y la guía.', 'MIT'],
  ['Supabase', 'Cuentas y ejemplos compartidos por el programador.', 'MIT (cliente)'],
  ['Lucide', 'Los íconos.', 'ISC'],
  ['Raleway, Atkinson Hyperlegible Next, JetBrains Mono, Anton y Sacramento', 'Las letras de la app.', 'SIL OFL 1.1'],
];

const PRIVACY: string[] = [
  'No se guarda video. De cada toma solo se guardan las posiciones de los puntos de la boca y la cara, sin imágenes.',
  'Los ejemplos que graba una persona se quedan en su dispositivo.',
  'La cuenta guarda el correo, el usuario y una contraseña de 4 números. El correo se comprueba una vez con un código.',
  'Para saber si un correo existe, la app pregunta a Google DNS solo por el dominio (por ejemplo, gmail.com), nunca por la dirección completa.',
  'Voz Propia es una ayuda para comunicarse, no un dispositivo médico.',
];

/** Transparencia: qué hizo el equipo, qué se usó de otros y cómo se usó la inteligencia artificial. */
export function creditosView(root: HTMLElement) {
  root.innerHTML = `
    <section class="cr">
      <button class="cr__back" type="button" data-back>${icon('arrow-left', 18, 2.4)}<span>Volver</span></button>
      <p class="cr__eye">[ Transparencia ]</p>
      <h1>Herramientas y créditos</h1>
      <p class="cr__lead">Aquí está, sin rodeos, qué construimos, qué usamos de otros y qué parte hizo la inteligencia artificial. La convocatoria de Infomatrix acepta la IA como apoyo si se indica su contribución, y aquí la indicamos.</p>

      <h2>Lo que construimos</h2>
      <ul class="cr__list">${OWN.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>

      <h2>Lo que usamos de otros</h2>
      <p class="cr__note">Todo con licencia abierta que permite usarlo en proyectos como este.</p>
      <ul class="cr__cards">${THIRD.map(([n, d, l]) => `<li><b>${esc(n)}</b><span>${esc(d)}</span><em>${esc(l)}</em></li>`).join('')}</ul>

      <h2>Contribución de la inteligencia artificial</h2>
      <p class="cr__note">Herramienta: Claude Code, un asistente de programación con IA de Anthropic.</p>
      <h3>Qué hizo la IA</h3>
      <ul class="cr__list">${AI_DID.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>
      <h3>Qué hizo el equipo</h3>
      <ul class="cr__list">${TEAM_DID.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>

      <h2>Cómo se usa la IA dentro de la app</h2>
      <ul class="cr__list">
        <li><b>Al usarla:</b> no hay chatbot ni IA que escriba textos o genere imágenes. La lectura de labios usa los puntos de la cara que da el modelo de Google y los cálculos del equipo.</li>
        <li><b>Idea de investigación:</b> aprender palabras con pocos ejemplos está inspirado en LipLearner (Su, Fang y Rekimoto, CHI 2023).</li>
      </ul>

      <h2>Tus datos</h2>
      <ul class="cr__list">${PRIVACY.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>
      <p class="cr__note">Los datos de México y el mundo de la página «Cómo funciona y cómo te ayuda» traen su fuente al final de esa página.</p>
    </section>`;
  root.querySelector('[data-back]')!.addEventListener('click', () => go('guia'));
}

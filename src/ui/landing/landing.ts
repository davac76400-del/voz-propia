import '@fontsource/anton/latin-400.css';
import '@fontsource/sacramento/latin-400.css';
import './landing.css';
import './loader.css';

import { state } from '../../app/state';
import type { Role } from '../../core/types';
import { CODE_LENGTH, guest, requestCode, session, signOut, verifyCode } from '../../core/auth';
import { speakText } from '../../core/voice/speaker';
import { brandMark } from '../brand';
import { bindHold, holdRing } from '../components/hold';
import { reducedMotion, sleep, vibrate } from '../dom';
import { icon } from '../icons';
import { openDevPanel } from '../components/dev-panel';
import type { FieldControl, GravityField, Pointer } from './scene';

interface Options {
  jumpToRoles: boolean;
  /** Se abrió desde la app (botón Cuenta): sin cargador, abre la cuenta y al terminar regresa a la app. */
  account?: boolean;
  onReturn?: () => void;
  onChoose: (role: Role, page?: 'ayuda' | 'consejos') => void;
}

const BALL_COLOR = '#2F69FF';
const HERO_BG = 'radial-gradient(circle at center, #ffffff 0%, #ecefff 35%, #c2d1ff 100%)';

/** Cosas que aparecen arriba mientras carga: [tipo, texto o forma, x %, y %, color, % en que aparece]. */
const LD_ITEMS: [string, string, number, number, string, number][] = [
  ['w', 'Hola', 17, 10, '#3df2a0', 8],
  ['w', 'Agua', 83, 20, '#00e5ff', 18],
  ['m', 'o', 36, 26, '#ff3df0', 24],
  ['w', 'Gracias', 16, 34, '#ff3df0', 30],
  ['m', 'smile', 66, 8, '#f7ff3d', 36],
  ['w', 'Te quiero', 84, 48, '#f7ff3d', 42],
  ['w', 'Familia', 17, 58, '#b04dff', 54],
  ['m', 'm', 70, 82, '#00e5ff', 60],
  ['w', 'Tengo sed', 83, 72, '#3df2a0', 66],
  ['w', 'Estoy aquí', 19, 82, '#00e5ff', 78],
  ['m', 'o', 32, 90, '#3df2a0', 86],
  ['w', 'Sí', 84, 92, '#ff3df0', 92],
];
const LD_MOUTH: Record<string, string> = {
  o: '<svg viewBox="0 0 60 44"><ellipse cx="30" cy="22" rx="13" ry="17"/><ellipse cx="30" cy="22" rx="5.5" ry="9"/></svg>',
  smile: '<svg viewBox="0 0 60 44"><path d="M5 12Q30 50 55 12Q30 26 5 12Z"/></svg>',
  m: '<svg viewBox="0 0 60 44"><path d="M5 22Q17 8 30 16Q43 8 55 22Q43 38 30 38Q17 38 5 22Z"/><path d="M5 22H55"/></svg>',
};
/** Línea por donde se parte la pantalla (x, y en %). */
const CRACK: [number, number][] = [[50, 0], [55, 6], [46, 13], [56, 21], [45, 29], [54, 37], [44, 46], [55, 54], [46, 62], [56, 70], [47, 78], [55, 86], [48, 93], [51, 100]];
/** Grietas que parten cada mitad en dos pedazos (desde el punto K de la grieta principal) y ramas cortas. */
const CRACK_K = 7;
const CUT_L: [number, number][] = [[23, 55], [14, 59], [0, 66]];
const CUT_R: [number, number][] = [[76, 47], [88, 42], [100, 34]];
const BRANCH: [number, number][][] = [[[46, 13], [36, 16], [30, 25], [24, 28]], [[56, 21], [67, 24], [72, 34], [80, 37]], [[44, 46], [33, 44], [27, 37], [18, 36]], [[55, 54], [65, 60], [72, 58], [84, 64]], [[46, 62], [38, 70], [33, 81], [27, 88]], [[56, 70], [66, 77], [69, 87], [76, 95]], [[54, 37], [63, 32], [66, 22]], [[47, 78], [40, 84], [43, 94]], [[45, 29], [37, 33], [35, 42]]];

const BAND = ['Sí', 'No', 'Tengo sed', 'Me duele', 'Tengo frío', 'Llama a mi familia', 'Tengo miedo', 'Gracias'];
const MARQUEE = ['Menos silencio', 'Más voz', 'Tus labios hablan', 'Sin internet'];

const orbChevron = (ic = 'chevron-right') => `<span class="l-orb" aria-hidden="true">${icon(ic, 16, 2.4)}</span>`;

function template() {
  const band = BAND.map((w, i) => `<span class="${i % 2 ? 'is-solid' : ''}">${w}</span><i>✦</i>`).join('');
  const marquee = MARQUEE.map((w) => `<span>${w}</span><i></i>`).join('');
  const card = (n: string, k: string, v: string, d: string) => `
    <div class="l-card"><div class="l-card__inner">
      <div class="l-card__head"><span>${n}</span><span>${k}</span><i></i></div>
      <p class="l-card__v">${v}</p>
      <p class="l-card__d">${d}</p>
    </div></div>`;
  const feature = (ic: string, t: string, d: string, i: number) => `
    <article class="l-feature" data-reveal style="--d:${i * 0.09}s">
      <span class="l-feature__icon">${icon(ic, 22, 1.8)}</span>
      <h3>${t}</h3>
      <p>${d}</p>
    </article>`;

  return `
  <div class="landing" data-stage="0">
    <div class="l-bg" aria-hidden="true">
      <i style="background:${HERO_BG}" data-layer="0"></i>
      <i data-layer="1"></i><i data-layer="2"></i><i data-layer="3"></i><i data-layer="4"><b class="l-stars"></b></i>
    </div>
    <div class="l-poster" aria-hidden="true">
      <p class="l-poster__over">Tus labios hablan · nosotros ponemos la</p>
      <p class="l-poster__word">Voz</p>
    </div>
    <div class="l-canvas" aria-hidden="true"><canvas></canvas></div>
    <div class="l-poster l-poster--front" aria-hidden="true">
      <p class="l-poster__over">Tus labios hablan · nosotros ponemos la</p>
      <p class="l-poster__word">Voz</p>
    </div>

    <div class="l-loader" data-loader role="status" aria-live="polite">
      <div class="l-ld" data-ld>
        <p class="l-ld__brand" aria-hidden="true">${brandMark()}<span>Voz Propia</span></p>
        <div class="l-ld__field" aria-hidden="true">
          <div class="l-ld__hero" data-ld-hero>
            <i class="l-ld__wave"></i><i class="l-ld__wave l-ld__wave--2"></i>
            <svg viewBox="0 0 120 76"><defs><linearGradient id="ld-lips" x1="0" x2="1"><stop offset="0" stop-color="#3df2a0"/><stop offset=".5" stop-color="#4d7cff"/><stop offset="1" stop-color="#ff3df0"/></linearGradient></defs><path class="l-ld__lip" d="M6 38C24 30 36 14 49 14C55 14 58 19 60 21C62 19 65 14 71 14C84 14 96 30 114 38C98 41 78 43 60 41C42 43 22 41 6 38Z"/><path class="l-ld__lip l-ld__lip--low" d="M6 39C22 43 42 45 60 44C78 45 98 43 114 39C100 58 82 66 60 66C38 66 20 58 6 39Z"/></svg>
          </div>
          ${LD_ITEMS.map(
            ([kind, v, x, y, c, at]) =>
              `<span class="l-ld__it l-ld__it--${kind}" data-at="${at}" style="--x:${x}%;--y:${y}%;--c:${c}">${kind === 'w' ? `<b>${v}</b>` : LD_MOUTH[v]}</span>`,
          ).join('')}
        </div>
        <div class="l-ld__meter" aria-hidden="true">
          <div class="l-ld__track">
            <i class="l-ld__bar l-ld__bar--glow"></i>
            <i class="l-ld__bar"></i>
            <i class="l-ld__spark"></i>
          </div>
          <p class="l-ld__status" data-loader-status>Calibrando lectura de labios</p>
        </div>
      </div>
    </div>

    <header class="l-header">
      <a class="l-word" href="#top" data-scroll="top" aria-label="Voz Propia, arriba">${brandMark()}<span>Voz Propia</span></a>
      <nav class="l-nav" aria-label="Secciones del inicio">
        <a href="#historia" data-scroll="historia">Historia</a>
        <a href="#labios" data-scroll="labios">Labios</a>
        <a href="#entrar" data-scroll="entrar">Entrar</a>
      </nav>
      <div class="l-header__right">
        <button class="l-chip" type="button" data-tools>${icon('lightbulb', 17, 2.2)}<span>Consejos</span></button>
        <button class="l-chip l-chip--acct" type="button" data-acct aria-label="Tu cuenta">${icon('user', 17, 2.2)}<span data-acct-label>Cuenta</span></button>
        <a class="l-pill" href="#entrar" data-scroll="entrar"><span>Comenzar</span>${orbChevron()}</a>
      </div>
    </header>

    <main class="l-main">
      <section class="l-sec l-hero" id="top" aria-labelledby="hero-title">
        <p class="l-hero__script" aria-hidden="true">propia</p>
        <div class="l-hero__row">
          <div class="l-hero__left">
            <p class="l-eyebrow l-in" style="--d:.15s">[ Lectura de labios sin internet ]</p>
            <h1 class="l-hero__title l-in" id="hero-title" style="--d:.28s"><span class="sr-only">Voz Propia. </span>Menos silencio.<br>Más voz.</h1>
          </div>
          <div class="l-hero__right l-in" style="--d:.45s">
            <p>Lee el movimiento de tus labios y lo dice en voz alta. Para quien perdió la voz, en su propio teléfono.</p>
            <p class="l-credit">© 2026 · Proyecto para SOLACYT Infomatrix</p>
            <p class="l-cue">${icon('arrow-down', 14)} Desliza</p>
          </div>
        </div>
      </section>

      <section class="l-sec l-drop" id="historia">
        <div class="l-band" aria-hidden="true"><div class="l-band__track">${band}${band}</div></div>
        <div class="l-wrap l-grid">
          <div class="l-grid__main">
            <p class="l-label" data-reveal>[ 02 · Silencio ]</p>
            <h2 class="l-h2" data-reveal style="--d:.1s">Cuando la voz<br>se cae.<span class="l-script l-script--drop" aria-hidden="true">sin voz</span></h2>
            <p class="l-p" data-reveal style="--d:.2s">Una traqueostomía, una cirugía de garganta o días en terapia intensiva. Las palabras siguen ahí, pero el sonido ya no sale. Desliza y mira cómo cada una cae al suelo, sin que nadie la escuche.</p>
          </div>
          <div class="l-grid__side l-cards" data-reveal style="--d:.25s">
            ${card('01', 'Visión', 'Tus labios', 'Los mira la cámara de tu teléfono')}
            ${card('02', 'Privacidad', '0 videos', 'Nada sale de tu teléfono, ni una imagen')}
          </div>
        </div>
        <span class="l-sticker l-sticker--a" aria-hidden="true">Sin internet ✦</span>
      </section>

      <section class="l-sec l-form" id="labios">
        <div class="l-wrap l-form__top">
          <p class="l-label" data-reveal>[ 03 · Forma ]</p>
          <h2 class="l-h2" data-reveal style="--d:.1s">Del silencio,<br>una forma.<span class="l-script l-script--form" aria-hidden="true">tus labios</span></h2>
        </div>
        <div class="l-wrap l-form__bottom">
          <p class="l-p l-p--glass" data-reveal style="--d:.15s">Del caos, cada esfera encuentra su lugar: unos labios. Así lee Voz Propia, con la forma de tu boca y no la de nadie más. Pasa el cursor por encima y mira cómo se desordena y vuelve.</p>
          <button class="l-hold" type="button" data-talk data-reveal style="--d:.28s">
            <span class="hold">${holdRing()}<span class="hold__core">${icon('volume', 18)}</span></span>
            <span class="l-hold__text">Mantén presionado<b>y escucha cómo hablan</b></span>
          </button>
        </div>
        <span class="l-sticker l-sticker--b" aria-hidden="true">Solo tu boca</span>
      </section>

      <section class="l-sec l-release" id="voz">
        <div class="l-release__inner">
          <p class="l-label" data-reveal>[ 04 · Voz ]</p>
          <h2 class="l-h2 l-h2--xl" data-reveal style="--d:.12s">Y entonces,<br>tu voz.<span class="l-script l-script--rel" aria-hidden="true">se escucha</span></h2>
          <p class="l-p l-p--glass" data-reveal style="--d:.24s">Cada palabra despega de tus labios y se vuelve sonido. Al instante, sin internet, con la voz que tu familia eligió para ti.</p>
        </div>
        <span class="l-sticker l-sticker--c" aria-hidden="true">Al instante</span>
        <span class="l-sticker l-sticker--d" aria-hidden="true">100% en tu teléfono</span>
        <span class="l-sticker l-sticker--e" aria-hidden="true">Sin servidores ✦</span>
      </section>

      <section class="l-how" id="como-funciona">
        <div class="l-wrap">
          <div class="l-head">
            <p class="l-eye" data-reveal>Así funciona</p>
            <h2 data-reveal style="--d:.08s">Una voz que vive en tu teléfono</h2>
            <p data-reveal style="--d:.16s">Sin servidores ni esperas. Voz Propia mira tus labios, reconoce la palabra y habla al instante.</p>
          </div>
          <div class="l-features">
            ${feature('scan-face', 'Mira tus labios', 'La cámara de tu teléfono mira cómo se mueven tus labios, aunque te muevas un poco.', 0)}
            ${feature('sparkles', 'Palabras preparadas', 'Nuestro equipo prepara cada palabra con cuidado, para que se reconozca bien desde el primer día.', 1)}
            ${feature('volume', 'Habla por ti', 'Con la voz del teléfono, la que tu familia elija para ti.', 2)}
            ${feature('wifi-off', 'Funciona en modo avión', 'Todo corre dentro del teléfono. Ideal para un cuarto de hospital sin señal.', 3)}
            ${feature('shield-check', 'Tus datos, tuyos', 'No se graba ni se envía video. Nada sale de tu teléfono.', 4)}
            ${feature('layout-grid', 'Respuestas rápidas', 'Sí, no, escala de dolor y frases por tema, a un toque y sin cámara.', 5)}
          </div>
          <div class="l-big" data-reveal>
            <i class="l-big__glow" aria-hidden="true"></i>
            <p class="l-eye">Por qué importa</p>
            <h2 class="l-big__title"><b data-count-to="742">742</b> mil personas<br>en México casi no pueden hablar.<span class="l-script l-script--big" aria-hidden="true">y tienen mucho que decir</span></h2>
            <p class="l-big__p">Tienen mucha dificultad para hablar o comunicarse, o no pueden hacerlo. Para quienes todavía mueven los labios, Voz Propia puede ser su voz.</p>
            <p class="l-big__src">Fuente: INEGI, Encuesta Intercensal 2025 (publicada en 2026)</p>
          </div>
          <div class="l-stats">
            ${[['0', 'Videos guardados'], ['0', 'Aparatos extra'], ['100%', 'Dentro de tu teléfono'], ['11', 'Niveles de dolor']]
              .map(([v, l], i) => `<div class="l-stat" data-reveal style="--d:${i * 0.08}s"><p class="l-stat__v">${v}</p><p class="l-stat__l">${l}</p></div>`)
              .join('')}
          </div>
        </div>
      </section>

      <section class="l-roles" id="entrar">
        <div class="l-wrap">
          <div class="l-head">
            <p class="l-eye" data-reveal>Empecemos</p>
            <h2 data-reveal style="--d:.08s">¿Quién va a usar Voz Propia?</h2>
            <p data-reveal style="--d:.16s">Elige tu modo. Se puede cambiar después.</p>
          </div>
          <div class="l-role-grid">
            <button class="l-role l-role--user" type="button" data-role="usuario" data-reveal>
              <span class="l-role__balls" aria-hidden="true"><i></i><i></i><i></i><i></i></span>
              <span class="l-role__tag">${icon('user', 15)} Usuario</span>
              <span class="l-role__title">Iniciar a usar</span>
              <span class="l-role__desc">Para quien va a hablar. Conoce cómo trabajamos y con qué palabras contamos.</span>
              <span class="l-role__list"><span>${icon('check', 16, 2.6)} Cómo trabajamos, paso a paso</span><span>${icon('check', 16, 2.6)} Las palabras con las que contamos</span><span>${icon('check', 16, 2.6)} Nada que configurar</span></span>
              <span class="l-role__cta"><span>Iniciar a usar</span>${orbChevron()}</span>
            </button>
            <button class="l-role l-role--pro" type="button" data-ayuda data-reveal style="--d:.12s">
              <span class="l-role__grid" aria-hidden="true"></span>
              <span class="l-role__tag">${icon('sparkles', 15)} Conoce el proyecto</span>
              <span class="l-role__title">Cómo funciona y cómo te ayuda</span>
              <span class="l-role__desc">Datos reales, a quién ayuda y cómo lee tus labios.</span>
              <span class="l-role__list"><span>${icon('check', 16, 2.6)} Datos de México y el mundo</span><span>${icon('check', 16, 2.6)} A quién ayuda y cómo</span><span>${icon('check', 16, 2.6)} Pruébalo con un ejemplo</span></span>
              <span class="l-role__cta"><span>Ver cómo ayuda</span>${orbChevron()}</span>
            </button>
            <button class="l-role l-role--jz" type="button" data-tools data-reveal style="--d:.18s">
              <span class="l-jz__stickers" aria-hidden="true"><i>Buena luz</i><i>De frente</i><i>Con calma</i></span>
              <span class="l-role__tag">${icon('lightbulb', 15)} Manual de uso</span>
              <span class="l-role__title">Consejos para usar Voz Propia</span>
              <span class="l-role__desc">Cómo ponerte frente a la cámara, cómo mover los labios, letras que se ven igual, qué hacer si duda y cómo puede ayudar tu familia.</span>
              <span class="l-role__cta"><span>Ver los consejos</span>${orbChevron()}</span>
            </button>
            <button class="l-role l-role--dev" type="button" data-dev data-reveal style="--d:.24s">
              <span class="l-role__tag">${icon('code', 15)} Desarrollador</span>
              <span class="l-role__title">Soy programador</span>
              <span class="l-role__desc">Importar videos para entrenar la IA con ejemplos de labios.</span>
              <span class="l-role__cta"><span>Importar videos</span>${orbChevron()}</span>
            </button>
          </div>
        </div>
      </section>
    </main>

    <footer class="l-footer">
      <i class="l-footer__glow l-footer__glow--a" aria-hidden="true"></i>
      <i class="l-footer__glow l-footer__glow--b" aria-hidden="true"></i>
      <div class="l-marquee" aria-hidden="true"><div class="l-marquee__track">${marquee}${marquee}</div></div>
      <div class="l-footer__body">
        <div class="l-footer__cta" data-reveal>
          <p class="l-footer__eye">[ Hagamos que te escuchen ]</p>
          <p class="l-footer__title">Tus labios<br>ya saben hablar.</p>
          <a class="l-footer__pill" href="#entrar" data-scroll="entrar"><span>Elegir cómo entrar</span><span class="l-orb l-orb--lg">${icon('arrow-up-right', 18, 2.2)}</span></a>
        </div>
        <div class="l-footer__cols">
          <div data-reveal><p class="l-footer__h">Voz Propia</p><ul>
            ${[['historia', 'Historia'], ['labios', 'Labios'], ['entrar', 'Entrar']].map(([id, t]) => `<li><a href="#${id}" data-scroll="${id}">${t}${icon('arrow-up-right', 13)}</a></li>`).join('')}
          </ul></div>
          <div data-reveal style="--d:.08s"><p class="l-footer__h">Hecha para</p><ul>
            <li><span>Traqueostomía</span></li><li><span>Laringectomía</span></li><li><span>Terapia intensiva</span></li><li><span>Su familia</span></li>
          </ul></div>
          <div data-reveal style="--d:.16s"><p class="l-footer__h">Promesas</p><ul>
            <li><span>Sin internet</span></li><li><span>Sin video guardado</span></li><li><span>Palabras preparadas</span></li><li><span>Tu voz, tu decisión</span></li>
          </ul></div>
        </div>
      </div>
      <div class="l-footer__bar">
        <p><b>Voz Propia</b><i></i><span>© 2026 · Una ayuda para comunicarse, no un dispositivo médico.</span></p>
        <a class="l-footer__top" href="#top" data-scroll="top" aria-label="Volver arriba">${icon('arrow-up-right', 16)}</a>
      </div>
    </footer>

    <div class="l-gate" data-gate role="dialog" aria-modal="true" aria-labelledby="gate-t" hidden>
      <div class="l-gate__card">
        <div class="l-gate__top">
          <p class="l-gate__brand">${brandMark()}<span>Voz Propia</span></p>
          <button class="l-gate__close" type="button" data-gate-close aria-label="Cerrar" hidden>${icon('x', 18, 2.4)}</button>
        </div>
        <div class="l-gate__view" data-view="elegir">
          <h2 id="gate-t">Te damos la bienvenida.</h2>
          <p class="l-gate__p">Elige cómo quieres entrar.</p>
          <button class="l-gate__opt is-main" type="button" data-go-view="entrar">
            <span class="l-gate__ic">${icon('log-in', 20)}</span><span><b>Iniciar sesión</b><small>Ya tengo cuenta.</small></span>${orbChevron()}
          </button>
          <button class="l-gate__opt" type="button" data-go-view="crear">
            <span class="l-gate__ic">${icon('user-plus', 20)}</span><span><b>Crear cuenta</b><small>Con tu correo, en un minuto.</small></span>${orbChevron()}
          </button>
          <button class="l-gate__opt" type="button" data-guest>
            <span class="l-gate__ic">${icon('user', 20)}</span><span><b>Entrar sin cuenta</b><small>Rápido. Al salir no se guarda nada.</small></span>${orbChevron()}
          </button>
          <p class="l-gate__fine">${icon('lock', 14)} Entras con un código que te llega al correo. Sin contraseñas.</p>
        </div>
        <div class="l-gate__view l-gate__hello" data-view="hola" hidden>
          <svg class="l-gate__check" viewBox="0 0 52 52" aria-hidden="true"><circle cx="26" cy="26" r="24"/><path d="M15 27 l8 8 l15 -17"/></svg>
          <h2 data-hello-t>¡Hola!</h2>
          <p class="l-gate__p" data-hello-p>Todo listo.</p>
        </div>
        <div class="l-gate__view l-work" data-view="trabajar" hidden>
          <p class="l-work__hi" data-work-hi>¡Hola!</p>
          <h2 class="l-work__t" data-work-t>Inicia a trabajar</h2>
          <div class="l-work__pad" data-work role="button" tabindex="0" aria-label="Dibuja el círculo con el dedo o el mouse, o mantén presionada la barra espaciadora, para iniciar a trabajar">
            <svg class="l-work__svg" viewBox="0 0 240 240" aria-hidden="true">
              <defs>
                <linearGradient id="wk-g" gradientUnits="userSpaceOnUse" x1="20" y1="20" x2="220" y2="220"><stop offset="0" stop-color="#3df2a0"/><stop offset=".35" stop-color="#00e5ff"/><stop offset=".65" stop-color="#4d7cff"/><stop offset="1" stop-color="#ff3df0"/></linearGradient>
                <radialGradient id="wk-f"><stop offset="0" stop-color="#4d7cff" stop-opacity=".6"/><stop offset="1" stop-color="#3df2a0" stop-opacity=".2"/></radialGradient>
                <filter id="wk-rough" x="-20%" y="-20%" width="140%" height="140%"><feTurbulence type="fractalNoise" baseFrequency=".05" numOctaves="2" seed="4" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="9" xChannelSelector="R" yChannelSelector="G"/></filter>
              </defs>
              <circle class="l-work__ticks" cx="120" cy="120" r="108" pathLength="108"/>
              <circle class="l-work__fill" cx="120" cy="120" r="80"/>
              <circle class="l-work__track" cx="120" cy="120" r="92"/>
              <g filter="url(#wk-rough)"><circle class="l-work__arc" cx="120" cy="120" r="92" pathLength="100"/></g>
            </svg>
            <i class="l-work__demo" aria-hidden="true"></i>
            <i class="l-work__dot" aria-hidden="true"></i>
            <span class="l-work__core">${brandMark('md')}<small data-work-label>Sigue el círculo</small></span>
          </div>
          <p class="l-gate__p l-work__p">Dibújalo con tu dedo o el mouse hasta cerrarlo.</p>
        </div>
        <div class="l-gate__view" data-view="cuenta" hidden>
          <h2>Tu cuenta</h2>
          <div class="l-gate__me"><span class="l-gate__avatar" data-me-initial>A</span><span><b data-me-name></b><small data-me-mail></small></span></div>
          <button class="l-gate__submit" type="button" data-gate-close><span>Seguir</span>${orbChevron()}</button>
          <button class="l-gate__out" type="button" data-signout>${icon('log-in', 16, 2.2)}<span>Cambiar de cuenta</span></button>
        </div>
        <form class="l-gate__view" data-view="entrar" data-form="entrar" hidden novalidate>
          <button class="l-gate__back" type="button" data-go-view="elegir">${icon('arrow-left', 18, 2.4)}<span>Volver</span></button>
          <h2>Iniciar sesión</h2>
          <p class="l-gate__p">Te mandamos un código al correo. No necesitas contraseña.</p>
          <label class="l-gate__field"><span>Correo</span><input type="email" name="email" autocomplete="email" inputmode="email" required></label>
          <p class="l-gate__err" data-err aria-live="polite"></p>
          <button class="l-gate__submit" type="submit"><span>Enviarme el código</span>${orbChevron()}</button>
          <p class="l-gate__switch">¿No tienes cuenta? <button type="button" data-go-view="crear">Crear cuenta</button></p>
        </form>
        <form class="l-gate__view" data-view="crear" data-form="crear" hidden novalidate>
          <button class="l-gate__back" type="button" data-go-view="elegir">${icon('arrow-left', 18, 2.4)}<span>Volver</span></button>
          <h2>Crear cuenta</h2>
          <label class="l-gate__field"><span>Tu nombre</span><input type="text" name="name" autocomplete="name" required></label>
          <label class="l-gate__field"><span>Correo</span><input type="email" name="email" autocomplete="email" inputmode="email" required></label>
          <p class="l-gate__err" data-err aria-live="polite"></p>
          <button class="l-gate__submit" type="submit"><span>Enviarme el código</span>${orbChevron()}</button>
          <p class="l-gate__switch">¿Ya tienes cuenta? <button type="button" data-go-view="entrar">Iniciar sesión</button></p>
        </form>
        <form class="l-gate__view" data-view="codigo" data-form="codigo" hidden novalidate>
          <button class="l-gate__back" type="button" data-code-back>${icon('arrow-left', 18, 2.4)}<span>Cambiar correo</span></button>
          <h2>Revisa tu correo</h2>
          <p class="l-gate__p">Escribe el código de ${CODE_LENGTH} números que mandamos a <b data-code-mail></b>.</p>
          <div class="l-code" style="--n:${CODE_LENGTH}" data-code role="group" aria-label="Código de ${CODE_LENGTH} números">
            ${Array.from({ length: CODE_LENGTH }, (_, i) => `<input class="l-code__box" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="${CODE_LENGTH}" autocomplete="${i === 0 ? 'one-time-code' : 'off'}" aria-label="Número ${i + 1}" data-box="${i}">`).join('')}
          </div>
          <p class="l-gate__err" data-err aria-live="polite"></p>
          <button class="l-gate__submit" type="submit"><span>Verificar y entrar</span>${orbChevron()}</button>
          <p class="l-gate__switch">¿No llegó? Revisa spam o <button type="button" data-resend>Reenviar código</button><span data-resend-wait></span></p>
        </form>
      </div>
    </div>
  </div>`;
}

export function mountLanding(app: HTMLElement, opts: Options) {
  const motionOk = !reducedMotion();
  app.innerHTML = template();
  const root = app.querySelector<HTMLElement>('.landing')!;
  const canvasBox = root.querySelector<HTMLElement>('.l-canvas')!;
  const loader = root.querySelector<HTMLElement>('[data-loader]')!;
  const gate = root.querySelector<HTMLElement>('[data-gate]')!;
  const ac = new AbortController();
  const { signal } = ac;

  const control: FieldControl = { progress: 0, started: false };
  const pointer: Pointer = { x: 99, y: 99, isDown: false };
  let field: GravityField | null = null;
  let sceneReady = false;
  let disposed = false;

  /* ---------- Escena 3D (si el equipo no tiene WebGL, el inicio funciona igual sin ella) ---------- */

  const buildScene = async () => {
    try {
      const { createGravityField } = await import('./scene');
      if (disposed) return;
      field = createGravityField(canvasBox, canvasBox.querySelector('canvas')!, {
        ballColor: BALL_COLOR,
        control,
        pointer,
        reducedMotion: !motionOk,
        onReady: () => (sceneReady = true),
      });
    } catch {
      root.classList.add('no-webgl');
      sceneReady = true;
    }
  };
  void buildScene();

  /* ---------- Cargador: barra de colores; al llenarse la pantalla se parte en dos y aparece la cuenta ---------- */

  const ld = root.querySelector<HTMLElement>('[data-ld]')!;
  const status = root.querySelector<HTMLElement>('[data-loader-status]')!;
  const items = Array.from(ld.querySelectorAll<HTMLElement>('.l-ld__it'));
  const PHASES = ['Calibrando lectura de labios', 'Preparando tu cámara', 'Afinando tu voz', 'Casi lista'];
  const MIN_MS = 3000;
  const t0 = performance.now();
  let value = 0;
  let phase = -1;
  let last = t0;
  let loaderRaf = 0;
  const wait: number[] = [];

  // Se asignan más abajo, cuando la pantalla de cuenta ya está lista.
  let gateFromLoader = () => {};
  let releaseGate = () => {};
  const reveal = () => {
    control.started = true;
    root.classList.add('is-revealed');
    if (opts.jumpToRoles) jumpTo('entrar', true);
  };

  /** La pantalla se rompe en cuatro pedazos por una grieta de luz; detrás ya está la cuenta (o «Inicia a trabajar»). */
  const breakLoader = () => {
    const P = (pts: [number, number][]) => pts.map(([x, y]) => `${x}% ${y}%`);
    const top = CRACK.slice(0, CRACK_K + 1);
    const bot = CRACK.slice(CRACK_K);
    const cl = CUT_L;
    const cr = CUT_R;
    const shards: [string, string][] = [
      ['lt', `polygon(0 0, ${P(top).join(', ')}, ${P(cl).join(', ')})`],
      ['lb', `polygon(${P([...cl].reverse()).join(', ')}, ${P(bot).join(', ')}, 0 100%)`],
      ['rt', `polygon(${P(top).join(', ')}, ${P(cr).join(', ')}, 100% 0)`],
      ['rb', `polygon(${P(bot).join(', ')}, 100% 100%, ${P([...cr].reverse()).join(', ')})`],
    ];
    const frag = document.createDocumentFragment();
    for (const [side, clip] of shards) {
      const h = document.createElement('div');
      h.className = `l-loader__half l-loader__half--${side}`;
      h.setAttribute('aria-hidden', 'true');
      h.style.clipPath = clip;
      h.style.setProperty('-webkit-clip-path', clip);
      h.append(ld.cloneNode(true));
      frag.append(h);
    }
    const W = innerWidth;
    const H = innerHeight;
    const line = (pts: [number, number][], cls: string) => `<polyline class="${cls}" pathLength="100" points="${pts.map(([x, y]) => `${((x * W) / 100).toFixed(1)},${((y * H) / 100).toFixed(1)}`).join(' ')}"/>`;
    const crack = document.createElement('div');
    crack.className = 'l-loader__crack';
    crack.setAttribute('aria-hidden', 'true');
    const sparks = Array.from({ length: 26 }, (_, i) => {
      const y = 4 + Math.random() * 92;
      const idx = Math.min(CRACK.length - 1, Math.floor(y / 7.2));
      const x = CRACK[idx][0];
      const dir = i % 2 ? 1 : -1;
      return `<i style="left:${x}%;top:${y.toFixed(1)}%;--dx:${(dir * (40 + Math.random() * 260)).toFixed(0)}px;--dy:${(Math.random() * 200 - 100).toFixed(0)}px;--s:${(3 + Math.random() * 6).toFixed(1)}px;--d:${(Math.random() * 0.2).toFixed(2)}s"></i>`;
    }).join('');
    crack.innerHTML = `<svg viewBox="0 0 ${W} ${H}">
      ${line(CRACK, 'l-loader__crack-glow')}${line(CRACK, 'l-loader__crack-core')}
      ${line([CRACK[CRACK_K], ...CUT_L], 'l-loader__crack-sub')}${line([CRACK[CRACK_K], ...CUT_R], 'l-loader__crack-sub')}
      ${BRANCH.map((b) => line(b, 'l-loader__crack-sub l-loader__crack-sub--thin')).join('')}
    </svg><i class="l-loader__beam"></i><i class="l-loader__flash"></i><span class="l-loader__sparks">${sparks}</span>`;
    loader.append(frag, crack);
    ld.style.visibility = 'hidden';
    void loader.offsetWidth;
    loader.classList.add('is-cracking');
    vibrate([14, 40, 14, 40, 24]);
    wait.push(
      window.setTimeout(() => {
        loader.classList.add('is-split');
        vibrate([90, 40, 160]);
      }, 640),
    );
    wait.push(
      window.setTimeout(() => {
        loader.hidden = true;
        releaseGate();
      }, 2000),
    );
  };

  const finishLoader = () => {
    loader.classList.add('is-full');
    vibrate(20);
    status.textContent = 'Lista para escucharte';
    const strike = () => {
      gateFromLoader();
      breakLoader();
    };
    wait.push(window.setTimeout(strike, 700));
  };

  const loaderTick = (now: number) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const elapsed = now - t0;
    // El avance es parejo (mínimo ~3 s) para que se vea la animación, y espera a la escena si tarda más.
    const t = Math.min(1, elapsed / MIN_MS);
    const cap = 100 * (0.5 - Math.cos(Math.PI * t) / 2);
    const goal = Math.min(sceneReady ? 100 : 92, cap);
    value += (goal - value) * Math.min(1, 6 * dt);
    if (sceneReady && elapsed >= MIN_MS && value > 99.4) value = 100;
    ld.style.setProperty('--p', (value / 100).toFixed(4));
    items.forEach((it) => {
      if (it.classList.contains('on') || value < Number(it.dataset.at)) return;
      it.classList.add('on');
    });
    const ph = Math.min(PHASES.length - 1, Math.floor(value / 25));
    if (ph !== phase && value < 100) {
      phase = ph;
      status.textContent = PHASES[ph];
    }
    if (value >= 100) return finishLoader();
    loaderRaf = requestAnimationFrame(loaderTick);
  };

  if (opts.jumpToRoles || opts.account || !motionOk) {
    loader.hidden = true;
    requestAnimationFrame(reveal);
  } else {
    loaderRaf = requestAnimationFrame(loaderTick);
  }

  /* ---------- Scroll: progreso de la escena, color de fondo y encabezado ---------- */

  // El progreso se mide por secciones (0 inicio … 4 cómo funciona), no por pantallas: así la física
  // coincide con el texto aunque una sección mida más que la pantalla en el teléfono.
  const sections = ['top', 'historia', 'labios', 'voz', 'como-funciona'].map((id) => root.querySelector<HTMLElement>(`#${id}`)!);
  const progressAt = (y: number) => {
    const tops = sections.map((s) => s.getBoundingClientRect().top + scrollY);
    for (let i = 0; i < tops.length - 1; i++) {
      if (y < tops[i + 1]) return i + Math.max(0, y - tops[i]) / Math.max(1, tops[i + 1] - tops[i]);
    }
    return tops.length - 1 + (y - tops[tops.length - 1]) / (innerHeight || 1);
  };

  let scrollRaf = 0;
  const onScroll = () => {
    if (scrollRaf) return;
    scrollRaf = requestAnimationFrame(() => {
      scrollRaf = 0;
      const progress = progressAt(window.scrollY);
      control.progress = progress;
      // El lienzo 3D se apaga al entrar a la parte nocturna: ahí ya no hay esferas.
      canvasBox.style.opacity = String(1 - Math.min(1, Math.max(0, (progress - 3.5) / 0.5)));
      const stage = progress > 3.55 ? 4 : progress > 2.55 ? 3 : progress > 1.55 ? 2 : progress > 0.7 ? 1 : 0;
      if (root.dataset.stage !== String(stage)) root.dataset.stage = String(stage);
    });
  };
  addEventListener('scroll', onScroll, { passive: true, signal });
  addEventListener('resize', onScroll, { signal });
  onScroll();

  /* ---------- Scroll suave con la rueda (estilo Lenis): un deslizamiento con peso ---------- */

  let target = scrollY;
  let current = scrollY;
  let gliding = false;
  const maxScroll = () => document.documentElement.scrollHeight - innerHeight;
  const glide = () => {
    if (disposed) return;
    current += (target - current) * 0.09;
    if (Math.abs(target - current) < 0.5) {
      current = target;
      gliding = false;
    }
    window.scrollTo(0, current);
    if (gliding) requestAnimationFrame(glide);
  };
  const startGlide = () => {
    if (!gliding) {
      gliding = true;
      current = scrollY;
      requestAnimationFrame(glide);
    }
  };
  if (motionOk) {
    addEventListener(
      'wheel',
      (e) => {
        if (e.ctrlKey || !gate.hidden) return;
        e.preventDefault();
        const delta = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaMode === 2 ? e.deltaY * innerHeight : e.deltaY;
        if (!gliding) target = scrollY;
        target = Math.max(0, Math.min(maxScroll(), target + delta));
        startGlide();
      },
      { passive: false, signal },
    );
    // Teclado, barra de desplazamiento o dedo: el destino sigue a la posición real.
    addEventListener('scroll', () => !gliding && (target = current = scrollY), { passive: true, signal });
  }

  function jumpTo(id: string, instant = false) {
    const el = id === 'top' ? root : root.querySelector<HTMLElement>(`#${id}`);
    if (!el) return;
    const y = id === 'top' ? 0 : el.getBoundingClientRect().top + scrollY;
    if (instant || !motionOk) {
      window.scrollTo(0, y);
      target = current = y;
      return;
    }
    target = Math.max(0, Math.min(maxScroll(), y));
    startGlide();
  }

  /* ---------- Cursor: las esferas se apartan, con más fuerza si el movimiento es rápido ---------- */

  // Mientras se mantiene presionado «escucha cómo hablan», el cursor no empuja los labios.
  let holdingTalk = false;
  addEventListener(
    'pointermove',
    (e) => {
      if (holdingTalk) return;
      pointer.x = (e.clientX / innerWidth) * 2 - 1;
      pointer.y = -(e.clientY / innerHeight) * 2 + 1;
    },
    { signal },
  );
  addEventListener(
    'pointerdown',
    (e) => {
      holdingTalk = !!(e.target as Element).closest('[data-talk]');
      if (holdingTalk) pointer.x = pointer.y = 99;
      else pointer.isDown = true;
    },
    { signal },
  );
  addEventListener(
    'pointerup',
    (e) => {
      holdingTalk = false;
      pointer.isDown = false;
      // Con el dedo no hay cursor que se quede encima.
      if (e.pointerType !== 'mouse') pointer.x = pointer.y = 99;
    },
    { signal },
  );
  document.addEventListener('pointerleave', () => (pointer.x = pointer.y = 99), { signal });

  /* ---------- Aparición al entrar en pantalla ---------- */

  const io = new IntersectionObserver(
    (entries) => {
      for (const en of entries) {
        if (!en.isIntersecting) continue;
        en.target.classList.add('is-in');
        io.unobserve(en.target);
      }
    },
    { threshold: 0.3, rootMargin: '0px 0px -6% 0px' },
  );
  root.querySelectorAll('[data-reveal]').forEach((el) => io.observe(el));

  /* ---------- Los labios hablan ---------- */

  const offHold = bindHold(root.querySelector<HTMLElement>('[data-talk]')!, 900, () => {
    const voice = speakText('Hola. Esta es mi voz.', state.settings);
    field?.talk(Promise.all([voice, sleep(1600)]));
  });

  /* ---------- Cuenta: se pide al abrir la app, una sola vez ---------- */

  const acctLabel = root.querySelector<HTMLElement>('[data-acct-label]')!;
  const closeBtn = root.querySelector<HTMLElement>('.l-gate__close')!;
  let afterGate: (() => void) | null = null;
  let gateTimer = 0;
  let helloTimer = 0;
  const showAccount = () => {
    const s = session();
    acctLabel.textContent = !s ? 'Entrar' : s.kind === 'invitado' ? 'Invitado' : s.name.split(' ')[0];
  };
  const setView = (v: string) => {
    if (v !== 'hola') clearTimeout(helloTimer);
    gate.querySelectorAll<HTMLElement>('[data-view]').forEach((el) => (el.hidden = el.dataset.view !== v));
    gate.querySelectorAll<HTMLElement>('[data-err]').forEach((el) => (el.textContent = ''));
    gate.dataset.view = v;
    if (v === 'cuenta') {
      const s = session();
      root.querySelector<HTMLElement>('[data-me-initial]')!.textContent = (s?.name ?? '?').charAt(0).toUpperCase();
      root.querySelector<HTMLElement>('[data-me-name]')!.textContent = s?.name ?? '';
      root.querySelector<HTMLElement>('[data-me-mail]')!.textContent = s?.kind === 'invitado' ? 'Sin correo: no se guarda nada.' : (s?.email ?? '');
    }
    if (v === 'trabajar') {
      const s = session();
      root.querySelector<HTMLElement>('[data-work-hi]')!.textContent = !s || s.kind === 'invitado' ? '¡Bienvenido!' : `¡Hola, ${s.name.split(' ')[0]}!`;
      root.querySelector<HTMLElement>('[data-work-t]')!.textContent = 'Inicia a trabajar';
      root.querySelector<HTMLElement>('[data-work-label]')!.textContent = 'Sigue el círculo';
      gate.querySelector('.l-work')!.classList.remove('is-done');
    }
    gate.querySelector<HTMLElement>(`[data-view="${v}"] input, [data-view="${v}"] button:not([hidden])`)?.focus({ preventScroll: true });
  };
  const clearFlood = () => gate.querySelectorAll('.l-flood').forEach((el) => el.remove());
  const openGate = (view = 'elegir', solo = Boolean(loader.hidden)) => {
    clearFlood();
    clearTimeout(gateTimer);
    clearTimeout(helloTimer);
    control.paused = true;
    gate.classList.add('is-out');
    gate.hidden = false;
    void gate.offsetWidth;
    gate.classList.remove('is-out');
    const card = gate.querySelector<HTMLElement>('.l-gate__card')!;
    card.style.animation = 'none';
    void card.offsetWidth;
    card.style.animation = '';
    gate.classList.toggle('is-solo', solo);
    closeBtn.hidden = !session();
    document.documentElement.classList.add('gate-on');
    setView(view);
  };
  const closeGate = () => {
    control.paused = false;
    gate.classList.add('is-out');
    document.documentElement.classList.remove('gate-on');
    clearTimeout(gateTimer);
    gateTimer = window.setTimeout(() => {
      gate.hidden = true;
      clearFlood();
    }, motionOk ? 420 : 0);
    showAccount();
    const next = afterGate;
    afterGate = null;
    next?.();
  };
  /** Después de entrar: en el arranque pide mantener presionado el círculo; si no, un saludo corto. */
  const welcome = () => {
    if (afterGate) return setView('trabajar');
    const s = session()!;
    root.querySelector<HTMLElement>('[data-hello-t]')!.textContent = s.kind === 'invitado' ? '¡Bienvenido!' : `¡Hola, ${s.name.split(' ')[0]}!`;
    root.querySelector<HTMLElement>('[data-hello-p]')!.textContent = s.kind === 'invitado' ? 'Entraste sin cuenta. Vamos.' : 'Qué gusto verte. Vamos.';
    setView('hola');
    helloTimer = window.setTimeout(closeGate, motionOk ? 1300 : 300);
  };
  // Círculo de «Inicia a trabajar»: se dibuja siguiendo el aro con el dedo o el mouse (o con la barra espaciadora).
  const pad = root.querySelector<HTMLElement>('[data-work]')!;
  const TAU = Math.PI * 2;
  let drawing = false;
  let finished = false;
  let wLast = 0;
  let wCum = 0;
  let wDir = 0;
  let keyRaf = 0;
  const wSet = (p: number) => pad.style.setProperty('--hold', p.toFixed(4));
  const wReset = () => {
    wCum = 0;
    wDir = 0;
    wSet(0);
  };
  const flood = () => {
    finished = true;
    vibrate([20, 30, 60]);
    wSet(1);
    gate.querySelector('.l-work')!.classList.add('is-done');
    root.querySelector<HTMLElement>('[data-work-t]')!.textContent = '¡Adelante!';
    root.querySelector<HTMLElement>('[data-work-label]')!.textContent = 'Listo';
    vibrate(30);
    const f = document.createElement('div');
    f.className = 'l-flood';
    f.innerHTML = '<i></i><i></i><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 1.5C12.7 6.7 15.8 10.3 22.5 12C15.8 13.7 12.7 17.3 12 22.5C11.3 17.3 8.2 13.7 1.5 12C8.2 10.3 11.3 6.7 12 1.5Z"/></svg>';
    gate.append(f);
    wait.push(window.setTimeout(closeGate, motionOk ? 1250 : 100));
  };
  const geo = () => {
    const r = pad.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, R: (r.width * 92) / 240 };
  };
  const wDown = (e: PointerEvent) => {
    if (finished || e.button > 0) return;
    const g = geo();
    drawing = true;
    pad.setPointerCapture?.(e.pointerId);
    pad.classList.add('is-drawing');
    wLast = Math.atan2(e.clientY - g.y, e.clientX - g.x);
    pad.style.setProperty('--a0', ((wLast * 180) / Math.PI).toFixed(1));
    pad.style.setProperty('--dir', '1');
    wReset();
    wMove(e);
  };
  const wMove = (e: PointerEvent) => {
    if (!drawing || finished) return;
    const g = geo();
    const dx = e.clientX - g.x;
    const dy = e.clientY - g.y;
    if (Math.hypot(dx, dy) < g.R * 0.3) return;
    const a = Math.atan2(dy, dx);
    let d = a - wLast;
    if (d > Math.PI) d -= TAU;
    else if (d < -Math.PI) d += TAU;
    wLast = a;
    wCum += d;
    if (!wDir && Math.abs(wCum) > 0.06) {
      wDir = Math.sign(wCum);
      pad.style.setProperty('--dir', String(wDir));
    }
    if (wDir && wCum * wDir < -0.3) {
      // Cambió de sentido: el trazo empieza de nuevo desde aquí.
      pad.style.setProperty('--a0', ((a * 180) / Math.PI).toFixed(1));
      wReset();
    }
    pad.style.setProperty('--ang', ((a * 180) / Math.PI).toFixed(1));
    pad.style.setProperty('--r', `${g.R.toFixed(1)}px`);
    const p = Math.max(0, Math.min(1, (wCum * (wDir || 1)) / TAU));
    wSet(p);
    spark(a, g.R);
    if (p >= 0.97) flood();
  };
  /** Detalle: el pincel suelta chispas de colores que se apagan. */
  const COLORS = ['#3df2a0', '#00e5ff', '#4d7cff', '#ff3df0', '#f7ff3d'];
  let lastSpark = 0;
  const spark = (a: number, R: number) => {
    if (!motionOk) return;
    const now = performance.now();
    if (now - lastSpark < 32) return;
    lastSpark = now;
    const el = document.createElement('i');
    el.className = 'l-work__spark';
    el.style.setProperty('--a', ((a * 180) / Math.PI).toFixed(1));
    el.style.setProperty('--r', `${R.toFixed(1)}px`);
    el.style.setProperty('--out', `${(8 + Math.random() * 26).toFixed(0)}px`);
    el.style.setProperty('--drift', `${(Math.random() * 26 - 13).toFixed(0)}px`);
    el.style.setProperty('--s', `${(3 + Math.random() * 5).toFixed(1)}px`);
    el.style.setProperty('--c', COLORS[Math.floor(Math.random() * COLORS.length)]);
    pad.append(el);
    window.setTimeout(() => el.remove(), 760);
  };
  const wUp = () => {
    if (!drawing) return;
    drawing = false;
    pad.classList.remove('is-drawing');
    if (!finished) wReset();
  };
  const wKey = (e: KeyboardEvent) => {
    if (finished || (e.key !== ' ' && e.key !== 'Enter') || e.repeat) return;
    e.preventDefault();
    pad.classList.add('is-drawing', 'is-key');
    pad.style.setProperty('--a0', '-90');
    pad.style.setProperty('--dir', '1');
    pad.style.setProperty('--ang', '-90');
    pad.style.setProperty('--r', `${geo().R}px`);
    const t = performance.now();
    const step = () => {
      const p = Math.min(1, (performance.now() - t) / 1500);
      wSet(p);
      pad.style.setProperty('--ang', (-90 + p * 360).toFixed(1));
      if (p >= 1) return flood();
      keyRaf = requestAnimationFrame(step);
    };
    keyRaf = requestAnimationFrame(step);
  };
  const wKeyUp = (e: KeyboardEvent) => {
    if (e.key !== ' ' && e.key !== 'Enter') return;
    cancelAnimationFrame(keyRaf);
    pad.classList.remove('is-drawing', 'is-key');
    if (!finished) wReset();
  };
  pad.addEventListener('pointerdown', wDown);
  pad.addEventListener('pointermove', wMove);
  pad.addEventListener('pointerup', wUp);
  pad.addEventListener('pointercancel', wUp);
  pad.addEventListener('keydown', wKey);
  pad.addEventListener('keyup', wKeyUp);
  pad.addEventListener('contextmenu', (e) => e.preventDefault());
  const offWork = () => {
    cancelAnimationFrame(keyRaf);
    pad.removeEventListener('pointerdown', wDown);
    pad.removeEventListener('pointermove', wMove);
    pad.removeEventListener('pointerup', wUp);
    pad.removeEventListener('pointercancel', wUp);
    pad.removeEventListener('keydown', wKey);
    pad.removeEventListener('keyup', wKeyUp);
  };
  gateFromLoader = () => {
    afterGate = reveal;
    openGate(session() ? 'trabajar' : 'elegir', true);
    gate.classList.add('is-under');
  };
  releaseGate = () => gate.classList.remove('is-under');
  showAccount();
  if (opts.account) {
    afterGate = opts.onReturn ?? null;
    openGate(session() ? 'cuenta' : 'elegir', true);
  } else if (loader.hidden && !session()) openGate();

  // En el teléfono, arrastrar la pantalla de cuenta no debe mover la página de atrás ni rebotar al llegar al borde.
  let touchY = 0;
  gate.addEventListener('touchstart', (e) => (touchY = e.touches[0].clientY), { signal, passive: true });
  gate.addEventListener(
    'touchmove',
    (e) => {
      const dy = e.touches[0].clientY - touchY;
      const fits = gate.scrollHeight <= gate.clientHeight + 1;
      const atTop = gate.scrollTop <= 0;
      const atBottom = gate.scrollTop + gate.clientHeight >= gate.scrollHeight - 1;
      if (fits || (dy > 0 && atTop) || (dy < 0 && atBottom)) e.preventDefault();
    },
    { signal, passive: false },
  );

  /* ---------- Código del correo ---------- */

  let pending: { email: string; name?: string } = { email: '' };
  let resendTimer = 0;
  const codeForm = () => gate.querySelector<HTMLFormElement>('[data-form="codigo"]')!;
  const boxes = () => Array.from(codeForm().querySelectorAll<HTMLInputElement>('[data-box]'));

  const startResendWait = (secs = 45) => {
    clearInterval(resendTimer);
    const btn = codeForm().querySelector<HTMLButtonElement>('[data-resend]')!;
    const note = codeForm().querySelector<HTMLElement>('[data-resend-wait]')!;
    let left = secs;
    btn.disabled = true;
    const tick = () => {
      note.textContent = left > 0 ? ` (${left} s)` : '';
      if (left-- <= 0) {
        clearInterval(resendTimer);
        btn.disabled = false;
      }
    };
    tick();
    resendTimer = window.setInterval(tick, 1000);
  };

  const showCodeView = () => {
    boxes().forEach((b) => (b.value = ''));
    codeForm().querySelector<HTMLElement>('[data-code-mail]')!.textContent = pending.email;
    setView('codigo');
    startResendWait();
    boxes()[0]?.focus({ preventScroll: true });
  };

  gate.addEventListener(
    'input',
    (e) => {
      const box = e.target as HTMLInputElement;
      if (!box.matches('[data-box]')) return;
      const all = boxes();
      const i = Number(box.dataset.box);
      const digits = box.value.replace(/\D/g, '');
      // Pegar o autocompletar el código completo reparte los números; si no, la casilla guarda solo el último.
      if (digits.length >= all.length) {
        digits.slice(0, all.length).split('').forEach((d, k) => (all[k].value = d));
        all[all.length - 1].focus();
      } else {
        box.value = digits.slice(-1);
        if (box.value && i < all.length - 1) all[i + 1].focus();
      }
      if (all.every((b) => b.value)) codeForm().requestSubmit();
    },
    { signal },
  );

  gate.addEventListener(
    'keydown',
    (e) => {
      const box = e.target as HTMLInputElement;
      if (!box.matches?.('[data-box]')) return;
      const all = boxes();
      const i = Number(box.dataset.box);
      if (e.key === 'Backspace' && !box.value && i > 0) all[i - 1].focus();
      if (e.key === 'ArrowLeft' && i > 0) all[i - 1].focus();
      if (e.key === 'ArrowRight' && i < all.length - 1) all[i + 1].focus();
    },
    { signal },
  );

  gate.addEventListener(
    'click',
    async (e) => {
      const t = e.target as HTMLElement;
      if (t.closest('[data-code-back]')) return setView(pending.name !== undefined ? 'crear' : 'entrar');
      if (t.closest('[data-resend]')) {
        const err = codeForm().querySelector<HTMLElement>('[data-err]')!;
        err.textContent = '';
        try {
          await requestCode(pending.email, pending.name);
          boxes().forEach((b) => (b.value = ''));
          boxes()[0]?.focus();
          startResendWait();
          err.textContent = '';
        } catch (x) {
          err.textContent = x instanceof Error ? x.message : 'No se pudo reenviar.';
        }
      }
    },
    { signal },
  );

  gate.addEventListener(
    'submit',
    async (e) => {
      e.preventDefault();
      const form = e.target as HTMLFormElement;
      const err = form.querySelector<HTMLElement>('[data-err]')!;
      const btn = form.querySelector<HTMLButtonElement>('[type="submit"]')!;
      const data = new FormData(form);
      const v = (k: string) => String(data.get(k) ?? '');
      btn.disabled = true;
      err.textContent = '';
      try {
        if (form.dataset.form === 'codigo') {
          const code = Array.from(form.querySelectorAll<HTMLInputElement>('[data-box]'), (i) => i.value).join('');
          await verifyCode(pending.email, code);
        } else {
          pending = { email: v('email').trim().toLowerCase(), name: form.dataset.form === 'crear' ? v('name') : undefined };
          await requestCode(pending.email, pending.name);
          showCodeView();
          return;
        }
        form.reset();
        clearInterval(resendTimer);
        welcome();
      } catch (x) {
        vibrate([30, 50, 30]);
        err.textContent = x instanceof Error ? x.message : 'No se pudo entrar. Intenta otra vez.';
        if (form.dataset.form === 'codigo') {
          boxes().forEach((b) => (b.value = ''));
          boxes()[0]?.focus();
        }
        form.classList.remove('is-shake');
        void form.offsetWidth;
        form.classList.add('is-shake');
      } finally {
        btn.disabled = false;
      }
    },
    { signal },
  );

  /* ---------- Elegir modo ---------- */

  let chosen: Role = 'usuario';

  const enter = async (page?: 'ayuda' | 'consejos') => {
    if (!session()) return openGate('elegir', true);
    root.classList.add('is-leaving');
    await sleep(motionOk ? 420 : 0);
    opts.onChoose(chosen, page);
  };

  root.addEventListener(
    'click',
    (e) => {
      const t = e.target as HTMLElement;
      const goView = t.closest<HTMLElement>('[data-go-view]');
      if (goView) return setView(goView.dataset.goView!);
      if (t.closest('[data-guest]')) {
        guest();
        return welcome();
      }
      if (t.closest('[data-signout]')) {
        signOut();
        showAccount();
        closeBtn.hidden = true;
        return setView('elegir');
      }
      if (t.closest('[data-gate-close]')) return session() ? closeGate() : undefined;
      if (t.closest('[data-acct]')) return openGate(session() ? 'cuenta' : 'elegir', true);
      const scroll = t.closest<HTMLElement>('[data-scroll]');
      if (scroll) {
        e.preventDefault();
        jumpTo(scroll.dataset.scroll!);
        return;
      }
      const role = t.closest<HTMLElement>('[data-role]');
      if (role) {
        chosen = role.dataset.role as Role;
        return void enter();
      }
      if (t.closest('[data-ayuda]')) {
        chosen = 'usuario';
        return void enter('ayuda');
      }
      if (t.closest('[data-tools]')) {
        chosen = 'usuario';
        return void enter('consejos');
      }
      if (t.closest('[data-dev]')) {
        return showDevGate();
      }
    },
    { signal },
  );

  const showDevGate = () => {
    const dlg = document.createElement('dialog');
    dlg.className = 'sheet dev-sheet';
    dlg.innerHTML = `
      <div class="sheet__inner dev">
        <header class="sheet__head">
          <div><p class="kicker">[ Acceso ]</p><h2>Soy programador</h2></div>
          <button class="icon-btn" type="button" data-close aria-label="Cerrar">${icon('x', 20)}</button>
        </header>
        <form class="dev-gate" onsubmit="return false">
          <label class="field">
            <span class="field__label">Contraseña</span>
            <input type="password" id="dev-pwd" class="input" placeholder="Escribe la contraseña" autocomplete="off">
          </label>
          <p id="dev-err" class="field__error" role="alert" hidden></p>
          <button class="btn btn--primary btn--lg" id="dev-submit" type="button">Entrar</button>
        </form>
      </div>`;

    document.body.appendChild(dlg);
    dlg.showModal();

    const pwdInput = dlg.querySelector<HTMLInputElement>('#dev-pwd')!;
    const errMsg = dlg.querySelector<HTMLElement>('#dev-err')!;
    const submitBtn = dlg.querySelector<HTMLButtonElement>('#dev-submit')!;
    const closeBtn = dlg.querySelector<HTMLButtonElement>('[data-close]')!;

    pwdInput.focus();

    const checkPassword = () => {
      const pwd = pwdInput.value;
      if (pwd === '76767678') {
        dlg.close();
        dlg.remove();
        openDevPanel();
      } else {
        errMsg.textContent = 'Contraseña incorrecta';
        errMsg.hidden = false;
        pwdInput.value = '';
        pwdInput.focus();
        vibrate([30, 50, 30]);
      }
    };

    submitBtn.addEventListener('click', checkPassword);
    pwdInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') checkPassword();
    });
    closeBtn.addEventListener('click', () => {
      dlg.close();
      dlg.remove();
    });

    dlg.addEventListener('close', () => dlg.remove());
  };

  return () => {
    disposed = true;
    ac.abort();
    io.disconnect();
    offHold();
    offWork();
    cancelAnimationFrame(loaderRaf);
    clearTimeout(gateTimer);
    clearTimeout(helloTimer);
    wait.forEach(clearTimeout);
    cancelAnimationFrame(scrollRaf);
    field?.dispose();
    document.documentElement.classList.remove('gate-on');
    app.innerHTML = '';
  };
}

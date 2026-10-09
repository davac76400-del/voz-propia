import { LANDMARK_DIMS } from './lip-features';

/**
 * ¿Los labios se están moviendo de verdad, o es solo el temblor de la cámara?
 *
 * No se compara contra un número fijo: el temblor cambia de una cámara a otra y de una luz a otra, y los gestos
 * redondos o chicos (o, u, m) mueven poco cada punto. En cambio se mide la relación señal/ruido de la toma misma:
 * el movimiento lento y coordinado de los labios (lo que queda tras suavizar) contra el ruido rápido que la propia
 * toma trae (lo que el suavizado quita). Sirve igual con movimientos grandes o mínimos y no depende de la cámara.
 */

/** Suavizado binomial de 5 puntos (el mismo que usa la lectura): [1 4 6 4 1] / 16. */
const K0 = 1 / 16;
const K1 = 4 / 16;
const K2 = 6 / 16;
/** Varianza que le queda al ruido blanco unitario tras suavizarlo (suma de cuadrados del núcleo). */
const SMOOTH_NOISE = 70 / 256;
/** Varianza del residuo (cuadro menos su suavizado) para ruido blanco unitario. */
const RESIDUAL_NOISE = 1 - 2 * K2 + SMOOTH_NOISE;

/** Por encima de esto la toma tiene movimiento de labios (medido con grabaciones reales: el ruido solo casi nunca llega). */
export const SPEECH_SNR = 1;
/** Cuadros mínimos para poder medir. */
const MIN_FRAMES = 8;

let scratch = new Float64Array(64);

/**
 * Relación señal/ruido del movimiento lento de los labios entre los cuadros [from, to) de la toma.
 * 0 = solo ruido; 1 = el movimiento vale tanto como el ruido; 10 = diez veces más.
 */
export function takeSnr(frames: Float32Array, D: number, from = 0, to = frames.length / D): number {
  const T = to - from;
  if (T < MIN_FRAMES) return 0;
  const n = Math.min(LANDMARK_DIMS, D);
  const m = T - 4;
  if (scratch.length < m) scratch = new Float64Array(m);
  let signal = 0;
  let residual = 0;
  for (let d = 0; d < n; d++) {
    let mean = 0;
    for (let t = 2; t < T - 2; t++) {
      const i = (from + t) * D + d;
      const s = K0 * (frames[i - 2 * D] + frames[i + 2 * D]) + K1 * (frames[i - D] + frames[i + D]) + K2 * frames[i];
      scratch[t - 2] = s;
      mean += s;
      const r = frames[i] - s;
      residual += r * r;
    }
    mean /= m;
    for (let k = 0; k < m; k++) signal += (scratch[k] - mean) ** 2;
  }
  const count = n * m;
  // Piso: una toma perfectamente lisa (sin ruido) no debe dar un número infinito.
  const noise = Math.max(residual / count / RESIDUAL_NOISE, 1e-9);
  return Math.max(0, signal / count - SMOOTH_NOISE * noise) / noise;
}

export interface MotionState {
  /** Relación señal/ruido de la ventana más reciente. */
  snr: number;
  /** Verdadero mientras los labios se mueven (con histéresis: no parpadea). */
  moving: boolean;
  /** 0..1 suavizado, para animar la interfaz: crece con el movimiento sin importar cuán grande sea. */
  level: number;
}

export interface MotionConfig {
  /** Cuadros de la ventana en vivo (unos 0.4 a 0.7 s). */
  window: number;
  /** Entra a «moviéndose» con esta relación y sale con otra más baja (así no parpadea en el borde). */
  enter: number;
  leave: number;
  /** Cuadros seguidos por encima de `enter` para empezar, y por debajo de `leave` para terminar. */
  enterRun: number;
  leaveRun: number;
  /** Con qué relación el indicador llega a casi lleno. */
  levelFull: number;
}

/**
 * Valores medidos con grabaciones reales (simulando movimientos de 1, 1/2 y 1/4 del tamaño normal): con una ventana de
 * 12 cuadros el grabador se detiene solo en 98 % / 96 % / 73 % de las tomas, corta el habla en menos de 5 %, y con solo
 * temblor cree que hablaste en 2 %. El detector anterior (apertura de la boca) creía que hablaste en 83 % de las tomas
 * de puro temblor y casi nunca se detenía solo.
 */
const DEFAULTS: MotionConfig = { window: 12, enter: 1.6, leave: 0.6, enterRun: 2, leaveRun: 3, levelFull: 8 };

/**
 * Detector en vivo: se alimenta con los rasgos de cada cuadro y dice, al momento, si los labios se mueven.
 * Usa la misma medida que `takeSnr` sobre una ventana corta que se desplaza.
 */
export class LipMotion {
  private cfg: MotionConfig;
  private buf: Float32Array;
  private n = 0;
  private head = 0;
  private above = 0;
  private below = 0;
  private lvl = 0;
  private win: Float32Array;
  state: MotionState = { snr: 0, moving: false, level: 0 };

  constructor(
    private D: number,
    cfg: Partial<MotionConfig> = {},
  ) {
    this.cfg = { ...DEFAULTS, ...cfg };
    this.buf = new Float32Array(this.cfg.window * D);
    this.win = new Float32Array(this.cfg.window * D);
  }

  /** Una cara que se pierde y vuelve no debe contar el salto como movimiento. */
  reset() {
    this.n = 0;
    this.head = 0;
    this.above = 0;
    this.below = 0;
    this.lvl = 0;
    this.state = { snr: 0, moving: false, level: 0 };
  }

  push(features: Float32Array): MotionState {
    const { D, cfg } = this;
    const W = cfg.window;
    this.buf.set(features.subarray(0, D), this.head * D);
    this.head = (this.head + 1) % W;
    this.n = Math.min(W, this.n + 1);
    if (this.n < W) return this.state;
    // La ventana se ordena del cuadro más viejo al más nuevo.
    this.win.set(this.buf.subarray(this.head * D), 0);
    this.win.set(this.buf.subarray(0, this.head * D), (W - this.head) * D);
    const snr = takeSnr(this.win, D);
    if (snr >= cfg.enter) {
      this.above++;
      this.below = 0;
    } else if (snr < cfg.leave) {
      this.below++;
      this.above = 0;
    } else {
      this.above = 0;
      this.below = 0;
    }
    let moving = this.state.moving;
    if (!moving && this.above >= cfg.enterRun) moving = true;
    else if (moving && this.below >= cfg.leaveRun) moving = false;
    const target = 1 - Math.exp(-snr / (cfg.levelFull / 3));
    this.lvl += (target - this.lvl) * (target > this.lvl ? 0.5 : 0.2);
    this.state = { snr, moving, level: this.lvl };
    return this.state;
  }
}

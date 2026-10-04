import {
  AdditiveBlending,
  AmbientLight,
  BufferAttribute,
  BufferGeometry,
  Color,
  DirectionalLight,
  Group,
  InstancedMesh,
  LineBasicMaterial,
  LineLoop,
  MathUtils,
  MeshStandardMaterial,
  Object3D,
  PerspectiveCamera,
  PointLight,
  Points,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  WebGLRenderer,
} from 'three';
import type { Palette } from '../components/theme';

/**
 * Escena de la guía: UN solo lienzo fijo y UN solo dibujo de puntos que se transforma con el scroll
 * (cara, halo, galaxia, ondas de voz, globo). Sin imágenes, sin sombras, sin postproceso: ~500 puntos,
 * 22 esferas instanciadas y 4 pares de contornos de labios.
 */

export interface GuideScene {
  /** Posición en capítulos, en flotante: 0 inicio, 1 mira, 2 forma, 3 compara, 4 duda, 5 voz, 6 promesas. */
  setProgress: (p: number) => void;
  /** Resalta la opción 0, 1 o 2 en el capítulo de la duda (-1 = ninguna). */
  setChosen: (i: number) => void;
  /** Los labios hablan mientras dure la promesa. */
  talk: (until: Promise<unknown>) => void;
  /** Pausa el dibujo cuando el lienzo no se ve. */
  setVisible: (v: boolean) => void;
  /** Cambia los colores de puntos, labios y esferas. */
  setPalette: (p: Palette) => void;
  dispose: () => void;
}

interface Options {
  palette: Palette;
  reducedMotion: boolean;
  /** Se llama con el índice de la forma de labios mostrada (capítulo 2). */
  onShape: (i: number) => void;
}

const N = 478;
const LIPS = 40;
const CLOUD = N - LIPS;
const BLUE = new Color('#2F69FF');
const BLUE_L = new Color('#9DB7FF');
const GREEN = new Color('#3DF2A0');
const WHITE = new Color('#F4F7FA');

/* ---------- Formas de labios: ancho, apertura y redondez ---------- */

const SHAPES = [
  { w: 0.52, open: 0.0, round: 0 },
  { w: 0.46, open: 0.36, round: 0.1 },
  { w: 0.3, open: 0.32, round: 1 },
  { w: 0.64, open: 0.07, round: 0 },
];
type Shape = { w: number; open: number; round: number };
const mix = (a: Shape, b: Shape, t: number): Shape => ({ w: MathUtils.lerp(a.w, b.w, t), open: MathUtils.lerp(a.open, b.open, t), round: MathUtils.lerp(a.round, b.round, t) });

const OUTER = 24;
const INNER = 16;

/** Contorno exterior e interior de unos labios, en el plano XY. */
function lipContours(s: Shape, outer: Float32Array, inner: Float32Array) {
  for (let i = 0; i < OUTER; i++) {
    const t = (i / OUTER) * Math.PI * 2;
    const c = Math.cos(t);
    const sn = Math.sin(t);
    const up = sn >= 0;
    const thick = up ? 0.17 : 0.2;
    const bow = up ? -0.05 * Math.exp(-((c / 0.22) ** 2)) : 0;
    outer[i * 3] = s.w * c * (1 - s.round * 0.18 * sn * sn);
    outer[i * 3 + 1] = (up ? 1 : -1) * (s.open / 2 + thick * Math.abs(sn) ** (0.85 + s.round * 0.3)) + bow;
    outer[i * 3 + 2] = 0.04 * (1 - c * c);
  }
  for (let i = 0; i < INNER; i++) {
    const t = (i / INNER) * Math.PI * 2;
    const c = Math.cos(t);
    const sn = Math.sin(t);
    inner[i * 3] = s.w * 0.82 * c * (1 - s.round * 0.2 * sn * sn);
    inner[i * 3 + 1] = (sn >= 0 ? 1 : -1) * (s.open / 2) * Math.abs(sn) ** 0.9;
    inner[i * 3 + 2] = 0.03;
  }
}

class LipRing {
  readonly group = new Group();
  private outer = new Float32Array(OUTER * 3);
  private inner = new Float32Array(INNER * 3);
  private oGeo = new BufferGeometry();
  private iGeo = new BufferGeometry();
  private pGeo = new BufferGeometry();
  private lineMat = new LineBasicMaterial({ color: WHITE, transparent: true, blending: AdditiveBlending, depthWrite: false });
  private pts: Points;

  constructor(pointMat: ShaderMaterial) {
    this.oGeo.setAttribute('position', new BufferAttribute(this.outer, 3));
    this.iGeo.setAttribute('position', new BufferAttribute(this.inner, 3));
    const all = new Float32Array((OUTER + INNER) * 3);
    this.pGeo.setAttribute('position', new BufferAttribute(all, 3));
    const col = new Float32Array((OUTER + INNER) * 3);
    for (let i = 0; i < OUTER + INNER; i++) GREEN.toArray(col, i * 3);
    this.pGeo.setAttribute('color', new BufferAttribute(col, 3));
    this.pGeo.setAttribute('size', new BufferAttribute(new Float32Array(OUTER + INNER).fill(1.5), 1));
    this.pts = new Points(this.pGeo, pointMat);
    this.group.add(new LineLoop(this.oGeo, this.lineMat), new LineLoop(this.iGeo, this.lineMat), this.pts);
    this.pts.frustumCulled = false;
  }

  private last = '';
  private lastColor: Color | null = null;
  private lastOpacity = -1;

  set(s: Shape) {
    const key = `${s.w.toFixed(3)}|${s.open.toFixed(3)}|${s.round.toFixed(3)}`;
    if (key === this.last) return;
    this.last = key;
    lipContours(s, this.outer, this.inner);
    const all = this.pGeo.getAttribute('position').array as Float32Array;
    all.set(this.outer, 0);
    all.set(this.inner, OUTER * 3);
    this.oGeo.getAttribute('position').needsUpdate = true;
    this.iGeo.getAttribute('position').needsUpdate = true;
    this.pGeo.getAttribute('position').needsUpdate = true;
  }

  /** Fuerza a repintar con el color actual (cuando el color cambia sin cambiar de objeto). */
  refresh() {
    this.lastColor = null;
  }

  color(c: Color, opacity: number) {
    if (c === this.lastColor && Math.abs(opacity - this.lastOpacity) < 0.002) return;
    this.lastColor = c;
    this.lastOpacity = opacity;
    const col = this.pGeo.getAttribute('color').array as Float32Array;
    for (let i = 0; i < OUTER + INNER; i++) c.toArray(col, i * 3);
    this.pGeo.getAttribute('color').needsUpdate = true;
    this.lineMat.color.copy(c);
    this.lineMat.opacity = opacity;
    this.group.visible = opacity > 0.02;
  }

  dispose() {
    this.oGeo.dispose();
    this.iGeo.dispose();
    this.pGeo.dispose();
    this.lineMat.dispose();
  }
}

/* ---------- Objetivos de la nube de puntos (CLOUD puntos cada uno) ---------- */

const faceZ = (x: number, y: number) => {
  const e = 1 - (x / 0.95) ** 2 - (y / 1.25) ** 2;
  if (e <= 0) return 0;
  const nose = 0.22 * Math.exp(-((x / 0.14) ** 2 + ((y - 0.02) / 0.3) ** 2));
  const eyes = -0.07 * (Math.exp(-(((x - 0.36) / 0.17) ** 2 + ((y - 0.38) / 0.1) ** 2)) + Math.exp(-(((x + 0.36) / 0.17) ** 2 + ((y - 0.38) / 0.1) ** 2)));
  return 0.85 * Math.sqrt(e) + nose + eyes;
};

function buildTargets() {
  const face = new Float32Array(CLOUD * 3);
  const halo = new Float32Array(CLOUD * 3);
  const galaxy = new Float32Array(CLOUD * 3);
  const globe = new Float32Array(CLOUD * 3);
  const rings = new Float32Array(CLOUD * 3);
  const golden = Math.PI * (3 - Math.sqrt(5));
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;

  for (let i = 0; i < CLOUD; i++) {
    const r = Math.sqrt((i + 0.5) / CLOUD);
    const th = i * golden;
    let x = 0.95 * r * Math.cos(th);
    let y = 1.25 * r * Math.sin(th);
    // La boca queda libre: ahí van los puntos de los labios.
    if (Math.abs(x) < 0.55 && y < -0.28 && y > -0.62) y += y < -0.45 ? -0.18 : 0.18;
    face.set([x, y, faceZ(x, y)], i * 3);

    // Halo: la cara abierta hacia afuera, como una nebulosa alrededor de los labios.
    const k = 1.9 + 0.8 * rnd();
    halo.set([x * k, y * k, faceZ(x, y) * 0.4 - 0.6 + (rnd() - 0.5) * 1.4], i * 3);

    // Galaxia: disco con brazos en espiral.
    const arm = i % 3;
    const rad = 0.5 + 2.7 * Math.sqrt(rnd());
    const ang = rad * 1.15 + (arm * Math.PI * 2) / 3 + (rnd() - 0.5) * 0.5;
    galaxy.set([Math.cos(ang) * rad, (rnd() - 0.5) * 0.35 * (1 + rad * 0.2), Math.sin(ang) * rad * 0.62 - 0.4], i * 3);

    // Globo: esfera de Fibonacci.
    const gy = 1 - ((i + 0.5) / CLOUD) * 2;
    const gr = Math.sqrt(1 - gy * gy);
    globe.set([Math.cos(i * golden) * gr * 1.7, gy * 1.7, Math.sin(i * golden) * gr * 1.7], i * 3);

    // Ondas: anillos concéntricos (el radio lo anima el tiempo).
    rings.set([0, 0, 0], i * 3);
  }
  return { face, halo, galaxy, globe, rings };
}

/* ---------- Parámetros por capítulo (se mezclan entre un capítulo y el siguiente) ---------- */

interface Chapter {
  cloud: 'face' | 'halo' | 'galaxy' | 'rings' | 'globe';
  /** -1 texto a la derecha (escena a la izquierda), 1 al revés, 0 centrada. */
  side: number;
  scale: number;
  lipsScale: number;
  lipsY: number;
  lipsZ: number;
  lipsOn: number;
  cand: number;
  spheres: number;
  yaw: number;
}

const CH: Chapter[] = [
  { cloud: 'face', side: 1, scale: 1, lipsScale: 1, lipsY: -0.45, lipsZ: 0.86, lipsOn: 1, cand: 0, spheres: 0.7, yaw: 0 },
  { cloud: 'face', side: -1, scale: 1.05, lipsScale: 1, lipsY: -0.45, lipsZ: 0.86, lipsOn: 1, cand: 0, spheres: 0.6, yaw: 0 },
  { cloud: 'halo', side: 1, scale: 0.8, lipsScale: 2.4, lipsY: 0, lipsZ: 0.9, lipsOn: 1, cand: 0, spheres: 0.2, yaw: 0 },
  { cloud: 'galaxy', side: -1, scale: 0.78, lipsScale: 1.5, lipsY: 0.1, lipsZ: 0.6, lipsOn: 1, cand: 1, spheres: 0.2, yaw: 0 },
  { cloud: 'galaxy', side: 1, scale: 0.78, lipsScale: 1.5, lipsY: 0.1, lipsZ: 0.6, lipsOn: 1, cand: 1, spheres: 0.2, yaw: 0 },
  { cloud: 'rings', side: -1, scale: 0.95, lipsScale: 1.9, lipsY: 0, lipsZ: 0.9, lipsOn: 1, cand: 0, spheres: 0.3, yaw: 0 },
  { cloud: 'globe', side: 1, scale: 1, lipsScale: 0.5, lipsY: 0, lipsZ: 1.75, lipsOn: 0.7, cand: 0, spheres: 0.75, yaw: 0 },
];

const smooth = (a: number, b: number, x: number) => {
  const t = MathUtils.clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

export function createGuideScene(box: HTMLElement, canvas: HTMLCanvasElement, opts: Options): GuideScene {
  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  let maxDpr = Math.min(devicePixelRatio || 1, 1.75);
  renderer.setPixelRatio(maxDpr);
  renderer.setClearColor(0x000000, 0);

  const scene = new Scene();
  const camera = new PerspectiveCamera(34, 1, 0.1, 60);
  camera.position.set(0, 0, 7.4);

  const world = new Group();
  const head = new Group();
  world.add(head);
  scene.add(world);

  /* Puntos: un solo dibujo. Cada punto brilla con un círculo suave. */
  const pointMat = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    uniforms: { uScale: { value: 1 }, uAlpha: { value: 1 } },
    vertexShader: `
      attribute float size; attribute vec3 color; varying vec3 vColor; uniform float uScale;
      void main(){ vColor = color; vec4 mv = modelViewMatrix * vec4(position,1.0);
        gl_PointSize = size * uScale * (52.0 / -mv.z); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `
      varying vec3 vColor; uniform float uAlpha;
      void main(){ float d = length(gl_PointCoord - 0.5); if (d > 0.5) discard;
        float a = smoothstep(0.5, 0.0, d); gl_FragColor = vec4(vColor, a * a * 1.15 * uAlpha); }`,
  });

  BLUE.set(opts.palette.a1);
  BLUE_L.set(opts.palette.a1l);
  GREEN.set(opts.palette.a2);

  const T = buildTargets();
  const cloudGeo = new BufferGeometry();
  const pos = new Float32Array(CLOUD * 3);
  const col = new Float32Array(CLOUD * 3);
  const size = new Float32Array(CLOUD);
  const scatter = new Float32Array(CLOUD * 3);
  for (let i = 0; i < CLOUD; i++) {
    const a = i * 2.399;
    const r = 3 + (i % 7) * 0.6;
    scatter.set([Math.cos(a) * r, Math.sin(a * 1.3) * r * 0.7, Math.sin(a) * r - 2], i * 3);
    pos.set([scatter[i * 3], scatter[i * 3 + 1], scatter[i * 3 + 2]], i * 3);
    const c = i % 9 === 0 ? WHITE : i % 4 === 0 ? BLUE_L : BLUE;
    c.toArray(col, i * 3);
    size[i] = 0.9 + (i % 5) * 0.28;
  }
  cloudGeo.setAttribute('position', new BufferAttribute(pos, 3));
  cloudGeo.setAttribute('color', new BufferAttribute(col, 3));
  cloudGeo.setAttribute('size', new BufferAttribute(size, 1));
  const cloud = new Points(cloudGeo, pointMat);
  cloud.frustumCulled = false;
  head.add(cloud);

  /* Labios principales (sobre la cara) y tres candidatos que aparecen al comparar. */
  const lips = new LipRing(pointMat);
  head.add(lips.group);
  const cands = [0, 1, 2].map(() => new LipRing(pointMat));
  const candShapes: Shape[] = [SHAPES[1], SHAPES[2], SHAPES[3]];
  cands.forEach((c, i) => {
    c.set(candShapes[i]);
    head.add(c.group);
  });

  /* Esferas que orbitan: dan volumen y profundidad con una sola llamada de dibujo. */
  const ORBS = 22;
  const orbMat = new MeshStandardMaterial({ roughness: 0.28, metalness: 0.12, color: 0xffffff });
  const orbs = new InstancedMesh(new SphereGeometry(1, 20, 14), orbMat, ORBS);
  const m = new Object3D();
  const orbData = Array.from({ length: ORBS }, (_, i) => ({
    r: 1.9 + (i % 5) * 0.34,
    a: (i / ORBS) * Math.PI * 2,
    s: 0.06 + (i % 4) * 0.025,
    y: ((i * 37) % 100) / 100 - 0.5,
    size: 0.05 + ((i * 13) % 7) * 0.012,
  }));
  for (let i = 0; i < ORBS; i++) orbs.setColorAt(i, i % 4 === 0 ? WHITE : i % 4 === 1 ? GREEN : BLUE);
  world.add(orbs);
  scene.add(new AmbientLight(0xffffff, 0.8));
  const key = new DirectionalLight(0xffffff, 2.2);
  key.position.set(3, 4, 5);
  scene.add(key);
  const rim = new PointLight(0x3df2a0, 18, 12);
  rim.position.set(-3, -1, 3);
  scene.add(rim);

  /* ---------- Estado ---------- */

  let progress = 0;
  let chosen = -1;
  let visible = true;
  let disposed = false;
  let talking = false;
  let talkAmt = 0;
  let pulse = 0;
  let shapeIdx = -1;
  const assemble = { v: opts.reducedMotion ? 1 : 0 };
  const px = { x: 0, y: 0 };
  const tilt = { x: 0, y: 0 };
  let w = 1;
  let h = 1;

  const resize = () => {
    w = Math.max(1, box.clientWidth);
    h = Math.max(1, box.clientHeight);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    pointMat.uniforms.uScale.value = (h * renderer.getPixelRatio()) / 900;
  };
  const ro = new ResizeObserver(() => {
    resize();
    requestRender();
  });
  ro.observe(box);
  resize();

  const onMove = (e: PointerEvent) => {
    px.x = (e.clientX / innerWidth) * 2 - 1;
    px.y = (e.clientY / innerHeight) * 2 - 1;
  };
  const onDown = (e: PointerEvent) => {
    if ((e.target as Element).closest('button, a, input')) return;
    pulse = 1;
    requestRender();
  };
  addEventListener('pointermove', onMove, { passive: true });
  addEventListener('pointerdown', onDown, { passive: true });

  const target = (idx: Chapter['cloud'], time: number): Float32Array => {
    if (idx !== 'rings') return T[idx];
    const rt = T.rings;
    for (let i = 0; i < CLOUD; i++) {
      const ring = i % 6;
      const k = (((i / 6) | 0) / (CLOUD / 6)) * Math.PI * 2;
      const r = 0.9 + ((ring / 6 + time * 0.22) % 1) * 3.2;
      rt[i * 3] = Math.cos(k) * r;
      rt[i * 3 + 1] = Math.sin(k) * r * 0.78;
      rt[i * 3 + 2] = -0.4 - r * 0.12;
    }
    return rt;
  };

  const frame = (time: number, dt: number) => {
    const atEnd = progress >= CH.length - 1;
    const k = atEnd ? CH.length - 1 : Math.floor(progress);
    const f = atEnd ? 0 : MathUtils.clamp(progress - k, 0, 1);
    const tf = smooth(0.5, 0.95, f);
    const A = CH[k];
    const B = atEnd ? A : CH[k + 1];
    const L = (a: number, b: number) => MathUtils.lerp(a, b, tf);
    const val = (key: 'side' | 'scale' | 'lipsScale' | 'lipsY' | 'lipsZ' | 'lipsOn' | 'cand' | 'spheres') => L(A[key], B[key]);

    assemble.v = Math.min(1, assemble.v + dt * 0.55);
    const asm = smooth(0, 1, assemble.v);

    /* Nube: mezcla entre el objetivo de este capítulo y el siguiente. */
    const ta = target(A.cloud, time);
    const tb = B === A ? ta : target(B.cloud, time);
    const wave = pulse > 0.001 ? pulse : 0;
    for (let i = 0; i < CLOUD; i++) {
      const i3 = i * 3;
      const x = MathUtils.lerp(ta[i3], tb[i3], tf);
      const y = MathUtils.lerp(ta[i3 + 1], tb[i3 + 1], tf);
      const z = MathUtils.lerp(ta[i3 + 2], tb[i3 + 2], tf);
      const bulge = 1 + wave * 0.16 * Math.sin(i * 0.37 + time * 9);
      pos[i3] = MathUtils.lerp(scatter[i3], x, asm) * bulge;
      pos[i3 + 1] = MathUtils.lerp(scatter[i3 + 1], y, asm) * bulge;
      pos[i3 + 2] = MathUtils.lerp(scatter[i3 + 2], z, asm) * bulge;
    }
    cloudGeo.getAttribute('position').needsUpdate = true;
    pulse *= 0.93;

    /* Forma de los labios: en el capítulo 2 recorre las cuatro formas con el scroll. */
    let shape: Shape;
    if (progress >= 2 && progress < 3) {
      const u = MathUtils.clamp((progress - 2) / 0.8, 0, 1) * (SHAPES.length - 1);
      const i0 = Math.min(SHAPES.length - 2, Math.floor(u));
      const e = u - i0;
      shape = mix(SHAPES[i0], SHAPES[i0 + 1], e * e * (3 - 2 * e));
      const idx = Math.round(u);
      if (idx !== shapeIdx) {
        shapeIdx = idx;
        opts.onShape(idx);
      }
    } else if (progress >= 3 && progress < 5) {
      shape = SHAPES[1];
    } else {
      shape = SHAPES[0];
      if (progress < 1) shape = mix(SHAPES[0], { w: 0.5, open: 0.12, round: 0 }, 0.5 + 0.5 * Math.sin(time * 0.9));
    }
    talkAmt += ((talking ? 1 : 0) - talkAmt) * Math.min(1, dt * 8);
    const wavesOn = A.cloud === 'rings' || B.cloud === 'rings' ? 1 : 0;
    const speech = Math.max(0, Math.sin(time * 15.6)) * (0.55 + 0.45 * Math.sin(time * 5.3) ** 2);
    const autoTalk = progress >= 4.5 && progress < 5.9 ? 0.55 : 0;
    const mouth = Math.max(talkAmt, autoTalk * wavesOn) * speech;
    if (mouth > 0.001) shape = mix(shape, SHAPES[1], MathUtils.clamp(mouth * 1.4, 0, 1));
    lips.set(shape);

    const lOn = val('lipsOn');
    lips.color(GREEN, lOn);
    lips.group.position.set(0, val('lipsY'), val('lipsZ'));
    lips.group.scale.setScalar(val('lipsScale') * (1 + mouth * 0.06));

    /* Candidatos: tres labios flotando; el elegido (o el más parecido) brilla en verde. */
    const cOn = val('cand');
    const lead = progress >= 4 ? chosen : 0;
    cands.forEach((c, i) => {
      const hot = lead === i;
      c.color(hot ? GREEN : BLUE_L, cOn * (hot ? 1 : 0.55));
      const a = (i - 1) * 1.15;
      c.group.position.set(Math.sin(a) * (w / h > 1.1 ? 1.9 : 1.15), 1.55 - Math.abs(i - 1) * 0.25 + Math.sin(time * 0.8 + i) * 0.05, Math.cos(a) * 0.4 + (hot ? 0.5 : 0));
      c.group.scale.setScalar(0.85 * (hot ? 1.2 : 1));
      c.group.rotation.y = -a * 0.6;
    });

    /* Cámara y lado de la escena según el ancho. */
    const wide = w / h > 1.1;
    const shift = wide ? 2.05 : 0;
    const lift = wide ? 0 : 1.05;
    const side = val('side');
    world.position.x = MathUtils.damp(world.position.x, side * shift, 6, dt);
    world.position.y = MathUtils.damp(world.position.y, lift * (side === 0 && progress < 0.5 ? 0.4 : 1), 6, dt);
    world.scale.setScalar(val('scale') * (wide ? 0.92 : 0.7));

    tilt.x = MathUtils.damp(tilt.x, px.y * 0.22, 4, dt);
    tilt.y = MathUtils.damp(tilt.y, px.x * 0.35, 4, dt);
    const yaw = progress >= 1 && progress < 2 ? Math.sin(MathUtils.clamp(progress - 1, 0, 1) * Math.PI * 2) * 0.75 : 0;
    const spin = A.cloud === 'globe' || (B.cloud === 'globe' && tf > 0.5) ? time * 0.22 : 0;
    head.rotation.y = tilt.y + yaw + spin;
    head.rotation.x = tilt.x;

    /* Esferas en órbita. */
    // En pantalla ancha la órbita se aplana hacia los lados: así ninguna esfera cruza al texto.
    const so = val('spheres');
    const rx = wide ? 0.62 : 0.8;
    for (let i = 0; i < ORBS; i++) {
      const o = orbData[i];
      const a = o.a + time * o.s;
      m.position.set(Math.cos(a) * o.r * rx, o.y * 3.2 + Math.sin(a * 2 + i) * 0.2, Math.sin(a) * o.r * 0.5 - 0.6);
      m.scale.setScalar(o.size * 2.2 * so);
      m.updateMatrix();
      orbs.setMatrixAt(i, m.matrix);
    }
    orbs.instanceMatrix.needsUpdate = true;
    if (orbs.instanceColor) orbs.instanceColor.needsUpdate = true;
    orbs.visible = so > 0.02;
    rim.position.x = -3 + Math.sin(time * 0.4) * 1.5;

    pointMat.uniforms.uAlpha.value = 1;
    renderer.render(scene, camera);
  };

  /* ---------- Bucle: continuo con movimiento, por demanda con «reducir movimiento» ---------- */

  let raf = 0;
  let last = performance.now();
  let slow = 0;
  const tick = (now: number) => {
    raf = 0;
    if (disposed) return;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (visible) {
      frame(now / 1000, dt);
      // Si el equipo va lento, baja la resolución en vez de trabarse.
      slow = dt > 0.026 ? slow + 1 : Math.max(0, slow - 1);
      if (slow > 40 && maxDpr > 1) {
        maxDpr = 1;
        renderer.setPixelRatio(1);
        resize();
        slow = 0;
      }
    }
    if (!opts.reducedMotion || pulse > 0.01 || assemble.v < 1) raf = requestAnimationFrame(tick);
  };
  function requestRender() {
    if (!raf && !disposed) {
      last = performance.now();
      raf = requestAnimationFrame(tick);
    }
  }
  requestRender();

  const onVisibility = () => {
    if (!document.hidden) requestRender();
  };
  document.addEventListener('visibilitychange', onVisibility);

  return {
    setProgress: (p) => {
      progress = MathUtils.clamp(p, 0, CH.length - 1 + 0.0001);
      requestRender();
    },
    setChosen: (i) => {
      chosen = i;
      requestRender();
    },
    talk: (until) => {
      talking = true;
      requestRender();
      const done = () => (talking = false);
      void until.then(done, done);
    },
    setVisible: (v) => {
      visible = v && !document.hidden;
      if (visible) requestRender();
    },
    setPalette: (p) => {
      BLUE.set(p.a1);
      BLUE_L.set(p.a1l);
      GREEN.set(p.a2);
      for (let i = 0; i < CLOUD; i++) (i % 9 === 0 ? WHITE : i % 4 === 0 ? BLUE_L : BLUE).toArray(col, i * 3);
      cloudGeo.getAttribute('color').needsUpdate = true;
      for (let i = 0; i < ORBS; i++) orbs.setColorAt(i, i % 4 === 0 ? WHITE : i % 4 === 1 ? GREEN : BLUE);
      if (orbs.instanceColor) orbs.instanceColor.needsUpdate = true;
      lips.refresh();
      cands.forEach((c) => c.refresh());
      requestRender();
    },
    dispose: () => {
      disposed = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      removeEventListener('pointermove', onMove);
      removeEventListener('pointerdown', onDown);
      document.removeEventListener('visibilitychange', onVisibility);
      lips.dispose();
      cands.forEach((c) => c.dispose());
      cloudGeo.dispose();
      pointMat.dispose();
      orbs.geometry.dispose();
      orbMat.dispose();
      orbs.dispose();
      renderer.dispose();
    },
  };
}

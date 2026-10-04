import {
  ACESFilmicToneMapping,
  Color,
  DirectionalLight,
  Group,
  HemisphereLight,
  MathUtils,
  Mesh,
  MeshPhysicalMaterial,
  PCFShadowMap,
  PerspectiveCamera,
  Scene,
  SphereGeometry,
  Vector3,
  WebGLRenderer,
} from 'three';

/**
 * Campo de esferas con física (Verlet + choques) que sigue al scroll:
 * flota en el inicio, cae al suelo, se reordena en forma de LABIOS y despega hacia la cámara.
 * Adaptado del sitio «Gravity»: mismos materiales, constantes y física; la forma final son unos labios.
 */

export interface FieldControl {
  /** Índice de sección en flotante: 0 inicio, 1 caída, 2 labios, 3 despegue. */
  progress: number;
  started: boolean;
  /** Mientras está tapada (pantalla de cuenta), la escena no dibuja. */
  paused?: boolean;
}

export interface Pointer {
  x: number;
  y: number;
  isDown: boolean;
}

export interface GravityField {
  /** Los labios de esferas «hablan» mientras dure la promesa. */
  talk: (until: Promise<unknown>) => void;
  dispose: () => void;
}

type Role = 'pastel' | 'light' | 'medium' | 'deep' | 'glass';
type Palette = Record<Role, Color>;
const ROLES: Role[] = ['pastel', 'light', 'medium', 'deep', 'glass'];

export function getDynamicColors(baseColor: string): Palette {
  const hex = baseColor.toLowerCase();
  if (hex === '#e1fc03') {
    return { pastel: new Color('#FBFFE2'), light: new Color('#EFFE69'), medium: new Color('#E1FC03'), deep: new Color('#B1E200'), glass: new Color('#DCFF32') };
  } else if (hex === '#ffc5c2' || hex === '#ffa19e') {
    return { pastel: new Color('#FFF5F4'), light: new Color('#FFECEB'), medium: new Color('#FFA6B3'), deep: new Color('#FF4D6D'), glass: new Color('#FFA6B3') };
  } else if (hex === '#96e5ff') {
    return { pastel: new Color('#F0F9FF'), light: new Color('#C9F1FF'), medium: new Color('#96E5FF'), deep: new Color('#2BA5FF'), glass: new Color('#98E4FF') };
  } else if (hex === '#2f69ff') {
    return { pastel: new Color('#ECEFFF'), light: new Color('#A8C1FF'), medium: new Color('#2F69FF'), deep: new Color('#0A33BF'), glass: new Color('#4D80FF') };
  }
  const c = new Color(baseColor);
  return {
    pastel: c.clone().offsetHSL(0, -0.15, 0.25),
    light: c.clone().offsetHSL(0, -0.05, 0.12),
    medium: c.clone(),
    deep: c.clone().offsetHSL(0.01, 0.1, -0.12),
    glass: c.clone(),
  };
}

/* ---------- Forma de labios (coordenadas normalizadas: ancho -1..1) ---------- */

// Comisuras un poco hacia arriba: una sonrisa leve.
const mouthLine = (x: number) => 0.06 * x * x - 0.02;
// Mitad de la abertura entre labios; se cierra en las comisuras.
const gap = (x: number) => 0.085 * Math.pow(Math.max(0, 1 - x * x), 0.6);
const upperTop = (x: number) => {
  const ax = Math.abs(x);
  const base = 0.44 * Math.pow(Math.max(0, 1 - Math.pow(ax, 1.5)), 0.9);
  // Arco de Cupido: un valle al centro y dos picos a los lados.
  const bow = (1 - 0.45 * Math.exp(-((x / 0.12) ** 2))) * (1 + 0.16 * Math.exp(-(((ax - 0.32) / 0.16) ** 2)));
  return mouthLine(x) + gap(x) + base * bow;
};
const lowerBottom = (x: number) => mouthLine(x) - gap(x) - 0.52 * Math.pow(Math.max(0, 1 - x * x), 0.65);
/** Los labios se dibujan un poco más anchos que altos, como unos labios reales. */
const STRETCH = 1.2;

/** +1 labio de arriba, -1 labio de abajo, 0 fuera. `margin` aleja los puntos de la abertura. */
const lipSide = (x: number, y: number, margin = 0) => {
  if (Math.abs(x) > 1) return 0;
  const m = mouthLine(x);
  const g = gap(x) + margin;
  if (y >= m + g && y <= upperTop(x)) return 1;
  if (y <= m - g && y >= lowerBottom(x)) return -1;
  return 0;
};

const LIP_BOUNDARY: [number, number][] = (() => {
  const pts: [number, number][] = [];
  for (let i = 0; i <= 80; i++) {
    const x = -1 + (2 * i) / 80;
    pts.push([x, upperTop(x)], [x, lowerBottom(x)], [x, mouthLine(x) + gap(x)], [x, mouthLine(x) - gap(x)]);
  }
  return pts;
})();

const edgeDistance = (x: number, y: number) => {
  let best = Infinity;
  for (const [bx, by] of LIP_BOUNDARY) best = Math.min(best, ((bx - x) * STRETCH) ** 2 + (by - y) ** 2);
  return Math.sqrt(best);
};

/* ---------- Escena ---------- */

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smoothstep = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

interface Ball {
  id: number;
  radius: number;
  mass: number;
  position: Vector3;
  velocity: Vector3;
  meshGroup: Group;
  sphere: Mesh;
  material: MeshPhysicalMaterial;
  role: Role;
  isGlass: boolean;
  visualScale: number;
  shapeTarget: Vector3;
  side: number;
  lipX: number;
}

export function createGravityField(
  container: HTMLElement,
  canvas: HTMLCanvasElement,
  opts: { ballColor: string; control: FieldControl; pointer: Pointer; reducedMotion: boolean; onReady: () => void },
): GravityField {
  const { ballColor, control, pointer: mousePos, onReady } = opts;
  const isMobile = window.innerWidth < 768;

  const scene = new Scene();
  const camera = new PerspectiveCamera(38, container.clientWidth / container.clientHeight, 0.1, 100);
  camera.position.set(0, 0, 11);

  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, isMobile ? 1.75 : 2));
  renderer.setSize(container.clientWidth, container.clientHeight, false);
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFShadowMap;

  const hemiLight = new HemisphereLight(0xffffff, new Color(ballColor), 1.6);
  scene.add(hemiLight);

  const keyLight = new DirectionalLight(0xffffff, 1.4);
  keyLight.position.set(-6, 10, 8);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.width = isMobile ? 1024 : 2048;
  keyLight.shadow.mapSize.height = isMobile ? 1024 : 2048;
  keyLight.shadow.camera.near = 0.5;
  keyLight.shadow.camera.far = 30;
  keyLight.shadow.camera.left = -8;
  keyLight.shadow.camera.right = 8;
  keyLight.shadow.camera.top = 8;
  keyLight.shadow.camera.bottom = -8;
  keyLight.shadow.bias = -0.0003;
  keyLight.shadow.radius = 12.0;
  scene.add(keyLight);

  const rimLight = new DirectionalLight(0xffffff, 1.25);
  rimLight.position.set(8, 7, -8);
  scene.add(rimLight);

  const frontLight = new DirectionalLight(0xffffff, 0.4);
  frontLight.position.set(0, 0, 11);
  scene.add(frontLight);

  const sideBounceLight = new DirectionalLight(0xffffff, 0.3);
  sideBounceLight.position.set(-9, -2, 4);
  scene.add(sideBounceLight);

  let viewportWidth = 10;
  let viewportHeight = 6;
  const updateFrustumBounds = () => {
    const fovRad = MathUtils.degToRad(camera.fov);
    viewportHeight = 2 * Math.tan(fovRad / 2) * camera.position.z;
    viewportWidth = viewportHeight * (container.clientWidth / container.clientHeight);
  };
  updateFrustumBounds();

  const ballCount = isMobile ? 70 : 96;

  const palette = getDynamicColors(ballColor);
  // Paletas del scroll: color del inicio → lima (caída) → rosa (labios).
  const palHero = palette;
  const palLime = getDynamicColors('#E1FC03');
  // Rosa de labios, más intenso que el rosa pastel: la forma se lee desde lejos.
  const palPink: Palette = {
    pastel: new Color('#FFC4D0'), light: new Color('#FF8FA6'), medium: new Color('#FF4D6D'), deep: new Color('#D81B48'), glass: new Color('#FF7A93'),
  };
  const curPal: Palette = { pastel: new Color(), light: new Color(), medium: new Color(), deep: new Color(), glass: new Color() };

  const segments = isMobile ? 32 : 48;
  const sphereGeometry = new SphereGeometry(1, segments, segments);
  const balls: Ball[] = [];
  for (let i = 0; i < ballCount; i++) {
    let radius = 0.33;
    const rand = Math.random();
    if (rand < 0.3) radius = 0.27 + Math.random() * 0.12;
    else if (rand < 0.8) radius = 0.42 + Math.random() * 0.18;
    else radius = 0.66 + Math.random() * 0.21;

    const mass = Math.pow(radius, 3);
    let chosenColor = palette.medium;
    let sphereMat: MeshPhysicalMaterial;
    let role: Role = 'medium';
    const isGlass = Math.random() < 0.22;

    if (isGlass) {
      sphereMat = new MeshPhysicalMaterial({
        color: palette.glass, roughness: 0.08, metalness: 0.0,
        clearcoat: 1.0, clearcoatRoughness: 0.03, transmission: 0.95,
        ior: 1.485, thickness: 2.2,
        specularColor: new Color('#ffffff'), specularIntensity: 1.0,
        attenuationColor: palette.pastel, attenuationDistance: 1.0,
        emissive: palette.glass, emissiveIntensity: 0.12,
        transparent: true,
      });
      role = 'glass';
    } else {
      const colorRand = Math.random();
      if (colorRand < 0.25) { chosenColor = palette.pastel; role = 'pastel'; }
      else if (colorRand < 0.55) { chosenColor = palette.light; role = 'light'; }
      else if (colorRand < 0.85) { chosenColor = palette.medium; role = 'medium'; }
      else { chosenColor = palette.deep; role = 'deep'; }
      sphereMat = new MeshPhysicalMaterial({
        color: chosenColor, roughness: 0.44, metalness: 0.0,
        clearcoat: 0.24, clearcoatRoughness: 0.35,
        emissive: chosenColor, emissiveIntensity: 0.08,
        transparent: true,
      });
    }

    const group = new Group();
    const sphereMesh = new Mesh(sphereGeometry, sphereMat);
    sphereMesh.scale.setScalar(radius);
    sphereMesh.castShadow = true;
    sphereMesh.receiveShadow = true;
    group.add(sphereMesh);
    scene.add(group);

    balls.push({
      id: i, radius, mass,
      position: new Vector3(),
      velocity: new Vector3(),
      meshGroup: group, sphere: sphereMesh, material: sphereMat, role, isGlass,
      visualScale: radius,
      shapeTarget: new Vector3(),
      side: 1,
      lipX: 0,
    });
  }

  const meanRadius = balls.reduce((sum, b) => sum + b.radius, 0) / balls.length;
  let shapeScale = 1;
  let shapeS = 1;
  let portraitShape = false;

  /**
   * Reparte un punto por esfera dentro de los labios: muestreo por rechazo, unas pasadas de relajación para
   * que queden parejos, y las esferas grandes van al centro de cada labio para que el borde se vea nítido.
   */
  const assignLipTargets = () => {
    // En vertical (teléfono) los labios suben un poco para no quedar bajo el texto de abajo.
    const portrait = viewportWidth < viewportHeight * 0.8;
    const S = Math.min(viewportWidth * (portrait ? 0.34 : 0.28), viewportHeight * 0.42);
    // En vertical los labios se hacen más altos que anchos de lo normal para que se lean bien en el teléfono.
    const SY = portrait ? Math.min(viewportWidth * 0.5, viewportHeight * 0.34) : S;
    portraitShape = portrait;
    shapeS = SY;
    const baseCY = viewportHeight * (portrait ? 0.09 : -0.03);
    const area = 1.26 * STRETCH;
    const rt = Math.sqrt((area * 0.95) / (balls.length * Math.PI));
    const pts: { x: number; y: number; side: number }[] = [];
    while (pts.length < balls.length) {
      const x = Math.random() * 2 - 1;
      const y = Math.random() * 1.2 - 0.66;
      const side = lipSide(x, y, rt * 0.45);
      if (side) pts.push({ x, y, side });
    }
    for (let it = 0; it < 28; it++) {
      for (let i = 0; i < pts.length; i++) {
        for (let j = i + 1; j < pts.length; j++) {
          const dx = (pts[j].x - pts[i].x) * STRETCH;
          const dy = pts[j].y - pts[i].y;
          const d = Math.hypot(dx, dy) || 1e-6;
          if (d < rt * 2) {
            const push = (rt * 2 - d) * 0.25;
            const ux = ((dx / d) * push) / STRETCH;
            const uy = (dy / d) * push;
            for (const [p, sx, sy] of [[pts[i], -ux, -uy], [pts[j], ux, uy]] as const) {
              const nx = p.x + sx;
              const ny = p.y + sy;
              if (lipSide(nx, ny, rt * 0.45) === p.side) {
                p.x = nx;
                p.y = ny;
              }
            }
          }
        }
      }
    }
    const byDepth = pts.map((p) => ({ ...p, depth: edgeDistance(p.x, p.y) })).sort((a, b) => b.depth - a.depth);
    const byRadius = [...balls].sort((a, b) => b.radius - a.radius);
    shapeScale = Math.max(0.12, Math.min(1, (rt * Math.sqrt(S * SY)) / meanRadius));
    byRadius.forEach((b, i) => {
      const p = byDepth[i];
      b.side = p.side;
      b.lipX = p.x;
      b.shapeTarget.set(p.x * S * STRETCH, p.y * SY + baseCY, (Math.random() - 0.5) * 0.2);
    });
  };
  assignLipTargets();

  const scatterFar = (withInwardVelocity: boolean) => {
    const R = Math.max(viewportWidth, viewportHeight) * 1.5;
    for (const b of balls) {
      const a = Math.random() * Math.PI * 2;
      const px = Math.cos(a) * R * 1.25;
      const py = Math.sin(a) * R * 0.85;
      const pz = (Math.random() - 0.5) * 4;
      b.position.set(px, py, pz);
      b.meshGroup.position.copy(b.position);
      if (withInwardVelocity) b.velocity.set(-px, -py, -pz).normalize().multiplyScalar(0.08 + Math.random() * 0.05);
      else b.velocity.set(0, 0, 0);
    }
  };

  const placeInCluster = () => {
    for (const b of balls) {
      b.position.set((Math.random() - 0.5) * viewportWidth * 0.5, (Math.random() - 0.5) * viewportHeight * 0.3, (Math.random() - 0.5) * 2);
      b.meshGroup.position.copy(b.position);
      b.velocity.set(0, 0, 0);
    }
  };

  if (opts.reducedMotion) placeInCluster();
  else scatterFar(false);

  const params = {
    gravity: 0, rebound: -0.3,
    mouseRepelForce: 0.05, mouseRepelRadius: 4.4,
    damping: 0.91, centerAttractForce: 0.0035, bounciness: 0.02,
  };

  const mouseProjVec = new Vector3();
  const mouseWorld3D = new Vector3();
  const updateMouse3D = () => {
    mouseProjVec.set(mousePos.x, mousePos.y, 0.5);
    mouseProjVec.unproject(camera);
    const dir = mouseProjVec.sub(camera.position).normalize();
    const distance = -camera.position.z / dir.z;
    mouseWorld3D.copy(camera.position).add(dir.multiplyScalar(distance));
  };

  let animationFrameId = 0;
  let localStarted = false;
  let entranceStart = 0;
  let reportedReady = false;
  let talking = 0;
  let talkStart = 0;
  let talkAmt = 0;

  // Paso fijo de 1/60 s: la física avanza igual en pantallas de 30, 60 o 120 Hz.
  const STEP = 1 / 60;
  const MAX_STEPS = 5;
  let simTime = 0;
  let acc = 0;
  let lastNow = performance.now();

  const diffVec = new Vector3();
  const collideDiff = new Vector3();
  const relVel = new Vector3();
  const deltaPos = new Vector3();
  const rotAxis = new Vector3();
  const prevMouseWorld = new Vector3();

  const step = (time: number, mouseSpeed: number) => {
    const progress = control.progress;
    const heroF = 1 - smoothstep(0.3, 0.8, progress);
    const dropRaw = smoothstep(0.4, 0.95, progress);
    const flyF = smoothstep(2.7, 3.45, progress);
    const shapeF = smoothstep(1.4, 2.05, progress) * (1 - (portraitShape ? smoothstep(2.8, 3.1, progress) : smoothstep(2.55, 3.0, progress)));
    const dropF = dropRaw * (1 - smoothstep(1.25, 1.75, progress));

    // Los labios «hablan»: se abren y cierran en sílabas mientras suena la voz.
    talkAmt += ((talking ? 1 : 0) - talkAmt) * 0.15;
    const tt = time - talkStart;
    const syllable = talkAmt > 0.001 ? Math.max(0, Math.sin(tt * Math.PI * 2 * 2.6)) * (0.55 + 0.45 * Math.sin(tt * 5.3) ** 2) : 0;
    const mouthOpen = talkAmt * syllable;

    const entranceT = easeOutCubic(clamp01((time - entranceStart) / 2.2));
    const attractionBoost = lerp(7.5, 1, entranceT);
    const isMouseInteracting = Math.abs(mousePos.x) < 0.99 || Math.abs(mousePos.y) < 0.99;

    let damping = params.damping;
    damping = lerp(damping, 0.992, dropF);
    damping = lerp(damping, 0.9, shapeF);
    damping = lerp(damping, 0.985, flyF);

    const clusterActive = Math.max(heroF, entranceT < 1 ? 1 : 0);

    for (const b of balls) {
      if (heroF > 0.01) {
        b.velocity.x += Math.sin(time * 0.4 + b.id * 1.5) * 0.0004 * b.radius * heroF;
        b.velocity.y += Math.cos(time * 0.5 + b.id * 1.2) * 0.0004 * b.radius * heroF;
        b.velocity.z += Math.sin(time * 0.35 + b.id) * 0.0001 * heroF;
      }

      const clusterStrength = params.centerAttractForce * attractionBoost * clusterActive;
      if (clusterStrength > 0.00001) {
        b.velocity.x += (0 - b.position.x) * clusterStrength * 0.38;
        b.velocity.y += (0 - b.position.y) * clusterStrength * 1.85;
        b.velocity.z += (0 - b.position.z) * clusterStrength * 1.8;
      }

      if (dropF > 0.001) b.velocity.y -= 0.011 * dropF;

      if (shapeF > 0.001) {
        const k = 0.06 * shapeF;
        const open = mouthOpen * shapeS * (b.side > 0 ? 0.1 : 0.24) * (1 - b.lipX * b.lipX) * b.side;
        b.velocity.x += (b.shapeTarget.x - b.position.x) * k;
        b.velocity.y += (b.shapeTarget.y + open - b.position.y) * k;
        b.velocity.z += (b.shapeTarget.z - b.position.z) * k;
      }

      if (flyF > 0.001) {
        const stagger = (b.id * 0.6180339887) % 1;
        const local = smoothstep(stagger * 0.55, stagger * 0.55 + 0.45, flyF);
        b.velocity.z += 0.05 * local;
        b.velocity.x += b.position.x * 0.006 * local;
        b.velocity.y += b.position.y * 0.006 * local;
      }

      if (isMouseInteracting) {
        diffVec.subVectors(b.position, mouseWorld3D);
        const rawDist = diffVec.length();
        const down = mousePos.isDown;
        const activeRepelRadius = down ? params.mouseRepelRadius * 1.4 : params.mouseRepelRadius;
        const activeRepelForce = down ? params.mouseRepelForce * 1.7 : params.mouseRepelForce;
        if (rawDist < activeRepelRadius && rawDist > 0.0001) {
          const ratio = rawDist / activeRepelRadius;
          const smoothFactor = 1.0 - ratio * ratio * (3.0 - 2.0 * ratio);
          const speedBoost = 1 + mouseSpeed * 3.2;
          const push = smoothFactor * activeRepelForce * speedBoost;
          diffVec.normalize();
          diffVec.z *= 0.12;
          diffVec.normalize();
          b.velocity.addScaledVector(diffVec, push);
        }
      }

      b.velocity.multiplyScalar(damping);
      b.position.addScaledVector(b.velocity, 1);

      // En forma de labios los tamaños se parecen más entre sí: el borde se lee mejor.
      const shaped = shapeScale * (meanRadius + (b.radius - meanRadius) * 0.35);
      const targetVis = lerp(b.radius, shaped, shapeF);
      b.visualScale += (targetVis - b.visualScale) * 0.12;
    }

    // Choques entre pares (casi apagados en forma de labios para que cada esfera llegue a su lugar).
    const collideScale = 0.28 * (1 - 0.93 * shapeF) * (1 - flyF);
    for (let sub = 0; sub < 4; sub++) {
      for (let i = 0; i < balls.length; i++) {
        for (let j = i + 1; j < balls.length; j++) {
          const b1 = balls[i];
          const b2 = balls[j];
          collideDiff.subVectors(b2.position, b1.position);
          const dist = collideDiff.length();
          const minDist = b1.visualScale + b2.visualScale;
          if (dist < minDist && dist > 0.001) {
            const overlap = minDist - dist;
            collideDiff.multiplyScalar(1 / dist);
            const totalMass = b1.mass + b2.mass;
            b1.position.addScaledVector(collideDiff, -overlap * (b2.mass / totalMass) * collideScale);
            b2.position.addScaledVector(collideDiff, overlap * (b1.mass / totalMass) * collideScale);
            relVel.subVectors(b2.velocity, b1.velocity);
            const velAlongNormal = relVel.dot(collideDiff);
            if (velAlongNormal < -0.0001) {
              const impulse = (-(1 + params.bounciness) * velAlongNormal) / (1 / b1.mass + 1 / b2.mass);
              b1.velocity.addScaledVector(collideDiff, -impulse / b1.mass);
              b2.velocity.addScaledVector(collideDiff, impulse / b2.mass);
            }
          }
        }
      }
    }

    // Paredes del viewport y piso que rebota.
    const xBound = viewportWidth / 2 - 0.2;
    const topY = viewportHeight / 2 - 0.05;
    const floorY = -viewportHeight / 2 + 0.05;
    const zBound = 2.0;
    const restitution = 0.3 + 0.35 * dropF;
    const contain = flyF < 0.5;
    const zContain = flyF < 0.02;
    for (const b of balls) {
      const r = b.visualScale;
      if (contain) {
        if (b.position.x < -xBound - r) { b.position.x = -xBound - r; b.velocity.x *= params.rebound; }
        else if (b.position.x > xBound + r) { b.position.x = xBound + r; b.velocity.x *= params.rebound; }
        if (b.position.y - r < floorY) {
          b.position.y = floorY + r;
          if (b.velocity.y < 0) b.velocity.y = -b.velocity.y * restitution;
          if (dropF > 0.3) { b.velocity.x *= 0.86; b.velocity.z *= 0.86; }
        }
        if (b.position.y + r > topY) {
          b.position.y = topY - r;
          if (b.velocity.y > 0) b.velocity.y *= params.rebound;
        }
      }
      if (zContain) {
        if (b.position.z < -zBound) { b.position.z = -zBound; b.velocity.z *= params.rebound; }
        else if (b.position.z > zBound) { b.position.z = zBound; b.velocity.z *= params.rebound; }
      }
    }
  };

  const simulateAndRender = (now: number) => {
    animationFrameId = requestAnimationFrame(simulateAndRender);
    if (control.paused && reportedReady) {
      lastNow = now;
      return;
    }
    const dt = Math.min(0.25, Math.max(0, (now - lastNow) / 1000));
    lastNow = now;
    updateMouse3D();

    if (control.started && !localStarted) {
      localStarted = true;
      entranceStart = opts.reducedMotion ? simTime - 10 : simTime;
      if (!opts.reducedMotion) scatterFar(true);
    }

    if (!localStarted) {
      renderer.render(scene, camera);
      if (!reportedReady) {
        reportedReady = true;
        onReady();
      }
      return;
    }

    // Ya despegaron y el lienzo está oculto bajo la parte oscura: no gastar batería.
    if (control.progress > 4.1) {
      acc = 0;
      return;
    }

    const isMouseInteracting = Math.abs(mousePos.x) < 0.99 || Math.abs(mousePos.y) < 0.99;
    const frameMouse = isMouseInteracting ? Math.min(3, mouseWorld3D.distanceTo(prevMouseWorld)) : 0;
    prevMouseWorld.copy(mouseWorld3D);

    acc += dt;
    const steps = Math.min(MAX_STEPS, Math.floor(acc / STEP));
    for (let i = 0; i < steps; i++) {
      simTime += STEP;
      step(simTime, frameMouse / steps);
    }
    acc = steps === MAX_STEPS ? 0 : acc - steps * STEP;

    const progress = control.progress;
    const flyF = smoothstep(2.7, 3.45, progress);
    const bLime = smoothstep(0.55, 1.05, progress);
    const bPink = smoothstep(1.4, 1.95, progress);
    for (const role of ROLES) curPal[role].copy(palHero[role]).lerp(palLime[role], bLime).lerp(palPink[role], bPink);
    hemiLight.groundColor.copy(curPal.medium);
    const camZ = camera.position.z;

    for (const b of balls) {
      const c = b.isGlass ? curPal.glass : curPal[b.role];
      b.material.color.copy(c);
      b.material.emissive.copy(c);
      b.material.opacity = flyF > 0.001 ? 1 - smoothstep(camZ - 2.6, camZ - 0.3, b.position.z) : 1;
      b.sphere.scale.setScalar(b.visualScale);
      deltaPos.copy(b.position).sub(b.meshGroup.position);
      if (deltaPos.lengthSq() > 0.000001) {
        rotAxis.set(deltaPos.y, -deltaPos.x, 0).normalize();
        b.meshGroup.rotateOnWorldAxis(rotAxis, (deltaPos.length() / b.radius) * 0.95);
      }
      b.meshGroup.position.copy(b.position);
    }

    renderer.render(scene, camera);
  };

  animationFrameId = requestAnimationFrame(simulateAndRender);

  const handleResize = () => {
    const width = container.clientWidth;
    const height = container.clientHeight;
    if (!width || !height) return;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
    updateFrustumBounds();
    assignLipTargets();
  };
  const ro = new ResizeObserver(handleResize);
  ro.observe(container);

  return {
    talk: (until) => {
      talking++;
      if (talking === 1) talkStart = simTime;
      void until.finally(() => (talking = Math.max(0, talking - 1)));
    },
    dispose: () => {
      cancelAnimationFrame(animationFrameId);
      ro.disconnect();
      sphereGeometry.dispose();
      for (const b of balls) b.material.dispose();
      renderer.dispose();
    },
  };
}

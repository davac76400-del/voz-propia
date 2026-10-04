import type { Palette } from '../components/theme';
import { AdditiveBlending, BufferAttribute, BufferGeometry, Color, OrthographicCamera, Points, Scene, ShaderMaterial, WebGLRenderer } from 'three';

/** Figura que forman los puntos: un texto (cifras) o un dibujo. */
export type Shape = { text: string } | { draw: 'lips' | 'heart' | 'wave' };

export interface Field {
  setShape: (i: number) => void;
  setVisible: (v: boolean) => void;
  setPalette: (p: Palette) => void;
  dispose: () => void;
}

const paletteColors = (p: Palette) => [p.a1, p.a1, p.a1, p.a1m, p.a1l, '#F4F7FA', p.a2].map((c) => new Color(c));

/* ---------- Muestreo: se dibuja la figura en un lienzo oculto y se toman sus píxeles ---------- */

function drawShape(ctx: CanvasRenderingContext2D, s: Shape, w: number, h: number) {
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#fff';
  ctx.strokeStyle = '#fff';
  if ('text' in s) {
    let size = h * 0.92;
    ctx.font = `400 ${size}px Anton, Impact, sans-serif`;
    const tw = ctx.measureText(s.text).width;
    if (tw > w * 0.96) size *= (w * 0.96) / tw;
    ctx.font = `400 ${size}px Anton, Impact, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(s.text, w / 2, h / 2 + size * 0.04);
    return;
  }
  const cx = w / 2;
  const cy = h / 2;
  const S = Math.min(w, h * 1.9);
  if (s.draw === 'lips') {
    const W = S * 0.86;
    const H = W * 0.42;
    ctx.beginPath();
    ctx.moveTo(cx - W / 2, cy);
    ctx.bezierCurveTo(cx - W * 0.3, cy - H * 0.62, cx - W * 0.13, cy - H * 0.66, cx, cy - H * 0.34);
    ctx.bezierCurveTo(cx + W * 0.13, cy - H * 0.66, cx + W * 0.3, cy - H * 0.62, cx + W / 2, cy);
    ctx.bezierCurveTo(cx + W * 0.28, cy + H * 0.82, cx - W * 0.28, cy + H * 0.82, cx - W / 2, cy);
    ctx.closePath();
    ctx.fill();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    ctx.ellipse(cx, cy + H * 0.02, W * 0.4, H * 0.1, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
  } else if (s.draw === 'heart') {
    const r = Math.min(w, h) * 0.44;
    ctx.beginPath();
    ctx.moveTo(cx, cy + r);
    ctx.bezierCurveTo(cx - r * 2.1, cy - r * 0.2, cx - r * 0.9, cy - r * 1.55, cx, cy - r * 0.55);
    ctx.bezierCurveTo(cx + r * 0.9, cy - r * 1.55, cx + r * 2.1, cy - r * 0.2, cx, cy + r);
    ctx.fill();
  } else {
    const bars = 23;
    const bw = (w * 0.9) / bars;
    for (let i = 0; i < bars; i++) {
      const k = Math.abs(i - (bars - 1) / 2) / ((bars - 1) / 2);
      const bh = h * (0.12 + 0.8 * Math.abs(Math.sin(i * 1.7)) * (1 - k * 0.75));
      const x = w * 0.05 + i * bw + bw * 0.18;
      ctx.beginPath();
      ctx.roundRect(x, cy - bh / 2, bw * 0.64, bh, bw * 0.32);
      ctx.fill();
    }
  }
}

function sample(s: Shape, w: number, h: number, want: number): Float32Array {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  drawShape(ctx, s, c.width, c.height);
  const data = ctx.getImageData(0, 0, c.width, c.height).data;
  let filled = 0;
  for (let i = 3; i < data.length; i += 16) if (data[i] > 128) filled++;
  const step = Math.max(2, Math.round(Math.sqrt((filled * 4) / want)));
  const pts: number[] = [];
  for (let y = 0; y < c.height; y += step) {
    for (let x = 0; x < c.width; x += step) if (data[(y * c.width + x) * 4 + 3] > 128) pts.push(x, y);
  }
  return Float32Array.from(pts);
}

/* ---------- Campo ---------- */

export function createField(box: HTMLElement, canvas: HTMLCanvasElement, shapes: Shape[], opts: { reducedMotion: boolean; palette: Palette }): Field {
  let PALETTE = paletteColors(opts.palette);
  let colors = new Float32Array(0);
  const renderer = new WebGLRenderer({ canvas, antialias: false, alpha: true, powerPreference: 'high-performance' });
  let dpr = Math.min(devicePixelRatio || 1, 1.75);
  renderer.setPixelRatio(dpr);
  renderer.setClearColor(0x000000, 0);
  const scene = new Scene();
  const camera = new OrthographicCamera(0, 1, 0, 1, -10, 10);

  let w = 1;
  let h = 1;
  let N = 0;
  let pos = new Float32Array(0);
  let vel = new Float32Array(0);
  let home = new Float32Array(0);
  let seed = new Float32Array(0);
  let dust = new Uint8Array(0);
  let targets: Float32Array[] = [];
  let shapeIdx = 0;

  const geo = new BufferGeometry();
  const mat = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    uniforms: { uDpr: { value: dpr } },
    vertexShader: `
      attribute float size; attribute vec3 color; varying vec3 vColor; uniform float uDpr;
      void main(){ vColor = color; gl_PointSize = size * uDpr; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `
      varying vec3 vColor;
      void main(){ float d = length(gl_PointCoord - 0.5); if (d > 0.5) discard;
        float a = smoothstep(0.5, 0.05, d); gl_FragColor = vec4(vColor, a * a); }`,
  });
  const points = new Points(geo, mat);
  points.frustumCulled = false;
  scene.add(points);

  /** Zona donde se dibuja la figura: a la derecha en pantalla ancha, arriba en el teléfono. */
  const region = () => (w >= 900 ? { x: w * 0.5, y: h * 0.16, w: w * 0.44, h: h * 0.68 } : { x: w * 0.06, y: h * 0.1, w: w * 0.88, h: h * 0.34 });

  const build = () => {
    w = Math.max(1, box.clientWidth);
    h = Math.max(1, box.clientHeight);
    renderer.setSize(w, h, false);
    camera.right = w;
    camera.bottom = h;
    camera.updateProjectionMatrix();

    const want = w >= 900 ? 2600 : 1500;
    const r = region();
    targets = shapes.map((s) => {
      const p = sample(s, r.w, r.h, want * 0.84);
      for (let i = 0; i < p.length; i += 2) {
        p[i] += r.x;
        p[i + 1] += r.y;
      }
      return p;
    });

    if (N !== want) {
      N = want;
      pos = new Float32Array(N * 3);
      vel = new Float32Array(N * 2);
      home = new Float32Array(N * 2);
      seed = new Float32Array(N);
      dust = new Uint8Array(N);
      const col = new Float32Array(N * 3);
      colors = col;
      const size = new Float32Array(N);
      for (let i = 0; i < N; i++) {
        pos[i * 3] = Math.random() * w;
        pos[i * 3 + 1] = Math.random() * h;
        seed[i] = Math.random();
        PALETTE[i % PALETTE.length].toArray(col, i * 3);
        size[i] = (w >= 900 ? 2.4 : 2.1) + (i % 5) * 0.55;
      }
      geo.setAttribute('position', new BufferAttribute(pos, 3));
      geo.setAttribute('color', new BufferAttribute(col, 3));
      geo.setAttribute('size', new BufferAttribute(size, 1));
    }
    assign();
  };

  /** Reparte los puntos en la figura actual; los que sobran flotan como polvo por toda la pantalla. */
  const assign = () => {
    const t = targets[shapeIdx];
    const m = t.length / 2;
    const used = Math.min(N, Math.round(N * 0.84));
    for (let i = 0; i < N; i++) {
      if (i < used && m) {
        const j = Math.floor(((i * 7919) % used) * (m / used));
        home[i * 2] = t[j * 2] + (seed[i] - 0.5) * 3;
        home[i * 2 + 1] = t[j * 2 + 1] + (seed[(i * 31) % N] - 0.5) * 3;
        dust[i] = 0;
      } else {
        dust[i] = 1;
        home[i * 2] = seed[i] * w;
        home[i * 2 + 1] = seed[(i * 17) % N] * h;
      }
    }
    if (opts.reducedMotion) {
      for (let i = 0; i < N; i++) {
        pos[i * 3] = home[i * 2];
        pos[i * 3 + 1] = home[i * 2 + 1];
      }
    }
    wake();
  };

  /* ---------- Puntero: los puntos van hacia el mouse o el dedo; al soltar, salen disparados ---------- */

  const ptr = { x: -9999, y: -9999, on: false, down: false };
  let shock = { x: 0, y: 0, t: -1 };
  const rect = () => canvas.getBoundingClientRect();
  const onMove = (e: PointerEvent) => {
    const r = rect();
    ptr.x = e.clientX - r.left;
    ptr.y = e.clientY - r.top;
    ptr.on = true;
    wake();
  };
  const onDown = (e: PointerEvent) => {
    if ((e.target as Element).closest('button, a, input, [role="tab"]')) return;
    onMove(e);
    ptr.down = true;
    document.documentElement.classList.add('a-drag');
  };
  const onUp = (e: PointerEvent) => {
    if (ptr.down) shock = { x: ptr.x, y: ptr.y, t: performance.now() };
    ptr.down = false;
    document.documentElement.classList.remove('a-drag');
    if (e.pointerType !== 'mouse') ptr.on = false;
    wake();
  };
  const onLeave = () => {
    ptr.on = false;
    ptr.down = false;
    document.documentElement.classList.remove('a-drag');
  };
  addEventListener('pointermove', onMove, { passive: true });
  addEventListener('pointerdown', onDown, { passive: true });
  addEventListener('pointerup', onUp, { passive: true });
  addEventListener('pointercancel', onLeave, { passive: true });
  document.documentElement.addEventListener('pointerleave', onLeave);

  /* ---------- Física: resorte hacia su lugar + atracción del puntero ---------- */

  let raf = 0;
  let last = performance.now();
  let visible = true;
  let disposed = false;
  let calm = 0;
  let slow = 0;

  const step = (now: number) => {
    raf = 0;
    if (disposed || !visible) return;
    const dt = Math.min(0.033, (now - last) / 1000);
    last = now;
    const k = 60 * dt;
    const t = now / 1000;
    const R = (w >= 900 ? 190 : 130) * (ptr.down ? 1.7 : 1);
    const pull = ptr.down ? 2.6 : 1.1;
    const sAge = shock.t < 0 ? 99 : (now - shock.t) / 1000;
    const sR = sAge * 900;
    let energy = 0;

    for (let i = 0; i < N; i++) {
      const i3 = i * 3;
      const i2 = i * 2;
      let x = pos[i3];
      let y = pos[i3 + 1];
      const drift = dust[i] ? 14 : 2.2;
      const hx = home[i2] + Math.sin(t * 0.7 + seed[i] * 40) * drift;
      const hy = home[i2 + 1] + Math.cos(t * 0.6 + seed[i] * 30) * drift;
      let vx = vel[i2] + (hx - x) * 0.022 * k;
      let vy = vel[i2 + 1] + (hy - y) * 0.022 * k;

      if (ptr.on) {
        const dx = ptr.x - x;
        const dy = ptr.y - y;
        const d2 = dx * dx + dy * dy;
        if (d2 < R * R && d2 > 1) {
          const d = Math.sqrt(d2);
          const f = (1 - d / R) * pull * k;
          vx += (dx / d) * f - (dy / d) * f * 0.55;
          vy += (dy / d) * f + (dx / d) * f * 0.55;
        }
      }
      if (sAge < 0.6) {
        const dx = x - shock.x;
        const dy = y - shock.y;
        const d = Math.sqrt(dx * dx + dy * dy) || 1;
        const band = Math.abs(d - sR);
        if (band < 70) {
          const f = (1 - band / 70) * 9 * (1 - sAge / 0.6) * k;
          vx += (dx / d) * f;
          vy += (dy / d) * f;
        }
      }

      vx *= Math.pow(0.86, k);
      vy *= Math.pow(0.86, k);
      x += vx * k;
      y += vy * k;
      vel[i2] = vx;
      vel[i2 + 1] = vy;
      pos[i3] = x;
      pos[i3 + 1] = y;
      energy += Math.abs(vx) + Math.abs(vy);
    }
    geo.getAttribute('position').needsUpdate = true;
    renderer.render(scene, camera);

    // Si el equipo va lento, baja la resolución en vez de trabarse.
    slow = dt > 0.026 ? slow + 1 : Math.max(0, slow - 1);
    if (slow > 40 && dpr > 1) {
      dpr = 1;
      renderer.setPixelRatio(1);
      mat.uniforms.uDpr.value = 1;
      renderer.setSize(w, h, false);
      slow = 0;
    }

    // Con «reducir movimiento» se detiene en cuanto todo queda en su lugar.
    calm = energy / Math.max(1, N) < 0.02 ? calm + 1 : 0;
    if (!opts.reducedMotion || calm < 20 || ptr.down) raf = requestAnimationFrame(step);
  };

  function wake() {
    if (!raf && !disposed && visible) {
      last = performance.now();
      raf = requestAnimationFrame(step);
    }
  }

  // La barra del navegador del teléfono cambia el alto al hacer scroll: eso no vuelve a dibujar las figuras.
  let resizeT = 0;
  const ro = new ResizeObserver(() => {
    const nw = box.clientWidth;
    const nh = box.clientHeight;
    if (N && nw === w && Math.abs(nh - h) < 160) {
      h = Math.max(1, nh);
      renderer.setSize(w, h, false);
      camera.bottom = h;
      camera.updateProjectionMatrix();
      return;
    }
    clearTimeout(resizeT);
    resizeT = window.setTimeout(build, N ? 180 : 0);
  });
  ro.observe(box);
  const onVis = () => {
    visible = !document.hidden;
    wake();
  };
  document.addEventListener('visibilitychange', onVis);

  void document.fonts.load('400 120px Anton').finally(() => {
    if (!disposed && N) build();
  });

  return {
    setShape: (i) => {
      if (i === shapeIdx || i < 0 || i >= shapes.length) return;
      shapeIdx = i;
      assign();
    },
    setVisible: (v) => {
      visible = v && !document.hidden;
      wake();
    },
    setPalette: (p) => {
      PALETTE = paletteColors(p);
      for (let i = 0; i < N; i++) PALETTE[i % PALETTE.length].toArray(colors, i * 3);
      geo.getAttribute('color').needsUpdate = true;
      wake();
    },
    dispose: () => {
      disposed = true;
      cancelAnimationFrame(raf);
      clearTimeout(resizeT);
      ro.disconnect();
      removeEventListener('pointermove', onMove);
      removeEventListener('pointerdown', onDown);
      removeEventListener('pointerup', onUp);
      removeEventListener('pointercancel', onLeave);
      document.documentElement.removeEventListener('pointerleave', onLeave);
      document.removeEventListener('visibilitychange', onVis);
      document.documentElement.classList.remove('a-drag');
      geo.dispose();
      mat.dispose();
      renderer.dispose();
    },
  };
}

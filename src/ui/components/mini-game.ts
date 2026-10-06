/**
 * Minijuego para la espera del análisis: atrapa las gotas de luz verdes con la barra, esquiva las rojas.
 * No guarda nada (ni puntos ni récord) y se detiene al llamarse a `stop()`.
 */

const W = 300;
const H = 360;
const GREEN = '#3df2a0';
const RED = '#ff4d6d';

interface Drop {
  x: number;
  y: number;
  r: number;
  v: number;
  bad: boolean;
}

export function startMiniGame(host: HTMLElement): () => void {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  host.innerHTML = `<canvas class="minigame__cv" width="${W}" height="${H}" aria-label="Minijuego: mueve la barra para atrapar las gotas verdes"></canvas><p class="minigame__hint">Mientras analizamos: atrapa las gotas verdes, esquiva las rojas.</p>`;
  const cv = host.querySelector<HTMLCanvasElement>('canvas')!;
  const ctx = cv.getContext('2d')!;

  let bar = W / 2;
  let target = bar;
  let drops: Drop[] = [];
  let sparks: { x: number; y: number; vx: number; vy: number; life: number; c: string }[] = [];
  let score = 0;
  let combo = 0;
  let lives = 3;
  let t = 0;
  let spawn = 0;
  let over = 0;
  let raf = 0;
  let last = performance.now();

  const reset = () => {
    drops = [];
    sparks = [];
    score = 0;
    combo = 0;
    lives = 3;
    t = 0;
    over = 0;
  };

  const toX = (clientX: number) => {
    const b = cv.getBoundingClientRect();
    target = Math.min(W - 30, Math.max(30, ((clientX - b.left) / b.width) * W));
  };
  const onMove = (e: PointerEvent) => toX(e.clientX);
  const onDown = (e: PointerEvent) => {
    toX(e.clientX);
    if (over > 1) reset();
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowLeft') target = Math.max(30, target - 34);
    if (e.key === 'ArrowRight') target = Math.min(W - 30, target + 34);
  };
  cv.tabIndex = 0;
  cv.addEventListener('pointermove', onMove);
  cv.addEventListener('pointerdown', onDown);
  cv.addEventListener('keydown', onKey);

  const burst = (x: number, y: number, c: string) => {
    if (reduce) return;
    for (let i = 0; i < 10; i++) {
      const a = Math.random() * 6.283;
      sparks.push({ x, y, vx: Math.cos(a) * (40 + Math.random() * 90), vy: Math.sin(a) * (40 + Math.random() * 90) - 30, life: 0.5, c });
    }
  };

  const step = (dt: number) => {
    if (over) {
      over += dt;
      return;
    }
    t += dt;
    bar += (target - bar) * Math.min(1, dt * 18);
    spawn -= dt;
    const level = 1 + t / 25;
    if (spawn <= 0) {
      spawn = Math.max(0.28, 0.75 - t * 0.008);
      drops.push({ x: 14 + Math.random() * (W - 28), y: -10, r: 8 + Math.random() * 4, v: (90 + Math.random() * 50) * level, bad: Math.random() < Math.min(0.4, 0.2 + t * 0.003) });
    }
    for (const d of drops) d.y += d.v * dt;
    const keep: Drop[] = [];
    for (const d of drops) {
      const hit = d.y + d.r >= H - 30 && d.y - d.r <= H - 14 && Math.abs(d.x - bar) < 34 + d.r * 0.4;
      if (hit) {
        if (d.bad) {
          lives--;
          combo = 0;
          burst(d.x, d.y, RED);
          if (lives <= 0) over = 0.01;
        } else {
          combo++;
          score += 10 + Math.min(combo, 10);
          burst(d.x, d.y, GREEN);
        }
      } else if (d.y > H + 12) {
        if (!d.bad) combo = 0;
      } else keep.push(d);
    }
    drops = keep;
    for (const s of sparks) {
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.vy += 220 * dt;
      s.life -= dt;
    }
    sparks = sparks.filter((s) => s.life > 0);
  };

  const glow = (x: number, y: number, r: number, c: string) => {
    ctx.shadowColor = c;
    ctx.shadowBlur = reduce ? 0 : 16;
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, 6.283);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#fff';
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    ctx.arc(x - r * 0.25, y - r * 0.25, r * 0.35, 0, 6.283);
    ctx.fill();
    ctx.globalAlpha = 1;
  };

  const draw = () => {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#07101f');
    g.addColorStop(1, '#0d1c33');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(61,242,160,.07)';
    ctx.lineWidth = 1;
    const off = (t * 20) % 30;
    for (let y = off; y < H; y += 30) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }
    for (const d of drops) glow(d.x, d.y, d.r, d.bad ? RED : GREEN);
    for (const s of sparks) {
      ctx.globalAlpha = Math.max(0, s.life * 2);
      ctx.fillStyle = s.c;
      ctx.fillRect(s.x - 1.5, s.y - 1.5, 3, 3);
    }
    ctx.globalAlpha = 1;
    // Barra con forma de labios: una raya de luz.
    ctx.shadowColor = GREEN;
    ctx.shadowBlur = reduce ? 0 : 14;
    ctx.strokeStyle = '#eafff6';
    ctx.lineCap = 'round';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(bar - 30, H - 22);
    ctx.quadraticCurveTo(bar, H - 34, bar + 30, H - 22);
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#eafff6';
    ctx.font = '700 15px ui-monospace, monospace';
    ctx.textAlign = 'left';
    ctx.fillText(String(score), 12, 24);
    if (combo > 2) {
      ctx.fillStyle = GREEN;
      ctx.fillText(`x${combo}`, 12, 44);
    }
    ctx.textAlign = 'right';
    ctx.fillStyle = RED;
    ctx.fillText('●'.repeat(Math.max(0, lives)), W - 12, 24);
    if (over) {
      ctx.fillStyle = 'rgba(7,16,31,.78)';
      ctx.fillRect(0, 0, W, H);
      ctx.textAlign = 'center';
      ctx.fillStyle = '#eafff6';
      ctx.font = '700 22px ui-sans-serif, system-ui, sans-serif';
      ctx.fillText(`${score} puntos`, W / 2, H / 2 - 4);
      ctx.fillStyle = GREEN;
      ctx.font = '600 13px ui-sans-serif, system-ui, sans-serif';
      ctx.fillText('Toca para jugar otra vez', W / 2, H / 2 + 22);
    }
  };

  const loop = (now: number) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    step(dt);
    draw();
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);

  return () => {
    cancelAnimationFrame(raf);
    cv.removeEventListener('pointermove', onMove);
    cv.removeEventListener('pointerdown', onDown);
    cv.removeEventListener('keydown', onKey);
    host.innerHTML = '';
  };
}

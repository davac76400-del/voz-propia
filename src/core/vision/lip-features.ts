import type { Category as MPCategory, NormalizedLandmark } from '@mediapipe/tasks-vision';

// Contorno exterior e interior de los labios en la malla de 478 puntos de MediaPipe.
export const LIP_OUTER = [61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291, 409, 270, 269, 267, 0, 37, 39, 40, 185];
export const LIP_INNER = [78, 95, 88, 178, 87, 14, 317, 402, 318, 324, 308, 415, 310, 311, 312, 13, 82, 81, 80, 191];
// Puntos de apoyo alrededor de la boca: base de la nariz, mejillas, surcos y mentón.
// Siguen el movimiento de la mandíbula y las comisuras, que los labios solos no muestran.
export const MOUTH_AROUND = [
  2, 98, 327, 164, 167, 393, 205, 425, 187, 411, 207, 427, 216, 436, 92, 322, 57, 287, 43, 273,
  169, 394, 135, 364, 140, 369, 171, 396, 175, 199, 200, 152, 148, 377, 176, 400,
];
const LIP_POINTS = [...LIP_OUTER, ...LIP_INNER, ...MOUTH_AROUND];
const EYE_L = 33;
const EYE_R = 263;

export const MOUTH_BLENDSHAPES = [
  'jawOpen', 'mouthClose', 'mouthFunnel', 'mouthPucker', 'mouthLeft', 'mouthRight',
  'mouthSmileLeft', 'mouthSmileRight', 'mouthFrownLeft', 'mouthFrownRight',
  'mouthDimpleLeft', 'mouthDimpleRight', 'mouthStretchLeft', 'mouthStretchRight',
  'mouthRollLower', 'mouthRollUpper', 'mouthShrugLower', 'mouthShrugUpper',
  'mouthPressLeft', 'mouthPressRight', 'mouthLowerDownLeft', 'mouthLowerDownRight',
  'mouthUpperUpLeft', 'mouthUpperUpRight', 'cheekPuff',
] as const;

/** Cuántos de los rasgos son posiciones de puntos (el resto son gestos de la boca). */
export const LANDMARK_DIMS = LIP_POINTS.length * 2;

const BLEND_WEIGHT = 0.6;
export const FEATURE_DIMS = LIP_POINTS.length * 2 + MOUTH_BLENDSHAPES.length;

/**
 * Convierte un cuadro en un vector de rasgos invariante a posición, escala y giro de cabeza:
 * los labios se centran, se rotan según la línea de los ojos y se escalan por la distancia entre ojos.
 */
export function extractFeatures(
  lm: NormalizedLandmark[],
  blend: MPCategory[] | undefined,
  aspect: number,
  out = new Float32Array(FEATURE_DIMS),
): Float32Array {
  const ex = (lm[EYE_R].x - lm[EYE_L].x) * aspect;
  const ey = lm[EYE_R].y - lm[EYE_L].y;
  const eyeDist = Math.hypot(ex, ey) || 1;
  const cos = ex / eyeDist;
  const sin = ey / eyeDist;

  let cx = 0;
  let cy = 0;
  for (const i of LIP_POINTS) {
    cx += lm[i].x * aspect;
    cy += lm[i].y;
  }
  cx /= LIP_POINTS.length;
  cy /= LIP_POINTS.length;

  let k = 0;
  for (const i of LIP_POINTS) {
    const dx = lm[i].x * aspect - cx;
    const dy = lm[i].y - cy;
    out[k++] = (dx * cos + dy * sin) / eyeDist;
    out[k++] = (-dx * sin + dy * cos) / eyeDist;
  }

  if (blend) {
    for (const name of MOUTH_BLENDSHAPES) {
      const c = blend.find((b) => b.categoryName === name);
      out[k++] = (c?.score ?? 0) * BLEND_WEIGHT;
    }
  } else {
    out.fill(0, k);
  }
  return out;
}

/** Apertura de boca 0..1 aproximada, útil para medir actividad y animar la interfaz. */
export function mouthOpenness(lm: NormalizedLandmark[], aspect: number): number {
  const eye = Math.hypot((lm[EYE_R].x - lm[EYE_L].x) * aspect, lm[EYE_R].y - lm[EYE_L].y) || 1;
  const gap = Math.hypot((lm[14].x - lm[13].x) * aspect, lm[14].y - lm[13].y);
  return Math.min(1, (gap / eye) * 3.2);
}

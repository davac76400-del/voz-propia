import type { Phrase } from '../core/types';

type Seed = Pick<Phrase, 'text' | 'icon' | 'category'>;

/**
 * Palabras sueltas, nunca frases: las frases se arman solas al juntar palabras («Me» + «Duele» + «Cabeza»).
 * Van en el orden recomendado para grabarlas: primero las que se ven más distintas en los labios y más frases permiten.
 */
export const DEFAULT_PHRASES: Seed[] = [
  { text: 'Sí', icon: 'check', category: 'respuesta' },
  { text: 'No', icon: 'x', category: 'respuesta' },
  { text: 'Me', icon: 'hand', category: 'cuerpo' },
  { text: 'Duele', icon: 'zap', category: 'cuerpo' },
  // Ronda 1: dónde me duele
  { text: 'Cabeza', icon: 'activity', category: 'cuerpo' },
  { text: 'Pecho', icon: 'heart', category: 'cuerpo' },
  { text: 'Espalda', icon: 'activity', category: 'cuerpo' },
  { text: 'Garganta', icon: 'thermometer', category: 'cuerpo' },
  // Ronda 2: cómo estoy
  { text: 'Tengo', icon: 'hand', category: 'cuerpo' },
  { text: 'Frío', icon: 'snowflake', category: 'cuerpo' },
  { text: 'Calor', icon: 'sun', category: 'cuerpo' },
  { text: 'Hambre', icon: 'utensils', category: 'necesidad' },
  // Ronda 3: lo que necesito
  { text: 'Necesito', icon: 'hand-heart', category: 'necesidad' },
  { text: 'Agua', icon: 'glass-water', category: 'necesidad' },
  { text: 'Baño', icon: 'bath', category: 'necesidad' },
  { text: 'Aire', icon: 'wind', category: 'cuerpo' },
  // Ronda 4: personas
  { text: 'Enfermera', icon: 'stethoscope', category: 'social' },
  { text: 'Médico', icon: 'stethoscope', category: 'social' },
  { text: 'Familia', icon: 'phone', category: 'social' },
  { text: 'Gracias', icon: 'hand-heart', category: 'social' },
  // Ronda 5: cómo me siento
  { text: 'Fuerte', icon: 'zap', category: 'cuerpo' },
  { text: 'Cansado', icon: 'moon', category: 'emocion' },
  { text: 'Miedo', icon: 'frown', category: 'emocion' },
  { text: 'Estómago', icon: 'activity', category: 'cuerpo' },
];

/** Frases de varias palabras que antes venían de fábrica: si siguen sin ejemplos, se quitan. */
export const RETIRED_DEFAULTS = [
  'Tengo dolor', 'Tengo sed', 'Me falta el aire', 'Necesito aspiración', 'Necesito ir al baño', 'Tengo frío',
  'Tengo calor', 'Cámbiame de posición', 'Llama a mi familia', 'Tengo miedo', 'Quiero dormir',
];

export const CATEGORY_LABEL: Record<Phrase['category'], string> = {
  respuesta: 'Respuestas',
  cuerpo: 'Mi cuerpo',
  necesidad: 'Necesito',
  emocion: 'Cómo me siento',
  social: 'Personas',
};

export const ICON_CHOICES = [
  'message-circle', 'check', 'x', 'zap', 'glass-water', 'wind', 'activity', 'bath', 'snowflake', 'sun',
  'refresh-ccw', 'phone', 'heart', 'moon', 'hand-heart', 'utensils', 'pill', 'bed', 'eye', 'hand',
  'thermometer', 'stethoscope', 'smile', 'frown', 'tv', 'music', 'lightbulb', 'bell',
];

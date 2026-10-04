import type { Phrase } from '../core/types';

type Seed = Pick<Phrase, 'text' | 'icon' | 'category'>;

// Frases de hospital más pedidas por pacientes sin voz (traqueostomía, laringectomía, terapia intensiva).
export const DEFAULT_PHRASES: Seed[] = [
  { text: 'Sí', icon: 'check', category: 'respuesta' },
  { text: 'No', icon: 'x', category: 'respuesta' },
  { text: 'Tengo dolor', icon: 'zap', category: 'cuerpo' },
  { text: 'Tengo sed', icon: 'glass-water', category: 'necesidad' },
  { text: 'Me falta el aire', icon: 'wind', category: 'cuerpo' },
  { text: 'Necesito aspiración', icon: 'activity', category: 'cuerpo' },
  { text: 'Necesito ir al baño', icon: 'bath', category: 'necesidad' },
  { text: 'Tengo frío', icon: 'snowflake', category: 'cuerpo' },
  { text: 'Tengo calor', icon: 'sun', category: 'cuerpo' },
  { text: 'Cámbiame de posición', icon: 'refresh-ccw', category: 'necesidad' },
  { text: 'Llama a mi familia', icon: 'phone', category: 'social' },
  { text: 'Tengo miedo', icon: 'heart', category: 'emocion' },
  { text: 'Quiero dormir', icon: 'moon', category: 'necesidad' },
  { text: 'Gracias', icon: 'hand-heart', category: 'social' },
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

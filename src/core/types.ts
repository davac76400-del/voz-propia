export type Category = 'necesidad' | 'cuerpo' | 'emocion' | 'social' | 'respuesta';

export interface Phrase {
  id: string;
  text: string;
  icon: string;
  category: Category;
  order: number;
  audioId?: string;
  /** Carpeta que el programador le puso; las frases propias no la tienen. */
  folder?: string;
  createdAt: number;
}

/** Secuencia de rasgos de labios: `frames` es T×dims aplanado. */
export interface LipSequence {
  dims: number;
  frames: Float32Array;
  fps: number;
}

export interface Sample {
  id: string;
  phraseId: string;
  seq: LipSequence;
  source: 'grabacion' | 'correccion';
  createdAt: number;
}

export interface Candidate {
  phraseId: string;
  distance: number;
  probability: number;
}

export interface Prediction {
  candidates: Candidate[];
  /** Probabilidad del mejor candidato, de 0 a 1. */
  confidence: number;
  /** Verdadero si conviene que la persona confirme entre opciones. */
  ambiguous: boolean;
}

export type VoiceMode = 'sistema' | 'grabada';

/** Usuario: solo habla con lo que ya está preparado. Programador: entrena, elige voces y ajusta. */
export type Role = 'usuario' | 'programador';

export interface Settings {
  role: Role | null;
  voiceURI: string | null;
  rate: number;
  pitch: number;
  /** Hablar solo cuando la confianza supera este valor; si no, mostrar opciones. */
  autoSpeakThreshold: number;
  maxCaptureMs: number;
  /** Cuando el usuario corrige una lectura, esa toma se guarda como ejemplo nuevo. */
  learnFromUse: boolean;
  cameraId: string | null;
}

export const DEFAULT_SETTINGS: Settings = {
  role: null,
  voiceURI: null,
  rate: 0.95,
  pitch: 1,
  autoSpeakThreshold: 0.7,
  maxCaptureMs: 4000,
  learnFromUse: true,
  cameraId: null,
};

import { db } from '../storage/db';
import type { Phrase, Settings } from '../types';

const synth = typeof speechSynthesis !== 'undefined' ? speechSynthesis : null;
let currentAudio: HTMLAudioElement | null = null;

/** Voces en español, primero las de México y las que funcionan sin internet. */
export function spanishVoices(): SpeechSynthesisVoice[] {
  if (!synth) return [];
  const rank = (v: SpeechSynthesisVoice) =>
    (v.lang === 'es-MX' ? 0 : v.lang === 'es-US' ? 1 : 2) * 2 + (v.localService ? 0 : 1);
  return synth
    .getVoices()
    .filter((v) => v.lang.toLowerCase().startsWith('es') || /personal/i.test(v.name))
    .sort((a, b) => rank(a) - rank(b));
}

export function onVoicesChanged(fn: () => void) {
  synth?.addEventListener('voiceschanged', fn);
  return () => synth?.removeEventListener('voiceschanged', fn);
}

export function isPersonalVoice(v: SpeechSynthesisVoice) {
  return /personal/i.test(v.name) || /personal/i.test(v.voiceURI);
}

export function stopSpeaking() {
  synth?.cancel();
  currentAudio?.pause();
  currentAudio = null;
}

export function speakText(text: string, s: Pick<Settings, 'voiceURI' | 'rate' | 'pitch'>): Promise<void> {
  return new Promise((resolve) => {
    if (!synth) return resolve();
    stopSpeaking();
    const u = new SpeechSynthesisUtterance(text);
    const voices = spanishVoices();
    u.voice = voices.find((v) => v.voiceURI === s.voiceURI) ?? voices[0] ?? null;
    u.lang = u.voice?.lang ?? 'es-MX';
    u.rate = s.rate;
    u.pitch = s.pitch;
    u.onend = () => resolve();
    u.onerror = () => resolve();
    synth.speak(u);
  });
}

/** Si la frase tiene un audio grabado (la voz del paciente o de su familia), se usa ese. */
export async function speakPhrase(p: Phrase, s: Settings): Promise<void> {
  if (p.audioId) {
    const blob = await db.audio(p.audioId);
    if (blob) {
      stopSpeaking();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      currentAudio = audio;
      await new Promise<void>((resolve) => {
        audio.onended = audio.onerror = () => resolve();
        audio.play().catch(() => resolve());
      });
      URL.revokeObjectURL(url);
      return;
    }
  }
  return speakText(p.text, s);
}

export interface AudioRecording {
  stop: () => Promise<Blob>;
  cancel: () => void;
}

export async function recordAudio(): Promise<AudioRecording> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
  const mime = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm'].find((m) => MediaRecorder.isTypeSupported(m));
  const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  rec.start();
  const release = () => stream.getTracks().forEach((t) => t.stop());
  return {
    stop: () =>
      new Promise((resolve) => {
        rec.onstop = () => {
          release();
          resolve(new Blob(chunks, { type: rec.mimeType }));
        };
        rec.stop();
      }),
    cancel: () => {
      rec.onstop = release;
      rec.stop();
    },
  };
}

// Entrena el clasificador y el decodificador en otro hilo: aprender tarda de 1 a 15 segundos y, en el hilo principal,
// congelaba la cámara y la pantalla. Aquí corre aparte y solo devuelve el resultado ya calculado.
import type { LipSequence } from '../types';
import { FewShotClassifier, type Embedded } from './classifier';
import { WordDecoder } from './decoder';

export interface FitRequest {
  id: number;
  embedded: { id?: string; phraseId: string; emb: Embedded }[];
  raw: { phraseId: string; seq: LipSequence }[];
}

export interface FitReply {
  id: number;
  /** Estado ya calculado de cada modelo: son solo datos, se copian tal cual al modelo del hilo principal. */
  classifier: object;
  decoder: object;
  ms: number;
}

const scope = self as unknown as {
  onmessage: ((e: MessageEvent<FitRequest>) => void) | null;
  postMessage: (m: FitReply) => void;
};

scope.onmessage = (e) => {
  const { id, embedded, raw } = e.data;
  const t0 = performance.now();
  const classifier = new FewShotClassifier();
  classifier.fit(embedded);
  const decoder = new WordDecoder();
  decoder.fit(raw);
  scope.postMessage({ id, classifier: { ...classifier }, decoder: { ...decoder }, ms: performance.now() - t0 });
};

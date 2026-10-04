export interface Segment {
  text: string;
  start: number;
  end: number;
}

export async function transcribeVideoAudio(file: File): Promise<Segment[]> {
  const audio = await extractAudioFromVideo(file);
  const result = await transcribeAudio(audio);
  return parseSegments(result);
}

async function extractAudioFromVideo(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');

    video.onloadedmetadata = () => {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const destination = audioContext.createMediaStreamDestination();
      const source = audioContext.createMediaElementSource(video);
      source.connect(destination);

      const mediaRecorder = new MediaRecorder(destination.stream);
      const chunks: BlobPart[] = [];

      mediaRecorder.ondataavailable = (e) => chunks.push(e.data);
      mediaRecorder.onstop = () => {
        resolve(new Blob(chunks, { type: 'audio/webm' }));
      };

      video.play();
      mediaRecorder.start();
      setTimeout(() => mediaRecorder.stop(), Math.min(video.duration * 1000, 65000));
    };

    video.onerror = () => reject(new Error('No se pudo cargar el video'));
    video.src = URL.createObjectURL(file);
  });
}

async function transcribeAudio(audio: Blob): Promise<{ text: string; chunks: Array<{ start: number; end: number; text: string }> }> {
  try {
    const audioBuffer = await audio.arrayBuffer();
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const decoded = await audioContext.decodeAudioData(audioBuffer);

    // Placeholder: Aquí iría Whisper de transformers.js
    // Por ahora, simulamos detección simple de palabras
    const duration = decoded.duration * 1000;
    const words = ['Me', 'Me', 'Me', 'Me', 'Me'];

    const chunks = words.map((word, i) => {
      const start = (i * duration) / words.length;
      const end = ((i + 1) * duration) / words.length;
      return { start, end, text: word };
    });

    return { text: words.join(' '), chunks };
  } catch (e) {
    console.warn('Transcribe error:', e);
    return { text: 'Me Me Me', chunks: [{ start: 0, end: 1000, text: 'Me' }] };
  }
}

function parseSegments(result: { text: string; chunks: Array<{ start: number; end: number; text: string }> }): Segment[] {
  return result.chunks
    .filter((c) => c.text.trim().length > 0)
    .map((c) => ({
      text: c.text.trim(),
      start: c.start / 1000,
      end: c.end / 1000,
    }));
}
import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';

let faceLandmarker: FaceLandmarker | null = null;

async function initFaceLandmarker() {
  if (faceLandmarker) return faceLandmarker;

  const vision = await FilesetResolver.forVisionTasks(
    'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm'
  );

  faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
    baseOptions: { modelAssetPath: 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/models/face_landmarker.task' },
    runningMode: 'IMAGE',
  });

  return faceLandmarker;
}

export interface FrameLandmarks {
  frameIndex: number;
  timestamp: number;
  lipPoints: Array<{ x: number; y: number; z: number }>;
}

export async function processVideoFile(file: File): Promise<FrameLandmarks[]> {
  const landmarker = await initFaceLandmarker();
  const video = document.createElement('video');
  const results: FrameLandmarks[] = [];

  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;

    video.onloadedmetadata = async () => {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;

      const fps = 25;
      const frameDuration = 1000 / fps;
      let frameIndex = 0;

      const extractFrame = async () => {
        if (video.currentTime >= video.duration) {
          resolve(results);
          return;
        }

        ctx.drawImage(video, 0, 0);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

        try {
          const detection = landmarker.detectForVideo(imageData, performance.now());

          if (detection.faceLandmarks && detection.faceLandmarks[0]) {
            const face = detection.faceLandmarks[0];
            const lipIndices = [61, 62, 63, 64, 65, 66, 67, 68, 72, 78, 82, 87, 83, 79, 73, 80, 81, 77, 76, 74, 75];
            const lipPoints = lipIndices.map((i) => face[i]).filter(Boolean);

            results.push({
              frameIndex,
              timestamp: video.currentTime * 1000,
              lipPoints: lipPoints.map((p) => ({ x: p.x, y: p.y, z: p.z })),
            });
          }
        } catch (e) {
          console.warn('Frame skipped', frameIndex, e);
        }

        frameIndex++;
        video.currentTime += frameDuration / 1000;

        setTimeout(extractFrame, 10);
      };

      extractFrame();
    };

    video.onerror = () => reject(new Error('No se pudo cargar el video'));
    video.src = URL.createObjectURL(file);
  });
}
/**
 * Обёртка над MediaPipe Pose Landmarker (on-device, WASM).
 * Инференс всегда в try/catch: любая ошибка — это null-результат, не падение.
 */
import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision';
import { settings } from '../config/settings.js';

let landmarker = null;

export async function initPoseTracker() {
  if (landmarker) return landmarker;
  const fileset = await FilesetResolver.forVisionTasks(settings.paths.wasm);
  landmarker = await PoseLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: settings.paths.poseModel, delegate: 'GPU' },
    runningMode: 'VIDEO',
    numPoses: settings.pose.numPoses,
    minPoseDetectionConfidence: settings.pose.minPoseDetectionConfidence,
    minPosePresenceConfidence: settings.pose.minPosePresenceConfidence,
    minTrackingConfidence: settings.pose.minTrackingConfidence,
  });
  return landmarker;
}

/**
 * @returns {Array<Array<{x,y,z,visibility}>>|null} массивы landmarks по людям либо null при ошибке
 */
export function detectPoses(video, timestampMs) {
  if (!landmarker) return null;
  try {
    const result = landmarker.detectForVideo(video, timestampMs);
    return result.landmarks ?? [];
  } catch (err) {
    console.error('Pose inference failed:', err);
    return null;
  }
}

export function closePoseTracker() {
  try {
    landmarker?.close();
  } finally {
    landmarker = null;
  }
}

import { FilesetResolver, PoseLandmarker } from "@mediapipe/tasks-vision";
import { PoseFrame } from "../domain/types";

const VERSION = "0.10.35";
const WASM_ROOT = `${import.meta.env.BASE_URL}mediapipe/wasm`;
const MODEL_URL = `${import.meta.env.BASE_URL}mediapipe/models/pose_landmarker_lite.task`;
const TRACKED_JOINTS = [0, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28];

let enginePromise: Promise<PoseLandmarker> | null = null;
let lastSourceTimestamp = -1;
let lastInferenceTimestamp = -1;
let timestampOffset = 0;

async function createEngine(delegate: "GPU" | "CPU") {
  const vision = await FilesetResolver.forVisionTasks(WASM_ROOT);
  return PoseLandmarker.createFromOptions(vision, {
    baseOptions: { modelAssetPath: MODEL_URL, delegate },
    runningMode: "VIDEO",
    numPoses: 2,
    minPoseDetectionConfidence: 0.55,
    minPosePresenceConfidence: 0.55,
    minTrackingConfidence: 0.5,
  });
}

export async function loadPoseEngine() {
  if (!enginePromise) {
    enginePromise = createEngine("GPU").catch(() => createEngine("CPU"));
  }
  return enginePromise;
}

export async function detectPose(video: HTMLVideoElement, timestamp: number): Promise<PoseFrame | null> {
  if (video.readyState < 2 || !video.videoWidth) return null;
  const engine = await loadPoseEngine();
  if (timestamp <= lastSourceTimestamp || timestamp + timestampOffset <= lastInferenceTimestamp) {
    timestampOffset = lastInferenceTimestamp + 34 - timestamp;
  }
  const inferenceTimestamp = timestamp + timestampOffset;
  lastSourceTimestamp = timestamp;
  lastInferenceTimestamp = inferenceTimestamp;
  const result = engine.detectForVideo(video, inferenceTimestamp);
  const detected = result.landmarks
    .map((landmarks) => ({
      landmarks,
      visibility: TRACKED_JOINTS.reduce((sum, index) => sum + (landmarks[index]?.visibility ?? 0), 0) / TRACKED_JOINTS.length,
    }))
    .sort((a, b) => b.visibility - a.visibility)[0]?.landmarks;
  if (!detected) return null;
  return {
    timestamp,
    poseCount: result.landmarks.length,
    landmarks: detected.map((point) => ({
      x: point.x,
      y: point.y,
      z: point.z,
      visibility: point.visibility ?? 1,
    })),
  };
}

export const poseRuntimeMeta = {
  name: "MediaPipe Pose Landmarker Lite",
  version: VERSION,
  landmarks: 33,
  processing: "Runs in this browser from bundled assets",
};

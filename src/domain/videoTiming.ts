export const MIN_VIDEO_FRAME_STEP_SECONDS = 1 / 45;

export function videoTimestampMs(currentTimeSeconds: number) {
  return Math.max(0, Math.round(currentTimeSeconds * 1000));
}

export function shouldProcessVideoFrame(lastTimeSeconds: number, currentTimeSeconds: number) {
  return currentTimeSeconds > lastTimeSeconds + MIN_VIDEO_FRAME_STEP_SECONDS;
}

export function detectionCoverage(detected: number, sampled: number) {
  if (!sampled) return 0;
  return Math.round((detected / sampled) * 100);
}

import { Assessment, DanceStyle, DimensionName, FeedbackCue, Landmark, PoseFrame } from "./types";

const J = {
  nose: 0, leftShoulder: 11, rightShoulder: 12, leftElbow: 13, rightElbow: 14,
  leftWrist: 15, rightWrist: 16, leftHip: 23, rightHip: 24,
  leftKnee: 25, rightKnee: 26, leftAnkle: 27, rightAnkle: 28,
  leftHeel: 29, rightHeel: 30, leftFoot: 31, rightFoot: 32,
} as const;

const clamp = (value: number, min = 0, max = 100) => Math.min(max, Math.max(min, value));
const distance = (a: Landmark, b: Landmark) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const midpoint = (a: Landmark, b: Landmark) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2, visibility: (a.visibility + b.visibility) / 2 });
const mean = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
const variability = (values: number[]) => {
  if (values.length < 2) return 0;
  const avg = mean(values);
  return Math.sqrt(mean(values.map((value) => (value - avg) ** 2)));
};

export function qualityForScore(score: number): Assessment["quality"] {
  if (score >= 88) return "Excellent";
  if (score >= 78) return "Good";
  if (score >= 68) return "Developing";
  return "Needs focus";
}

function get(frame: PoseFrame, index: number): Landmark {
  return frame.landmarks[index] ?? { x: 0.5, y: 0.5, z: 0, visibility: 0 };
}

function frameSpeed(a: PoseFrame, b: PoseFrame) {
  const tracked = [J.leftWrist, J.rightWrist, J.leftAnkle, J.rightAnkle, J.leftHip, J.rightHip];
  const dt = Math.max(16, b.timestamp - a.timestamp) / 1000;
  return mean(tracked.map((joint) => distance(get(a, joint), get(b, joint)) / dt));
}

function computeDimensions(frames: PoseFrame[], style: DanceStyle) {
  const latest = frames.at(-1)!;
  const ls = get(latest, J.leftShoulder); const rs = get(latest, J.rightShoulder);
  const lh = get(latest, J.leftHip); const rh = get(latest, J.rightHip);
  const lw = get(latest, J.leftWrist); const rw = get(latest, J.rightWrist);
  const lk = get(latest, J.leftKnee); const rk = get(latest, J.rightKnee);
  const la = get(latest, J.leftAnkle); const ra = get(latest, J.rightAnkle);
  const nose = get(latest, J.nose);
  const shoulders = midpoint(ls, rs); const hips = midpoint(lh, rh); const feet = midpoint(la, ra);
  const body = Math.max(0.18, distance(shoulders, feet));
  const shoulderLevel = Math.abs(ls.y - rs.y) / body;
  const hipLevel = Math.abs(lh.y - rh.y) / body;
  const torsoLean = Math.abs(shoulders.x - hips.x) / body;
  const posture = clamp(96 - shoulderLevel * 80 - hipLevel * 75 - torsoLean * 65);

  const reach = (distance(lw, hips) + distance(rw, hips) + distance(la, hips) + distance(ra, hips)) / (4 * body);
  const span = (Math.abs(lw.x - rw.x) + Math.abs(la.x - ra.x)) / body;
  const amplitude = clamp(42 + reach * 38 + span * 17);

  const supportWidth = Math.max(0.06, Math.abs(la.x - ra.x));
  const supportCenter = (la.x + ra.x) / 2;
  const centerDrift = Math.abs(hips.x - supportCenter) / Math.max(supportWidth, 0.16);
  const balance = clamp(98 - centerDrift * 28 - torsoLean * 35 - Math.abs(feet.y - Math.max(la.y, ra.y)) * 40);

  const armSymmetry = Math.abs(distance(ls, lw) - distance(rs, rw)) / body;
  const legSymmetry = Math.abs(distance(lh, la) - distance(rh, ra)) / body;
  const crossPattern = Math.abs((lw.y - rw.y) - (rk.y - lk.y));
  const coordination = clamp(94 - armSymmetry * 52 - legSymmetry * 46 - crossPattern * 18);

  const speeds = frames.slice(1).map((frame, index) => frameSpeed(frames[index], frame));
  const activeSpeeds = speeds.filter((speed) => speed > 0.015);
  const speedMean = mean(activeSpeeds);
  const regularity = speedMean ? variability(activeSpeeds) / speedMean : 1;
  const rhythm = clamp(94 - regularity * 24 - (activeSpeeds.length < 5 ? 8 : 0));

  const kneeFlexion = ((lk.y + rk.y) / 2 - (lh.y + rh.y) / 2) / body;
  const verticalExtension = (hips.y - Math.min(lw.y, rw.y, nose.y)) / body;
  const styleSignals: Record<DanceStyle, number> = {
    Contemporary: 56 + reach * 24 + Math.min(0.28, torsoLean) * 55,
    Folk: 58 + (1 - Math.min(1, armSymmetry * 4)) * 18 + (1 - Math.min(1, torsoLean * 4)) * 16,
    Street: 54 + Math.min(0.7, kneeFlexion) * 38 + Math.min(1, speedMean * 2) * 14,
    Classical: 55 + verticalExtension * 24 + balance * 0.2 + amplitude * 0.08,
  };
  const styleScore = clamp(styleSignals[style]);

  return { Posture: posture, Rhythm: rhythm, Amplitude: amplitude, Coordination: coordination, Balance: balance, Style: styleScore };
}

function contributions(dimensions: Record<DimensionName, number>) {
  const inverse = (value: number) => Math.max(4, 104 - value);
  const raw: Record<string, number> = {
    "Left ankle": inverse(dimensions.Balance) * 1.05,
    "Right ankle": inverse(dimensions.Balance),
    "Left knee": inverse((dimensions.Balance + dimensions.Coordination) / 2) * 0.9,
    "Right knee": inverse((dimensions.Balance + dimensions.Coordination) / 2) * 0.86,
    "Left wrist": inverse((dimensions.Amplitude + dimensions.Coordination) / 2) * 0.72,
    "Right wrist": inverse((dimensions.Amplitude + dimensions.Coordination) / 2) * 0.7,
    Hips: inverse((dimensions.Posture + dimensions.Style) / 2) * 0.82,
  };
  const total = Object.values(raw).reduce((sum, value) => sum + value, 0);
  return Object.fromEntries(Object.entries(raw).map(([name, value]) => [name, value / total]));
}

const feedbackText: Record<DimensionName, { joints: string[]; observation: string; action: string }> = {
  Posture: { joints: ["Shoulders", "Hips"], observation: "Torso alignment varies through the phrase.", action: "Stack the ribs over the pelvis before the next transition." },
  Rhythm: { joints: ["Wrists", "Ankles"], observation: "Motion accents arrive with uneven spacing.", action: "Mark the preparation count, then land the peak on the phrase accent." },
  Amplitude: { joints: ["Wrists", "Ankles"], observation: "The movement pathway closes before full extension.", action: "Send energy through the fingertips and complete the leg line." },
  Coordination: { joints: ["Knees", "Wrists"], observation: "Upper and lower body pathways resolve at different times.", action: "Connect the arm finish to the supporting-leg change." },
  Balance: { joints: ["Ankles", "Hips"], observation: "The center shifts outside the support area during recovery.", action: "Widen the base slightly and finish the landing through the standing hip." },
  Style: { joints: ["Torso", "Arms"], observation: "Style markers appear inconsistently across the phrase.", action: "Hold the selected style's energy quality through each transition." },
};

export function generateFeedback(dimensions: Record<DimensionName, number>, confidence: number): FeedbackCue[] {
  return (Object.entries(dimensions) as [DimensionName, number][])
    .sort((a, b) => a[1] - b[1])
    .slice(0, 4)
    .map(([category, score], index) => {
      const text = feedbackText[category];
      return {
        id: `${category.toLowerCase()}-${index}`,
        category,
        severity: score < 68 ? "priority" : score < 82 ? "focus" : "strength",
        phase: index === 0 ? "Peak / transition" : index === 1 ? "Landing" : "Across phrase",
        joints: text.joints,
        observation: score >= 82 ? `${category} remains controlled across the observed phrase.` : text.observation,
        action: score >= 82 ? "Preserve this quality as movement complexity increases." : text.action,
        confidence,
        selected: true,
      };
    });
}

export function scorePoseWindow(frames: PoseFrame[], style: DanceStyle, mode: Assessment["inferenceMode"] = "pose-kinematics"): Assessment {
  const started = performance.now();
  if (!frames.length) throw new Error("At least one pose frame is required.");
  const dimensions = computeDimensions(frames, style);
  const weights: Record<DimensionName, number> = { Posture: 0.2, Rhythm: 0.18, Amplitude: 0.14, Coordination: 0.18, Balance: 0.18, Style: 0.12 };
  const overall = clamp((Object.keys(weights) as DimensionName[]).reduce((sum, name) => sum + dimensions[name] * weights[name], 0));
  const tracked = [0, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28];
  const confidence = clamp(mean(frames.slice(-12).flatMap((frame) => tracked.map((joint) => get(frame, joint).visibility))) * 100) / 100;
  const speedSeries = frames.slice(1).map((frame, index) => frameSpeed(frames[index], frame));
  const maxSpeed = Math.max(...speedSeries, 0.001);
  const temporalSalience = speedSeries.slice(-32).map((speed) => clamp(speed / maxSpeed, 0, 1));
  return {
    overall,
    quality: qualityForScore(overall),
    dimensions,
    confidence,
    jointContributions: contributions(dimensions),
    temporalSalience,
    cues: generateFeedback(dimensions, confidence),
    latencyMs: performance.now() - started,
    inferenceMode: mode,
  };
}

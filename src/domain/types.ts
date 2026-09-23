export type DanceStyle = "Contemporary" | "Folk" | "Street" | "Classical";
export type InputSource = "demo" | "camera" | "upload";
export type SessionStatus = "setup" | "ready" | "running" | "paused" | "complete";
export type InferenceMode = "pose-kinematics" | "validated-model" | "demo-pose";
export type DimensionName = "Posture" | "Rhythm" | "Amplitude" | "Coordination" | "Balance" | "Style";

export interface Landmark {
  x: number;
  y: number;
  z: number;
  visibility: number;
}

export interface PoseFrame {
  timestamp: number;
  landmarks: Landmark[];
  poseCount?: number;
}

export interface FeedbackCue {
  id: string;
  category: DimensionName;
  severity: "strength" | "focus" | "priority";
  phase: "Preparation" | "Peak / transition" | "Landing" | "Across phrase";
  joints: string[];
  observation: string;
  action: string;
  confidence: number;
  selected: boolean;
}

export interface Assessment {
  overall: number;
  quality: "Excellent" | "Good" | "Developing" | "Needs focus";
  dimensions: Record<DimensionName, number>;
  confidence: number;
  jointContributions: Record<string, number>;
  temporalSalience: number[];
  cues: FeedbackCue[];
  latencyMs: number;
  inferenceMode: InferenceMode;
}

export interface SessionConfig {
  dancerName: string;
  style: DanceStyle;
  routine: string;
  level: "Foundation" | "Intermediate" | "Advanced";
  source: InputSource;
  durationSeconds: number;
}

export interface KeyMoment {
  id: string;
  timestamp: number;
  label: "Preparation" | "Peak / transition" | "Landing";
  score: number;
  landmarks: Landmark[];
}

export interface SessionRecord {
  schemaVersion: 1;
  id: string;
  createdAt: string;
  completedAt: string;
  config: SessionConfig;
  duration: number;
  frameCount: number;
  assessment: Assessment;
  keyMoments: KeyMoment[];
  instructorNote: string;
  approved: boolean;
  editedFeedback: FeedbackCue[];
}

export const DIMENSIONS: DimensionName[] = ["Posture", "Rhythm", "Amplitude", "Coordination", "Balance", "Style"];

export const DEFAULT_DIMENSIONS: Record<DimensionName, number> = {
  Posture: 0,
  Rhythm: 0,
  Amplitude: 0,
  Coordination: 0,
  Balance: 0,
  Style: 0,
};

export const EMPTY_ASSESSMENT: Assessment = {
  overall: 0,
  quality: "Needs focus",
  dimensions: { ...DEFAULT_DIMENSIONS },
  confidence: 0,
  jointContributions: {},
  temporalSalience: [],
  cues: [],
  latencyMs: 0,
  inferenceMode: "pose-kinematics",
};

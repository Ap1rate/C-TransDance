import { describe, expect, it } from "vitest";
import { generateFeedback, qualityForScore, scorePoseWindow } from "./scoring";
import { PoseFrame } from "./types";

function poseFixture(timestamp: number): PoseFrame {
  const phase = timestamp / 600;
  const landmarks = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.3, z: 0, visibility: 0.96 }));
  const set = (index: number, x: number, y: number) => { landmarks[index] = { x, y, z: 0, visibility: 0.98 }; };
  set(0, 0.5, 0.14); set(11, 0.43, 0.27); set(12, 0.57, 0.27);
  set(13, 0.36 - Math.sin(phase) * 0.08, 0.38 - Math.cos(phase) * 0.08);
  set(14, 0.64 + Math.sin(phase) * 0.08, 0.38 - Math.cos(phase) * 0.08);
  set(15, 0.28 - Math.sin(phase) * 0.12, 0.48 - Math.cos(phase) * 0.18);
  set(16, 0.72 + Math.sin(phase) * 0.12, 0.48 - Math.cos(phase) * 0.18);
  set(23, 0.46, 0.51); set(24, 0.54, 0.51); set(25, 0.43, 0.69); set(26, 0.57, 0.69);
  set(27, 0.4 - Math.sin(phase) * 0.05, 0.9); set(28, 0.6 + Math.sin(phase) * 0.05, 0.9);
  set(29, landmarks[27].x, 0.92); set(30, landmarks[28].x, 0.92); set(31, landmarks[27].x - 0.02, 0.93); set(32, landmarks[28].x + 0.02, 0.93);
  return { timestamp, landmarks };
}

describe("pose scoring", () => {
  const frames = Array.from({ length: 36 }, (_, index) => poseFixture(index * 100));

  it("is deterministic and bounded", () => {
    const first = scorePoseWindow(frames, "Contemporary", "demo-pose");
    const second = scorePoseWindow(frames, "Contemporary", "demo-pose");
    expect(first.overall).toBeCloseTo(second.overall, 8);
    Object.values(first.dimensions).forEach((value) => expect(value).toBeGreaterThanOrEqual(0));
    Object.values(first.dimensions).forEach((value) => expect(value).toBeLessThanOrEqual(100));
  });

  it("uses centralized quality thresholds", () => {
    expect(qualityForScore(88)).toBe("Excellent");
    expect(qualityForScore(78)).toBe("Good");
    expect(qualityForScore(68)).toBe("Developing");
    expect(qualityForScore(67.99)).toBe("Needs focus");
  });

  it("returns constrained actionable feedback", () => {
    const assessment = scorePoseWindow(frames, "Classical");
    const cues = generateFeedback(assessment.dimensions, assessment.confidence);
    expect(cues).toHaveLength(4);
    cues.forEach((cue) => {
      expect(cue.action.length).toBeGreaterThan(12);
      expect(cue.joints.length).toBeGreaterThan(0);
    });
  });
});

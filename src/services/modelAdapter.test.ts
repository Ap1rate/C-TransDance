import { describe, expect, it } from "vitest";
import { normalizeValidatedOutput } from "./modelAdapter";

describe("validated model adapter", () => {
  it("normalizes scores, contributions, and metadata-backed mode", () => {
    const result = normalizeValidatedOutput({
      overall: 102,
      dimensions: { Posture: 91, Rhythm: 87, Amplitude: -2, Coordination: 84, Balance: 89, Style: 86 },
      confidence: 1.2,
      jointContributions: { ankles: 3, knees: 1 },
      temporalSalience: [0.2, 1.4],
      model: { name: "dance-cnn-transformer", version: "1.0.0" },
    });
    expect(result.overall).toBe(100);
    expect(result.dimensions.Amplitude).toBe(0);
    expect(result.confidence).toBe(1);
    expect(result.jointContributions.ankles).toBeCloseTo(0.75);
    expect(result.inferenceMode).toBe("validated-model");
  });

  it("rejects outputs without versioned model metadata", () => {
    expect(() => normalizeValidatedOutput({ overall: 80, dimensions: {} as never, model: { name: "", version: "" } })).toThrow();
  });
});

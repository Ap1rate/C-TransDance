import { describe, expect, it } from "vitest";
import { detectionCoverage, shouldProcessVideoFrame, videoTimestampMs } from "./videoTiming";

describe("uploaded-video timing", () => {
  it("uses the decoded media clock for inference timestamps", () => {
    expect(videoTimestampMs(1.2344)).toBe(1234);
    expect(videoTimestampMs(-1)).toBe(0);
  });

  it("does not analyze the same decoded frame repeatedly", () => {
    expect(shouldProcessVideoFrame(1, 1.01)).toBe(false);
    expect(shouldProcessVideoFrame(1, 1.03)).toBe(true);
  });

  it("reports pose coverage over sampled frames", () => {
    expect(detectionCoverage(18, 20)).toBe(90);
    expect(detectionCoverage(0, 0)).toBe(0);
  });
});

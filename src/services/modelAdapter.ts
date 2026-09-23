import { Assessment, DIMENSIONS, DimensionName, FeedbackCue, PoseFrame } from "../domain/types";
import { generateFeedback, qualityForScore } from "../domain/scoring";

export interface ValidatedModelOutput {
  overall: number;
  dimensions: Record<DimensionName, number>;
  qualityProbabilities?: Record<string, number>;
  confidence?: number;
  feedback?: FeedbackCue[];
  temporalSalience?: number[];
  jointContributions?: Record<string, number>;
  latencyMs?: number;
  model: { name: string; version: string; checksum?: string };
}

export interface ValidatedModelAdapter {
  metadata: ValidatedModelOutput["model"];
  infer(frames: PoseFrame[], style: string): Promise<ValidatedModelOutput>;
}

const clamp = (value: number, min = 0, max = 100) => Math.min(max, Math.max(min, Number.isFinite(value) ? value : 0));

export function normalizeValidatedOutput(output: ValidatedModelOutput): Assessment {
  if (!output.model?.name || !output.model?.version) throw new Error("Validated model metadata is required.");
  const dimensions = Object.fromEntries(DIMENSIONS.map((name) => [name, clamp(output.dimensions?.[name])])) as Record<DimensionName, number>;
  const overall = clamp(output.overall);
  const temporalSalience = (output.temporalSalience ?? []).slice(-96).map((value) => clamp(value, 0, 1));
  const rawContributions = Object.entries(output.jointContributions ?? {}).filter(([, value]) => Number.isFinite(value) && value >= 0);
  const total = rawContributions.reduce((sum, [, value]) => sum + value, 0);
  const jointContributions = total > 0 ? Object.fromEntries(rawContributions.map(([name, value]) => [name, value / total])) : {};
  const confidence = clamp((output.confidence ?? 0.8) * 100) / 100;
  return {
    overall,
    dimensions,
    quality: qualityForScore(overall),
    confidence,
    cues: output.feedback?.length ? output.feedback : generateFeedback(dimensions, confidence),
    temporalSalience,
    jointContributions,
    latencyMs: Math.max(0, output.latencyMs ?? 0),
    inferenceMode: "validated-model",
  };
}

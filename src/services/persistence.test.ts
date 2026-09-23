import { beforeEach, describe, expect, it, vi } from "vitest";
import { EMPTY_ASSESSMENT, SessionRecord } from "../domain/types";
import { deleteSession, loadSessions, saveSession } from "./persistence";

const memory = new Map<string, string>();
vi.stubGlobal("localStorage", {
  getItem: (key: string) => memory.get(key) ?? null,
  setItem: (key: string, value: string) => memory.set(key, value),
  removeItem: (key: string) => memory.delete(key),
});

function record(id: string): SessionRecord {
  return {
    schemaVersion: 1, id, createdAt: "2026-01-01", completedAt: "2026-01-01",
    config: { dancerName: "", style: "Folk", routine: "Phrase study", level: "Foundation", source: "demo", durationSeconds: 30 },
    duration: 10, frameCount: 1, assessment: EMPTY_ASSESSMENT, keyMoments: [], instructorNote: "", approved: false, editedFeedback: [],
  };
}

describe("session persistence", () => {
  beforeEach(() => memory.clear());
  it("saves newest first and deletes by id", () => {
    saveSession(record("a")); saveSession(record("b"));
    expect(loadSessions().map((item) => item.id)).toEqual(["b", "a"]);
    deleteSession("b");
    expect(loadSessions().map((item) => item.id)).toEqual(["a"]);
  });
  it("recovers from corrupt storage", () => {
    memory.set("motion-studio-sessions-v1", "not json");
    expect(loadSessions()).toEqual([]);
  });
});

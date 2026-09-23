import { SessionRecord } from "../domain/types";

const STORAGE_KEY = "motion-studio-sessions-v1";

export function loadSessions(): SessionRecord[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((record) => record?.schemaVersion === 1 && typeof record?.id === "string");
  } catch {
    return [];
  }
}

export function saveSession(record: SessionRecord): SessionRecord[] {
  const next = [record, ...loadSessions().filter((item) => item.id !== record.id)].slice(0, 40);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
}

export function deleteSession(id: string): SessionRecord[] {
  const next = loadSessions().filter((record) => record.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
}

export function clearSessions() {
  localStorage.removeItem(STORAGE_KEY);
}

export function exportSession(record: SessionRecord) {
  const blob = new Blob([JSON.stringify(record, null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `${record.id}-assessment.json`;
  link.click();
  URL.revokeObjectURL(link.href);
}

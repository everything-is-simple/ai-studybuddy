import { useCallback, useEffect, useState } from 'react';

export const CRAM_SESSION_VERSION = 1;

export interface CramSessionSnapshot {
  version: number;
  assessmentAttemptId: string;
  cardIds: string[];
  currentCardId: string;
  viewedCardIds: string[];
  endsAt: number;
  flipped: boolean;
}

export function cramSessionStorageKey(semesterId: string, assessmentAttemptId: string): string {
  return `ai-studybuddy:cram:${semesterId}:${assessmentAttemptId}`;
}

function canUseSessionStorage(): boolean {
  try {
    const key = '__ai_studybuddy_cram_probe__';
    window.sessionStorage.setItem(key, '1');
    window.sessionStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

function uniqueKnownIds(ids: unknown, knownIds: Set<string>): string[] {
  if (!Array.isArray(ids)) return [];
  const result: string[] = [];
  for (const id of ids) {
    if (typeof id === 'string' && knownIds.has(id) && !result.includes(id)) result.push(id);
  }
  return result;
}

export function readCramSession(
  semesterId: string | null,
  assessmentAttemptId: string | null,
  availableCardIds: string[]
): CramSessionSnapshot | null {
  if (!semesterId || !assessmentAttemptId || availableCardIds.length === 0 || !canUseSessionStorage()) return null;
  try {
    const raw = window.sessionStorage.getItem(cramSessionStorageKey(semesterId, assessmentAttemptId));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const snapshot = parsed as Partial<CramSessionSnapshot>;
    const knownIds = new Set(availableCardIds);
    const cardIds = uniqueKnownIds(snapshot.cardIds, knownIds);
    const currentCardId = typeof snapshot.currentCardId === 'string' && knownIds.has(snapshot.currentCardId) ? snapshot.currentCardId : cardIds[0];
    const viewedCardIds = uniqueKnownIds(snapshot.viewedCardIds, knownIds);
    if (
      snapshot.version !== CRAM_SESSION_VERSION ||
      snapshot.assessmentAttemptId !== assessmentAttemptId ||
      cardIds.length === 0 ||
      !currentCardId ||
      typeof snapshot.endsAt !== 'number' ||
      !Number.isFinite(snapshot.endsAt) ||
      typeof snapshot.flipped !== 'boolean'
    ) return null;
    return { version: CRAM_SESSION_VERSION, assessmentAttemptId, cardIds, currentCardId, viewedCardIds, endsAt: snapshot.endsAt, flipped: snapshot.flipped };
  } catch {
    return null;
  }
}

export function writeCramSession(semesterId: string | null, assessmentAttemptId: string | null, snapshot: CramSessionSnapshot | null): boolean {
  if (!semesterId || !assessmentAttemptId || !snapshot || !canUseSessionStorage()) return false;
  try {
    window.sessionStorage.setItem(cramSessionStorageKey(semesterId, assessmentAttemptId), JSON.stringify(snapshot));
    return true;
  } catch {
    return false;
  }
}

export function clearCramSession(semesterId: string | null, assessmentAttemptId: string | null): void {
  if (!semesterId || !assessmentAttemptId || !canUseSessionStorage()) return;
  try { window.sessionStorage.removeItem(cramSessionStorageKey(semesterId, assessmentAttemptId)); } catch {}
}

interface UseCramSessionOptions {
  semesterId: string | null;
  assessmentAttemptId: string | null;
  cardIds: string[];
}

export function useCramSession({ semesterId, assessmentAttemptId, cardIds }: UseCramSessionOptions) {
  const [snapshot, setSnapshot] = useState<CramSessionSnapshot | null>(null);
  const [isHydrated, setIsHydrated] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const cardIdsKey = cardIds.join('|');

  useEffect(() => {
    setIsHydrated(false);
    const restored = readCramSession(semesterId, assessmentAttemptId, cardIds);
    setSnapshot(restored);
    setNow(Date.now());
    setIsHydrated(true);
  }, [assessmentAttemptId, cardIdsKey, semesterId]);

  useEffect(() => {
    if (!snapshot) return;
    const intervalId = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(intervalId);
  }, [snapshot]);

  useEffect(() => {
    if (isHydrated && snapshot) writeCramSession(semesterId, assessmentAttemptId, snapshot);
  }, [assessmentAttemptId, isHydrated, semesterId, snapshot]);

  const isExpired = Boolean(snapshot && now >= snapshot.endsAt);
  const remainingSeconds = snapshot ? Math.max(0, Math.ceil((snapshot.endsAt - now) / 1000)) : null;
  const currentIndex = snapshot ? Math.max(0, snapshot.cardIds.indexOf(snapshot.currentCardId)) : 0;

  const start = useCallback((durationMinutes: 5 | 10 | 15) => {
    if (!assessmentAttemptId || cardIds.length === 0) return;
    const startedAt = Date.now();
    setSnapshot({
      version: CRAM_SESSION_VERSION,
      assessmentAttemptId,
      cardIds: [...cardIds],
      currentCardId: cardIds[0],
      viewedCardIds: [cardIds[0]],
      endsAt: startedAt + durationMinutes * 60 * 1000,
      flipped: false,
    });
    setNow(startedAt);
  }, [assessmentAttemptId, cardIdsKey]);

  const visit = useCallback((cardId: string) => {
    setSnapshot((current) => {
      if (!current || Date.now() >= current.endsAt || !current.cardIds.includes(cardId)) return current;
      return { ...current, currentCardId: cardId, viewedCardIds: current.viewedCardIds.includes(cardId) ? current.viewedCardIds : [...current.viewedCardIds, cardId], flipped: false };
    });
  }, []);

  const toggleFlipped = useCallback(() => {
    setSnapshot((current) => current ? { ...current, flipped: !current.flipped } : current);
  }, []);

  const restart = useCallback(() => {
    clearCramSession(semesterId, assessmentAttemptId);
    setSnapshot(null);
    setNow(Date.now());
  }, [assessmentAttemptId, semesterId]);

  return {
    snapshot,
    isHydrated,
    isExpired,
    remainingSeconds,
    currentIndex,
    start,
    visit,
    toggleFlipped,
    restart,
    canPersist: canUseSessionStorage(),
  };
}

// 개인 데이터는 로그인 없이 기기 localStorage 에만 저장한다(계획서 D6).
const K_RECENT = "edudic.recent";
const K_FAV = "edudic.favorites";
const K_SETTINGS = "edudic.settings";
const K_COUNTS = "edudic.searchCounts"; // "내가 자주 찾은 낱말"(전체기간, D23) 집계용
const RECENT_MAX = 12;

function read(key: string): string[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function write(key: string, list: string[]) {
  try {
    localStorage.setItem(key, JSON.stringify(list));
  } catch {
    /* 저장 실패해도 앱은 계속 동작 */
  }
}

export function getRecent(): string[] {
  return read(K_RECENT);
}

export function pushRecent(word: string): string[] {
  const w = word.trim();
  if (!w) return getRecent();
  const next = [w, ...getRecent().filter((x) => x !== w)].slice(0, RECENT_MAX);
  write(K_RECENT, next);
  return next;
}

export function clearRecent(): string[] {
  write(K_RECENT, []);
  return [];
}

// "나의 낱말사전 → 내가 자주 찾은 낱말"용 — 전체 기간 누적 검색 횟수(많이 찾은 순). 서버의 전역
// "자주 찾는 낱말"(다른 사용자 포함, 최근 30일)과는 별개의 순수 개인 지표다.
function readCounts(): Record<string, number> {
  try {
    const raw = localStorage.getItem(K_COUNTS);
    if (!raw) return {};
    const v = JSON.parse(raw);
    return v && typeof v === "object" ? v : {};
  } catch {
    return {};
  }
}

export function bumpSearchCount(word: string): void {
  const w = word.trim();
  if (!w) return;
  const counts = readCounts();
  counts[w] = (counts[w] ?? 0) + 1;
  try {
    localStorage.setItem(K_COUNTS, JSON.stringify(counts));
  } catch {
    /* noop */
  }
}

export function getMostSearched(limit = 30): string[] {
  const counts = readCounts();
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([w]) => w);
}

export function getFavorites(): string[] {
  return read(K_FAV);
}

export function isFavorite(word: string): boolean {
  return getFavorites().includes(word.trim());
}

export function toggleFavorite(word: string): string[] {
  const w = word.trim();
  if (!w) return getFavorites();
  const cur = getFavorites();
  const next = cur.includes(w) ? cur.filter((x) => x !== w) : [w, ...cur];
  write(K_FAV, next);
  return next;
}

export interface Settings {
  bigMode?: boolean;
  level?: "dict" | "easy"; // 상단 난이도 토글(D17-2). 기본은 "dict"(사전 원문).
  // "낱말 익히기" 개인화(D26). wordLevel은 세트에 등급 태그가 붙기 전까진 보관만 하는 예비 설정.
  wordLevel?: "초급" | "중급" | "고급" | "all";
  interestedTopics?: string[]; // WORD_SETS의 id 목록. 없으면(undefined) 전체 관심으로 취급.
}

export function getSettings(): Settings {
  try {
    const raw = localStorage.getItem(K_SETTINGS);
    return raw ? (JSON.parse(raw) as Settings) : {};
  } catch {
    return {};
  }
}

export function setSettings(patch: Settings) {
  const next = { ...getSettings(), ...patch };
  try {
    localStorage.setItem(K_SETTINGS, JSON.stringify(next));
  } catch {
    /* noop */
  }
}

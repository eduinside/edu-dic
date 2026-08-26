// 데스크탑 클라이언트 API 통신 라이브러리
const BASE_URL = "https://dic.dgedu.link";

export interface DictAudio {
  url: string;
  attribution: string;
}

export interface DictImage {
  url: string;
  license: string;
  attribution: string;
  source: "krdict" | "encykorea" | "naver";
}

export interface DictSense {
  def: string;
  example?: string;
  synonyms?: string[];
  antonyms?: string[];
}

export interface DictHomograph {
  pos?: string;
  level?: "초급" | "중급" | "고급" | null;
  senses: DictSense[];
  image?: DictImage | null;
  audio?: DictAudio | null;
  easySenses?: DictSense[] | null;
}

export interface DictEntry {
  word: string;
  reading?: string;
  pos?: string;
  level?: "초급" | "중급" | "고급" | null;
  senses: DictSense[];
  image?: DictImage | null;
  audio?: DictAudio | null;
  source: "krdict" | "encykorea";
  fetchedAt: string;
  easySenses?: DictSense[] | null;
  homographs?: DictHomograph[];
}

export type LookupResult =
  | { status: "ok"; entry: DictEntry }
  | { status: "not_found"; word: string; suggestion?: string }
  | { status: "blocked"; word: string; reason?: string }
  | { status: "not_ready"; word: string }
  | { status: "error"; word: string; message: string };

export async function lookupWord(word: string): Promise<LookupResult> {
  const w = word.trim();
  if (!w) return { status: "not_found", word: w };
  try {
    const res = await fetch(`${BASE_URL}/api/lookup?q=${encodeURIComponent(w)}`, {
      headers: { accept: "application/json" },
    });
    if (!res.ok) {
      if (res.status === 404) return { status: "not_ready", word: w };
      return { status: "error", word: w, message: `HTTP ${res.status}` };
    }
    return (await res.json()) as LookupResult;
  } catch {
    return { status: "not_ready", word: w };
  }
}

export async function fetchSuggestions(query: string): Promise<string[]> {
  const q = query.trim();
  if (!q) return [];
  try {
    const res = await fetch(`${BASE_URL}/api/suggest?q=${encodeURIComponent(q)}`, {
      headers: { accept: "application/json" },
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { suggestions?: string[] };
    return data.suggestions ?? [];
  } catch {
    return [];
  }
}

export async function fetchEasySenses(word: string, homographIndex = 0): Promise<DictSense[] | null> {
  try {
    const res = await fetch(`${BASE_URL}/api/simplify?q=${encodeURIComponent(word)}&h=${homographIndex}`, {
      headers: { accept: "application/json" },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { status: string; easySenses?: DictSense[] | null };
    return data.easySenses ?? null;
  } catch {
    return null;
  }
}

import type { DictSense, LookupResult } from "../types.ts";

// 낱말 조회. 프런트는 항상 우리 Function(/api/lookup)만 부른다 — krdict 인증키는 서버 전용(계획서 §2.2).
// M0: Functions 미구현 상태에서 vite 단독 실행 시 404가 나므로 not_ready 로 부드럽게 처리.
export async function lookupWord(word: string): Promise<LookupResult> {
  const w = word.trim();
  if (!w) return { status: "not_found", word: w };
  try {
    const res = await fetch(`/api/lookup?q=${encodeURIComponent(w)}`, {
      headers: { accept: "application/json" },
    });
    if (!res.ok) {
      // 404(엔드포인트 없음) 등 → M0 스텁 취급
      if (res.status === 404) return { status: "not_ready", word: w };
      return { status: "error", word: w, message: `HTTP ${res.status}` };
    }
    const data = (await res.json()) as LookupResult;
    return data;
  } catch (e) {
    // 네트워크 실패(예: vite 단독 실행) → 화면은 placeholder
    return { status: "not_ready", word: w };
  }
}

// "쉬운 말로" 토글 — 사전 원문을 AI로 다시 쓴 버전(서버가 krdict 뜻풀이와 줄 수 일치를 검증한 것만 반환).
// homographIndex: 동음이의어 탭 전환 시 지금 보고 있는 뜻만 변환하도록 서버에 알려준다(D25).
// null이면 변환 불가(AI 미설정 등) → 호출부는 조용히 원문(entry.senses)을 계속 보여주면 된다.
export async function fetchEasySenses(word: string, homographIndex = 0): Promise<DictSense[] | null> {
  try {
    const res = await fetch(`/api/simplify?q=${encodeURIComponent(word)}&h=${homographIndex}`, {
      headers: { accept: "application/json" },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { status: string; easySenses?: DictSense[] | null };
    return data.easySenses ?? null;
  } catch {
    return null;
  }
}

export interface RelatedResult {
  words: string[];
  communityTopic?: {
    title: string;
    emoji: string;
    words: string[];
  } | null;
}

// AI 관련어 및 커스텀 낱말사전 소속 주제 탐색 결과
export async function fetchRelated(word: string): Promise<RelatedResult> {
  try {
    const res = await fetch(`/api/related?q=${encodeURIComponent(word)}`, { headers: { accept: "application/json" } });
    if (!res.ok) return { words: [] };
    const data = (await res.json()) as RelatedResult;
    return {
      words: Array.isArray(data.words) ? data.words : [],
      communityTopic: data.communityTopic || null,
    };
  } catch {
    return { words: [] };
  }
}


// 전역 인기 낱말(익명 집계). 실패해도 홈 화면은 빈 섹션으로 조용히 대체.
export async function fetchPopular(): Promise<string[]> {
  try {
    const res = await fetch("/api/popular", { headers: { accept: "application/json" } });
    if (!res.ok) return [];
    const data = (await res.json()) as { words: string[] };
    return data.words ?? [];
  } catch {
    return [];
  }
}

// 사용자 지정 관심 주제의 낱말 추천 및 krdict 검증(PLAN.md §13)
export async function fetchTopicWords(
  topic: string,
): Promise<{ status: "ok" | "blocked" | "not_found" | "error"; emoji?: string; words: string[]; message?: string }> {
  const t = topic.trim();
  if (!t) return { status: "error", words: [], message: "주제를 입력해주세요." };
  try {
    const res = await fetch(`/api/topic-words?topic=${encodeURIComponent(t)}`, {
      headers: { accept: "application/json" },
    });
    const data = (await res.json()) as {
      status: "ok" | "blocked" | "not_found" | "error";
      emoji?: string;
      words: string[];
      message?: string;
    };
    return data;
  } catch {
    return { status: "error", words: [], message: "연결 중 문제가 생겼어요. 잠시 후 다시 시도해주세요." };
  }
}

// 커스텀 주제를 dgedu.link 단축 링크로 생성하여 공유
export async function createTopicShareLink(topic: {
  title: string;
  emoji: string;
  words: string[];
}): Promise<string | null> {
  try {
    const res = await fetch("/api/share-topic", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(topic),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { status: string; shortUrl?: string; fullUrl?: string };
    return data.shortUrl || data.fullUrl || null;
  } catch {
    return null;
  }
}

// 초성 및 낱말 자동완성 추천 목록 조회
export async function fetchSuggestions(query: string): Promise<string[]> {
  const q = query.trim();
  if (!q) return [];
  try {
    const res = await fetch(`/api/suggest?q=${encodeURIComponent(q)}`, {
      headers: { accept: "application/json" },
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { suggestions?: string[] };
    return data.suggestions ?? [];
  } catch {
    return [];
  }
}

// 네이버 웹 이미지 교체(다음 순위) 또는 영구 차단/숨김 요청
export async function requestImageAction(
  word: string,
  currentUrl: string,
  action: "next" | "hide",
  homoIndex = 0,
): Promise<{ success: boolean; image: DictImage | null }> {
  try {
    const res = await fetch("/api/image-action", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ word, currentUrl, action, homoIndex }),
    });
    if (!res.ok) return { success: false, image: null };
    return (await res.json()) as { success: boolean; image: DictImage | null };
  } catch {
    return { success: false, image: null };
  }
}



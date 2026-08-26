import { jsonResponse, type Env } from "../_shared.ts";
import { getCachedWords, getPopular } from "../lib/store.ts";
import { isBlocked } from "../lib/blocklist.ts";
import { extractChoseong, isChoseongOnly, matchesChoseongOrPrefix } from "../lib/choseong.ts";
import { WORD_SETS } from "../../app/lib/words.ts";

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const url = new URL(context.request.url);
  const q = url.searchParams.get("q")?.trim() ?? "";

  if (!q || q.length > 20 || isBlocked(q)) {
    return jsonResponse({ query: q, suggestions: [] });
  }


  // 1. 기본 큐레이션 단어 풀 수집 (초등 11개 주제 300+개)
  const curatedSet = new Set<string>();
  for (const set of WORD_SETS) {
    for (const w of set.words) {
      curatedSet.add(w);
    }
  }

  // 2. D1 캐시 및 인기 낱말 수집
  const [cachedWords, popularWords] = await Promise.all([
    getCachedWords(context.env, 500).catch(() => []),
    getPopular(context.env, 30).catch(() => []),
  ]);

  for (const w of cachedWords) curatedSet.add(w);
  for (const w of popularWords) curatedSet.add(w);

  const allWords = Array.from(curatedSet);
  const isChoseong = isChoseongOnly(q);
  const queryLower = q.toLowerCase();

  // 3. 매칭 및 순위 산정
  // - 1순위: 표제어가 검색어로 시작 (접두사 완전 일치)
  // - 2순위: 초성이 검색어로 시작 (초성 접두사 일치)
  // - 3순위: 표제어 또는 초성에 포함
  const exactPrefix: string[] = [];
  const choseongPrefix: string[] = [];
  const contains: string[] = [];

  for (const word of allWords) {
    const wordLower = word.toLowerCase();
    const wordChoseong = extractChoseong(wordLower);

    if (isChoseong) {
      if (wordChoseong.startsWith(queryLower)) {
        choseongPrefix.push(word);
      } else if (wordChoseong.includes(queryLower)) {
        contains.push(word);
      }
    } else {
      if (wordLower === queryLower) {
        exactPrefix.unshift(word); // 완전 일치는 최우선
      } else if (wordLower.startsWith(queryLower)) {
        exactPrefix.push(word);
      } else if (wordChoseong.startsWith(extractChoseong(queryLower))) {
        choseongPrefix.push(word);
      } else if (wordLower.includes(queryLower) || matchesChoseongOrPrefix(word, q)) {
        contains.push(word);
      }
    }
  }

  // 중복 제거 및 상위 8개 추출
  const combined = Array.from(new Set([...exactPrefix, ...choseongPrefix, ...contains])).slice(0, 8);

  return jsonResponse({
    query: q,
    isChoseong,
    suggestions: combined,
  });
};

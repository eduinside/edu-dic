import { jsonResponse, type Env } from "../_shared.ts";
import { getWordPool } from "../lib/store.ts";
import { isBlocked } from "../lib/blocklist.ts";
import { isChoseongOnly, rankSuggestions } from "../lib/choseong.ts";
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

  // 2. D1 캐시 및 인기 낱말 수집 (풀 1000개, isolate 메모리에 5분 보관)
  const { cached: cachedWords, popular: popularWords } = await getWordPool(context.env);

  for (const w of cachedWords) curatedSet.add(w);
  for (const w of popularWords) curatedSet.add(w);

  // 3. 매칭 및 순위 산정 — 브라우저 즉시 추천(SearchBox)과 같은 규칙, 상위 10개
  const suggestions = rankSuggestions(curatedSet, q, 10).filter((w) => !isBlocked(w));

  return jsonResponse({
    query: q,
    isChoseong: isChoseongOnly(q),
    suggestions,
  });
};

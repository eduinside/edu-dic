import { json, type Env } from "../_shared.ts";
import { generateText } from "../lib/ai.ts";
import { isBlocked } from "../lib/blocklist.ts";
import { getOrFetchEntry } from "../lib/dictionary.ts";
import { searchWord } from "../lib/krdict.ts";
import { putCachedEntry } from "../lib/store.ts";

// GET /api/related?q=낱말 — AI 관련어 제안(D17-3). 결과 화면이 이미 뜬 뒤 지연 호출되는 보조 정보라
// "바로 찾아서 바로 보여준다" 핵심 경로를 막지 않는다(App.tsx가 lookup 완료 후 별도로 호출).
//
// AI가 제안한 낱말을 그대로 보여주지 않고, 하나하나 krdict에 실제 있는지 검증한 것만 남긴다
// (오타 교정과 같은 접지 패턴) — 클릭했는데 "준비 중"만 뜨는 낱말을 추천하지 않기 위함.
export const onRequestGet: PagesFunction<Env> = async ({ request, env, waitUntil }) => {
  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  if (!q || isBlocked(q)) return json({ words: [] });

  const entry = await getOrFetchEntry(env, q, waitUntil);
  if (!entry) return json({ words: [] });

  if (entry.related) {
    return json({ words: entry.related });
  }
  if ((!env.TIMELY_API_KEY && !env.GEMINI_API_KEY) || !env.KRDICT_API_KEY) {
    return json({ words: [] });
  }

  const raw = await generateText(env, {
    systemPrompt:
      "다음 한국어 낱말과 뜻이나 주제가 비슷한 낱말을 3~5개 골라 쉼표(,)로만 구분해서 출력해. " +
      "초등학생이 배우기 좋은 쉬운 낱말로 골라. 입력한 낱말 자체는 넣지 마. 설명이나 문장부호 없이 낱말만.",
    userMessage: q,
  }).catch(() => null);

  if (!raw) return json({ words: [] });

  const candidates = [...new Set(raw.split(/[,，、\n]/).map((w) => w.trim()).filter(Boolean))]
    .filter((w) => w !== q && w.length <= 12 && !isBlocked(w))
    .slice(0, 8);

  const verified: string[] = [];
  for (const c of candidates) {
    if (verified.length >= 5) break;
    try {
      const found = await searchWord(env.KRDICT_API_KEY, c);
      if (found) verified.push(found.word);
    } catch {
      /* 이 후보만 건너뜀 */
    }
  }

  entry.related = verified;
  waitUntil(putCachedEntry(env, q, entry).catch(() => {}));
  return json({ words: verified });
};

import { json, type Env } from "../_shared.ts";
import { generateText } from "../lib/ai.ts";
import { isBlocked } from "../lib/blocklist.ts";
import { searchWord } from "../lib/krdict.ts";
import { getCachedEntry, patchCachedEntry } from "../lib/store.ts";

interface CommunityTopicMatch {
  title: string;
  emoji: string;
  words: string[];
}

// D1 공유 데이터베이스(edudic_shares)에서 검색 낱말이 포함된 커스텀 주제 탐색
async function findCommunityTopicForWord(db: D1Database | undefined, word: string): Promise<CommunityTopicMatch | null> {
  if (!db) return null;
  try {
    const rows = await db
      .prepare("SELECT payload FROM edudic_shares WHERE payload LIKE ? ORDER BY created_at DESC LIMIT 10")
      .bind(`%${word}%`)
      .all<{ payload: string }>();

    if (rows && rows.results) {
      for (const row of rows.results) {
        try {
          const parsed = JSON.parse(row.payload) as { title?: string; emoji?: string; words?: string[] };
          if (parsed.title && Array.isArray(parsed.words) && parsed.words.includes(word)) {
            const siblings = parsed.words.filter((w) => w !== word && !isBlocked(w));
            if (siblings.length > 0) {
              return {
                title: parsed.title,
                emoji: parsed.emoji || "💡",
                words: siblings.slice(0, 10),
              };
            }
          }
        } catch {
          /* 개별 row 파싱 실패 무시 */
        }
      }
    }
  } catch (err) {
    console.error("findCommunityTopicForWord failed:", err);
  }
  return null;
}

// GET /api/related?q=낱말 — 커스텀 낱말사전 기반 주제 탐색 + AI 관련어 제안
export const onRequestGet: PagesFunction<Env> = async ({ request, env, waitUntil }) => {
  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  if (!q || isBlocked(q)) return json({ words: [], communityTopic: null });

  // 관련어에는 표제어만 있으면 된다 — 캐시 항목은 저장된 관련어를 꺼내 보는 데만 쓰고, 없다고 krdict를
  // 처음부터 다시 조회하지 않는다(화면은 /api/lookup 성공 뒤에만 이걸 부르므로 보통 캐시에 있다).
  const [entry, communityTopic] = await Promise.all([
    getCachedEntry(env, q).catch(() => null),
    findCommunityTopicForWord(env.DB, q),
  ]);

  // 1. 이미 캐시된 AI 관련어가 있는 경우
  if (entry?.related && entry.related.length > 0) {
    return json({ words: entry.related, communityTopic });
  }

  // 2. AI 키나 사전 키가 없으면 커스텀 주제 연관어 기반으로 폴백
  if ((!env.TIMELY_API_KEY && !env.GEMINI_API_KEY) || !env.KRDICT_API_KEY) {
    const fallbackWords = communityTopic ? communityTopic.words.slice(0, 5) : [];
    return json({ words: fallbackWords, communityTopic });
  }

  // 3. 커스텀 주제 컨텍스트를 반영하여 AI 관련어 생성
  const topicContext = communityTopic
    ? `이 낱말('${q}')은 초등학생 주제 '${communityTopic.title}'(예: ${communityTopic.words.slice(0, 4).join(", ")})에 소속되어 있습니다. `
    : "";

  const raw = await generateText(env, {
    systemPrompt:
      topicContext +
      "다음 한국어 낱말과 뜻이나 주제가 밀접하게 비슷한 낱말을 3~5개 골라 쉼표(,)로만 구분해서 출력해. " +
      "초등학생이 배우기 좋은 쉬운 낱말로 골라. 입력한 낱말 자체는 넣지 마. 설명이나 문장부호 없이 낱말만.",
    userMessage: q,
  }).catch(() => null);

  if (!raw) {
    const fallbackWords = communityTopic ? communityTopic.words.slice(0, 5) : [];
    return json({ words: fallbackWords, communityTopic });
  }

  const candidates = [...new Set(raw.split(/[,，、\n]/).map((w) => w.trim()).filter(Boolean))]
    .filter((w) => w !== q && w.length <= 12 && !isBlocked(w))
    .slice(0, 8);

  // 후보를 한꺼번에 검증한다(예전에는 하나씩 기다려 파리 엣지 기준 25초까지 걸렸다). 순서는 AI 순서 유지.
  const krdictKey = env.KRDICT_API_KEY;
  const checked = await Promise.all(candidates.map((c) => searchWord(krdictKey, c).catch(() => null)));
  const verified = [...new Set(checked.flatMap((f) => (f ? [f.word] : [])))].slice(0, 5);

  // AI 검증 결과가 부족할 경우 커스텀 주제 단어로 보충
  if (verified.length < 3 && communityTopic) {
    for (const sib of communityTopic.words) {
      if (verified.length >= 5) break;
      if (!verified.includes(sib)) verified.push(sib);
    }
  }

  if (entry) waitUntil(patchCachedEntry(env, q, [["$.related", verified]]).catch(() => {}));

  return json({ words: verified, communityTopic });
};

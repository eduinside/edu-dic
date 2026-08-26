import { json, type Env } from "../_shared.ts";
import { isBlocked } from "../lib/blocklist.ts";
import { getOrFetchEntry } from "../lib/dictionary.ts";
import { isChoseongOnly, matchesChoseongOrPrefix } from "../lib/choseong.ts";
import { KrdictError, searchWord } from "../lib/krdict.ts";
import { searchNaverErrata } from "../lib/naver.ts";
import { predictWordCandidate } from "../lib/ai.ts";
import { bumpPopular, getCachedWords } from "../lib/store.ts";

// 사전에 없는 낱말이거나 미등록 초성일 때:
// 1) 네이버 오타 변환 API (NCP API Hub)
// 2) AI 추측 추천 (Timely / Gemini)
// 3) 국어원 표제어 유효성 검증
async function suggestCorrection(env: Env, word: string): Promise<string | undefined> {
  const naverId = env["X-NCP-APIGW-API-KEY-ID"];
  const naverKey = env["X-NCP-APIGW-API-KEY"];

  // 1. 네이버 오타 변환 시도
  if (naverId && naverKey) {
    const corrected = await searchNaverErrata(naverId, naverKey, word).catch(() => null);
    if (corrected && corrected !== word && corrected.length <= 12 && !isBlocked(corrected)) {
      if (env.KRDICT_API_KEY) {
        try {
          const found = await searchWord(env.KRDICT_API_KEY, corrected);
          if (found) return found.word;
        } catch {}
      } else {
        return corrected;
      }
    }
  }

  // 2. AI 낱말 추측 시도 (초성 미등록어 'ㄱㄱㅁ' 또는 오타 '고굼마' 등)
  const aiCandidate = await predictWordCandidate(env, word).catch(() => null);
  if (aiCandidate && aiCandidate !== word && !isBlocked(aiCandidate)) {
    if (env.KRDICT_API_KEY) {
      try {
        const found = await searchWord(env.KRDICT_API_KEY, aiCandidate);
        if (found) return found.word;
      } catch {}
    }
    return aiCandidate;
  }

  return undefined;
}

// GET /api/lookup?q=낱말
export const onRequestGet: PagesFunction<Env> = async ({ request, env, waitUntil }) => {
  const url = new URL(request.url);
  let q = (url.searchParams.get("q") ?? "").trim();
  if (!q) return json({ status: "not_found", word: "" });

  if (isBlocked(q)) {
    return json({ status: "blocked", word: q });
  }

  // 0) 검색어가 초성만으로 구성된 경우 (예: "ㄷㄱ", "ㄱㄱㅁ")
  if (isChoseongOnly(q)) {
    const cachedWords = await getCachedWords(env);
    const matched = cachedWords.find((w) => matchesChoseongOrPrefix(w, q));
    if (matched) {
      q = matched;
    } else {
      // D1에 없는 초성인 경우: AI에게 대표 낱말 추측 요청 (예: 'ㄱㄱㅁ' -> '고구마')
      const suggestion = await suggestCorrection(env, q).catch(() => undefined);
      return json({ status: "not_found", word: q, suggestion });
    }
  }

  if (!env.KRDICT_API_KEY) {
    return json({ status: "error", word: q, message: "KRDICT_API_KEY 미설정(.dev.vars)" }, { status: 500 });
  }

  try {
    const entry = await getOrFetchEntry(env, q, waitUntil);
    if (!entry) {
      const suggestion = await suggestCorrection(env, q).catch(() => undefined);
      return json({ status: "not_found", word: q, suggestion });
    }
    waitUntil(bumpPopular(env, q).catch(() => {}));
    return json({ status: "ok", entry });
  } catch (e) {
    if (e instanceof KrdictError) {
      return json({ status: "error", word: q, message: e.message }, { status: 502 });
    }
    return json({ status: "error", word: q, message: "알 수 없는 오류" }, { status: 500 });
  }
};


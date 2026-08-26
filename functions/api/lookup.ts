import { json, type Env } from "../_shared.ts";
import { isBlocked } from "../lib/blocklist.ts";
import { getOrFetchEntry } from "../lib/dictionary.ts";
import { KrdictError, searchWord } from "../lib/krdict.ts";
import { searchNaverErrata } from "../lib/naver.ts";
import { bumpPopular } from "../lib/store.ts";

// 사전에 없는 낱말일 때만(드문 경로) 네이버 오타 변환 API(NCP API Hub)로 교정을 시도하고, 그 결과가
// 실제 krdict 표제어인지 다시 검증한다(D29 — AI 대신 이 공식 API로 교체. 이미지 검색과 같은 키·쿼터
// 공유). 지어낸 낱말을 보여주지 않기 위한 접지(grounding) 단계는 그대로 유지 — 검증 실패·키 미설정·
// 차단어면 조용히 undefined(사용자에게는 평범한 "준비 중" 안내만 보임).
async function suggestCorrection(env: Env, word: string): Promise<string | undefined> {
  const naverId = env["X-NCP-APIGW-API-KEY-ID"];
  const naverKey = env["X-NCP-APIGW-API-KEY"];
  if (!naverId || !naverKey || !env.KRDICT_API_KEY) return undefined;

  const corrected = await searchNaverErrata(naverId, naverKey, word).catch(() => null);
  if (!corrected || corrected === word || corrected.length > 12) return undefined;
  if (isBlocked(corrected)) return undefined;

  try {
    const found = await searchWord(env.KRDICT_API_KEY, corrected);
    return found ? found.word : undefined;
  } catch {
    return undefined;
  }
}

// GET /api/lookup?q=낱말
//
// 1) 로컬 금칙어 프리필터 → 즉시 차단(D8)
// 2) edudic_dict_cache 조회 → HIT면 즉시 반환(krdict 미호출, 계획서 ★ "바로 찾아서 바로 보여준다")
// 3) MISS → krdict search+view 호출·정규화(+encykorea/네이버 이미지 폴백) → 캐시 저장 → 반환.
//    미수록이면 not_found(D10 — 표준대사전 폴백 없음). 이때만 네이버 오타 변환을 1회 시도(D29).
// 4) 성공 조회만 edudic_popular 카운트 증가(익명, 차단어는 집계 제외)
export const onRequestGet: PagesFunction<Env> = async ({ request, env, waitUntil }) => {
  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  if (!q) return json({ status: "not_found", word: "" });

  if (isBlocked(q)) {
    return json({ status: "blocked", word: q });
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

import { json, type Env } from "../_shared.ts";
import { generateText } from "../lib/ai.ts";
import { isBlocked } from "../lib/blocklist.ts";
import { getOrFetchEntry } from "../lib/dictionary.ts";
import { putCachedEntry } from "../lib/store.ts";
import type { DictSense } from "../../app/types.ts";

// GET /api/simplify?q=낱말&h=동음이의어_인덱스(선택, 기본 0) — 상단 "쉬운 말로" 토글용(D17-2).
//
// D25: 동음이의어(예: 배¹신체/배²선박/배³과일)를 탭으로 전환할 수 있게 되면서, "쉬운 말로"도 지금 보고
// 있는 그 뜻에 맞춰 따로 변환해야 한다. h로 어느 동음이의어인지 받아 그 뜻풀이만 변환하고,
// entry.homographs[h].easySenses(대표=0이면 entry.easySenses에도 동기화)로 각각 캐시한다.
//
// "스켈레톤 → 변환": krdict 뜻풀이(정답)를 뼈대로 주고, AI에게는 어미·단어만 살짝 바꾸는 게 아니라
// 초등 저학년이 실제로 이해할 만한 쉬운 개념으로 통째로 다시 설명하게 한다(새 사실 추가는 여전히 금지 —
// 정확성이 임계 경로). 응답 항목 수가 원문과 다르면 신뢰하지 않고 버리고, 검증 실패 시 조용히
// 원문으로 되돌아간다.
export const onRequestGet: PagesFunction<Env> = async ({ request, env, waitUntil }) => {
  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  const h = Math.max(0, Number(url.searchParams.get("h") ?? "0") || 0);
  if (!q || isBlocked(q)) return json({ status: "not_found", word: q });

  const entry = await getOrFetchEntry(env, q, waitUntil);
  if (!entry) return json({ status: "not_found", word: q });

  const homographs = entry.homographs && entry.homographs.length > 1 ? entry.homographs : null;
  const targetSenses = homographs ? homographs[h]?.senses : entry.senses;
  if (!targetSenses) return json({ status: "ok", easySenses: null });

  const already = homographs ? homographs[h]?.easySenses : entry.easySenses;
  if (already) {
    return json({ status: "ok", easySenses: already });
  }
  if (!env.TIMELY_API_KEY && !env.GEMINI_API_KEY) {
    return json({ status: "ok", easySenses: null }); // AI 미설정 → 쉬운 말 변환만 생략, 원문은 그대로 사용 가능
  }

  const inputData = targetSenses.map((s, i) => ({
    no: i + 1,
    originalDef: s.def,
    originalExample: s.example || "",
  }));

  const raw = await generateText(env, {
    systemPrompt:
      "너는 초등학교 1~2학년 학생에게 낱말 뜻을 설명해 주는 선생님이야. 아래 국어사전 뜻풀이와 예문을 " +
      "그 학생이 실제로 알아들을 수 있도록 쉬운 개념의 뜻풀이와 학교/일상 상황의 쉬운 예문으로 다시 작성해.\n" +
      "규칙:\n" +
      "(1) 뜻풀이(def): 초등 저학년 눈높이로 완전히 풀어서 설명(한자어·전문용어 배제). 끝은 '~하는 것.', '~한 도구.'처럼 명사형으로 마침.\n" +
      "(2) 예문(example): 어린이가 집이나 학교에서 직접 말하거나 겪을 법한 친근하고 쉬운 1문장. 해당 낱말이 반드시 포함되어야 함.\n" +
      "(3) 입력 항목 개수와 순서를 정확히 유지하여 반드시 다음 JSON 배열 형식으로만 출력:\n" +
      `[{"def": "쉬운 뜻풀이", "example": "어린이 쉬운 예문"}]`,
    userMessage: `낱말: "${q}"\n\n항목 목록:\n${JSON.stringify(inputData, null, 2)}`,
    temperature: 0.3,
  }).catch(() => null);

  const easySenses = raw ? parseEasySenses(raw, targetSenses) : null;

  if (easySenses) {
    if (homographs) {
      homographs[h] = { ...homographs[h], easySenses };
      entry.homographs = homographs;
      if (h === 0) entry.easySenses = easySenses; // 대표 뜻 필드도 동기화(하위 호환)
    } else {
      entry.easySenses = easySenses;
    }
    waitUntil(putCachedEntry(env, q, entry).catch(() => {}));
  }

  return json({ status: "ok", easySenses });
};

// JSON 배열 또는 텍스트 폴백으로 DictSense 배열 파싱
function parseEasySenses(raw: string, original: DictSense[]): DictSense[] | null {
  try {
    const clean = raw.replace(/^```(json)?\s*/i, "").replace(/\s*```$/, "").trim();
    const parsed = JSON.parse(clean) as { def?: string; example?: string }[];
    if (Array.isArray(parsed) && parsed.length === original.length) {
      return parsed.map((item, i) => ({
        def: (item.def ?? "").trim() || original[i].def,
        example: (item.example ?? "").trim() || original[i].example,
      }));
    }
  } catch {
    // JSON 파싱 실패 시 기존 번호 기반 텍스트 파싱 폴백
    const items = raw
      .split(/\d+\.\s*/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    if (items.length === original.length) {
      return items.map((def, i) => ({ def, example: original[i]?.example }));
    }
  }
  return null;
}

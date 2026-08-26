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

  const numbered = targetSenses.map((s, i) => `${i + 1}. ${s.def}`).join("\n");
  const raw = await generateText(env, {
    systemPrompt:
      "너는 초등학교 1~2학년 학생에게 낱말 뜻을 설명해 주는 선생님이야. 아래 국어사전 뜻풀이를 " +
      "그 학생이 실제로 알아들을 수 있도록 쉬운 개념으로 통째로 다시 설명해. 단어만 살짝 바꾸거나 " +
      "말끝(어미)만 다듬는 정도로는 부족해 — 어려운 한자어·전문 용어가 있으면 아이가 아는 쉬운 말이나 " +
      "익숙한 상황에 빗댄 표현으로 완전히 풀어서 설명해도 좋아. 규칙: " +
      "(1) 원래 뜻풀이에 없는 새로운 사실(색깔·크기·용도 같은 구체 정보)을 지어내지 마 — 설명 방식만 " +
      "쉽게 바꾸는 것이지 내용을 추가하는 게 아니야. " +
      "(2) 한 항목은 짧은 문장 1~2개로. " +
      "(3) 문장 끝은 원래 사전처럼 명사형으로 끝내(예: '~하는 것.', '~한 도구.', '~하는 사람.'). " +
      "'~하는 거야', '~해요', '~야' 같은 구어체 종결어미는 쓰지 마 — 쉬운 말이지 반말체 설명이 아니야. " +
      "(4) 입력과 똑같은 개수로 '번호. 내용' 형식을 유지하되, 항목과 항목 사이는 반드시 줄바꿈으로 구분해 " +
      "(한 항목의 내용 자체를 여러 줄로 쪼개지만 않으면 돼). 다른 설명은 붙이지 마.",
    userMessage: numbered,
  }).catch(() => null);

  const easySenses = raw ? parseNumberedLines(raw, targetSenses) : null;

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

// "1. 내용 2. 내용 …" 을 파싱한다. 번호 마커 기준으로 나누고(줄바꿈 여부와 무관 — AI가 가끔 한 줄에
// 다 이어붙여서 준다, 실측) 항목 개수가 원문과 다르면 검증 실패(null)로 취급한다.
function parseNumberedLines(raw: string, original: DictSense[]): DictSense[] | null {
  const items = raw
    .split(/\d+\.\s*/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (items.length !== original.length) return null;
  return items.map((def, i) => ({ def, example: original[i]?.example }));
}

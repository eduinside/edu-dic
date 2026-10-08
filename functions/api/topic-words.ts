import { json, type Env } from "../_shared.ts";
import { generateText } from "../lib/ai.ts";
import { isBlocked } from "../lib/blocklist.ts";
import { searchWord } from "../lib/krdict.ts";
import { searchNaverWeb } from "../lib/naver.ts";

// GET /api/topic-words?topic=우주와별 — 사용자 지정 관심 주제의 낱말 추천 및 krdict 검증(PLAN.md §13).
//
// 1. 금칙어 검사
// 2. 네이버 웹문서 API(NCP search/v1/webkr)로 주제 관련 세부 정보/어휘 사전 탐색
// 3. AI(Timely/Gemini)로 웹문서 컨텍스트 기반 구체적 초등 어휘 후보 및 대표 이모지 생성
// 4. krdict API로 실존 낱말 검증 (환각 방지 접지)
// 5. 검증된 낱말 목록과 이모지 반환
export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const url = new URL(request.url);
  const topic = (url.searchParams.get("topic") ?? "").trim();

  if (!topic) {
    return json({ status: "error", message: "주제를 입력해주세요." }, { status: 400 });
  }

  if (isBlocked(topic)) {
    return json({ status: "blocked", message: "알맞지 않은 표현이 포함되어 있어요." }, { status: 400 });
  }

  if (!env.KRDICT_API_KEY) {
    return json({ status: "error", message: "사전 검색 설정을 확인해주세요." }, { status: 500 });
  }

  // 네이버 웹문서 검색으로 주제 관련 구체 어휘 컨텍스트 확보
  let webSnippets: string[] = [];
  const ncpId = env["X-NCP-APIGW-API-KEY-ID"];
  const ncpKey = env["X-NCP-APIGW-API-KEY"];
  if (ncpId && ncpKey) {
    webSnippets = await searchNaverWeb(ncpId, ncpKey, topic, 4);
  }

  const contextText =
    webSnippets.length > 0
      ? `\n[참고 웹문서 정보]:\n${webSnippets.join("\n")}\n\n위 참고 자료에 등장하는 구체적인 낱말(명칭, 사물, 도구 등)을 적극 참고하여 `
      : "";

  // AI 프롬프트 실행
  const prompt =
    `주제: "${topic}"\n` +
    contextText +
    `위 주제와 밀접하게 관련된 초등학교 1~2학년(유치원~초등 저학년) 수준의 구체적이고 쉬운 한국어 낱말(명사 중심)을 12~18개 골라줘.\n` +
    `너무 상위의 뻔한 범주어(예: 24절기 주제에 단순히 '봄, 여름, 계절'만 나열하는 것)는 피하고, 주제를 구체적으로 나타내는 낱말(예: 24절기라면 '입춘', '하지', '추분', '동지', '서리' 등)을 풍부하게 포함해줘.\n` +
    `어울리는 대표 이모지 1개도 골라줘.\n` +
    `반드시 다음 JSON 형식으로만 응답해 (추가 설명 금지):\n` +
    `{"emoji": "대표이모지", "words": ["낱말1", "낱말2", ...]}`;

  let emoji = "💡";
  let candidateWords: string[] = [];

  const raw = await generateText(env, {
    systemPrompt:
      "너는 초등학교 국어 어휘 지도 전문가이자 교육 과정 전문가야. 주어진 주제와 참고 웹문서를 분석하여 어린이들이 배우기 좋은 생생하고 구체적인 한국어 기초 어휘를 정확한 JSON으로만 답해줘.",
    userMessage: prompt,
    temperature: 0.3,
    json: true,
    timeoutMs: 15000, // 낱말 12~18개 목록이라 다른 AI 호출보다 답이 길다
  }).catch(() => null);

  if (raw) {
    try {
      // JSON 파싱 (코드블록 등 제거)
      const clean = raw.replace(/^```(json)?\s*/i, "").replace(/\s*```$/, "").trim();
      const parsed = JSON.parse(clean) as { emoji?: string; words?: string[] };
      if (parsed.emoji && typeof parsed.emoji === "string") {
        emoji = parsed.emoji.trim();
      }
      if (Array.isArray(parsed.words)) {
        candidateWords = parsed.words
          .map((w) => (typeof w === "string" ? w.trim() : ""))
          .filter((w) => w && w.length <= 10 && !isBlocked(w));
      }
    } catch {
      // JSON 파싱 실패 시 정규식/줄바꿈 폴백
      const lines = raw.split(/[\n,，、]/).map((s) => s.replace(/["'[\]{}:]/g, "").trim()).filter(Boolean);
      candidateWords = lines.filter((w) => w.length >= 1 && w.length <= 10 && !isBlocked(w));
    }
  }

  // 중복 제거
  candidateWords = [...new Set(candidateWords)].slice(0, 16);

  // krdict 접지(Grounding) 검증 — 후보를 한꺼번에 조회하고 AI가 준 순서대로 앞에서 12개
  const krdictKey = env.KRDICT_API_KEY;
  const checked = await Promise.all(candidateWords.map((w) => searchWord(krdictKey, w).catch(() => null)));
  const verifiedWords = [...new Set(checked.flatMap((f) => (f?.word ? [f.word] : [])))].slice(0, 12);

  if (verifiedWords.length === 0) {
    return json({
      status: "not_found",
      topic,
      emoji,
      words: [],
      message: "주제에 맞는 낱말을 사전에서 찾지 못했어요. 다른 주제로 시도해보세요.",
    });
  }

  return json({
    status: "ok",
    topic,
    emoji,
    words: verifiedWords,
  });
};

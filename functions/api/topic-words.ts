import { json, type Env } from "../_shared.ts";
import { generateText } from "../lib/ai.ts";
import { isBlocked } from "../lib/blocklist.ts";
import { searchWord } from "../lib/krdict.ts";

// GET /api/topic-words?topic=우주와별 — 사용자 지정 관심 주제의 낱말 추천 및 krdict 검증(PLAN.md §13).
//
// 1. 금칙어 검사
// 2. AI(Timely/Gemini)로 초등 1~2학년 수준의 어휘 후보 및 대표 이모지 생성
// 3. krdict API로 실존 낱말 검증 (환각 방지 접지)
// 4. 검증된 낱말 목록과 이모지 반환
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

  // AI 프롬프트 실행
  const prompt =
    `주제: "${topic}"\n\n` +
    `위 주제와 밀접하게 관련된 초등학교 1~2학년(유치원~초등 저학년) 수준의 쉬운 한국어 낱말(명사 중심)을 12~15개 추천해줘.\n` +
    `어울리는 대표 이모지 1개도 골라줘.\n` +
    `반드시 다음 JSON 형식으로만 응답해 (추가 설명 금지):\n` +
    `{"emoji": "대표이모지", "words": ["낱말1", "낱말2", ...]}`;

  let emoji = "💡";
  let candidateWords: string[] = [];

  const raw = await generateText(env, {
    systemPrompt: "너는 초등학교 국어 어휘 지도 전문가야. 주어진 주제에 맞는 유아·초등 저학년 기초 어휘를 정확한 JSON으로만 답해줘.",
    userMessage: prompt,
    temperature: 0.3,
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

  // krdict 접지(Grounding) 검증
  const verifiedWords: string[] = [];
  for (const word of candidateWords) {
    if (verifiedWords.length >= 12) break;
    try {
      const found = await searchWord(env.KRDICT_API_KEY, word);
      if (found && found.word) {
        if (!verifiedWords.includes(found.word)) {
          verifiedWords.push(found.word);
        }
      }
    } catch {
      // 개별 단어 조회 실패 시 건너뜀
    }
  }

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

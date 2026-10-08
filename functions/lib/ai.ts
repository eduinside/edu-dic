// Timely 게이트웨이 연동(조직 크레딧, 사실상 무료) + Gemini 직접 폴백.
// byeduin-labs/functions/api/_ai.js의 generateContent 패턴을 이 앱의 텍스트 전용 용도로 이식.
// 상세: byeduin-labs/docs/timely-ai-pattern.md
import type { Env } from "../_shared.ts";

const TIMELY_ENDPOINT = "https://hello.timelygpt.co.kr/api/v2/chat/bridge/openai/chat/completions";
// byeduin 전체 Timely 기본 텍스트 모델과 같게 맞춘다(_ai.js DEFAULT_TIMELY_MODEL, 2026-10-06 운영자 결정).
const TIMELY_MODEL = "openai/gpt-5.6-luna";
// 사진 번호 고르기만 예외. 실측(2026-10-09, 같은 질문 2회씩 6낱말): luna는 3낱말에서 답이 흔들리거나
// 금지 규칙을 어겼다(무지개 0↔1, 행복 0↔3, 우정 → 인물 사진). flash-lite는 6/6 일관되고 더 빨랐다(약 0.9초 대 1.2초).
export const IMAGE_JUDGE_MODEL = "google/gemini-2.5-flash-lite";
const GEMINI_MODEL = "gemini-flash-lite-latest";
const DEFAULT_TIMEOUT_MS = 10000;

async function callTimely(body: unknown, timelyKey: string, timeoutMs: number): Promise<Response> {
  const doFetch = () =>
    fetch(TIMELY_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${timelyKey}` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });

  let res = await doFetch();
  // 429=크레딧 등급 하락에 따른 일시 제한 → 400ms 후 1회 재시도(byeduin 관례).
  if (res.status === 429) {
    await new Promise((r) => setTimeout(r, 400));
    res = await doFetch();
  }
  if (res.status === 402) console.error("[ai] Timely 402(크레딧 소진) — 충전 필요. Gemini로 폴백.");
  return res;
}

interface GenerateOpts {
  systemPrompt: string;
  userMessage: string;
  temperature?: number;
  json?: boolean; // JSON 객체만 받기(Timely response_format / Gemini responseMimeType)
  timeoutMs?: number;
  model?: string; // Timely 모델 오버라이드(기본 TIMELY_MODEL). 직접 Gemini 폴백은 항상 GEMINI_MODEL.
}

// AI 응답 텍스트를 반환. 두 게이트웨이 모두 실패하거나 키가 없으면 null(호출부는 항상 이 실패를
// "AI 기능 생략"으로 조용히 처리해야 한다 — 이 사전 앱의 핵심 경로는 krdict만으로 완결되어야 함).
export async function generateText(env: Env, opts: GenerateOpts): Promise<string | null> {
  const { systemPrompt, userMessage, temperature = 0.3, json = false, timeoutMs = DEFAULT_TIMEOUT_MS, model = TIMELY_MODEL } = opts;
  const timelyKey = env.TIMELY_API_KEY;
  const geminiKey = env.GEMINI_API_KEY;

  if (timelyKey) {
    try {
      const body: Record<string, unknown> = {
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
        temperature,
      };
      // 실측(2026-10-09, luna): 기본값이면 짧은 답에도 추론 토큰 30~45개를 쓰며 2~3초, "none"이면 0개·약 1.5초.
      // 이 앱의 AI 작업(쉬운 말·관련어·오타 추측)은 추론이 필요 없는 짧은 변환이다. OpenAI 계열 모델에만 보낸다.
      if (model.startsWith("openai/")) body.reasoning_effort = "none";
      if (json) body.response_format = { type: "json_object" };
      const res = await callTimely(body, timelyKey, timeoutMs);
      if (res.ok) {
        const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
        const text = data?.choices?.[0]?.message?.content;
        if (text) return text.trim();
        console.error("[ai] Timely OK지만 content 없음:", JSON.stringify(data).slice(0, 300));
      } else {
        console.error("[ai] Timely HTTP", res.status, (await res.text()).slice(0, 300));
      }
    } catch (e) {
      console.error("[ai] Timely fetch 예외:", e instanceof Error ? e.message : String(e));
    }
  }

  if (geminiKey) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${geminiKey}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            system_instruction: { parts: { text: systemPrompt } },
            contents: [{ role: "user", parts: [{ text: userMessage }] }],
            generationConfig: json ? { temperature, responseMimeType: "application/json" } : { temperature },
          }),
          signal: AbortSignal.timeout(timeoutMs),
        },
      );

      if (res.ok) {
        const data = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) return text.trim();
      } else {
        console.error("[ai] Gemini HTTP", res.status);
      }
    } catch {
      /* 조용히 실패 — null 반환 */
    }
  }

  return null;
}

/**
 * 사용자가 입력한 오타나 미등록 초성(예: 'ㄱㄱㅁ' -> '고구마', '고굼마' -> '고구마')을 바탕으로
 * 찾으려 했을 가장 유력한 한국어 표제어 단어 1개를 AI로 추측합니다.
 */
export async function predictWordCandidate(env: Env, input: string): Promise<string | null> {
  const clean = input.trim();
  if (!clean || clean.length > 15) return null;

  const systemPrompt = `너는 초등학생 대상 한국어 사전의 검색어 추천 전문가야.
사용자가 입력한 오타나 초성 단어(예: 'ㄱㄱㅁ' -> '고구마', '고굼마' -> '고구마', 'ㅂㄴㄴ' -> '바나나', 'ㄷㄱ' -> '당근')를 보고, 사용자가 찾으려 했을 가장 대표적이고 친숙한 단 하나의 한국어 표준어 표제어(명사/동사 기본형)만 출력해.
주의: 따옴표나 부가 설명 없이 오직 추천 단어 1개만 단독으로 반환할 것.`;

  const text = await generateText(env, {
    systemPrompt,
    userMessage: `입력어: ${clean}`,
    temperature: 0.1,
  });

  if (!text) return null;
  const word = text.replace(/["'‘’.!]/g, "").trim().split(/\s+/)[0];
  return word && word !== clean && word.length <= 10 ? word : null;
}

/**
 * 네이버 이미지 검색 후보 제목들을 사전 표제어 및 뜻풀이와 대조하여
 * 가장 적절한 번호(1~N)를 선택합니다. 모두 부적합하면 0을 반환합니다. (타임아웃 3초)
 */
export async function selectBestImageIndex(
  env: Env,
  word: string,
  def: string,
  candidateTitles: string[],
): Promise<number | null> {
  if (candidateTitles.length === 0) return null;

  const systemPrompt =
    "너는 초등학생 어린이 사전의 이미지 적합성 심사관이다. 표제어와 사전 뜻풀이에 가장 알맞은 실물 사물/자연/일러스트 사진 번호 1개만 숫자로 답하라. 뉴스 보도 사진, 도심 빌딩, 인물 사진, 책 표지, 광고, 쇼핑, 단순 글자 썸네일은 모두 배제하라. 적절한 후보가 하나도 없으면 0을 출력하라. 반드시 숫자 1개만 출력하라.";


  const userMessage = `낱말: ${word}\n사전 뜻풀이: ${def}\n\n후보 목록:\n${candidateTitles
    .map((t, i) => `${i + 1}: ${t}`)
    .join("\n")}\n\n가장 적합한 번호(숫자 1개):`;

  // luna는 짧은 답도 1.2초 안팎이라(실측) 예전 1.2초 한도면 거의 항상 시간 초과였다. 사진 채우기는 이제
  // 첫 응답 뒤(/api/image)에서 돌아서 3초로 늘려도 화면이 기다리지 않는다.
  const aiPromise = generateText(env, {
    systemPrompt,
    userMessage,
    temperature: 0.1,
    timeoutMs: 3000,
    model: IMAGE_JUDGE_MODEL,
  });

  const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000));

  try {
    const raw = await Promise.race([aiPromise, timeoutPromise]);
    if (!raw) return null;
    const match = raw.match(/\d+/);
    if (match) {
      const idx = parseInt(match[0], 10);
      return isNaN(idx) ? null : idx;
    }
    return null;
  } catch {
    return null;
  }
}



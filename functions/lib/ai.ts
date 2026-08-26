// Timely 게이트웨이 연동(조직 크레딧, 사실상 무료) + Gemini 직접 폴백.
// byeduin-labs/functions/api/_ai.js의 generateContent 패턴을 이 앱의 텍스트 전용 용도로 이식.
// 상세: byeduin-labs/docs/timely-ai-pattern.md
import type { Env } from "../_shared.ts";

const TIMELY_ENDPOINT = "https://hello.timelygpt.co.kr/api/v2/chat/bridge/openai/chat/completions";

async function callTimely(body: unknown, timelyKey: string): Promise<Response> {
  const doFetch = () =>
    fetch(TIMELY_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${timelyKey}` },
      body: JSON.stringify(body),
    });

  let res = await doFetch();
  // 429=크레딧 등급 하락에 따른 일시 제한 → 400ms 후 1회 재시도(byeduin 관례).
  if (res.status === 429) {
    await new Promise((r) => setTimeout(r, 400));
    res = await doFetch();
  }
  return res;
}

interface GenerateOpts {
  systemPrompt: string;
  userMessage: string;
  temperature?: number;
}

// AI 응답 텍스트를 반환. 두 게이트웨이 모두 실패하거나 키가 없으면 null(호출부는 항상 이 실패를
// "AI 기능 생략"으로 조용히 처리해야 한다 — 이 사전 앱의 핵심 경로는 krdict만으로 완결되어야 함).
export async function generateText(env: Env, opts: GenerateOpts): Promise<string | null> {
  const { systemPrompt, userMessage, temperature = 0.3 } = opts;
  const timelyKey = env.TIMELY_API_KEY;
  const geminiKey = env.GEMINI_API_KEY;

  if (timelyKey) {
    try {
      const res = await callTimely(
        {
          model: "google/gemini-2.5-flash-lite",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userMessage },
          ],
          temperature,
        },
        timelyKey,
      );
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
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent?key=${geminiKey}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            system_instruction: { parts: { text: systemPrompt } },
            contents: [{ role: "user", parts: [{ text: userMessage }] }],
            generationConfig: { temperature },
          }),
        },
      );


      if (res.ok) {
        const data = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) return text.trim();
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


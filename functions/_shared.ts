// Pages Functions 공용 헬퍼.
export interface Env {
  DB: D1Database; // 공유 edu-link-db (테이블은 edudic_ 접두어)
  KRDICT_API_KEY?: string; // krdict 인증키 — .dev.vars(로컬) / CF Secret(운영)
  ENCYKOREA_API_KEY?: string; // 한국민족문화대백과사전 — krdict 미수록 텍스트 또는 이미지 보완(D20). 없으면 생략.
  // 네이버(NCP API Gateway) 이미지 검색 — krdict·encykorea 둘 다 이미지 없을 때만 쓰는 3순위 폴백(D24, 카카오 대체).
  // 헤더명을 그대로 변수명으로 씀(.dev.vars에 이미 이 이름으로 들어 있음) — 대괄호 표기로 접근.
  "X-NCP-APIGW-API-KEY-ID"?: string;
  "X-NCP-APIGW-API-KEY"?: string;
  TIMELY_API_KEY?: string; // AI 게이트웨이(오타 교정·쉬운 말 변환·관련어). 없으면 해당 AI 기능만 생략.
  GEMINI_API_KEY?: string; // Timely 실패 시 직접 폴백(선택).
}

export function json(data: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...(init?.headers ?? {}),
    },
  });
}

// Pages Functions 공용 헬퍼.
export interface Env {
  DB: D1Database; // 공유 edu-link-db (테이블은 edudic_ 접두어)
  KRDICT_API_KEY?: string; // krdict 인증키 — .dev.vars(로컬) / CF Secret(운영)
  ENCYKOREA_API_KEY?: string; // 한국민족문화대백과사전 — krdict 미수록 텍스트 또는 이미지 보완(D20). 없으면 생략.
  "X-NCP-APIGW-API-KEY-ID"?: string;
  "X-NCP-APIGW-API-KEY"?: string;
  TIMELY_API_KEY?: string; // AI 게이트웨이(오타 교정·쉬운 말 변환·관련어). 없으면 해당 AI 기능만 생략.
  GEMINI_API_KEY?: string; // Timely 실패 시 직접 폴백(선택).
  DGEDU_LINK_API_KEY?: string; // dgedu.link 단축 링크 생성 API 키 (공유용)
  DOWNLOADS?: R2Bucket; // R2 버킷 (데스크탑 설치 프로그램 및 업데이트 매니페스트)
}

export function json(data: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET, HEAD, POST, OPTIONS",
      "access-control-allow-headers": "*",
      ...(init?.headers ?? {}),
    },
  });
}

export const jsonResponse = json;

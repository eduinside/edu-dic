import { json, type Env } from "../_shared.ts";

interface ShareTopicPayload {
  title: string;
  emoji: string;
  words: string[];
}

// POST /api/share-topic — 커스텀 낱말 주제를 dgedu.link 단축 링크로 생성하여 공유
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  let body: ShareTopicPayload;
  try {
    body = (await request.json()) as ShareTopicPayload;
  } catch {
    return json({ status: "error", message: "잘못된 요청 형식입니다." }, { status: 400 });
  }

  const { title, emoji = "💡", words = [] } = body;
  if (!title || !Array.isArray(words) || words.length === 0) {
    return json({ status: "error", message: "주제명과 낱말 목록이 필요합니다." }, { status: 400 });
  }

  // 1. 공유용 전체 URL 생성 (수신자가 접속했을 때 파싱할 수 있도록 압축/인코딩)
  const origin = new URL(request.url).origin;
  const baseUrl = origin.includes("localhost") || origin.includes("127.0.0.1") ? origin : "https://dic.dgedu.link";
  const rawData = JSON.stringify({ title, emoji, words });
  const shareParam = encodeURIComponent(rawData);
  const targetUrl = `${baseUrl}/my?shareTopic=${shareParam}`;

  // 2. dgedu.link API로 단축 링크 생성 시도
  const apiKey = env.DGEDU_LINK_API_KEY;
  if (apiKey) {
    try {
      const linkRes = await fetch("https://dgedu.link/api/create", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${apiKey}`,
          "x-api-key": apiKey,
        },
        body: JSON.stringify({
          url: targetUrl,
          title: `어린이 쉬운 사전 - ${title} (${words.length}낱말)`,
        }),
      });

      if (linkRes.ok) {
        const linkData = (await linkRes.json()) as {
          shortUrl?: string;
          url?: string;
          code?: string;
        };
        const shortUrl =
          linkData.shortUrl ||
          linkData.url ||
          (linkData.code ? `https://dgedu.link/${linkData.code}` : null);
        if (shortUrl) {
          return json({ status: "ok", shortUrl, fullUrl: targetUrl });
        }
      }
    } catch {
      // dgedu.link 호출 실패 시 fullUrl 폴백으로 진행
    }
  }

  // dgedu.link 키가 없거나 실패한 경우 fullUrl 반환
  return json({ status: "ok", shortUrl: targetUrl, fullUrl: targetUrl });
};

import { json, type Env } from "../_shared.ts";

interface ShareTopicPayload {
  title: string;
  emoji: string;
  words: string[];
}

function nanoid(n = 8) {
  const alphabet = "0123456789abcdefghijkmnpqrstuvwxyz";
  const arr = new Uint8Array(n);
  crypto.getRandomValues(arr);
  let s = "";
  for (let i = 0; i < n; i++) s += alphabet[arr[i] % alphabet.length];
  return s;
}

// D1 공유 테이블 자동 생성 보장
async function ensureShareTable(db: D1Database) {
  try {
    await db
      .prepare(
        "CREATE TABLE IF NOT EXISTS edudic_shares (id TEXT PRIMARY KEY, payload TEXT NOT NULL, created_at INTEGER NOT NULL)",
      )
      .run();
  } catch {
    /* 테이블 생성 오류 무시 */
  }
}

// GET /api/share-topic?id=xxxx — 단축 ID로 공유 데이터 조회
export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  if (!id) {
    return json({ status: "error", message: "공유 ID가 필요합니다." }, { status: 400 });
  }

  if (env.DB) {
    try {
      await ensureShareTable(env.DB);
      const row = await env.DB.prepare("SELECT payload FROM edudic_shares WHERE id = ?")
        .bind(id)
        .first<{ payload: string }>();

      if (row && row.payload) {
        const parsed = JSON.parse(row.payload);
        return json({ status: "ok", ...parsed });
      }
    } catch {
      /* DB 조회 실패 시 404 */
    }
  }

  return json({ status: "error", message: "공유된 주제를 찾을 수 없습니다." }, { status: 404 });
};

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

  const origin = new URL(request.url).origin;
  const baseUrl =
    origin.includes("localhost") || origin.includes("127.0.0.1") ? origin : "https://dic.dgedu.link";

  let targetUrl = "";

  // 1. D1 DB가 있으면 가벼운 shareId URL 생성
  if (env.DB) {
    try {
      await ensureShareTable(env.DB);
      const id = nanoid(8);
      const payloadStr = JSON.stringify({ title, emoji, words });
      await env.DB.prepare("INSERT INTO edudic_shares (id, payload, created_at) VALUES (?, ?, ?)")
        .bind(id, payloadStr, Date.now())
        .run();
      targetUrl = `${baseUrl}/my?shareId=${id}`;
    } catch (e) {
      console.error("D1 share store failed:", e);
    }
  }

  // D1 저장 실패 시 shareTopic 쿼리스트링 폴백
  if (!targetUrl) {
    const rawData = JSON.stringify({ title, emoji, words });
    const shareParam = encodeURIComponent(rawData);
    targetUrl = `${baseUrl}/my?shareTopic=${shareParam}`;
  }

  // 2. dgedu.link 단축 링크 생성 (ssac-app 및 edulink 표준 API 패턴)
  const apiKey = env.EDULINK_API_KEY || env.DGEDU_LINK_API_KEY;
  if (apiKey) {
    try {
      const linkRes = await fetch("https://dgedu.link/api/v1/shorten", {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          original_url: targetUrl,
          is_public: false,
        }),
      });

      if (linkRes.ok) {
        const linkData = (await linkRes.json()) as {
          success?: boolean;
          short_url?: string;
          shortUrl?: string;
          error?: string;
        };
        const shortUrl = linkData.short_url || linkData.shortUrl;
        if (shortUrl) {
          return json({ status: "ok", shortUrl, fullUrl: targetUrl });
        }
      }
    } catch (err) {
      console.error("dgedu.link shorten call failed:", err);
    }
  }

  // dgedu.link API 키가 없거나 실패 시 targetUrl 반환
  return json({ status: "ok", shortUrl: targetUrl, fullUrl: targetUrl });
};

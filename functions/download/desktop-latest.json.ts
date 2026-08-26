// GET /download/desktop-latest.json — Tauri 자동 업데이트 확인용 매니페스트
import type { Env } from "../_shared.ts";

const MANIFEST_KEY = "desktop-latest.json";

export const onRequestGet: PagesFunction<Env> = async (context) => {
  if (!context.env.DOWNLOADS) {
    return new Response(JSON.stringify({ error: "다운로드 저장소가 준비 중입니다." }), {
      status: 503,
      headers: { "content-type": "application/json; charset=utf-8" },
    });
  }

  const object = await context.env.DOWNLOADS.get(MANIFEST_KEY);
  if (!object) {
    return new Response(JSON.stringify({ error: "업데이트 정보를 찾을 수 없습니다." }), {
      status: 404,
      headers: { "content-type": "application/json; charset=utf-8" },
    });
  }

  return new Response(object.body, {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "public, max-age=300",
    },
  });
};

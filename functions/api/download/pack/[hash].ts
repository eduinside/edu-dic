// GET & HEAD /api/download/pack/<sha256> — 데스크탑 앱 변경분 업데이트용 팩(zip).
// 이름이 내용의 해시라 한 번 올린 팩은 바뀌지 않는다 → 1년 캐시. 앱이 받은 뒤 해시·서명을 다시 확인한다
// (desktop/src/EduDic.Core/Install.cs, docs/plan-desktop-dotnet.md §7).
import type { Env } from "../../../_shared.ts";

const HASH = /^[0-9a-f]{64}$/;

export const onRequest: PagesFunction<Env, "hash"> = async (context) => {
  const hash = String(context.params.hash ?? "");
  if (!HASH.test(hash)) {
    return new Response("잘못된 주소예요.", { status: 400, headers: { "content-type": "text/plain; charset=utf-8" } });
  }
  if (!context.env.DOWNLOADS) {
    return new Response("다운로드 저장소가 준비 중입니다.", { status: 503, headers: { "content-type": "text/plain; charset=utf-8" } });
  }

  const object = await context.env.DOWNLOADS.get(`desktop-packs/${hash}.zip`);
  if (!object) {
    return new Response("파일을 찾을 수 없어요.", { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });
  }

  return new Response(context.request.method === "HEAD" ? null : object.body, {
    headers: {
      "content-type": "application/zip",
      "content-length": String(object.size),
      "cache-control": "public, max-age=31536000, immutable",
    },
  });
};

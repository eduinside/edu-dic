// GET & HEAD /api/download/desktop — 최신 데스크탑 설치 프로그램 다운로드
import type { Env } from "../../_shared.ts";

const OBJECT_KEY = "edu-dic-desktop-setup.exe";

export const onRequest: PagesFunction<Env> = async (context) => {
  if (!context.env.DOWNLOADS) {
    return new Response("다운로드 저장소가 준비 중입니다. 잠시 후 다시 시도해 주세요.", {
      status: 503,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }

  const object = await context.env.DOWNLOADS.get(OBJECT_KEY);
  if (!object) {
    return new Response("설치 프로그램을 준비 중입니다. 잠시 후 다시 확인해 주세요.", {
      status: 404,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }

  return new Response(context.request.method === "HEAD" ? null : object.body, {
    headers: {
      "content-type": "application/x-msdownload",
      "content-disposition": 'attachment; filename="어린이 쉬운 사전 데스크탑 설치.exe"',
      "content-length": String(object.size),
      "cache-control": "public, max-age=300",
    },
  });
};

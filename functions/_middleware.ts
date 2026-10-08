// 미들웨어: CORS 허용 및 *.pages.dev 리다이렉트.
// public/_routes.json 때문에 /api/*, /download/* 에서만 돈다(정적 파일·SPA 페이지의 pages.dev 리다이렉트는 index.html 스크립트).
export const onRequest: PagesFunction = async ({ request, next }) => {
  // CORS Preflight 처리
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "GET, HEAD, POST, OPTIONS",
        "access-control-allow-headers": "*",
        "access-control-max-age": "86400",
      },
    });
  }

  const url = new URL(request.url);
  // 프로젝트 기본 주소(<project>.pages.dev)만 정본으로 보낸다. 미리보기 배포(<hash|branch>.<project>.pages.dev)는
  // 배포 검증용이라 그대로 둔다 — 같이 보내면 미리보기에서 운영 API를 부르게 된다.
  if (url.hostname.endsWith(".pages.dev") && url.hostname.split(".").length === 3) {
    url.hostname = "dic.dgedu.link";
    url.port = "";
    url.protocol = "https:";
    return Response.redirect(url.toString(), 301);
  }

  const response = await next();
  const newHeaders = new Headers(response.headers);
  newHeaders.set("access-control-allow-origin", "*");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: newHeaders,
  });
};

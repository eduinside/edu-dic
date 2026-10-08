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
  if (url.hostname.endsWith(".pages.dev")) {
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

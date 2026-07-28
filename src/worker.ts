export interface Env {
  ASSETS: Fetcher;
}

const json = (value: unknown, init: ResponseInit = {}): Response =>
  Response.json(value, {
    ...init,
    headers: {
      "cache-control": "no-store",
      "content-type": "application/json; charset=utf-8",
      ...init.headers,
    },
  });

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/health") {
      return json({
        ok: true,
        service: "chernobyl-rbmk-simulator",
        runtime: "cloudflare-workers",
        timestamp: new Date().toISOString(),
      });
    }

    if (url.pathname === "/api/config") {
      return json({
        model: "RBMK-1000 simplified educational dynamics model",
        fixedStepSeconds: 0.05,
        simulationCore: "typescript",
        wasmReady: true,
        disclaimer: "Not for engineering or operator training",
      });
    }

    if (url.pathname.startsWith("/api/")) {
      return json({ error: "Not found" }, { status: 404 });
    }

    const response = await env.ASSETS.fetch(request);
    const headers = new Headers(response.headers);
    headers.set("x-content-type-options", "nosniff");
    headers.set("referrer-policy", "strict-origin-when-cross-origin");
    headers.set("permissions-policy", "camera=(), microphone=(), geolocation=()");

    if (url.pathname === "/" || url.pathname.endsWith(".html")) {
      headers.set("cache-control", "public, max-age=0, must-revalidate");
      headers.set(
        "content-security-policy",
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
      );
    } else if (response.ok) {
      headers.set("cache-control", "public, max-age=31536000, immutable");
    }

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  },
} satisfies ExportedHandler<Env>;

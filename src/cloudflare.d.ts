interface Fetcher {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

type ExportedHandler<Env = unknown> = {
  fetch(request: Request, env: Env, context: ExecutionContext): Response | Promise<Response>;
};

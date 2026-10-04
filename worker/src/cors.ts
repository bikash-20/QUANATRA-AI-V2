type CorsEnv = {
  ALLOWED_ORIGIN?: string;
  ALLOWED_ORIGINS?: string;
};

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

function isLocalOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    return (
      (url.protocol === 'http:' || url.protocol === 'https:') &&
      LOCAL_HOSTS.has(url.hostname)
    );
  } catch {
    return false;
  }
}

export function corsHeaders(req: Request, env: CorsEnv): Headers {
  const headers = new Headers({
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    Vary: 'Origin',
  });
  const origin = req.headers.get('Origin');
  const configuredOrigins = [
    ...(env.ALLOWED_ORIGIN ?? '').split(','),
    ...(env.ALLOWED_ORIGINS ?? '').split(','),
  ]
    .map((value) => value.trim())
    .filter(Boolean);
  const isLocalWorker = isLocalOrigin(new URL(req.url).origin);

  if (
    origin &&
    (configuredOrigins.includes(origin) || (isLocalWorker && isLocalOrigin(origin)))
  ) {
    headers.set('Access-Control-Allow-Origin', origin);
  }

  return headers;
}

export function applyCors(req: Request, env: CorsEnv, response: Response): Response {
  const headers = new Headers(response.headers);
  headers.delete('Access-Control-Allow-Origin');

  const varyValues = new Set(
    (headers.get('Vary') ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
  );
  varyValues.add('Origin');
  headers.set('Vary', [...varyValues].join(', '));

  for (const [name, value] of corsHeaders(req, env)) {
    if (name.toLowerCase() !== 'vary') headers.set(name, value);
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

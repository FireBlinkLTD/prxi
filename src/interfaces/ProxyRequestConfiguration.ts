import { HttpMethod } from './RequestHandler';

export interface ProxyRequestConfiguration {
  // Request url
  url?: string;

  // Override HTTP method
  method?: HttpMethod;

  // Override target host
  target?: string;

  // Override target port
  port?: number;

  // Proxy request headers to add/replace/remove on top of the Configuration ones (if any)
  proxyRequestHeaders?: Record<string, string | string[] | null>;

  // Proxy response headers to add/replace/remove on top of the Configuration ones (if any)
  proxyResponseHeaders?: Record<string, string | string[] | null>;
}

import { OutgoingHttpHeaders, RequestOptions } from 'node:http';
import { HttpMethod } from './RequestHandler';
import { Response } from './Response';

export interface ProxyRequestConfiguration {
  // Request url (path)
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

  /**
   * Optional handler before making the proxy request
   * @param options request options, can be null for HTTP/2 request
   * @parma proxyHeaders
   * @returns
   */
  onBeforeProxyRequest?: (options: RequestOptions | null, proxyHeaders: OutgoingHttpHeaders) => void;

  /**
   * Optional handler before sending a response
   * @param res can be null for the HTTP/2 response
   * @param outgoingHeaders
   * @returns
   */
  onBeforeResponse?: (res: Response | null, outgoingHeaders: OutgoingHttpHeaders) => void;
}

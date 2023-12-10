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
   * @param proxyHeaders
   * @param context
   * @returns
   */
  onBeforeProxyRequest?: (options: RequestOptions | null, proxyHeaders: OutgoingHttpHeaders, context: Record<string, any>) => void;

  /**
   * Optional handler before sending a response
   * @param res can be null for the HTTP/2 response
   * @param outgoingHeaders
   * @param context
   * @returns
   */
  onBeforeResponse?: (res: Response | null, outgoingHeaders: OutgoingHttpHeaders, context: Record<string, any>) => void;
}

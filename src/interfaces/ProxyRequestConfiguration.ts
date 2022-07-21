import { HttpMethod } from './RequestHandler';

export interface ProxyRequestConfiguration {
  // Request path
  path: string;

  // Override HTTP method
  method?: HttpMethod;

  // Override target host
  target?: string;

  // Override target port
  port?: number;
}

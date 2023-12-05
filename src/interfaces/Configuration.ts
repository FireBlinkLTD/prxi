import { UpstreamConfiguration } from './UpstreamConfiguration';
import { Request } from './Request';
import { Response } from './Response';
import { ServerHttp2Stream } from 'http2';
import { IncomingHttpHeaders } from 'http';

export type ErrorHandler = (req: Request, res: Response, err: Error) => Promise<void>;
export type Http2ErrorHandler = (stream: ServerHttp2Stream, headers: IncomingHttpHeaders, err: Error) => Promise<void>;

export interface Configuration {
  mode: 'HTTP' | 'HTTP2'

  /**
   * Host port
   */
  port: number;

  /**
   * Optional host name
   */
  hostname?: string;

  /**
   * Optional proxy request timeout duration
   * @default 60000 - 1 minute
   */
  proxyRequestTimeout?: number;

  /**
   * Request error handler
   */
  errorHandler?: ErrorHandler;

  /**
   * HTTP/2 Error handler
   */
  http2ErrorHandler?: Http2ErrorHandler;

  /**
   * Proxy request headers to add/replace/remove
   */
  proxyRequestHeaders?: Record<string, string | string[] | null>;

  /**
   * Proxy response headers to add/replace/remove
   */
  responseHeaders?: Record<string, string | string[] | null>;

  /**
   * Upstream configurations
   */
  upstream: UpstreamConfiguration[];

  /**
   * Info log handler
   */
  logInfo?: (message?: any, ...params: any[]) => void;

  /**
   * Error log handler
   */
  logError?: (message?: any, ...params: any[]) => void;
}

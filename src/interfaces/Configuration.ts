import { UpstreamConfiguration } from './UpstreamConfiguration';
import { Request } from './Request';
import { Response } from './Response';
import { ServerHttp2Stream } from 'node:http2';
import { IncomingHttpHeaders } from 'node:http2';
import { SecureContextOptions } from 'node:tls';
import { Stream } from 'node:stream';
import { Socket } from 'node:net';

export type ErrorHandler = (req: Request, res: Response, err: Error) => Promise<void>;
export type Http2ErrorHandler = (stream: ServerHttp2Stream, headers: IncomingHttpHeaders, err: Error) => Promise<void>;

export interface Configuration {
  /**
   * Operational mode, defaults to HTTP (HTTP/1.1)
   */
  mode?: 'HTTP' | 'HTTP2';

  /**
   * If provided secure connection will be used
   */
  secure?: SecureContextOptions,

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
   * For HTTP/2 connection it declares max idle time for the connection
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

  on?: {
    beforeHTTPRequest?: (req: Request, res: Response, context: Record<string, any>) => void;
    afterHTTPRequest?: (req: Request, res: Response, context: Record<string, any>) => void;
    upgrade?: (req: Request, socket: Socket, head: Buffer, context: Record<string, any>) => void;
    afterUpgrade?: (req: Request, socket: Socket, head: Buffer, context: Record<string, any>) => void;
    beforeHTTP2Request?: (stream: Stream, headers: IncomingHttpHeaders, context: Record<string, any>) => void;
    afterHTTP2Request?: (stream: Stream, headers: IncomingHttpHeaders, context: Record<string, any>) => void;
  }

  /**
   * Info log handler
   */
  logInfo?: (message?: any, ...params: any[]) => void;

  /**
   * Error log handler
   */
  logError?: (message?: any, ...params: any[]) => void;
}

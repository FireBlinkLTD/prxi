import { UpstreamConfiguration } from './UpstreamConfiguration';
import { Request } from './Request';
import { Response } from './Response';
import { Http2Session, ServerHttp2Stream } from 'node:http2';
import { IncomingHttpHeaders } from 'node:http2';
import { SecureContextOptions } from 'node:tls';
import { Stream } from 'node:stream';
import { Socket } from 'node:net';

export type ErrorHandler = (req: Request, res: Response, err: Error, context: Record<string, any>) => Promise<void>;
export type Http2ErrorHandler = (stream: ServerHttp2Stream, headers: IncomingHttpHeaders, err: Error, context: Record<string, any>) => Promise<void>;

export interface LogConfiguration {
  debug?: (context: Record<string, any>, message: any, params?: Record<string, any>) => void;
  info?: (context: Record<string, any>, message: any, params?: Record<string, any>) => void;
  error?: (context: Record<string, any>, message: any, error?: Error, params?: Record<string, any>) => void;
}

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

  /**
   * Hooks
   */
  on?: {
    // Before HTTP/1.1 request
    beforeHTTPRequest?: (req: Request, res: Response, context: Record<string, any>) => void;
    // After HTTP/1.1 request
    afterHTTPRequest?: (req: Request, res: Response, context: Record<string, any>) => void;

    // Before connection upgrade (before WS processing)
    upgrade?: (req: Request, socket: Socket, head: Buffer, context: Record<string, any>) => void;
    // After connection upgrade (WS processing)
    afterUpgrade?: (req: Request, socket: Socket, head: Buffer, context: Record<string, any>) => void;

    // Before HTTP/2 session
    beforeHTTP2Session?: (session: Http2Session, context: Record<string, any>) => void;
    // After HTTP/2 session
    afterHTTP2Session?: (session: Http2Session, context: Record<string, any>) => void;

    // Before HTTP/2 request/stream
    beforeHTTP2Request?: (stream: Stream, headers: IncomingHttpHeaders, context: Record<string, any>) => void;
    // After HTTP/2 request/stream
    afterHTTP2Request?: (stream: Stream, headers: IncomingHttpHeaders, context: Record<string, any>) => void;
  }

  /**
   * Log methods
   */
  log?: LogConfiguration,
}

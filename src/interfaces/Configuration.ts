import { IncomingMessage, ServerResponse } from 'http';
import { UpstreamConfiguration } from './UpstreamConfiguration';

export type ErrorHandler = (req: IncomingMessage, res: ServerResponse, err: Error) => Promise<void>;

export interface Configuration {
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

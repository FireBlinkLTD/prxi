import { IncomingMessage, ServerResponse } from 'http';
import { RequestHandler } from './RequestHandler';

export type ErrorHandler = (req: IncomingMessage, res: ServerResponse, err: Error) => Promise<void>;

export interface Configuration {
  /**
   * Target host
   */
  target: string;

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
  errorHandler: ErrorHandler;

  /**
   * Request handlers
   */
  requestHandlers: Array<RequestHandler>;

  // Proxy request headers to add/replace/remove
  proxyRequestHeaders?: Record<string, string | string[] | null>;

  // Proxy response headers to add/replace/remove
  proxyResponseHeaders?: Record<string, string | string[] | null>;

  /**
   * Info log handler
   */
  logInfo?: (msg: string) => void;

  /**
   * Error log handler
   */
  logError?: (msg: string, err?: Error) => void;
}

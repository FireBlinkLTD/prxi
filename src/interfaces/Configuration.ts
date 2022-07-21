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
   * Request error handler
   */
  errorHandler: ErrorHandler;

  /**
   * Request handlers
   */
  requestHandlers: Array<RequestHandler>;

  /**
   * Info log handler
   */
  logInfo?: (msg: string) => void;

  /**
   * Error log handler
   */
  logError?: (msg: string, err?: Error) => void;
}

import { ErrorHandler } from "./Configuration";
import { RequestHandlerConfig, WebSocketHandlerConfig } from "./RequestHandler";

export interface UpstreamConfiguration {
  /**
   * Upstream host
   */
  target: string;

  /**
   * Optional proxy request timeout duration
   * @default 60000 - 1 minute
   */
  proxyRequestTimeout?: number;

  /**
   * Proxy request headers to add/replace/remove
   */
  proxyRequestHeaders?: Record<string, string | string[] | null>;

  /**
   * Proxy response headers to add/replace/remove
   */
  responseHeaders?: Record<string, string | string[] | null>;

  /**
   * Request error handler
   */
  errorHandler?: ErrorHandler;

  /**
   * Request handlers
   */
  requestHandlers?: Array<RequestHandlerConfig>;

  /**
   * WebSocket request handler
   */
  webSocketHandlers?: Array<WebSocketHandlerConfig>;
}

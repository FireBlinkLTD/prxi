import { ErrorHandler, Http2ErrorHandler } from "./Configuration";
import { HttpRequestHandlerConfig, Http2RequestHandlerConfig, WebSocketHandlerConfig } from "./RequestHandler";

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
   * HTTP/1.1 Request error handler
   */
  errorHandler?: ErrorHandler;

  /**
   * HTTP/1.1 Request handlers
   */
  requestHandlers?: Array<HttpRequestHandlerConfig>;

  /**
   * HTTP/2 Error handler
   */
  http2ErrorHandler?: Http2ErrorHandler;

  /**
   * HTTP/2 Request handlers
   */
  http2RequestHandlers?: Array<Http2RequestHandlerConfig>;

  /**
   * WebSocket request handler
   */
  webSocketHandlers?: Array<WebSocketHandlerConfig>;
}

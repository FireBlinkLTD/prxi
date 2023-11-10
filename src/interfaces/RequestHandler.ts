import { IncomingMessage, ServerResponse } from 'http';
import { Socket } from 'net';
import { ProxyRequestConfiguration } from './ProxyRequestConfiguration';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'OPTIONS' | 'HEAD';
export type IsMatchingRequestFunction = (method: HttpMethod, path: string, context: Record<string, any>) => boolean;
export type IsMatchingWebSocketFunction = (path: string, context: Record<string, any>) => boolean;
export type ProxyRequest = (configuration?: ProxyRequestConfiguration) => Promise<void>;
export type WebSocketProxyCancelRequest = (status: number, description: string) => void;
export type HandleFunction = (
  req: IncomingMessage,
  res: ServerResponse,
  proxyRequest: ProxyRequest,
  method: HttpMethod,
  path: string,
  context: Record<string, any>
) => Promise<void>;

export type WebSocketHandlerFunction = (
  req: IncomingMessage,
  socket: Socket,
  head: Buffer,
  proxyRequest: ProxyRequest,
  proxyCancel: WebSocketProxyCancelRequest,
  path: string,
  context: Record<string, any>
) => Promise<void>;

export interface WebSocketHandlerConfig {
  // Check if request method and path should be processed by current RequestHandler
  isMatching: IsMatchingWebSocketFunction;

  // Incoming request handler
  handle: WebSocketHandlerFunction;
}

export interface RequestHandlerConfig {
  // Check if request method and path should be processed by current RequestHandler
  isMatching: IsMatchingRequestFunction;

  // Incoming request handler
  handle: HandleFunction;
}

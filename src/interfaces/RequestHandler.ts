import { Method } from 'axios';
import { IncomingMessage, ServerResponse } from 'http';
import { Socket } from 'net';
import { ProxyRequestConfiguration } from './ProxyRequestConfiguration';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'OPTIONS' | 'HEAD';
export type IsMatchingFunction = (method: Method, path: string) => boolean;
export type ProxyRequest = (configuration?: ProxyRequestConfiguration) => Promise<void>;
export type HandleFunction = (
  req: IncomingMessage,
  res: ServerResponse,
  proxyRequest: ProxyRequest,
) => Promise<void>;

export type WebSocketHandlerFunction = (
  req: IncomingMessage,
  socket: Socket,
  head: Buffer,
  proxyRequest: ProxyRequest,
) => Promise<void>;

export interface RequestHandler {
  // Check if request method and path should be processed by current RequestHandler
  isMatching: IsMatchingFunction;

  // URL Path to process
  path?: string;

  // Incoming request handler
  handle: HandleFunction;
}

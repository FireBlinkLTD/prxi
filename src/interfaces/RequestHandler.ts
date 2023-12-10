import { Socket } from 'net';
import { ProxyRequestConfiguration } from './ProxyRequestConfiguration';
import { Request } from './Request';
import { Response } from './Response';
import { OutgoingHttpHeaders, ServerHttp2Stream, IncomingHttpHeaders } from 'node:http2';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'OPTIONS' | 'HEAD';
export type IsMatchingRequestFunction = (method: HttpMethod, path: string, context: Record<string, any>, headers: IncomingHttpHeaders) => boolean;
export type IsMatchingWebSocketFunction = (path: string, context: Record<string, any>, headers: IncomingHttpHeaders) => boolean;
export type ProxyRequest = (configuration?: ProxyRequestConfiguration) => Promise<void>;
export type WebSocketProxyCancelRequest = (status: number, description: string) => void;

export type HttpHandleFunction = (
  req: Request,
  res: Response,
  proxyRequest: ProxyRequest,
  method: HttpMethod,
  path: string,
  context: Record<string, any>
) => Promise<void>;

export type Http2HandleFunction = (
  stream: ServerHttp2Stream,
  headers: OutgoingHttpHeaders,
  proxyRequest: ProxyRequest,
  method: HttpMethod,
  path: string,
  context: Record<string, any>
) => Promise<void>;

export type WebSocketHandlerFunction = (
  req: Request,
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

export interface HttpRequestHandlerConfig {
  // Check if request method and path should be processed by current RequestHandler
  isMatching: IsMatchingRequestFunction;

  // Incoming request handler
  handle: HttpHandleFunction;
}

export interface Http2RequestHandlerConfig {
  // Check if request method and path should be processed by current RequestHandler
  isMatching: IsMatchingRequestFunction;

  // Incoming request handler
  handle: Http2HandleFunction;
}

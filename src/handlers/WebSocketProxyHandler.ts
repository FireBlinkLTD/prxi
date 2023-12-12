import { ClientRequest, IncomingMessage } from "node:http";
import {request as httpRequest, RequestOptions} from 'node:http';
import {request as httpsRequest} from 'node:https';
import { Socket } from "node:net";

import { Configuration, LogConfiguration, ProxyRequestConfiguration } from "../interfaces";
import { UpstreamConfiguration } from "../interfaces/UpstreamConfiguration";
import { RequestUtils, WebSocketUtils } from "../utils";

const emptyObj = {};

interface DebugInterface {
  upstreamRequest?: ClientRequest;
  upstreamSocket?: Socket;
  incomingSocket?: Socket;
}

export class WebSocketProxyHandler {
  static LOG_CLASS = 'prxi/ws';

  private activeSockets = new Set<Socket>();

  constructor(
    private log: LogConfiguration,
    private configuration: Configuration,
    private upstream: UpstreamConfiguration,
  ) {}

  public static readonly debug: DebugInterface = {}

  /**
   * Close all connections
   */
  public closeAllConnections(): void {
    this.activeSockets.forEach((socket) => {
      socket.destroy();
    });
    this.activeSockets = new Set<Socket>();
  }

  /**
   * Proxy request
   * @param id
   * @param req
   * @param socket
   * @param head
   * @param context
   * @param proxyConfiguration
   */
  public async proxy(
    req: IncomingMessage,
    socket: Socket,
    head: Buffer,
    context: Record<string, any>,
    proxyConfiguration?: ProxyRequestConfiguration,
  ): Promise<void> {
    try {
      WebSocketProxyHandler.debug.incomingSocket = socket;
      /* istanbul ignore next */
      if (!proxyConfiguration) {
        proxyConfiguration = emptyObj;
      }

      // istanbul ignore next
      let target = proxyConfiguration.target || this.upstream.target;
      // istanbul ignore next
      const url = proxyConfiguration.url || req.url;
      const httpsTarget = RequestUtils.isHttpsTarget(target);
      // istanbul ignore next
      const request = httpsTarget ? httpsRequest : httpRequest;
      // istanbul ignore next
      const port = proxyConfiguration.port || RequestUtils.getPort(target) || (httpsTarget ? 443 : 80);
      const host = RequestUtils.getHost(target);
      const initialPath = new URL(target).pathname;

      this.log.debug(context, 'Processing', {
        class: WebSocketProxyHandler.LOG_CLASS,
        target,
        path: url,
      });

      const options: RequestOptions = {
        method: 'GET',
        host,
        port,

        headers: RequestUtils.prepareProxyHeaders(
          req.headers,
          this.configuration.proxyRequestHeaders,
          this.upstream.proxyRequestHeaders,
          // istanbul ignore next
          proxyConfiguration?.proxyRequestHeaders,
        ),
        path: RequestUtils.concatPath(initialPath, url),
        timeout: this.configuration.proxyRequestTimeout,
      };

      /* istanbul ignore else */
      if (proxyConfiguration && proxyConfiguration.onBeforeProxyRequest) {
        proxyConfiguration.onBeforeProxyRequest(options, options.headers, context);
      }

      const client = request(options);
      WebSocketProxyHandler.debug.upstreamRequest = client;

      // remove head from the socket
      // istanbul ignore next
      if (head && head.length) {
        socket.unshift(head);
      }

      await new Promise<void>((resolve, reject) => {
        req.pipe(client);

        let ps: Socket = null;
        client.once('error', (err) => {
          // istanbul ignore next
          ps?.destroy();

          reject(err);
        });

        client.once('response', (res: IncomingMessage) => {
          this.log.debug(context, 'Proxy response received', {
            class: WebSocketProxyHandler.LOG_CLASS,
            target,
            path: url,
          });

          // istanbul ignore else
          if (!res.headers.upgrade) {
            this.log.info(context, "Response doesn't have an UPGRADE header", {
              class: WebSocketProxyHandler.LOG_CLASS,
              target,
              path: url,
            });

            const headersToSet = RequestUtils.prepareProxyHeaders(
              res.headers,
              this.configuration.responseHeaders,
              this.upstream.proxyRequestHeaders,
              proxyConfiguration.proxyResponseHeaders,
            );

            socket.write(WebSocketUtils.prepareRawHeadersString(`HTTP/${res.httpVersion} ${res.statusCode} ${res.statusMessage}`, headersToSet), () => {
              socket.end();
              resolve();
            });
          }
        });

        client.once('upgrade', (proxyResponse: IncomingMessage, proxySocket: Socket, proxyHead: Buffer) => {
          WebSocketProxyHandler.debug.upstreamSocket = proxySocket;

          ps = proxySocket;
          this.activeSockets.add(ps);
          this.log.debug(context, 'Upgrade received', {
            class: WebSocketProxyHandler.LOG_CLASS,
            target,
            path: url,
          });

          ps.once('error', (err) => {
            this.log.error(context, 'Proxy socket error', err, {
              class: WebSocketProxyHandler.LOG_CLASS,
              target,
              path: url,
            });

            ps.destroy();
            this.activeSockets.delete(ps);

            reject(err);
          });

          ps.once('end', () => {
            this.log.debug(context, 'Proxy socket ended', {
              class: WebSocketProxyHandler.LOG_CLASS,
              target,
              path: url,
            });
            this.activeSockets.delete(ps);
            resolve();
          });

          // remove head from the proxySocket
          // istanbul ignore next
          if (proxyHead && proxyHead.length) {
            ps.unshift(proxyHead);
          }

          // end proxy socket when incoming fails
          socket.once('error', (err) => {
            this.log.error(context, 'Socket error', err, {
              class: WebSocketProxyHandler.LOG_CLASS,
              target,
              path: url,
            });

            ps.destroy();
            this.activeSockets.delete(ps);

            reject(err);
          });

          // keep sockets alive
          WebSocketUtils.keepAlive(socket);
          WebSocketUtils.keepAlive(proxySocket);

          const headersToSet = RequestUtils.prepareProxyHeaders(
            proxyResponse.headers,
            this.configuration.responseHeaders,
            this.upstream.proxyRequestHeaders,
            proxyConfiguration.proxyResponseHeaders,
          );
          socket.write(WebSocketUtils.prepareRawHeadersString(`HTTP/${req.httpVersion} 101 Switching Protocols`, headersToSet));
          proxySocket.pipe(socket).pipe(proxySocket);
        });
      });
    } finally {
      delete WebSocketProxyHandler.debug.incomingSocket;
      delete WebSocketProxyHandler.debug.upstreamSocket;
      delete WebSocketProxyHandler.debug.upstreamRequest;
    }
  }
}

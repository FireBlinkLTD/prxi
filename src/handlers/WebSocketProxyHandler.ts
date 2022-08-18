import { ClientRequest, IncomingMessage } from "http";
import {request as httpRequest, RequestOptions} from 'http';
import {request as httpsRequest} from 'https';
import { Socket } from "net";

import { Configuration, ProxyRequestConfiguration } from "../interfaces";
import { RequestUtils, WebSocketUtils } from "../utils";

const emptyObj = {};

interface DebugInterface {
  upstreamRequest?: ClientRequest;
  upstreamSocket?: Socket;
  incomingSocket?: Socket;
}

export class WebSocketProxyHandler {
  constructor(
    private logInfo: (msg: string) => void,
    private logError: (msg: string, err?: Error) => void,
    private configuration: Configuration,
  ) {}

  public static readonly debug: DebugInterface = {}

  /**
   * Proxy request
   * @param id
   * @param req
   * @param socket
   * @param head
   * @param proxyConfiguration
   */
  public async proxy(
    requestId: number,
    req: IncomingMessage,
    socket: Socket,
    head: Buffer,
    proxyConfiguration?: ProxyRequestConfiguration,
  ): Promise<void> {
    try {
      WebSocketProxyHandler.debug.incomingSocket = socket;
      proxyConfiguration = proxyConfiguration || emptyObj;

      let target = proxyConfiguration.target || this.configuration.target;
      const url = proxyConfiguration.url || req.url;
      const httpsTarget = RequestUtils.isHttpsTarget(target);
      const request = httpsTarget ? httpsRequest : httpRequest;
      const port = proxyConfiguration.port || RequestUtils.getPort(target) || (httpsTarget ? 443 : 80);
      const host = RequestUtils.getHost(target);

      this.logInfo(`[${requestId}] [WebSocketProxyHandler] Processing WebSocket proxy request with method to ${target}${url}`);

      const options: RequestOptions = {
        method: 'GET',
        host,
        port,
        headers: RequestUtils.prepareProxyHeaders(req.headers, this.configuration.proxyRequestHeaders, proxyConfiguration?.proxyRequestHeaders),
        path: url,
        timeout: this.configuration.proxyRequestTimeout || 60 * 1000,
      };

      const client = request(options);
      WebSocketProxyHandler.debug.upstreamRequest = client;

      // remove head from the socket
      // istanbul ignore next
      if (head && head.length) {
        socket.unshift(head);
      }

      // keep socket alive
      WebSocketUtils.keepAlive(socket);

      await new Promise<void>((resolve, reject) => {
        req.pipe(client);

        let ps: Socket = null;
        client.on('error', (err) => {
          ps?.destroy();
          socket.end();

          reject(err);
        });

        client.on('response', (res: IncomingMessage) => {
          this.logInfo(`[${requestId}] [WebSocketProxyHandler] Received response`);

          if (!res.headers.upgrade) {
            this.logInfo(`[${requestId}] [WebSocketProxyHandler] Response doesn't have an UPGRADE header`);

            const headersToSet = RequestUtils.prepareProxyHeaders(res.headers, this.configuration.responseHeaders, proxyConfiguration.proxyResponseHeaders);
            socket.write(WebSocketUtils.prepareRawHeadersString(`HTTP/${res.httpVersion} ${res.statusCode} ${res.statusMessage}`, headersToSet));
            res.pipe(socket);
          }

          resolve();
        });

        client.on('upgrade', (proxyResponse: IncomingMessage, proxySocket: Socket, proxyHead: Buffer) => {
          WebSocketProxyHandler.debug.upstreamSocket = proxySocket;

          ps = proxySocket;
          this.logInfo(`[${requestId}] [WebSocketProxyHandler] Upgrade received`);

          proxySocket.on('error', (err) => {
            this.logError(`[${requestId}] [WebSocketProxyHandler] ProxySocket error`, err);
            ps.destroy();
            socket.end();

            reject(err);
          });

          proxySocket.on('end', () => {
            this.logInfo(`[${requestId}] [WebSocketProxyHandler] ProxySocket end`);
            resolve();
          });

          // remove head from the proxySocket
          // istanbul ignore next
          if (proxyHead && proxyHead.length) {
            proxySocket.unshift(proxyHead);
          }

          // end proxy socket when incoming fails
          socket.on('error', (err) => {
            this.logError(`[${requestId}] [WebSocketProxyHandler] Socket error`, err);

            ps.destroy();
            socket.end();

            reject(err);
          });

          // keep socket alive
          WebSocketUtils.keepAlive(proxySocket);

          const headersToSet = RequestUtils.prepareProxyHeaders(proxyResponse.headers, this.configuration.responseHeaders, proxyConfiguration.proxyResponseHeaders);
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

import { ClientHttp2Session, Http2Session, OutgoingHttpHeaders, ServerHttp2Stream, connect, constants } from 'node:http2';

import { Configuration, ProxyRequestConfiguration } from "../interfaces";
import { UpstreamConfiguration } from "../interfaces/UpstreamConfiguration";
import { RequestUtils } from "../utils";

const emptyObj = {};

export class Http2ProxyHandler {
  private connections: Map<Http2Session, ClientHttp2Session>;

  constructor(
    private logInfo: (msg: string) => void,
    private logError: (message?: any, ...params: any[]) => void,
    private configuration: Configuration,
    private upstream: UpstreamConfiguration,
  ) {
    this.connections = new Map();
  }

  /**
   * Get existing connection or create a new one
   * @param session
   * @param target
   * @returns
   */
  private getOrCreateConnection(session: Http2Session, target: string): ClientHttp2Session {
    let connection = this.connections.get(session);
    if (connection && !connection.closed) {
      return connection;
    }

    connection = connect(target);
    this.connections.set(session, connection);

    connection.on('close', () => {
      this.closeConnection(session, connection);
    });

    session.on('close', () => {
      this.closeConnection(session, connection);
    });

    return connection;
  }


  /**
   * Close connection
   * @param session
   * @param connection
   */
  private closeConnection(session: Http2Session, connection: ClientHttp2Session): void {
    if (this.connections.has(session)) {
      this.connections.delete(session);
      connection.close();
    }
  }

  /**
   * Proxy request
   * @param id
   * @param req
   * @param res
   * @param context
   * @param proxyConfiguration
   */
  public async proxy(
    requestId: number,
    session: Http2Session,
    stream: ServerHttp2Stream,
    headers: OutgoingHttpHeaders,
    context: Record<string, any>,
    proxyConfiguration?: ProxyRequestConfiguration,
  ): Promise<void> {
    // istanbul ignore next
    proxyConfiguration = proxyConfiguration || emptyObj;

    let target = proxyConfiguration.target || this.upstream.target;
    const initialPath = new URL(target).pathname;

    this.logInfo(`[${requestId}] [Http2ProxyHandler] Processing proxy request to ${target}`);

    await new Promise<void>((resolve, reject) => {
      const client = this.getOrCreateConnection(session, target);

      const handle = () => {
        this.logInfo(`[${requestId}] [Http2ProxyHandler] Connected`);

        const path = RequestUtils.concatPath(initialPath, headers[constants.HTTP2_HEADER_PATH].toString());
        const method = proxyConfiguration.method || headers[constants.HTTP2_HEADER_METHOD].toString();
        this.logInfo(`[${requestId}] [Http2ProxyHandler] Processing stream for ${method} ${path}`);

        headers[constants.HTTP2_HEADER_METHOD] = method;
        headers[constants.HTTP2_HEADER_PATH] = path;

        const requestHeadersToSend = RequestUtils.prepareProxyHeaders(
          headers,
          this.configuration.proxyRequestHeaders,
          this.upstream.proxyRequestHeaders,
          // istanbul ignore next
          proxyConfiguration?.proxyRequestHeaders,
        );

        /* istanbul ignore else */
        if (proxyConfiguration && proxyConfiguration.onBeforeProxyRequest) {
          proxyConfiguration.onBeforeProxyRequest(null, requestHeadersToSend, context);
        }

        const proxyReq = client.request(requestHeadersToSend);

        proxyReq.once('error', (err) => {
          this.logError(`[${requestId}] [Http2ProxyHandler] Proxy request failed, error: ${err.message}`);
          reject(err);
        });

        proxyReq.on('response', (headers, flags) => {
          const headersToSet = RequestUtils.prepareProxyHeaders(
            headers,
            this.configuration.responseHeaders,
            this.upstream.responseHeaders,
            // istanbul ignore next
            proxyConfiguration?.proxyResponseHeaders
          );

          /* istanbul ignore else */
          if (proxyConfiguration && proxyConfiguration.onBeforeResponse) {
            proxyConfiguration.onBeforeResponse(null, headersToSet, context);
          }

          stream.respond(headersToSet);
        });

        proxyReq.once('end', () => {
          resolve();
        })

        proxyReq.pipe(stream).pipe(proxyReq);
      }

      if (!client.connecting && !client.closed) {
        return handle();
      }

      /* istanbul ignore else */
      if (this.configuration.proxyRequestTimeout) {
        client.setTimeout(this.configuration.proxyRequestTimeout, () => {
          this.closeConnection(session, client);
          this.logError(`[${requestId}] [Http2ProxyHandler] Proxy request timeout`);
        });
      }

      client.once('connect', () => {
        handle();
      });

      client.once('error', (err) => {
        this.closeConnection(session, client);
        this.logError(`[${requestId}] [Http2ProxyHandler] Proxy request failed, error: ${err.message}`);
        reject(err);
      });
    });
  }
}

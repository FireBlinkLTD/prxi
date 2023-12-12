import { ClientHttp2Session, Http2Session, OutgoingHttpHeaders, ServerHttp2Stream, connect, constants } from 'node:http2';

import { Configuration, LogConfiguration, ProxyRequestConfiguration } from "../interfaces";
import { UpstreamConfiguration } from "../interfaces/UpstreamConfiguration";
import { RequestUtils } from "../utils";

const emptyObj = {};

export class Http2ProxyHandler {
  static LOG_CLASS = 'prxi/http2';
  private connections: Map<Http2Session, ClientHttp2Session>;

  constructor(
    private log: LogConfiguration,
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

    connection.once('close', () => {
      this.closeConnection(session, connection);
    });

    session.once('close', () => {
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
   * Close all connections
   */
  public closeAllConnections(): void {
    this.connections.forEach((connection) => {
      connection.close();
    });
    this.connections = new Map();
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

    this.log.debug(
      context,
      'Processing HTTP/2 proxy request',
      {
        class: Http2ProxyHandler.LOG_CLASS,
        method: headers[constants.HTTP2_HEADER_METHOD],
        target,
        path: headers[constants.HTTP2_HEADER_PATH],
      }
    );

    await new Promise<void>((resolve, reject) => {
      const client = this.getOrCreateConnection(session, target);

      const handle = () => {
        try {
          const path = RequestUtils.concatPath(initialPath, headers[constants.HTTP2_HEADER_PATH].toString());
          const method = proxyConfiguration.method || headers[constants.HTTP2_HEADER_METHOD].toString();

          this.log.debug(context, 'Processing', {
            class: Http2ProxyHandler.LOG_CLASS,
            method: headers[constants.HTTP2_HEADER_METHOD],
            target,
            path: headers[constants.HTTP2_HEADER_PATH],
            targetMethod: method,
            targetPath: path,
          });

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
            this.log.error(context, 'Request failed', err, {
              class: Http2ProxyHandler.LOG_CLASS,
              method: headers[constants.HTTP2_HEADER_METHOD],
              target,
              path: headers[constants.HTTP2_HEADER_PATH],
              targetMethod: method,
              targetPath: path,
            });

            reject(err);
          });

          proxyReq.once('response', (headers, flags) => {
            try {
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

              /* istanbul ignore else */
              if (!stream.closed) {
                stream.respond(headersToSet);
                proxyReq.pipe(stream);
              }
            } catch (e) {
              /* istanbul ignore next */
              this.log.error(context, 'Unable to send response', e, {
                class: Http2ProxyHandler.LOG_CLASS,
                method: headers[constants.HTTP2_HEADER_METHOD],
                target,
                path: headers[constants.HTTP2_HEADER_PATH],
                targetMethod: method,
                targetPath: path,
              });
              /* istanbul ignore next */
              resolve();
            }
          });

          proxyReq.once('end', () => {
            resolve();
          });

          stream.pipe(proxyReq);
        } catch (e) {
          /* istanbul ignore next */
          reject(e);
        }
      }

      if (!client.connecting && !client.closed) {
        return handle();
      }

      /* istanbul ignore else */
      if (this.configuration.proxyRequestTimeout) {
        client.setTimeout(this.configuration.proxyRequestTimeout, () => {
          this.closeConnection(session, client);
          this.log.error(context, 'Request timeout', null, {
            class: Http2ProxyHandler.LOG_CLASS,
            method: headers[constants.HTTP2_HEADER_METHOD],
            target,
            path: headers[constants.HTTP2_HEADER_PATH],
          });
        });
      }

      client.once('connect', () => {
        handle();
      });

      client.once('error', (err) => {
        this.closeConnection(session, client);
        this.log.error(context, 'Proxy request failed', err, {
          class: Http2ProxyHandler.LOG_CLASS,
          method: headers[constants.HTTP2_HEADER_METHOD],
          target,
          path: headers[constants.HTTP2_HEADER_PATH],
        });
        reject(err);
      });
    });
  }
}

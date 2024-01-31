import { ClientHttp2Session, Http2Session, Http2Stream, OutgoingHttpHeaders, ServerHttp2Stream, connect, constants } from 'node:http2';

import { Configuration, LogConfiguration, ProxyRequestConfiguration } from "../interfaces";
import { UpstreamConfiguration } from "../interfaces/UpstreamConfiguration";
import { RequestUtils, callOptionalPromiseFunction } from "../utils";

const emptyObj = {};

export class Http2ProxyHandler {
  static LOG_CLASS = 'prxi/http2';
  private connections: Record<string, ClientHttp2Session> = {};
  private sessions: Record<string, Http2Session> = {};

  constructor(
    private log: LogConfiguration,
    private configuration: Configuration,
    private upstream: UpstreamConfiguration,
  ) {}

  /**
   * Get existing connection or create a new one
   * @param session
   * @param target
   * @returns
   */
  private getOrCreateConnection(session: Http2Session, target: string): ClientHttp2Session {
    const uuid = Http2ProxyHandler.getSessionUUID(session);

    if (!this.sessions[uuid]) {
      this.sessions[uuid] = session;
    }

    let connection = this.connections[uuid];
    if (connection && !connection.closed) {
      return connection;
    }

    connection = connect(target);
    this.connections[uuid] = connection;

    connection.once('close', (e) => {
      this.closeConnection(session, connection, true);
    });

    session.once('close', () => {
      this.closeConnection(session, connection, false);
    });

    return connection;
  }

  /**
   * Get session UUID
   */
  private static getSessionUUID(session: Http2Session): string {
    return (<any> session)._uuid;
  }

  /**
   * Close connection
   * @param session
   * @param connection
   * @param closeSession
   */
  private closeConnection(session: Http2Session, connection: ClientHttp2Session, closeSession: boolean): void {
    const uuid = Http2ProxyHandler.getSessionUUID(session);

    if (this.connections[uuid]) {
      delete this.connections[uuid];
      connection.close();

      if (closeSession) {
        (<any> session)._streams.forEach((stream: Http2Stream) => {
          stream.close();
        });

        session.close();
      }

      delete this.sessions[uuid];
    }
  }

  /**
   * Close all connections
   */
  public closeAllConnections(): void {
    for (const uuid of Object.keys(this.connections)) {
      this.connections[uuid].close();
      this.sessions[uuid].close();
    }

    this.connections = {};
    this.sessions = {};
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
            const headersToSet = RequestUtils.prepareProxyHeaders(
              headers,
              this.configuration.responseHeaders,
              this.upstream.responseHeaders,
              // istanbul ignore next
              proxyConfiguration?.proxyResponseHeaders
            );

            const next = () => {
              try {
                /* istanbul ignore else */
                if (!stream.closed) {
                  stream.respond(headersToSet);
                  proxyReq.pipe(stream);
                }
              } catch (e) {
                /* istanbul ignore next */
                this.log.error(context, 'Unable to respond', e, {
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
            }

            if (proxyConfiguration && proxyConfiguration.onBeforeResponse) {
              callOptionalPromiseFunction(
                () => proxyConfiguration.onBeforeResponse(null, headersToSet, context),
                () => next(),
                (err) => {
                  this.log.error(context, 'onBeforeResponse function failed', err, {
                    class: Http2ProxyHandler.LOG_CLASS,
                    method: headers[constants.HTTP2_HEADER_METHOD],
                    target,
                    path: headers[constants.HTTP2_HEADER_PATH],
                    targetMethod: method,
                    targetPath: path,
                  });

                  reject(err);
                }
              );
            } else {
              next();
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
          this.closeConnection(session, client, false);
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
        this.closeConnection(session, client, false);
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

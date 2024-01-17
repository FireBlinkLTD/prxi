import { Configuration, HttpMethod, ProxyRequestConfiguration, WebSocketHandlerConfig, Request, Response, Server, HttpRequestHandlerConfig, Http2RequestHandlerConfig, LogConfiguration  } from "./interfaces";
import { Socket } from "net";
import { RequestUtils, WebSocketUtils } from "./utils";
import { HttpProxyHandler, Http2ProxyHandler, WebSocketProxyHandler } from "./handlers";
import { UpstreamConfiguration } from "./interfaces/UpstreamConfiguration";
import {
  IncomingMessage,
  ServerResponse,
  createServer as createHttp1Server,
} from "node:http";
import { createServer as createSecureHttp1Server } from 'node:https';
import {
  OutgoingHttpHeaders,
  createServer as createHttp2Server,
  createSecureServer as createSecureHttp2Server,
  constants,
  ServerHttp2Stream,
  IncomingHttpHeaders,
  ServerOptions,
} from "node:http2";
import { Hooks } from "./Hooks";

interface Proxy {
  upstream: UpstreamConfiguration,
  http: HttpProxyHandler,
  http2: Http2ProxyHandler,
  ws: WebSocketProxyHandler,
}

export class Prxi {
  static LOG_CLASS = 'prxi';

  private server: Server = null;
  private log: LogConfiguration;
  private proxies: Proxy[];
  private sockets = new Set<Socket>();
  private hooks: Hooks;

  constructor(private configuration: Configuration) {
    // set default values
    /* istanbul ignore next */
    configuration.proxyRequestTimeout = configuration.proxyRequestTimeout ?? 60 * 1000;

    /* istanbul ignore next */
    configuration.mode = configuration.mode ?? 'HTTP';

    let { log } = this.configuration;
    /* istanbul ignore next */
    if (!log) {
      log = {}
    }
    /* istanbul ignore next */
    if (!log.debug) log.debug = () => {}
    /* istanbul ignore next */
    if (!log.info) log.info = () => {}
    /* istanbul ignore next */
    if (!log.error) log.error = () => {}

    this.log = log;
    this.hooks = new Hooks(this.log, this.configuration);
  }

  /**
   * Create server depending on the mode
   */
  private get createServer() {
    return ((cb: (req: Request, res: Response) => void): Server => {
      if (this.configuration.mode === 'HTTP') {
        if (this.configuration.secure) {
          return createSecureHttp1Server({
            ...this.configuration.secure,
          }, cb);
        }

        return createHttp1Server(cb);
      }

      if (this.configuration.mode === 'HTTP2') {
        if (this.configuration.secure) {
          return createSecureHttp2Server({
            allowHTTP1: true,
            ...this.configuration.secure,
          }, cb);
        }

        return createHttp2Server(<ServerOptions> {
          allowHTTP1: true,
        }, cb);
      }

      throw new Error(`Invalid mode provided inside the configuration object "${this.configuration.mode}", expected HTTP or HTTP2`);
    });
  }

  /**
   * Start proxy server
   */
  public async start(): Promise<void> {
    let {hostname, port, upstream: upstreamConfigurations, errorHandler, http2ErrorHandler} = this.configuration;
    hostname = hostname || 'localhost';

    // register default error handler
    if (!errorHandler) {
      /* istanbul ignore next */
      errorHandler = (req: IncomingMessage, res: ServerResponse, err?: Error): Promise<void> => {
        /* istanbul ignore next */
        return new Promise<void>((res, rej) => rej(err));
      }
    }

    // register default HTTP/2 error handler
    if (!http2ErrorHandler) {
      /* istanbul ignore next */
      http2ErrorHandler = (stream: ServerHttp2Stream, headers: IncomingHttpHeaders, err: Error): Promise<void> => {
        /* istanbul ignore next */
        return new Promise<void>((res, rej) => rej(err));
      }
    }

    this.proxies = upstreamConfigurations.map(upstream => {
      const httpProxyHandler = new HttpProxyHandler(
        this.log,
        this.configuration,
        upstream,
      );

      let http2ProxyHandler;
      if (this.configuration.mode === 'HTTP2') {
        http2ProxyHandler = new Http2ProxyHandler(
          this.log,
          this.configuration,
          upstream,
        );
      }

      const webSocketProxyHandler = new WebSocketProxyHandler(
        this.log,
        this.configuration,
        upstream
      );

      return {
        upstream,
        http: httpProxyHandler,
        http2: http2ProxyHandler,
        ws: webSocketProxyHandler,
      }
    });

    let id = 0;
    // create server
    const server = this.createServer((req: Request, res: Response) => {
      const context = {};

      if (this.configuration.mode === 'HTTP2' && req.httpVersion === "2.0") {
        this.log.debug(context, 'HTTP/2 request processing ignored by the HTTP/1 handler when mode is "HTTP2"', {
          class: Prxi.LOG_CLASS,
        });
        // Ignore HTTP/2 requests
        return;
      }

      const path = RequestUtils.getPath(req);
      this.hooks.onBeforeHttpRequest(path, req, res, context);

      this.log.debug(context, 'Handling incoming request', {
        class: Prxi.LOG_CLASS,
        method: req.method,
        path,
      });
      const {handler, upstream, proxy} = this.findRequestHandler('HTTP', upstreamConfigurations, <HttpMethod> req.method, path, req.headers, context);
      if (handler) {
        let errHandler = errorHandler;
        /* istanbul ignore next */
        if (upstream.errorHandler) {
          /* istanbul ignore next */
          errHandler = upstream.errorHandler;
        }

        const headersToSet = RequestUtils.prepareProxyHeaders(
          res.getHeaders(),
          this.configuration.responseHeaders,
          upstream.responseHeaders,
        );
        RequestUtils.updateResponseHeaders(res, headersToSet);

        (<HttpRequestHandlerConfig> handler).handle(
            req,
            res,
            async (
              proxyConfiguration?: ProxyRequestConfiguration,
            ): Promise<void> => {
              this.log.debug(context, 'Handling HTTP/1.1 proxy request', {
                class: Prxi.LOG_CLASS,
                method: req.method,
                path,
              });
              await proxy.http.proxy(req, res, context, proxyConfiguration);
            },
            <HttpMethod> req.method,
            path,
            context
          )
          .finally(() => {
            this.hooks.onAfterHttpRequest(path, req, res, context);
          })
          .catch((err: Error) => {
            this.log.error(context, 'Error occurred upon handling http/1.1 request', err, {
              class: Prxi.LOG_CLASS,
              method: req.method,
              path,
            });
            errHandler(req, res, err, context)
            .catch(err => {
              this.log.error(context, 'Unable to handle http/1.1 error with errorHandler', err, {
                class: Prxi.LOG_CLASS,
                method: req.method,
                path,
              });
              this.send500Error(context, req.method, path, req, res);
            })
          }
        );
      } else {
        /* istanbul ignore next */
        this.hooks.onAfterHttpRequest(path, req, res, context);
        this.log.error(context, 'Missing HTTP/1 RequestHandler configuration', null, {
          class: Prxi.LOG_CLASS,
          method: req.method,
          path,
        });
        errorHandler(req, res, new Error(`Missing RequestHandler configuration for the "${req.method}:${path}" request`), context)
        .catch(err => {
          this.log.error(context, 'Unable to handle http/1.1 error with errorHandler', err, {
            class: Prxi.LOG_CLASS,
            method: req.method,
            path,
          });
          this.send500Error(context, req.method, path, req, res);
        })
      }
    });

    if (this.configuration.mode === 'HTTP2') {
      server.on('session', (session) => {
        const sessionContext: Record<string, any> = {};
        (<any> session)._context = sessionContext;
        this.hooks.onBeforeHTTP2Session(session, sessionContext);
        session.once('close', () => {
          this.hooks.onAfterHTTP2Session(session, sessionContext);
        });

        /* istanbul ignore else */
        if (this.configuration.proxyRequestTimeout) {
          session.setTimeout(this.configuration.proxyRequestTimeout, () => {
            this.log.debug(sessionContext, `HTTP/2 session timeout`, {
              class: Prxi.LOG_CLASS,
            });
            session.close();
          });
        }

        session.on('stream', (stream, headers) => {
          const sessionContext = (<any> session)._context;
          const context = {
            ...sessionContext,
          };

          /* istanbul ignore next */
          stream.on('error', (err) => {
            this.log.error(context, `HTTP/2 stream error`, err, {
              class: Prxi.LOG_CLASS,
              headers,
            });
          });

          const path = RequestUtils.getPathFromStr(headers[constants.HTTP2_HEADER_PATH].toString());
          const method = headers[constants.HTTP2_HEADER_METHOD].toString();

          this.hooks.onBeforeHTTP2Request(method, path, stream, headers, context);
          stream.once('close', () => {
            this.hooks.onAfterHTTP2Request(method, path, stream, headers, context);
          });

          const {handler, upstream, proxy} = this.findRequestHandler(
            'HTTP2',
            upstreamConfigurations,
            <HttpMethod> method,
            <string> path,
            headers,
            context,
          );

          if (handler) {
            let http2ErrHandler = http2ErrorHandler;
            /* istanbul ignore next */
            if (upstream.http2ErrorHandler) {
              /* istanbul ignore next */
              http2ErrHandler = upstream.http2ErrorHandler;
            }

            const headersToSet = RequestUtils.prepareProxyHeaders(
              headers,
              this.configuration.responseHeaders,
              upstream.responseHeaders,
            );

            (<Http2RequestHandlerConfig> handler).handle(
              stream,
              headers,
              async (proxyConfiguration?: ProxyRequestConfiguration): Promise<void> => {
                this.log.debug(context, 'Handling HTTP/2 proxy request', {
                  class: Prxi.LOG_CLASS,
                  path,
                  method,
                });
                await proxy.http2.proxy(session, stream, headersToSet, context, proxyConfiguration);
              },
              <HttpMethod> method,
              path,
              context
            )
            .catch((err: Error) => {
              this.log.error(context, 'Error occurred upon making the HTTP/2 proxy request', err, {
                class: Prxi.LOG_CLASS,
                path,
                method,
              });
              http2ErrHandler(stream, headers, err, context)
              .catch(err => {
                this.log.error(context, 'Unable to handle HTTP/2 error with errorHandler', err, {
                  class: Prxi.LOG_CLASS,
                  path,
                  method,
                });
                this.send500ErrorForHttp2(context, method, path, stream, headers);
              })
            });
          } else {
            /* istanbul ignore next */
            this.log.error(context, 'Missing HTTP/2 RequestHandler configuration', null, {
              class: Prxi.LOG_CLASS,
              path,
              method,
            });
            http2ErrorHandler(stream, headers, new Error(`Missing RequestHandler configuration for the "${method}:${path}" HTTP/2 request`), context)
            .catch(err => {
              this.log.error(context, 'Unable to handle HTTP/2 error with errorHandler', err, {
                class: Prxi.LOG_CLASS,
                path,
                method,
              });
              this.send500ErrorForHttp2(context, method, path, stream, headers);
            })
          }
        });
      });
    }

    /* istanbul ignore next */
    server.on('clientError', (err) => {
      this.log.error({}, 'Client error', err), {
        class: Prxi.LOG_CLASS,
      };
    });

    // keep track of all open connections
    server.on('connection', (connection: Socket) => {
      connection.setTimeout(this.configuration.proxyRequestTimeout);

      this.sockets.add(connection);

      connection.once('close', () => {
        this.sockets.delete(connection);
      });
    });

    // handle upgrade action
    server.on('upgrade', (req: IncomingMessage, socket: Socket, head: Buffer) => {
      const context = {};
      const path = RequestUtils.getPath(req);

      this.hooks.onUpgrade(path, req, socket, head, context);
      const {handler, proxy} = this.findWebSocketHandler(context, upstreamConfigurations, path, req.headers);

      // handle websocket
      if (
        req.headers.upgrade.toLowerCase() === 'websocket'
        && req.method.toUpperCase() === 'GET'
        && handler
      ) {
        const headersToSet = RequestUtils.prepareProxyHeaders(
          {},
          this.configuration.responseHeaders,
          proxy.upstream.responseHeaders,
        );

        handler.handle(
          req,
          socket,
          head,
          // handle
          async (proxyConfiguration?: ProxyRequestConfiguration): Promise<void> => {
            this.log.debug(context, 'Handling WS proxy request', {
              class: Prxi.LOG_CLASS,
              path
            });
            await proxy.ws.proxy(req, socket, head, context, proxyConfiguration);
          },
          // cancel
          (status: number, description: string) => {
            this.log.debug(context, 'Cancel WS request', {
              class: Prxi.LOG_CLASS,
              path,
              status,
              description
            });
            this.closeSocket(context, req.method, path, req, socket, status, description, headersToSet);
          },
          path,
          context
        )
        .finally(() => {
          this.hooks.onAfterUpgrade(path, req, socket, head, context);
        })
        .catch(err => {
          this.log.error(context, 'Unable to handle WS request', err, {
            class: Prxi.LOG_CLASS,
            path,
          });
          this.closeSocket(context, req.method, path, req, socket, 500, 'Unexpected error ocurred', headersToSet);
        });
      } else {
        /* istanbul ignore next */
        this.hooks.onAfterUpgrade(path, req, socket, head, context);
        this.log.info(context, 'Unable to handle upgrade request', {
          class: Prxi.LOG_CLASS,
          path,
          method: req.method,
          upgrade: req.headers.upgrade,
        });

        const headersToSet = RequestUtils.prepareProxyHeaders(
          {},
          this.configuration.responseHeaders,
        );

        this.closeSocket(context, req.method, path, req, socket, 405, 'Upgrade could not be processed', headersToSet);
      }
    });

    // start listening on incoming connections
    await new Promise<void>(res => {
      server.listen(port, hostname, () => {
        this.server = server;
        this.log.info({}, 'Started listening for connections', {
          class: Prxi.LOG_CLASS,
          mode: this.configuration.mode,
          secure: !!this.configuration.secure,
          hostname,
          port,
        });
        res();
      });
    });
  }

  /**
   * Send 500 error response
   * @param context
   * @param method
   * @param path
   * @param req
   * @param res
   */
  private send500ErrorForHttp2(context: Record<string, any>, method: string, path: string, stream: ServerHttp2Stream, headers: IncomingHttpHeaders): void {
    /* istanbul ignore next */
    if (stream.closed) {
      return;
    }

    try {
      let contentType = 'text/plain';
      let data = 'Unexpected error occurred';

      /* istanbul ignore else */
      if (headers.accept && headers.accept.indexOf('application/json') >= 0) {
        contentType = 'application/json';
        data = JSON.stringify({
          error: data,
        });
      }

      stream.respond({
        [constants.HTTP2_HEADER_STATUS]: 500,
        'content-type': contentType,
      });

      stream.end(data);
    } catch (e) {
      /* istanbul ignore next */
      this.log.error(context, 'Failed to send 500 error over HTTP/2 connection', e, {
        class: Prxi.LOG_CLASS,
        method,
        path,
      });
    }
  }

  /**
   * Send 500 error response
   * @param context
   * @param method
   * @param path
   * @param req
   * @param res
   */
  private send500Error(context: Record<string, any>, method: string, path: string, req: Request, res: Response): void {
    try {
      res.statusCode = 500;
      let data = 'Unexpected error occurred';

      /* istanbul ignore else */
      if (req.headers.accept && req.headers.accept.indexOf('application/json') >= 0) {
        data = JSON.stringify({
          error: data,
        });
        res.setHeader('content-type', 'application/json');
      }

      res.write(data, () => {
        try {
          res.end();
        } catch (e) {
          /* istanbul ignore next */
          this.log.error(context, 'Failed to send 500 error over HTTP/1 connection', e, {
            class: Prxi.LOG_CLASS,
            method,
            path,
          });
        }
      });
    } catch (e) {
      /* istanbul ignore next */
      this.log.error(context, 'Failed to send 500 error over HTTP/1 connection', e, {
        class: Prxi.LOG_CLASS,
        method,
        path,
      });
    }
  }

  /**
   * Close socket
   * @param context
   * @param method
   * @param path
   * @param req
   * @param socket
   * @param status
   * @param description
   * @param headers
   */
  private closeSocket(context: Record<string, any>, method: string, path: string, req: IncomingMessage, socket: Socket, status: number, message: string, headers: OutgoingHttpHeaders): void {
    try {
      socket.write(WebSocketUtils.prepareRawHeadersString(`HTTP/${req.httpVersion} ${status} ${message}`, headers), (err) => {
        /* istanbul ignore next */
        if (err) {
          this.log.error(context, "Can't write upon socket closure", err, {
            class: Prxi.LOG_CLASS,
            method,
            path
          });
        }

        socket.destroy();
      });
    } catch (e) {
      /* istanbul ignore next */
      this.log.error(context, "Can't close socket", e, {
        class: Prxi.LOG_CLASS,
        method,
        path
      });
    }
  }

  /**
   * Find http request handler across all the configs
   * @param mode
   * @param proxies
   * @param configs
   * @param method
   * @param path
   * @param headers
   * @returns
   */
  private findRequestHandler(
    mode: 'HTTP' | 'HTTP2',
    configs: UpstreamConfiguration[],
    method: HttpMethod,
    path: string,
    headers: IncomingHttpHeaders,
    context: Record<string, any>,
  ): {
    proxy: Proxy | null,
    handler: HttpRequestHandlerConfig | Http2RequestHandlerConfig | null,
    upstream: UpstreamConfiguration | null,
  } | null {
    for (const upstream of configs) {
      let handler;

      if (mode === 'HTTP') {
        handler = upstream.requestHandlers?.find(i => i.isMatching(method, path, context, headers));
      }

      if (mode === 'HTTP2') {
        handler = upstream.http2RequestHandlers?.find(i => i.isMatching(method, path, context, headers));
      }

      if (handler) {
        const proxy = this.proxies.find(p => p.upstream === upstream);
        return {
          proxy,
          handler,
          upstream,
        };
      }
    }

    return {
      proxy: null,
      handler: null,
      upstream: null,
    };
  }

  /**
   * Find WS handler across all the configs
   * @param context
   * @param configs
   * @param path
   * @param headers
   * @returns
   */
  private findWebSocketHandler(context: Record<string, any>, configs: UpstreamConfiguration[], path: string, headers: IncomingHttpHeaders): {
    proxy: Proxy | null,
    handler: WebSocketHandlerConfig | null,
    upstream: UpstreamConfiguration | null,
  } | null {
    for (const upstream of configs) {
      const handler = upstream.webSocketHandlers?.find(i => i.isMatching(path, context, headers));
      if (handler) {
        const proxy = this.proxies.find(p => p.upstream === upstream);
        return {
          proxy,
          handler,
          upstream,
        };
      }
    }

    return {
      proxy: null,
      handler: null,
      upstream: null,
    };
  }

  /**
   * Stop proxy service if running
   * @param force
   */
  public async stop(force?: boolean): Promise<void> {
    const server = this.server;

    /* istanbul ignore next */
    if (server) {
      this.server = null;
      await new Promise<void>((res, rej) => {
        this.log.info({}, 'Stopping', {
          class: Prxi.LOG_CLASS,
        });
        if (force) {
          this.sockets.forEach(s => {
            s.destroy();
            this.sockets.delete(s);
          });

          this.proxies.forEach(p => {
            p.http2?.closeAllConnections();
            p.ws?.closeAllConnections();
          });
        }

        server.close((err) => {
          if (err) {
            this.log.error({}, 'Failed to stop', err, {
              class: Prxi.LOG_CLASS,
            });
            return rej(err);
          }

          this.proxies.forEach(p => {
            p.http2?.closeAllConnections();
            p.ws?.closeAllConnections();
          });

          this.log.info({}, 'Stopped', {
            class: Prxi.LOG_CLASS,
          });
          res();
        });
      });
    } else {
      this.log.info({}, 'Stop action skipped, not running', {
        class: Prxi.LOG_CLASS,
      });
    }
  }
}

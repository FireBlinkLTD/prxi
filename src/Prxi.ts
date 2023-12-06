import { Configuration, HttpMethod, ProxyRequestConfiguration, WebSocketHandlerConfig, Request, Response, Server, HttpRequestHandlerConfig, Http2RequestHandlerConfig  } from "./interfaces";
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

interface Proxy {
  upstream: UpstreamConfiguration,
  http: HttpProxyHandler,
  http2: Http2ProxyHandler,
  ws: WebSocketProxyHandler,
}

export class Prxi {
  private server: Server = null;
  private logInfo: (message?: any, ...params: any[]) => void;
  private logError: (message?: any, ...params: any[]) => void;
  private proxies: Proxy[];

  constructor(private configuration: Configuration) {
    // set default values
    /* istanbul ignore next */
    configuration.proxyRequestTimeout = configuration.proxyRequestTimeout ?? 60 * 1000;

    const {logInfo, logError} = this.configuration;
    this.logInfo = (msg) => {
      // istanbul ignore next
      (logInfo || this.logInfo)(`[${new Date().toISOString()}] ${msg}`);
    };

    this.logError = (msg, err) => {
      // istanbul ignore next
      (logError || this.logError)(`[${new Date().toISOString()}] ${msg}`, err);
    };
  }

  /**
   * Create server depending on the mode
   */
  private get createServer() {
    return ((cb: (req: Request, res: Response) => void): Server => {
      if (this.configuration.mode === 'HTTP') {
        if (this.configuration.secure) {
          return createSecureHttp1Server({
            key: this.configuration.secure.key,
            cert: this.configuration.secure.cert,
          }, cb);
        }

        return createHttp1Server(cb);
      }

      if (this.configuration.mode === 'HTTP2') {
        if (this.configuration.secure) {
          return createSecureHttp2Server({
            allowHTTP1: true,
            key: this.configuration.secure.key,
            cert: this.configuration.secure.cert,
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
      let httpProxyHandler;
      if (this.configuration.mode === 'HTTP') {
        httpProxyHandler = new HttpProxyHandler(
          this.logInfo,
          this.configuration,
          upstream,
        );
      }

      let http2ProxyHandler;
      if (this.configuration.mode === 'HTTP2') {
        http2ProxyHandler = new Http2ProxyHandler(
          this.logInfo,
          this.logError,
          this.configuration,
          upstream,
        );
      }

      const webSocketProxyHandler = new WebSocketProxyHandler(
        this.logInfo,
        this.logError,
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
      if (this.configuration.mode === 'HTTP2' && req.httpVersion === "2.0") {
        // Ignore HTTP/2 requests
        return;
      }

      const requestId = id++;
      const path = RequestUtils.getPath(req);

      this.logInfo(`[${requestId}] [Prxi] Handling incoming request for method: ${req.method} and path: ${path}`);

      const {handler, upstream, proxy, context} = this.findRequestHandler('HTTP', upstreamConfigurations, <HttpMethod> req.method, path);
      if (handler) {
        /* istanbul ignore next */
        if (upstream.errorHandler) {
          /* istanbul ignore next */
          errorHandler = upstream.errorHandler;
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
            this.logInfo(`[${requestId}] [Prxi] Handling HTTP/1.1 proxy request for ${req.method} ${path}`);
            await proxy.http.proxy(requestId, req, res, proxyConfiguration);
          }, <HttpMethod> req.method, path, context).catch((err: Error) => {
            this.logError(`[${requestId}] [Prxi] Error occurred upon making the "${req.method}:${path}" request`, err);
            errorHandler(req, res, err)
            .catch(err => {
              this.logError(`[${requestId}] [Prxi] Unable to handle error with errorHandler`, err);
              this.send500Error(req, res);
            })
          });
      } else {
        this.logError(`[${requestId}] [Prxi] Missing RequestHandler configuration for the "${req.method}:${path}" request`);
        errorHandler(req, res, new Error(`Missing RequestHandler configuration for the "${req.method}:${path}" request`))
        .catch(err => {
          this.logError(`[${requestId}] [Prxi] Unable to handle error with errorHandler`, err);
          this.send500Error(req, res);
        })
      }
    });

    if (this.configuration.mode === 'HTTP2') {
      server.on('session', (session) => {
        /* istanbul ignore else */
        if (this.configuration.proxyRequestTimeout) {
          session.setTimeout(this.configuration.proxyRequestTimeout, () => {
            this.logInfo(`[Prxi] HTTP/2 session timeout`);
            session.close();
          });
        }

        session.on('stream', (stream, headers) => {
          const requestId = id++;

          const path = RequestUtils.getPathFromStr(headers[constants.HTTP2_HEADER_PATH].toString());
          const method = headers[constants.HTTP2_HEADER_METHOD].toString();
          const {handler, upstream, proxy, context} = this.findRequestHandler('HTTP2', upstreamConfigurations, <HttpMethod> method, <string> path);

          if (handler) {
            /* istanbul ignore next */
            if (upstream.errorHandler) {
              /* istanbul ignore next */
              errorHandler = upstream.errorHandler;
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
                this.logInfo(`[${requestId}] [Prxi] Handling HTTP/2 proxy request for path: ${path}`);
                await proxy.http2.proxy(requestId, session, stream, headersToSet, proxyConfiguration);
              },
              <HttpMethod> method,
              path,
              context
            ).catch((err: Error) => {
              this.logError(`[${requestId}] [Prxi] Error occurred upon making the "${method}:${path}" request`, err);
              http2ErrorHandler(stream, headers, err)
              .catch(err => {
                this.logError(`[${requestId}] [Prxi] Unable to handle error with errorHandler`, err);
                this.send500ErrorForHttp2(stream, headers);
              })
            });
          } else {
            this.logError(`[${requestId}] [Prxi] Missing RequestHandler configuration for the "${method}:${path}" HTTP/2 request`);
            http2ErrorHandler(stream, headers, new Error(`Missing RequestHandler configuration for the "${method}:${path}" HTTP/2 request`))
            .catch(err => {
              this.logError(`[${requestId}] [Prxi] Unable to handle error with errorHandler`, err);
              this.send500ErrorForHttp2(stream, headers);
            })
          }

        });
      });
    }

    /* istanbul ignore next */
    server.on('clientError', (err) => {
      this.logError(`[Prxi] Client Error`, err);
    })

    // keep track of all open connections
    server.on('connection', (connection: Socket) => {
      connection.setTimeout(this.configuration.proxyRequestTimeout);
    });

    // handle upgrade action
    server.on('upgrade', (req: IncomingMessage, socket: Socket, head: Buffer) => {
      const requestId = id++;

      const path = RequestUtils.getPath(req);
      const {handler, proxy, context} = this.findWebSocketHandler(upstreamConfigurations, path);

      this.logInfo(`[${requestId}] [Prxi] Upgrade event received on path: ${path}`);
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
            this.logInfo(`[${requestId}] [Prxi] Handling WS proxy request for path: ${path}`);
            await proxy.ws.proxy(requestId, req, socket, head, proxyConfiguration);
          },
          // cancel
          (status: number, description: string) => {
            this.logError(`[${requestId}] [Prxi] cancel websocket request with ${status}: ${description}`);
            Prxi.closeSocket(req, socket, status, description, headersToSet);
          },
          path,
          context
        ).catch(err => {
          this.logError(`[${requestId}] [Prxi] Unable to handle websocket request`, err);
          Prxi.closeSocket(req, socket, 500, 'Unexpected error ocurred', headersToSet);
        });
      } else {
        this.logInfo(`[${requestId}] [Prxi] Unable to handle upgrade request`);

        const headersToSet = RequestUtils.prepareProxyHeaders(
          {},
          this.configuration.responseHeaders,
        );

        Prxi.closeSocket(req, socket, 405, 'Upgrade could not be processed', headersToSet);
      }
    });

    // start listening on incoming connections
    await new Promise<void>(res => {
      server.listen(port, hostname, () => {
        this.server = server;
        this.logInfo(`Prxi started listening on ${hostname}:${port}`);
        res();
      });
    });
  }

  /**
   * Send 500 error response
   * @param req
   * @param res
   */
  private send500ErrorForHttp2(stream: ServerHttp2Stream, headers: IncomingHttpHeaders): void {
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
      this.logError(`Prxi failed to send 500 error`, e);
    }
  }

  /**
   * Send 500 error response
   * @param req
   * @param res
   */
  private send500Error(req: Request, res: Response): void {
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
          this.logError(`Prxi failed to send 500 error`, e);
        }
      });
    } catch (e) {
      /* istanbul ignore next */
      this.logError(`Prxi failed to send 500 error`, e);
    }
  }

  /**
   * Close socket
   * @param req
   * @param socket
   * @param status
   * @param description
   * @param headers
   */
  private static closeSocket(req: IncomingMessage, socket: Socket, status: number, message: string, headers: OutgoingHttpHeaders): void {
    socket.write(WebSocketUtils.prepareRawHeadersString(`HTTP/${req.httpVersion} ${status} ${message}`, headers));
    socket.destroy();
  }

  /**
   * Find http request handler across all the configs
   * @param mode
   * @param proxies
   * @param configs
   * @param method
   * @param path
   * @returns
   */
  private findRequestHandler(mode: 'HTTP' | 'HTTP2', configs: UpstreamConfiguration[], method: HttpMethod, path: string): {
    proxy: Proxy | null,
    handler: HttpRequestHandlerConfig | Http2RequestHandlerConfig | null,
    upstream: UpstreamConfiguration | null,
    context: Record<string, any>
  } | null {
    const context = {};
    for (const upstream of configs) {
      let handler;

      if (mode === 'HTTP') {
        handler = upstream.requestHandlers?.find(i => i.isMatching(method, path, context));
      }

      if (mode === 'HTTP2') {
        handler = upstream.http2RequestHandlers?.find(i => i.isMatching(method, path, context));
      }

      if (handler) {
        const proxy = this.proxies.find(p => p.upstream === upstream);
        return {
          proxy,
          handler,
          upstream,
          context
        };
      }
    }

    return {
      proxy: null,
      handler: null,
      upstream: null,
      context,
    };
  }

  /**
   * Find WS handler across all the configs
   * @param configs
   * @param path
   * @returns
   */
  private findWebSocketHandler(configs: UpstreamConfiguration[], path: string): {
    proxy: Proxy | null,
    handler: WebSocketHandlerConfig | null,
    upstream: UpstreamConfiguration | null,
    context: Record<string, any>
  } | null {
    const context = {};
    for (const upstream of configs) {
      const handler = upstream.webSocketHandlers?.find(i => i.isMatching(path, context));
      if (handler) {
        const proxy = this.proxies.find(p => p.upstream === upstream);
        return {
          proxy,
          handler,
          upstream,
          context,
        };
      }
    }

    return {
      proxy: null,
      handler: null,
      upstream: null,
      context,
    };
  }

  /**
   * Stop proxy service if running
   */
  public async stop(): Promise<void> {
    const server = this.server;

    /* istanbul ignore next */
    if (server) {
      this.server = null;
      await new Promise<void>((res, rej) => {
        this.logInfo('Stopping Prxi');

        server.close((err) => {
          if (err) {
            this.logError('Failed to stop Prxi', err);
            return rej(err);
          }

          this.logInfo('Prxi stopped');
          res();
        });
      });
    } else {
      this.logInfo('Prxi stopping skipped, not running');
    }
  }
}

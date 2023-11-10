import { Configuration, HttpMethod, ProxyRequestConfiguration, RequestHandlerConfig, WebSocketHandlerConfig } from "./interfaces";
import { createServer, IncomingMessage, ServerResponse, Server } from "http";
import { Socket } from "net";
import { RequestUtils, WebSocketUtils } from "./utils";
import { HttpProxyHandler, WebSocketProxyHandler } from "./handlers";
import { UpstreamConfiguration } from "./interfaces/UpstreamConfiguration";
import { OutgoingHttpHeaders } from "http2";

interface Proxy {
  upstream: UpstreamConfiguration,
  http: HttpProxyHandler,
  ws: WebSocketProxyHandler,
}

export class Prxi {
  private server: Server = null;
  private logInfo: (message?: any, ...params: any[]) => void;
  private logError: (message?: any, ...params: any[]) => void;

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
   * Start proxy server
   */
  public async start(): Promise<void> {
    let {hostname, port, upstream: upstreamConfigurations, errorHandler} = this.configuration;
    hostname = hostname || 'localhost';

    // register default error handler
    if (!errorHandler) {
      /* istanbul ignore next */
      errorHandler = (req: IncomingMessage, res: ServerResponse, err?: Error): Promise<void> => {
        /* istanbul ignore next */
        return new Promise<void>((res, rej) => rej(err));
      }
    }

    const proxies = upstreamConfigurations.map(upstream => {
      const httpProxyHandler = new HttpProxyHandler(
        this.logInfo,
        this.configuration,
        upstream,
      );

      const webSocketProxyHandler = new WebSocketProxyHandler(
        this.logInfo,
        this.logError,
        this.configuration,
        upstream
      );

      return {
        upstream,
        http: httpProxyHandler,
        ws: webSocketProxyHandler,
      }
    });

    let id = 0;
    // create server
    const server = createServer((req: IncomingMessage, res: ServerResponse) => {
      const requestId = id++;
      const path = RequestUtils.getPath(req);

      this.logInfo(`[${requestId}] [Prxi] Handling incoming request for method: ${req.method} and path: ${path}`);

      const {handler, upstream, proxy, context} = Prxi.findRequestHandler(proxies, upstreamConfigurations, <HttpMethod> req.method, path);
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

        handler.handle(
          req,
          res,
          async (
            proxyConfiguration?: ProxyRequestConfiguration,
          ): Promise<void> => {
            this.logInfo(`[${requestId}] [Prxi] Handling HTTP proxy request for path: ${path}`);
            await proxy.http.proxy(requestId, req, res, proxyConfiguration);
          },  <HttpMethod> req.method, path, context).catch((err) => {
            this.logError(`[${requestId}] [Prxi] Error occurred upon making the "${req.method}:${path}" request`, err);
            errorHandler(req, res, err).catch(err => {
              this.logError(`[${requestId}] [Prxi] Unable to handle error with errorHandler`, err);
              req.destroy();
              res.destroy();
            });
          });
      } else {
        this.logError(`[${requestId}] [Prxi] Missing RequestHandler configuration for the "${req.method}:${path}" request`);
        errorHandler(req, res, new Error(`Missing RequestHandler configuration for the "${req.method}:${path}" request`)).catch(err => {
          this.logError(`[${requestId}] [Prxi] Unable to handle error with errorHandler`, err);
          req.destroy();
          res.destroy();
        });
      }
    });

    // keep track of all open connections
    server.on('connection', (connection: Socket) => {
      connection.setTimeout(this.configuration.proxyRequestTimeout);
    });

    // handle upgrade action
    server.on('upgrade', (req: IncomingMessage, socket: Socket, head: Buffer) => {
      const requestId = id++;

      const path = RequestUtils.getPath(req);
      const {handler, proxy, context} = Prxi.findWebSocketHandler(proxies, upstreamConfigurations, path);

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
   * @param proxies
   * @param configs
   * @param method
   * @param path
   * @returns
   */
  private static findRequestHandler(proxies: Proxy[], configs: UpstreamConfiguration[], method: HttpMethod, path: string): {
    proxy: Proxy | null,
    handler: RequestHandlerConfig | null,
    upstream: UpstreamConfiguration | null,
    context: Record<string, any>
  } | null {
    const context = {};
    for (const upstream of configs) {
      const handler = upstream.requestHandlers?.find(i => i.isMatching(method, path, context));
      if (handler) {
        const proxy = proxies.find(p => p.upstream === upstream);
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
  private static findWebSocketHandler(proxies: Proxy[], configs: UpstreamConfiguration[], path: string): {
    proxy: Proxy | null,
    handler: WebSocketHandlerConfig | null,
    upstream: UpstreamConfiguration | null,
    context: Record<string, any>
  } | null {
    const context = {};
    for (const upstream of configs) {
      const handler = upstream.webSocketHandlers?.find(i => i.isMatching(path, context));
      if (handler) {
        const proxy = proxies.find(p => p.upstream === upstream);
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

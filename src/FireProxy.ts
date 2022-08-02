import { Configuration, HttpMethod, ProxyRequestConfiguration } from "./interfaces";
import { createServer, IncomingMessage, ServerResponse, Server } from "http";
import { Socket } from "net";
import { RequestUtils, WebSocketUtils } from "./utils";
import { HttpProxyHandler, WebSocketProxyHandler } from "./handlers";

// empty object used in cases when default value is not provided
const emptyObj = {};

export class FireProxy {
  private server: Server = null;
  private logInfo = (msg: string) => {};
  private logError = (msg: string, err?: Error) => {};

  constructor(private configuration: Configuration) {
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
    let {hostname, port, requestHandlers, errorHandler} = this.configuration;
    hostname = hostname || 'localhost';

    const httpProxyHandler = new HttpProxyHandler(
      this.logInfo,
      this.configuration,
    );

    const webSocketProxyHandler = new WebSocketProxyHandler(
      this.logInfo,
      this.logError,
      this.configuration,
    );

    let id = 0;
    // create server
    const server = this.server = createServer((req: IncomingMessage, res: ServerResponse) => {
      const requestId = id++;
      const path = RequestUtils.getPath(req);

      const handler = requestHandlers.find(i => i.isMatching(req.method as HttpMethod, path));
      if (handler) {
        const headersToSet = RequestUtils.prepareProxyHeaders(res.getHeaders(), this.configuration.responseHeaders);
        RequestUtils.updateResponseHeaders(res, headersToSet);

        handler.handle(
          req,
          res,
          async (
            proxyConfiguration?: ProxyRequestConfiguration,
          ): Promise<void> => {
            await httpProxyHandler.proxy(requestId, req, res, proxyConfiguration);
          }).catch((err) => {
            this.logError(`[${requestId}] [FireProxy] Error occurred upon making the "${req.method}:${path}" request`, err);
            errorHandler(req, res, err).catch(err => {
              this.logError(`[${requestId}] [FireProxy] Unable to handle error with errorHandler`, err);
              req.destroy();
              res.destroy();
            });
          });
      } else {
        this.logError(`[${requestId}] [FireProxy] Missing RequestHandler configuration for the "${req.method}:${path}" request`);
        errorHandler(req, res, new Error(`Missing RequestHandler configuration for the "${req.method}:${path}" request`)).catch(err => {
          this.logError(`[${requestId}] [FireProxy] Unable to handle error with errorHandler`, err);
          req.destroy();
          res.destroy();
        });
      }
    });

    // handle upgrade action
    server.on('upgrade', (req: IncomingMessage, socket: Socket, head: Buffer) => {
      const requestId = id++;
      // handle websocket
      if (
        req.headers.upgrade.toLowerCase() === 'websocket'
        && req.method.toUpperCase() === 'GET'
        && this.configuration.webSocketHandler
      ) {
        this.configuration.webSocketHandler(req, socket, head, async (proxyConfiguration?: ProxyRequestConfiguration): Promise<void> => {
          await webSocketProxyHandler.proxy(requestId, req, socket, head, proxyConfiguration);
        })
        .catch(err => {
          this.logError(`[${requestId}] [FireProxy] Unable to handle websocket request`, err);

          const headersToSet = RequestUtils.prepareProxyHeaders({}, this.configuration.responseHeaders);
          socket.write(WebSocketUtils.prepareRawHeadersString(`HTTP/${req.httpVersion} 500 Unexpected error ocurred`, headersToSet));

          // destroy socket cause we can't handle it
          socket.destroy();
        });
      } else {
        this.logInfo(`[${requestId}] [FireProxy] Unable to handle upgrade request`);

        const headersToSet = RequestUtils.prepareProxyHeaders({}, this.configuration.responseHeaders);
        socket.write(WebSocketUtils.prepareRawHeadersString(`HTTP/${req.httpVersion} 405 Upgrade could not be processed`, headersToSet));

        // destroy socket cause we can't handle it
        socket.destroy();
      }
    });

    // start listening on incoming connections
    await new Promise<void>(res => {
      server.listen(port, hostname, () => {
        this.logInfo(`FireProxy started listening on ${hostname}:${port}`);
        res();
      });
    });
  }

  /**
   * Stop proxy service if running
   */
  public async stop(): Promise<void> {
    /* istanbul ignore next */
    if (this.server) {
      await new Promise<void>((res, rej) => {
        this.server.close((err) => {
          if (err) {
            this.logError('Failed to stop FireProxy', err);
            return rej(err);
          }

          this.logInfo('FireProxy stopped');
          res();
        });
      });
    } else {
      this.logInfo('Skip stop of FireProxy, not running');
    }

    this.server = null;
  }
}

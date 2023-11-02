import { IncomingMessage, ServerResponse } from 'http';
import { Duplex } from 'stream';
import { ErrorHandler, Prxi, ProxyRequest, WebSocketHandlerFunction, WebSocketHandlerConfig, Configuration } from '../../src';
import { TestServer } from './TestServer';

export class TestProxy {
  public static readonly PORT = 8888;
  private proxy: Prxi;

  constructor(
    private configOverride: Partial<Configuration> = {},
    private host = 'localhost',
    private customErrorHandler: ErrorHandler | false = null,
    private isMatching: boolean | null = true,
    private customWsHandler: WebSocketHandlerFunction | null | false = null,
    private prefix: string = '',
  ) {}

  /**
   * Start proxy server
   */
  public async start() {
    const wsh = <WebSocketHandlerConfig> {
      isMatching: () => true,
      handle: this.customWsHandler ? this.customWsHandler : (this.customWsHandler !==false ? this.wsHandler.bind(this) : null),
    };

    // instantiate
    this.proxy = new Prxi({
      port: TestProxy.PORT,
      upstream: [{
        target: `http://${this.host}:${TestServer.PORT}${this.prefix}`,
        requestHandlers: this.isMatching !== null ? [
          {
            isMatching: () => this.isMatching,
            handle: this.handleOthers.bind(this),
          }
        ] : null,
        webSocketHandlers: wsh.handle ? [wsh] : null,
      }],

      errorHandler: this.customErrorHandler ? this.customErrorHandler : (this.customErrorHandler !== false ? this.errorHandler.bind(this) : null),
      logInfo: console.log,
      logError: console.error,
      proxyRequestHeaders: {
        ReqConfigLevel: 'CONFIG-REQUEST',
        ReqConfigLevelOverwrite: 'CONFIG-REQUEST-OVERWRITE',
        ReqConfigLevelClear: null,
      },
      responseHeaders: {
        ResConfigLevel: 'CONFIG-RESPONSE',
        ResConfigLevelOverwrite: 'CONFIG-RESPONSE-OVERWRITE',
        ResConfigLevelClear: null,
      },

      ...this.configOverride
    });

    // start it
    await this.proxy.start();
  }

  /**
   * Handle error
   * @param req
   * @param res
   * @param err
   */
  private async errorHandler(req: IncomingMessage, res: ServerResponse, err?: Error): Promise<void> {
    throw err;
  }

  /**
   * Proxy all requests
   * @param req
   * @param res
   * @param proxyRequest
   */
  private async handleOthers(req: IncomingMessage, res: ServerResponse, proxyRequest: ProxyRequest): Promise<void> {
    await proxyRequest({
      proxyRequestHeaders: {
        REQProxyLevel: 'PROXY-REQUEST',
        REQConfigLevelOverwrite: 'PROXY-REQUEST-OVERWRITE',
        REQProxyLevelClear: null,
      },
      proxyResponseHeaders: {
        RESProxyLevel: 'PROXY-RESPONSE',
        RESConfigLevelOverwrite: 'PROXY-RESPONSE-OVERWRITE',
        RESProxyLevelClear: null,
      },
    });
  }

  /**
   * Proxy WS request
   * @param req
   * @param socket
   * @param head
   * @param handle
   */
  private async wsHandler(req: IncomingMessage, socket: Duplex, head: Buffer, handle: () => Promise<void>) {
    handle();
  }

  /**
   * Stop proxy server
   */
  public async stop() {
    await this.proxy?.stop();
  }
}

import { IncomingMessage, ServerResponse } from 'http';
import { Duplex } from 'stream';
import { ErrorHandler, Prxi, ProxyRequest, WebSocketHandlerFunction, WebSocketHandlerConfig, Configuration, ProxyRequestConfiguration } from '../../src';
import { TestServer } from './TestServer';
import { RequestOptions } from 'https';

export class TestProxyParams {
  configOverride?: Partial<Configuration>;
  host?: string;
  customErrorHandler?: ErrorHandler | false;
  isMatching?: boolean | null;
  customWsHandler?: WebSocketHandlerFunction | false;
  prefix?: string;

  /**
   * Initialize default values
   */
  public init() {
    this.configOverride = this.configOverride ?? {};
    this.host = this.host ?? 'localhost';
    this.prefix = this.prefix ?? '';
    this.isMatching = this.isMatching === undefined ? true : this.isMatching;
  }
}

export class TestProxy {
  public static readonly PORT = 8888;
  private proxy: Prxi;

  constructor(
    private params?: TestProxyParams
  ) {
    if (!this.params) {
      this.params = new TestProxyParams();
    }
    this.params.init();
  }

  /**
   * Start proxy server
   */
  public async start() {
    const wsh = <WebSocketHandlerConfig> {
      isMatching: () => true,
      handle: this.params.customWsHandler ? this.params.customWsHandler : (this.params.customWsHandler !==false ? this.wsHandler.bind(this) : null),
    };

    // instantiate
    this.proxy = new Prxi({
      port: TestProxy.PORT,
      upstream: [{
        target: `http://${this.params.host}:${TestServer.PORT}${this.params.prefix}`,
        requestHandlers: this.params.isMatching !== null ? [
          {
            isMatching: () => this.params.isMatching,
            handle: this.handleOthers.bind(this),
          }
        ] : null,
        webSocketHandlers: wsh.handle ? [wsh] : null,
      }],

      errorHandler: this.params.customErrorHandler ? this.params.customErrorHandler : (this.params.customErrorHandler !== false ? this.errorHandler.bind(this) : null),
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

      ...this.params.configOverride
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
      onBeforeProxyRequest: (options: RequestOptions) => {
        options.headers['ON_BEFORE_PROXY_HEADER'] = 'yes';
      },
      onBeforeResponse: (res, outgoingHeaders) => {
        outgoingHeaders['ON_BEFORE_RESPONSE_HEADER'] = 'yes';
      }
    });
  }

  /**
   * Proxy WS request
   * @param req
   * @param socket
   * @param head
   * @param handle
   */
  private async wsHandler(req: IncomingMessage, socket: Duplex, head: Buffer, handle: (configuration?: ProxyRequestConfiguration) => Promise<void>) {
    await handle({
      onBeforeProxyRequest: (options: RequestOptions) => {
        options.headers['ON_BEFORE_WS_PROXY_HEADER'] = 'yes';
      }
    });
  }

  /**
   * Stop proxy server
   */
  public async stop() {
    await this.proxy?.stop();
  }
}

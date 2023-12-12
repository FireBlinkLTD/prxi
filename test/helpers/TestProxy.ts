import { IncomingMessage, ServerResponse } from 'node:http';
import { Duplex } from 'stream';
import { ErrorHandler, Prxi, ProxyRequest, WebSocketHandlerFunction, WebSocketHandlerConfig, Configuration, ProxyRequestConfiguration, Http2ErrorHandler } from '../../src';
import { TestServer } from './TestServer';
import { RequestOptions } from 'node:https';
import { OutgoingHttpHeaders } from 'node:http2';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export class TestProxyParams {
  configOverride?: Partial<Configuration>;
  host?: string;
  customErrorHandler?: ErrorHandler | false;
  customHttp2ErrorHandler?: Http2ErrorHandler | false;
  isMatching?: boolean | null;
  customWsHandler?: WebSocketHandlerFunction | false;
  prefix?: string;
  mode: 'HTTP' | 'HTTP2' | 'INVALID';
  secure: boolean;
  secureSettings?: {
    key: string,
    cert: string,
  }

  /**
   * Initialize default values
   */
  public init() {
    this.configOverride = this.configOverride ?? {};
    this.host = this.host ?? 'localhost';
    this.prefix = this.prefix ?? '';
    this.isMatching = this.isMatching === undefined ? true : this.isMatching;

    if (this.secure) {
      this.secureSettings = {
        key: readFileSync(resolve(__dirname, '../key.pem'), 'utf-8'),
        cert: readFileSync(resolve(__dirname, '../cert.pem'), 'utf-8'),
      }
    }
  }
}

export class TestProxy {
  public static readonly PORT = 8888;
  private proxy: Prxi;

  constructor(
    private params: TestProxyParams
  ) {
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

    console.log(`-> [${this.params.mode}] Starting Prxi`);

    // instantiate
    this.proxy = new Prxi({
      mode: <any> this.params.mode,
      port: TestProxy.PORT,
      secure: this.params.secureSettings,
      upstream: [{
        target: `http${this.params.secure ? 's' : ''}://${this.params.host}:${TestServer.PORT}${this.params.prefix}`,
        requestHandlers: this.params.isMatching !== null ? [
          {
            isMatching: () => this.params.isMatching,
            handle: this.handleOthers.bind(this),
          }
        ] : null,
        http2RequestHandlers: this.params.isMatching !== null ? [
          {
            isMatching: () => this.params.isMatching,
            handle: this.handleOthers.bind(this),
          }
        ] : null,
        webSocketHandlers: wsh.handle ? [wsh] : null,
      }],

      errorHandler: this.params.customErrorHandler ? this.params.customErrorHandler : (this.params.customErrorHandler !== false ? this.errorHandler.bind(this) : null),
      http2ErrorHandler: this.params.customHttp2ErrorHandler ? this.params.customHttp2ErrorHandler : (this.params.customHttp2ErrorHandler !== false ? this.errorHandler.bind(this) : null),
      log: {
        debug: (context, msg, params) => {
          console.log(`[${new Date().toISOString()}] [DEBUG]`, msg, JSON.stringify(params, null, 2));
        },
        info: (context, msg, params) => {
          console.log(`[${new Date().toISOString()}] [INFO]`, msg, JSON.stringify(params, null, 2));
        },
        error: (context, msg, error, params) => {
          console.log(`[${new Date().toISOString()}] [INFO]`, msg, JSON.stringify(params, null, 2), error);
        },
      },
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
      onBeforeProxyRequest: (options: RequestOptions, proxyHeaders: OutgoingHttpHeaders) => {
        proxyHeaders['ON_BEFORE_PROXY_HEADER'] = 'yes';
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
  public async stop(force = false) {
    await this.proxy?.stop(force);
  }
}

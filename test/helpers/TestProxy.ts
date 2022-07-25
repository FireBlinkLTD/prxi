import { ClientRequest, IncomingMessage, ServerResponse } from 'http';
import { ErrorHandler, FireProxy, ProxyRequest } from '../../src';
import { TestServer } from './TestServer';

export class TestProxy {
  public static readonly PORT = 8888;
  private proxy: FireProxy;

  constructor(
    private host = 'localhost',
    private customErrorHandler: ErrorHandler = null,
    private isMatching = true
  ) {}

  /**
   * Start proxy server
   */
  public async start() {
    // instantiate
    this.proxy = new FireProxy({
      port: TestProxy.PORT,
      target: `http://${this.host}:${TestServer.PORT}`,
      errorHandler: this.customErrorHandler || this.errorHandler.bind(this),
      requestHandlers: [
        {
          isMatching: () => this.isMatching,
          handle: this.handleOthers.bind(this),
        }
      ],
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
    });

    // start it
    await this.proxy.start();
  }

  private async errorHandler(req: IncomingMessage, res: ServerResponse, err?: Error): Promise<void> {
    throw err;
  }

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
   * Stop proxy server
   */
  public async stop() {
    await this.proxy?.stop();
  }
}

import { IncomingMessage, ServerResponse } from 'http';
import { ErrorHandler, FireProxy, ProxyRequest } from '../../src';
import { TestServer } from './TestServer';

export class TestProxy {
  public static readonly PORT = 8888;
  private proxy: FireProxy;

  constructor(
    private host = 'localhost',
    private customErrorHandler: ErrorHandler = null,
  ) {}

  /**
   * Start proxy server
   */
  public async start() {
    // instantiate
    this.proxy = new FireProxy({
      port: TestProxy.PORT,
      target: `http://${this.host}:${TestServer.PORT}`,
      errorHandler: this.customErrorHandler || this.errorHandler,
      requestHandlers: [
        {
          isMatching: () => true,
          handle: this.handleOthers,
        }
      ],
      logInfo: console.log,
      logError: console.error,
    });

    // start it
    await this.proxy.start();
  }

  private async errorHandler(req: IncomingMessage, res: ServerResponse, err?: Error): Promise<void> {
    throw err;
  }

  private async handleOthers(path: string, req: IncomingMessage, res: ServerResponse, proxyRequest: ProxyRequest): Promise<void> {
    await proxyRequest({
      path,
    });
  }

  /**
   * Stop proxy server
   */
  public async stop() {
    await this.proxy?.stop();
  }
}

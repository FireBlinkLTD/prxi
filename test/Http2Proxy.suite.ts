import {test, context, suite} from '@testdeck/mocha';
import { TestServer, TestProxy, TestProxyParams } from './helpers';
import {deepEqual, strictEqual} from 'assert';
import { Configuration } from '../src';
import { FetchHelpers } from './helpers/FetchHelper';
import { Console } from './helpers/Console';

@suite()
abstract class Http2ProxySuite {
  private mode: 'HTTP' | 'HTTP2' = 'HTTP2';
  private secure = true;

  private server: TestServer = null;
  private proxy: TestProxy = null;

  private get proxyUrl() {
    return new FetchHelpers(this.mode, this.secure).fixUrl(`http://localhost:${TestProxy.PORT}`);
  }

  /**
   * Before hook
   */
  async before(): Promise<void> {
    Console.printSolidBox(`[TEST] [${this.mode}]${this.secure ? ' [secure]' : ''} ${this[context].test.title}`);
    this.server = new TestServer('HTTP2', true, true);
    this.proxy = null;

    await this.server.start();
  }

  /**
   * After hook
   */
  async after(): Promise<void> {
    await this.proxy?.stop();
    await this.server?.stop();
    Console.printDoubleBox(`[TEST] [${this.mode}]${this.secure ? ' [secure]' : ''} ${this[context].test.title}`);
  }

  /**
   * Init proxy server
   */
  private async initProxy(configOverride: Partial<Configuration> = {}): Promise<void> {
    const params = new TestProxyParams();
    params.configOverride = configOverride;
    params.mode = this.mode;
    params.secure = this.secure;

    this.proxy = new TestProxy(params);
    await this.proxy.start();
  }

  @test()
  async clientError(): Promise<void> {
    await this.initProxy();
    this.server.failHttp2Request = true;

    const testData = 'Test';

    const resp = await new FetchHelpers(this.mode, this.secure)
      .post(`${this.proxyUrl}/echo`, testData);

    strictEqual(resp.data.error, 'Unexpected error occurred');
  }

  @test()
  async sessionHooks(): Promise<void> {
    let sessionCtx;
    let requestCtx;
    await this.initProxy({
      on: {
        beforeHTTP2Session(session, ctx) {
          ctx.beforeHTTP2Session = true;
          sessionCtx = ctx;
        },

        afterHTTP2Session(session, ctx) {
          ctx.afterHTTP2Session = true;
          sessionCtx = ctx;
        },

        beforeHTTP2Request(stream, headers, ctx) {
          ctx.beforeHTTP2Request = true;
          requestCtx = ctx;
        },

        afterHTTP2Request(stream, headers, ctx) {
          ctx.afterHTTP2Request = true;
          requestCtx = ctx;;
        },
      }
    });

    await new FetchHelpers(this.mode, this.secure)
      .post(`${this.proxyUrl}/echo`, 'test');

    // need to wait a little bit to capture close event on session
    await new Promise<void>(res => setTimeout(res, 10));

    deepEqual(sessionCtx, {
      beforeHTTP2Session: true,
      afterHTTP2Session: true,
    })

    deepEqual(requestCtx, {
      beforeHTTP2Session: true,
      beforeHTTP2Request: true,
      afterHTTP2Request: true,
    })
  }

  @test()
  async stopPrxi(): Promise<void> {
    await this.initProxy();
    this.server.initialResponseDelay = 30;

    const testData = 'Test';

    const promise = new FetchHelpers(this.mode, this.secure)
        .post(`${this.proxyUrl}/echo`, testData);

    await new Promise<void>((res, rej) => {
      setTimeout(() => {
        this.proxy.stop(true).then(res, rej);
      }, 10);
    });

    const resp = await promise;
    //strictEqual(resp, 'Unexpected error occurred');
  }
}

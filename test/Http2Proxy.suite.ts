import {test, context, suite} from '@testdeck/mocha';
import { TestServer, TestProxy, TestProxyParams } from './helpers';
import {deepEqual, strictEqual} from 'assert';
import { Configuration } from '../src';
import { FetchHelpers } from './helpers/FetchHelper';

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
    console.log(`========= [${this.mode}]${this.secure ? ' [secure]' : ''} ${this[context].test.title} =========`);
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
    console.log(`========= [${this.mode}]${this.secure ? ' [secure]' : ''} ${this[context].test.title} =========`);
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

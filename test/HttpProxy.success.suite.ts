import {suite, test, context} from '@testdeck/mocha';
import { TestServer, TestProxy, TestProxyParams, assertReject } from './helpers';
import {deepEqual, ok, strictEqual} from 'assert';
import {io} from 'socket.io-client';
import { Configuration, ProxyRequest, WebSocketProxyCancelRequest } from '../src';
import { IncomingMessage } from 'http';
import { Socket as NetSocket } from 'net';
import { FetchHelpers } from './helpers/FetchHelper';
import { Console } from './helpers/Console';

abstract class BaseHttpProxySuccessSuite {
  constructor(private mode: 'HTTP' | 'HTTP2', private secure = false) {
  }

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
    this.server = new TestServer(this.mode, this.secure, true);
    this.proxy = null;

    await this.server.start();
  }

  /**
   * After hook
   */
  async after(): Promise<void> {
    await this.proxy?.stop();
    await this.server?.stop();
    this.proxy = null;
    this.server = null;
    Console.printDoubleBox(`[TEST] [${this.mode}]${this.secure ? ' [secure]' : ''} ${this[context].test.title}`);
  }

  /**
   * Init proxy server
   */
  private async initProxy(configOverride: Partial<Configuration> = {}, extra?: Partial<TestProxyParams>): Promise<void> {
    const params = new TestProxyParams();
    params.configOverride = configOverride;
    params.mode = this.mode;
    params.secure = this.secure;

    if (extra) {
      params.onBeforeResponse = extra.onBeforeResponse;
    }

    this.proxy = new TestProxy(params);
    await this.proxy.start();
  }

  @test()
  async closeOpenProxyRequestByClient(): Promise<void> {
    await this.initProxy();

    const controller = new AbortController();
    let error: Error;
    const promise = new FetchHelpers(this.mode, this.secure).get(`${this.proxyUrl}/hold`, {}, controller).catch(
      err => error = err
    )

    await new Promise<void>((res) => setTimeout(() => {
      controller.abort();
      res();
    }, 20));
    await promise;

    strictEqual(error.message, 'This operation was aborted');
  }

  @test()
  async closeOpenProxyRequestByUpstreamServer(): Promise<void> {
    await this.initProxy();

    let error: Error;
    const promise = new FetchHelpers(this.mode, this.secure).get(`${this.proxyUrl}/hold`).catch(
      err => error = err
    )

    await new Promise<void>((res) => setTimeout(() => {
      this.server.stop().then(() => {
        this.server = null;
        res();
      });
    }, 50));
    const resp = await promise;
    console.log('@@@', resp);

    //strictEqual(error.message, 'This operation was aborted');
  }

  @test()
  async echoRequest(): Promise<void> {
    let c: Record<string, any>;
    await this.initProxy({
      on: {
        beforeHTTPRequest: (req, res, context) => {
          c = context;
          context.beforeTheRequest = 'HTTP';
        },

        afterHTTPRequest: (req, res, context) => {
          c = context;
          context.afterTheRequest = 'HTTP';
        },

        beforeHTTP2Request: (stream, headers, context) => {
          c = context;
          context.beforeTheRequest = 'HTTP2';
        },

        afterHTTP2Request: (stream, headers, context) => {
          c = context;
          context.afterTheRequest = 'HTTP2';
        }
      }
    });

    const testData = [];
    for (let i = 0; i < 1000 * 1000; i++) {
      testData.push('Iteration - ' + i);
    }

    const result = await new FetchHelpers(this.mode, this.secure).post(`${this.proxyUrl}/echo`, testData);
    deepEqual(result.data, testData);

    ok(c);
    strictEqual(c.beforeTheRequest, this.mode);
    strictEqual(c.afterTheRequest, this.mode);
  }

  @test()
  async multipleEchoRequests(): Promise<void> {
    await this.initProxy();

    const testData = 'Test';
    const result = await new FetchHelpers(this.mode, this.secure, 2).post(`${this.proxyUrl}/echo`, testData);
    deepEqual(result.data, testData);
  }

  @test()
  async multipleEchoRequestsWithTimeout(): Promise<void> {
    await this.initProxy({
      proxyRequestTimeout: 15,
    });

    const testData = 'Test';
    const result = await new FetchHelpers(this.mode, this.secure, 2, 20).post(`${this.proxyUrl}/echo`, testData);
    deepEqual(result.data, testData);
  }

  @test()
  async echoRequestWithKeepAliveConnection(): Promise<void> {
    if (this.mode === 'HTTP2') {
      // invalid test for the HTTP/2 connection, as `Connection` header is not allowed
      return;
    }

    await this.initProxy();

    const testData = [];
    for (let i = 0; i < 1000 * 1000; i++) {
      testData.push('Iteration - ' + i);
    }

    const result = await new FetchHelpers(this.mode, this.secure).post(`${this.proxyUrl}/echo`, testData, {
      'Connection': 'keep-alive',
    });
    deepEqual(result.data, testData);
  }

  @test()
  async customPath(): Promise<void> {
    await this.after();
    this.server = new TestServer(this.mode, this.secure, true, '/api');
    const params = new TestProxyParams();
    params.prefix = '/api';
    params.mode = this.mode;
    params.secure = this.secure;
    this.proxy = new TestProxy(params);
    await this.proxy.start();

    await this.server.start();

    const testData = [];
    for (let i = 0; i < 1000 * 1000; i++) {
      testData.push('Iteration - ' + i);
    }

    const result = await new FetchHelpers(this.mode, this.secure).post(`${this.proxyUrl}/echo`, testData);
    deepEqual(result.data, testData);
  }

  @test()
  async queryRequest(): Promise<void> {
    await this.initProxy();

    const result = await new FetchHelpers(this.mode, this.secure).get(`${this.proxyUrl}/query?test=1`);
    deepEqual(result.data, {
      query: {
        test: '1',
      }
    });
  }

  @test()
  async onBeforeResponseWithFailure(): Promise<void> {
    await this.initProxy({}, {
      onBeforeResponse (res, outgoingHeaders, context) {
        throw new Error('Test');
      },
    });

    const resp = await new FetchHelpers(this.mode, this.secure)
      .post(`${this.proxyUrl}/echo`, {});

    strictEqual(resp.data.error, 'Unexpected error occurred');
  }

  @test()
  async onBeforeResponseWithAsyncFailure(): Promise<void> {
    await this.initProxy({}, {
      async onBeforeResponse (res, outgoingHeaders, context) {
        throw new Error('Test');
      },
    });

    const resp = await new FetchHelpers(this.mode, this.secure)
      .post(`${this.proxyUrl}/echo`, {});

    strictEqual(resp.data.error, 'Unexpected error occurred');
  }

  @test()
  async onBeforeResponseMissing(): Promise<void> {
    await this.initProxy({}, {
      onBeforeResponse: false,
    });

    const resp = await new FetchHelpers(this.mode, this.secure)
      .post(`${this.proxyUrl}/echo`, {});

    deepEqual(resp.data, {});
  }

  @test()
  async onBeforeResponseAsync(): Promise<void> {
    await this.initProxy({}, {
      onBeforeResponse: async () => {},
    });

    const resp = await new FetchHelpers(this.mode, this.secure)
      .post(`${this.proxyUrl}/echo`, {});

    deepEqual(resp.data, {});
  }

  @test()
  async headersRequest(): Promise<void> {
    await this.initProxy();

    const result = await new FetchHelpers(this.mode, this.secure).get(`${this.proxyUrl}/headers`, {
      ReqConfigLevelCLEAR: 'empty',
      REQConfigLevelOverwrite: 'overwrite',
      Test: 'true',
    });
    const data = await result.data;

    const requestHeaders = {
      reqconfigleveloverwrite: data.headers['reqconfigleveloverwrite'],
      reqproxylevel: data.headers['reqproxylevel'],
      reqproxylevelclear: data.headers['reqproxylevelclear'],
      reqconfiglevel: data.headers['reqconfiglevel'],
      test: data.headers['test'],
      ON_BEFORE_PROXY_HEADER: data.headers['ON_BEFORE_PROXY_HEADER'.toLowerCase()],
    }

    deepEqual(requestHeaders, {
      reqconfigleveloverwrite: 'PROXY-REQUEST-OVERWRITE',
      reqconfiglevel: 'CONFIG-REQUEST',
      reqproxylevel: 'PROXY-REQUEST',
      reqproxylevelclear: undefined,
      test: 'true',
      ON_BEFORE_PROXY_HEADER: 'yes',
    });

    const responseHeaders = {
      resconfigleveloverwrite: result.headers['resconfigleveloverwrite'],
      resconfiglevel: result.headers['resconfiglevel'],
      resproxylevel: result.headers['resproxylevel'],
      resproxylevelclear: result.headers['resproxylevelclear'],
      ['res-test']: result.headers['res-test'],
      ON_BEFORE_RESPONSE_HEADER: result.headers['ON_BEFORE_RESPONSE_HEADER'.toLowerCase()],
    }

    deepEqual(responseHeaders, {
      resconfigleveloverwrite: 'PROXY-RESPONSE-OVERWRITE',
      resconfiglevel: 'CONFIG-RESPONSE',
      resproxylevel: 'PROXY-RESPONSE',
      resproxylevelclear: undefined,
      ['res-test']: 'test-res',
      ON_BEFORE_RESPONSE_HEADER: 'yes',
    });
  }

  @test()
  async websocketHandle(): Promise<void> {
    if (this.mode === 'HTTP2' && !this.secure) {
      // invalid test for the HTTP/2 connection, as connection should be secured
      return;
    }

    let c: Record<string, any>;
    let res: Function;
    let p = new Promise<void>(r => res = r);
    await this.initProxy({
      on: {
        upgrade: (req, socket, head, context) => {
          console.log('-> upgrade');
          c = context;
          context.upgrade = true;
        },

        afterUpgrade: (req, socket, head, context) => {
          console.log('-> afterUpgrade');
          c = context;
          context.afterUpgrade = true;
          res();
        }
      }
    });
    const sio = io(this.proxyUrl, {
      transports: ['websocket'],
      reconnection: false,
    });

    const send = 'test';
    let received = null;
    await new Promise<void>((res, rej) => {
      const timeout = setTimeout(() => {
        sio.disconnect();
        rej(new Error('Unable to connect to WS'));
      }, 2000);

      sio.once('connect_error', (err) => {
        console.error('connection error', err);
      });

      sio.once('connect', () => {
        sio.once('echo', (msg: string) => {
          received = msg;
          sio.disconnect();
          clearTimeout(timeout);
          res();
        });
        sio.emit('echo', send);
      });
    });

    await p;
    strictEqual(received, send);
    ok(c);
    strictEqual(c.upgrade, true);
    strictEqual(c.afterUpgrade, true);
  }

  @test()
  async websocketCancel(): Promise<void> {
    if (this.mode === 'HTTP2' && !this.secure) {
      // invalid test for the HTTP/2 connection, as connection should be secured
      return;
    }

    await this.after();

    this.server = new TestServer(this.mode, this.secure, true);
    await this.server.start();

    const status = 418;
    const description = 'I\'m a teapot';

    const params = new TestProxyParams();
    params.mode = this.mode;
    params.secure = this.secure;
    params.customWsHandler = async (
        req: IncomingMessage,
        socket: NetSocket,
        head: Buffer,
        proxyRequest: ProxyRequest,
        proxyCancel: WebSocketProxyCancelRequest,
        path: string,
        context: Record<string, any>
      ): Promise<void> => {
        proxyCancel(status, description);
      }
    this.proxy = new TestProxy(params);
    await this.proxy.start();

    const sio = io(this.proxyUrl, {
      transports: ['websocket'],
      reconnection: false,
    });

    const err = await assertReject(new Promise<void>((res, rej) => {
      setTimeout(() => {
        sio.disconnect();
        rej(new Error('Unable to connect to WS'));
      }, 2000);

      sio.once('connect_error', (err) => {
        rej(err);
      });
    }));

    strictEqual(err.description.message, `Unexpected server response: ${status}`);
  }
}

@suite()
export class Http1ProxySuccessSuite extends BaseHttpProxySuccessSuite {
  constructor() {
    super('HTTP')
  }
}

@suite()
export class Http1ProxySuccessSuiteSecure extends BaseHttpProxySuccessSuite {
  constructor() {
    super('HTTP', true)
  }
}

@suite()
export class Http2ProxySuccessSuite extends BaseHttpProxySuccessSuite {
  constructor() {
    super('HTTP2')
  }
}

@suite()
export class Http2ProxySuccessSuiteSecure extends BaseHttpProxySuccessSuite {
  constructor() {
    super('HTTP2', true)
  }
}

import {suite, test} from '@testdeck/mocha';
import { TestServer, TestProxy, TestProxyParams, assertReject } from './helpers';
import axios from 'axios';
import {deepEqual, strictEqual} from 'assert';
import {io} from 'socket.io-client';
import { Configuration, ProxyRequest, WebSocketProxyCancelRequest } from '../src';
import { IncomingMessage } from 'http';
import { Socket } from 'socket.io';
import { Socket as NetSocket } from 'net';

@suite()
export class HttpProxySuccessSuite {
  private server: TestServer = null;
  private proxy: TestProxy = null;

  private get proxyUrl() {
    return `http://localhost:${TestProxy.PORT}`;
  }

  /**
   * Before hook
   */
  async before(): Promise<void> {
    this.server = new TestServer(true);
    this.proxy = null;

    await this.server.start();
  }

  /**
   * After hook
   */
  async after(): Promise<void> {
    await this.proxy?.stop();
    await this.server.stop();
  }

  /**
   * Init proxy server
   */
  private async initProxy(configOverride: Partial<Configuration> = {}): Promise<void> {
    const params = new TestProxyParams();
    params.configOverride = configOverride;

    this.proxy = new TestProxy(params);
    await this.proxy.start();
  }

  @test()
  async echoRequest(): Promise<void> {
    await this.initProxy();

    const testData = [];
    for (let i = 0; i < 1000 * 1000; i++) {
      testData.push('Iteration - ' + i);
    }

    const result = await axios.post(`${this.proxyUrl}/echo`, testData, {
      maxBodyLength: 50 * 1024 * 1024, // 50 mb
    });
    deepEqual(result.data, testData);
  }

  @test()
  async echoRequestWithKeepAliveConnection(): Promise<void> {
    await this.initProxy();

    const testData = [];
    for (let i = 0; i < 1000 * 1000; i++) {
      testData.push('Iteration - ' + i);
    }

    const result = await axios.post(`${this.proxyUrl}/echo`, testData, {
      maxBodyLength: 50 * 1024 * 1024, // 50 mb
      headers: {
        'Connection': 'keep-alive'
      }
    });
    deepEqual(result.data, testData);
  }

  @test()
  async customPath(): Promise<void> {
    await this.after();
    this.server = new TestServer(true, '/api');
    const params = new TestProxyParams();
    params.prefix = '/api';
    this.proxy = new TestProxy(params);
    await this.proxy.start();

    await this.server.start();

    const testData = [];
    for (let i = 0; i < 1000 * 1000; i++) {
      testData.push('Iteration - ' + i);
    }

    const result = await axios.post(`${this.proxyUrl}/echo`, testData, {
      maxBodyLength: 50 * 1024 * 1024, // 50 mb
    });
    deepEqual(result.data, testData);
  }

  @test()
  async queryRequest(): Promise<void> {
    await this.initProxy();

    const result = await axios.get(`${this.proxyUrl}/query?test=1`);
    deepEqual(result.data, {
      query: {
        test: '1',
      }
    });
  }

  @test()
  async headersRequest(): Promise<void> {
    await this.initProxy();

    const result = await axios.get(`${this.proxyUrl}/headers`, {
      headers: {
        ReqConfigLevelCLEAR: 'empty',
        REQConfigLevelOverwrite: 'overwrite',
        Test: 'true',
      }
    });

    const requestHeaders = {
      reqconfigleveloverwrite: result.data.headers['reqconfigleveloverwrite'],
      reqproxylevel: result.data.headers['reqproxylevel'],
      reqproxylevelclear: result.data.headers['reqproxylevelclear'],
      reqconfiglevel: result.data.headers['reqconfiglevel'],
      test: result.data.headers['test'],
      ON_BEFORE_PROXY_HEADER: result.data.headers['ON_BEFORE_PROXY_HEADER'.toLowerCase()],
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
    await this.initProxy();
    const sio = io(`http://localhost:${TestProxy.PORT}`, {
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

      sio.on('connect', () => {
        sio.on('echo', (msg: string) => {
          received = msg;
          sio.disconnect();
          clearTimeout(timeout);
          res();
        });
        sio.emit('echo', send);
      });
    });

    strictEqual(received, send);
  }

  @test()
  async websocketCancel(): Promise<void> {
    await this.after();

    this.server = new TestServer(true);
    await this.server.start();

    const status = 418;
    const description = 'I\'m a teapot';

    const params = new TestProxyParams();
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

    const sio = io(`http://localhost:${TestProxy.PORT}`, {
      transports: ['websocket'],
      reconnection: false,
    });

    const err = await assertReject(new Promise<void>((res, rej) => {
      setTimeout(() => {
        sio.disconnect();
        rej(new Error('Unable to connect to WS'));
      }, 2000);

      sio.on('connect_error', (err) => {
        rej(err);
      });
    }));

    strictEqual(err.description.message, `Unexpected server response: ${status}`);
  }
}

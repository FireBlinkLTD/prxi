import {suite, test} from 'mocha-typescript';
import { TestServer, TestProxy } from './helpers';
import axios from 'axios';
import {deepEqual, strictEqual} from 'assert';
import {io} from 'socket.io-client';

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
    private async initProxy(): Promise<void> {
      this.proxy = new TestProxy();
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
      }

      deepEqual(requestHeaders, {
        reqconfigleveloverwrite: 'PROXY-REQUEST-OVERWRITE',
        reqconfiglevel: 'CONFIG-REQUEST',
        reqproxylevel: 'PROXY-REQUEST',
        reqproxylevelclear: undefined,
        test: 'true',
      });

      const responseHeaders = {
        resconfigleveloverwrite: result.headers['resconfigleveloverwrite'],
        resconfiglevel: result.headers['resconfiglevel'],
        resproxylevel: result.headers['resproxylevel'],
        resproxylevelclear: result.headers['resproxylevelclear'],
        ['res-test']: result.headers['res-test'],
      }

      deepEqual(responseHeaders, {
        resconfigleveloverwrite: 'PROXY-RESPONSE-OVERWRITE',
        resconfiglevel: 'CONFIG-RESPONSE',
        resproxylevel: 'PROXY-RESPONSE',
        resproxylevelclear: undefined,
        ['res-test']: 'test-res',
      });
    }

    @test()
    async websocket(): Promise<void> {
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
}

import {suite, test} from 'mocha-typescript';
import { TestServer, TestProxy, assertReject, writeJson } from './helpers';
import axios from 'axios';
import {deepEqual, equal} from 'assert';
import { IncomingMessage, ServerResponse } from 'http';
import { Readable } from 'stream';

@suite()
export class HttpProxyErrorSuite {
    private server: TestServer = null;
    private proxy: TestProxy = null;

    private get proxyUrl() {
      return `http://localhost:${TestProxy.PORT}`;
    }

    /**
     * Before hook
     */
    async before(): Promise<void> {
      this.server = new TestServer();
      await this.server.start();
    }

    /**
     * After hook
     */
    async after(): Promise<void> {
      await this.proxy?.stop();
      await this.server.stop();
    }

    @test()
    async addressNotFoundFailErrorHandler(): Promise<void> {
      this.proxy = new TestProxy('non-existing-host');
      await this.proxy.start();

      const result = axios.post(`${this.proxyUrl}/echo`, { test: true });
      const error = await assertReject(result);
      equal(error.message, 'socket hang up');
    }

    @test()
    async addressNotFoundPassErrorHandler(): Promise<void> {
      const customError = 'Custom Error';
      this.proxy = new TestProxy('non-existing-host', async (req: IncomingMessage, res: ServerResponse, err: Error): Promise<void> => {
        equal(err.message, 'getaddrinfo ENOTFOUND non-existing-host');

        await writeJson(res, JSON.stringify({customError}));
      });
      await this.proxy.start();

      const result = await axios.post(`${this.proxyUrl}/echo`, { test: true });
      deepEqual(result.data.customError, customError);
    }
}

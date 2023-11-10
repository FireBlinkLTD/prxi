import {suite, test} from '@testdeck/mocha';
import { TestServer, TestProxy, assertReject, writeJson, TestProxyParams } from './helpers';
import axios from 'axios';
import {deepEqual, equal, strictEqual, match} from 'assert';
import { IncomingMessage, ServerResponse } from 'http';
import {io} from 'socket.io-client';
import { WebSocketProxyHandler } from '../src/handlers';

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
      this.server = new TestServer(true);
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
    async doubleProxyStop() {
      this.proxy = new TestProxy();
      await this.proxy.start();

      await this.proxy.stop();
      await this.proxy.stop();
    }

    @test()
    async addressNotFoundFailErrorHandler(): Promise<void> {
      const params = new TestProxyParams();
      params.host = 'non-existing-host';

      this.proxy = new TestProxy(params);
      await this.proxy.start();

      const result = axios.post(`${this.proxyUrl}/echo`, { test: true });
      const error = await assertReject(result);
      equal(error.message, 'socket hang up');
    }

    @test()
    async addressNotFoundPassErrorHandler(): Promise<void> {
      const customError = 'Custom Error';

      const params = new TestProxyParams();
      params.host = 'non-existing-host';
      params.customErrorHandler = async (req: IncomingMessage, res: ServerResponse, err: Error): Promise<void> => {
        match(err.message, /getaddrinfo .* non-existing-host/gi);
        await writeJson(res, JSON.stringify({customError}));
      };

      this.proxy = new TestProxy(params);
      await this.proxy.start();

      const result = await axios.post(`${this.proxyUrl}/echo`, { test: true });
      deepEqual(result.data.customError, customError);
    }

    @test()
    async missingHandler(): Promise<void> {
      let msg = null;

      const params = new TestProxyParams();
      params.customErrorHandler = async (req: IncomingMessage, res: ServerResponse, err?: Error) => {
        msg = err.message;
        throw err;
      };
      params.isMatching = false;

      this.proxy = new TestProxy(params);
      await this.proxy.start();

      const result = axios.post(`${this.proxyUrl}/missing`, { test: true });
      await assertReject(result);
      equal(msg, 'Missing RequestHandler configuration for the "POST:/missing" request');
    }

    @test()
    async noHandlers(): Promise<void> {
      let msg = null;

      const params = new TestProxyParams();
      params.isMatching = null;
      params.customErrorHandler = async (req: IncomingMessage, res: ServerResponse, err?: Error) => {
        msg = err.message;
        throw err;
      };

      this.proxy = new TestProxy(params);
      await this.proxy.start();

      const result = axios.post(`${this.proxyUrl}/missing`, { test: true });
      await assertReject(result);
      equal(msg, 'Missing RequestHandler configuration for the "POST:/missing" request');
    }

    @test()
    async noWebSocketHandler(): Promise<void> {
      const params = new TestProxyParams();
      params.customErrorHandler = false;
      params.isMatching = true;
      params.customWsHandler = false;

      this.proxy = new TestProxy(params);
      await this.proxy.start();
      const sio = io(`http://localhost:${TestProxy.PORT}`, {
        transports: ['websocket'],
        reconnection: false,
      });

      const err = await assertReject(new Promise<void>((res, rej) => {
        sio.on('connect_error', (err) => {
          rej(err);
        });

        setTimeout(() => {
          sio.disconnect();
          rej(new Error('Unable to connect to WS'));
        }, 2000);
      }));

      strictEqual(err.message, `websocket error`);
    }

    @test()
    async failedWebSocketHandler(): Promise<void> {
      const params = new TestProxyParams();
      params.customErrorHandler = false;
      params.isMatching = true;
      params.customWsHandler = async () => {
        throw new Error('test');
      };

      this.proxy = new TestProxy(params);
      await this.proxy.start();

      const sio = io(`http://localhost:${TestProxy.PORT}`, {
        transports: ['websocket'],
        reconnection: false,
      });

      const err = await assertReject(new Promise<void>((res, rej) => {
        const t = setTimeout(() => {
          sio.disconnect();
          rej(new Error('Unable to connect to WS'));
        }, 2000);

        sio.on('connect_error', (err) => {
          clearTimeout(t);
          rej(err);
        });
      }));

      strictEqual(err.message, `websocket error`);
    }

    @test()
    async erroredWebSocketHandler(): Promise<void> {
      this.proxy = new TestProxy();
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

        sio.on('connect', () => {
          WebSocketProxyHandler.debug.upstreamRequest.emit('error', new Error('Upstream fake error'));
        });

        sio.on('disconnect', (reason) => {
          rej(new Error(reason));
        })
      }));

      strictEqual(err.message, `transport close`);
    }

    @test()
    async erroredUpstreamSocketHandler(): Promise<void> {
      this.proxy = new TestProxy();
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

        sio.on('connect', () => {
          WebSocketProxyHandler.debug.upstreamSocket.emit('error', new Error('Proxy fake error'));
        });

        sio.on('disconnect', (reason) => {
          rej(new Error(reason));
        })
      }));

      strictEqual(err.message, `transport close`);
    }

    @test()
    async erroredIncomingSocketHandler(): Promise<void> {
      this.proxy = new TestProxy();
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

        sio.on('connect', () => {
          WebSocketProxyHandler.debug.incomingSocket.emit('error', new Error('Proxy fake error'));
        });

        sio.on('disconnect', (reason) => {
          rej(new Error(reason));
        })
      }));

      strictEqual(err.message, `transport close`);
    }

    @test()
    async wsNotSupportedByUpstream(): Promise<void> {
      // restart server with WS disabled
      await this.server.stop();
      this.server = new TestServer(false);
      await this.server.start();

      this.proxy = new TestProxy();
      await this.proxy.start();

      const sio = io(`http://localhost:${TestProxy.PORT}`, {
        transports: ['websocket'],
        reconnection: false,
      });

      const err = await assertReject(new Promise<void>((res, rej) => {
        sio.on('connect_error', (err) => {
          rej(err);
        });

        setTimeout(() => {
          sio.disconnect();
          rej(new Error('Unable to connect to WS'));
        }, 2000);
      }));

      strictEqual(err.message, `websocket error`);
    }
}

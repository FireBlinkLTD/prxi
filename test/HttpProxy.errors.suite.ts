import {suite, test} from '@testdeck/mocha';
import { TestServer, TestProxy, assertReject, writeJson } from './helpers';
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
        match(err.message, /getaddrinfo .* non-existing-host/gi);

        await writeJson(res, JSON.stringify({customError}));
      });
      await this.proxy.start();

      const result = await axios.post(`${this.proxyUrl}/echo`, { test: true });
      deepEqual(result.data.customError, customError);
    }

    @test()
    async missingHandler(): Promise<void> {
      let msg = null;
      this.proxy = new TestProxy('localhost', async (req: IncomingMessage, res: ServerResponse, err?: Error) => {
        msg = err.message;
        throw err;
      }, false);
      await this.proxy.start();

      const result = axios.post(`${this.proxyUrl}/missing`, { test: true });
      await assertReject(result);
      equal(msg, 'Missing RequestHandler configuration for the "POST:/missing" request');
    }

    @test()
    async noHandlers(): Promise<void> {
      let msg = null;
      this.proxy = new TestProxy('localhost', async (req: IncomingMessage, res: ServerResponse, err?: Error) => {
        msg = err.message;
        throw err;
      }, null);
      await this.proxy.start();

      const result = axios.post(`${this.proxyUrl}/missing`, { test: true });
      await assertReject(result);
      equal(msg, 'Missing RequestHandler configuration for the "POST:/missing" request');
    }

    @test()
    async noWebSocketHandler(): Promise<void> {
      this.proxy = new TestProxy('localhost', false, true, false);
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
      this.proxy = new TestProxy('localhost', null, true, async () => {
        throw new Error('test');
      });
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

import {suite, test} from '@testdeck/mocha';
import { TestServer, TestProxy, assertReject, writeJson, TestProxyParams } from './helpers';
import {equal, strictEqual, match} from 'assert';
import { IncomingHttpHeaders, IncomingMessage, ServerResponse } from 'http';
import {io} from 'socket.io-client';
import { WebSocketProxyHandler } from '../src/handlers';
import { FetchHelpers } from './helpers/FetchHelper';
import { ServerHttp2Stream, constants } from 'http2';

abstract class BaseHttpProxyErrorSuite {
    constructor(private mode: 'HTTP' | 'HTTP2', private secure = false) {
      console.log(`========= ${mode} ${secure ? '[secure]' : ''} =========`)
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
      this.server = new TestServer(this.mode, this.secure, true);
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
      const params = new TestProxyParams();
      params.mode = this.mode;
      params.secure = this.secure;
      this.proxy = new TestProxy(params);
      await this.proxy.start();

      await this.proxy.stop();
      await this.proxy.stop();
    }

    @test()
    async addressNotFoundFailErrorHandler(): Promise<void> {
      const params = new TestProxyParams();
      params.mode = this.mode;
      params.secure = this.secure;
      params.host = 'non-existing-host';

      this.proxy = new TestProxy(params);
      await this.proxy.start();

      const result = await new FetchHelpers(this.mode, this.secure).post(`${this.proxyUrl}/echo`, { test: true });
      equal(result.error, 'Unexpected error occurred');
    }

    @test()
    async addressNotFoundPassErrorHandler(): Promise<void> {
      const customError = 'Custom Error';

      const params = new TestProxyParams();
      params.mode = this.mode;
      params.secure = this.secure;
      params.host = 'non-existing-host';
      params.customErrorHandler = async (req: IncomingMessage, res: ServerResponse, err: Error): Promise<void> => {
        match(err.message, /getaddrinfo .* non-existing-host/gi);
        await writeJson(res, JSON.stringify({customError}));
      };
      params.customHttp2ErrorHandler = async (stream: ServerHttp2Stream, headers: IncomingHttpHeaders, err: Error): Promise<void> => {
        match(err.message, /getaddrinfo .* non-existing-host/gi);
        stream.respond({
          [constants.HTTP2_HEADER_STATUS]: 200,
          'content-type': 'application/json'
        })
        stream.write(JSON.stringify({customError}));
        stream.end();
      }

      this.proxy = new TestProxy(params);
      await this.proxy.start();

      const result = await new FetchHelpers(this.mode, this.secure).post(`${this.proxyUrl}/echo`, { test: true });
      strictEqual(result.customError, customError);
    }

    @test()
    async missingHandler(): Promise<void> {
      let msg = null;

      const params = new TestProxyParams();
      params.mode = this.mode;
      params.secure = this.secure;
      params.customErrorHandler = async (req: IncomingMessage, res: ServerResponse, err?: Error) => {
        msg = err.message;
        throw err;
      };
      params.customHttp2ErrorHandler = async (stream: ServerHttp2Stream, headers: IncomingHttpHeaders, err: Error): Promise<void> => {
        msg = err.message;
        throw err;
      }
      params.isMatching = false;

      this.proxy = new TestProxy(params);
      await this.proxy.start();

      const result = await new FetchHelpers(this.mode, this.secure).post(`${this.proxyUrl}/missing`, { test: true });
      equal(result.error, 'Unexpected error occurred');
      equal(msg, this.mode === 'HTTP'
        ? 'Missing RequestHandler configuration for the "POST:/missing" request'
        : 'Missing RequestHandler configuration for the "POST:/missing" HTTP/2 request');
    }

    @test()
    async noHandlers(): Promise<void> {
      let msg = null;

      const params = new TestProxyParams();
      params.mode = this.mode;
      params.secure = this.secure;
      params.isMatching = null;
      params.customErrorHandler = async (req: IncomingMessage, res: ServerResponse, err?: Error) => {
        msg = err.message;
        throw err;
      };
      params.customHttp2ErrorHandler = async (stream: ServerHttp2Stream, headers: IncomingHttpHeaders, err: Error): Promise<void> => {
        msg = err.message;
        throw err;
      }

      this.proxy = new TestProxy(params);
      await this.proxy.start();

      const result = await new FetchHelpers(this.mode, this.secure).post(`${this.proxyUrl}/missing`, { test: true });
      equal(result.error, 'Unexpected error occurred');
      equal(msg, this.mode === 'HTTP'
        ? 'Missing RequestHandler configuration for the "POST:/missing" request'
        : 'Missing RequestHandler configuration for the "POST:/missing" HTTP/2 request');
    }

    @test()
    async noWebSocketHandler(): Promise<void> {
      const params = new TestProxyParams();
      params.mode = this.mode;
      params.secure = this.secure;
      params.customErrorHandler = false;
      params.customHttp2ErrorHandler = false;
      params.isMatching = true;
      params.customWsHandler = false;

      this.proxy = new TestProxy(params);
      await this.proxy.start();
      const sio = io(this.proxyUrl, {
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
      params.mode = this.mode;
      params.secure = this.secure;
      params.customErrorHandler = false;
      params.customHttp2ErrorHandler = false;
      params.isMatching = true;
      params.customWsHandler = async () => {
        throw new Error('test');
      };

      this.proxy = new TestProxy(params);
      await this.proxy.start();

      const sio = io(this.proxyUrl, {
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
      if (this.mode === 'HTTP2' && !this.secure) {
        // invalid test for the HTTP/2 connection, as connection should be secured
        return;
      }

      const params = new TestProxyParams();
      params.mode = this.mode;
      params.secure = this.secure;
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
      if (this.mode === 'HTTP2' && !this.secure) {
        // invalid test for the HTTP/2 connection, as connection should be secured
        return;
      }

      const params = new TestProxyParams();
      params.mode = this.mode;
      params.secure = this.secure;
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
      if (this.mode === 'HTTP2' && !this.secure) {
        // invalid test for the HTTP/2 connection, as connection should be secured
        return;
      }

      const params = new TestProxyParams();
      params.mode = this.mode;
      params.secure = this.secure;
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
      if (this.mode === 'HTTP2' && !this.secure) {
        // invalid test for the HTTP/2 connection, as connection should be secured
        return;
      }

      // restart server with WS disabled
      await this.server.stop();
      this.server = new TestServer(this.mode, this.secure, false);
      await this.server.start();

      const params = new TestProxyParams();
      params.mode = this.mode;
      params.secure = this.secure;
      this.proxy = new TestProxy(params);
      await this.proxy.start();

      const sio = io(this.proxyUrl, {
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

@suite()
export class Http1ProxyErrorSuite extends BaseHttpProxyErrorSuite {
  constructor() {
    super('HTTP');
  }
}

@suite()
export class Http1ProxyErrorSuiteSecure extends BaseHttpProxyErrorSuite {
  constructor() {
    super('HTTP', true);
  }
}

@suite()
export class Http2ProxyErrorSuite extends BaseHttpProxyErrorSuite {
  constructor() {
    super('HTTP2');
  }
}

@suite()
export class Http2ProxyErrorSuiteSecure extends BaseHttpProxyErrorSuite {
  constructor() {
    super('HTTP2', true);
  }
}

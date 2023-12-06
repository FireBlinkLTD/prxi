# prxi

[![Tests](https://github.com/FireBlinkLTD/prxi/actions/workflows/test.yml/badge.svg)](https://github.com/FireBlinkLTD/prxi/actions?query=workflow%3ATests)
[![Known Vulnerabilities](https://snyk.io/test/github/FireBlinkLTD/prxi/badge.svg)](https://snyk.io/test/github/FireBlinkLTD/prxi)
[![codecov](https://codecov.io/gh/FireBlinkLTD/prxi/branch/main/graph/badge.svg?token=jhx7jzSGnp)](https://codecov.io/gh/FireBlinkLTD/prxi)


prxi is a zero dependency reverse proxy module for Node.js

# Installation

```bash
# For NPM users:
npm i prxi

# For Yarn users:
yarn add prxi
```

# Usage

```typescript
import { Prxi, HttpMethod, ProxyRequest, Request, Response } from 'prxi';
import { OutgoingHttpHeaders } from 'node:http';
import { ServerHttp2Stream } from 'node:http2';

// Instantiate new Prxi, requires a src/Configuration.ts configuration object
const proxy = new Prxi({
  // optional mode, can be HTTP or HTTP2, by default HTTP
  // When HTTP/2 is used, upstream services should be using HTTP/2 too
  mode: 'HTTP'

  // optional secure connection settings
  // by default disabled
  // NOTE: for secure WS connection upstream service should also use secure connection
  secure: {
    // For the list of available options please refer to https://nodejs.org/api/tls.html#tls_tls_createsecurecontext_options
  }

  // port to listen incoming requests on
  port: TestProxy.PORT,

  // optional hostname where proxy should listen for incoming connections
  hostname: 'localhost',

  // optional proxy request timeout in milliseconds (default value: 1 minute)
  proxyRequestTimeout: 30 * 1000,

  // log message function
  logInfo: console.log,

  // log errors function
  logError: console.error,

  // optional custom error handler
  errorHandler,

  // optional custom error handler for HTTP/2 connection
  // only in use when mode =
  http2ErrorHandler,

  // optional additional headers to add or remove from the upstream request
  // if value is null - header if presented will be removed
  // if value isn't null - header will be added or value replaced
  proxyRequestHeaders: {
    'X-ADD_TO_UPSTREAM_REQUEST': 'value',
    'X-REMOVE_FROM_REQUEST': null,
  },

  // optional additional headers to add or remove from the response
  // if value is null - header if presented will be removed
  // if value isn't null - header will be added or value replaced
  responseHeaders: {
    'X-ADD_TO_RESPONSE': 'value',
    'X-REMOVE_FROM_RESPONSE': null,
  },

  // Upstream list configuration
  upstream: [
    {
      // upstream endpoint
      target: `http://${this.host}:${TestServer.PORT}`,

      // optional custom error handler (overrides higher level setting)
      errorHandler,

      // optional proxy request timeout in milliseconds (overrides higher level setting)
      proxyRequestTimeout: 30 * 1000,

      // optional additional headers to add or remove from the upstream request
      // if value is null - header if presented will be removed
      // if value isn't null - header will be added or value replaced
      // Note: this setting will be merged with a higher level settings, so override will only happen if header names match between the two
      proxyRequestHeaders: {
        'X-ADD_TO_UPSTREAM_REQUEST': 'value',
        'X-REMOVE_FROM_REQUEST': null,
      },

      // optional additional headers to add or remove from the response
      // if value is null - header if presented will be removed
      // if value isn't null - header will be added or value replaced
      // Note: this setting will be merged with a higher level settings, so override will only happen if header names match between the two
      responseHeaders: {
        'X-ADD_TO_RESPONSE': 'value',
        'X-REMOVE_FROM_RESPONSE': null,
      },

      // optional custom error handler for given upstream only
      errorHandler,

      // optional custom error handler for HTTP/2 connection and given upstream only
      // only in use when mode =
      http2ErrorHandler,

      // optional list of request handlers
      requestHandlers,

      // optional list of websocket handlers
      webSocketHandlers,

      // optional HTTP/2 error handler
      // only used when mode is HTTP2
      http2ErrorHandler?: Http2ErrorHandler;

      // optional HTTP/2 handlers
      // only used when mode is HTTP2
      http2RequestHandlers;
    }
  ]
});

// HTTP/1.1 request handlers
const requestHandlers = [
  {
    // function to test the incoming request
    // if returns true `handle` function will process the request
    isMatching: (method: HttpMethod, path: string, context: Record<string, any>): boolean => true,

    /**
     * Request handler
     */
    handle: async (
      req: Request,
      res: Response,
      proxyRequest: ProxyRequest,
      method: HttpMethod,
      path: string,
      context: Record<string, any>
    ): Promise<void> => {
      // proxy incoming request to the upstream
      // optionally pass ProxyRequestConfiguration object as a parameter
      await proxyRequest({
        // optionally provide alternative path for the upstream request
        url: '/another/path',

        // optionally provide another HTTP method for the upstream request
        method: 'PUT',

        // optionally use another target host for the upstream request
        target: 'http://127.0.0.1',

        // optionally use another target port for the upstream request
        port: 9999,

        // Proxy request headers to add/replace/remove on top of the Configuration ones (if any)
        proxyRequestHeaders: {
          'X-ADD_TO_UPSTREAM_REQUEST': 'value',
          'X-REMOVE_FROM_REQUEST': null,
        },

        // Proxy response headers to add/replace/remove on top of the Configuration ones (if any)
        proxyResponseHeaders: {
          'X-ADD_TO_RESPONSE': 'value',
          'X-REMOVE_FROM_RESPONSE': null,
        },

        /**
         * Optional handler before making the proxy request
         * @param options request options
         * @returns
         */
        onBeforeProxyRequest: (options: RequestOptions | null, proxyHeaders: OutgoingHttpHeaders) => {

        }

        /**
         * Optional handler before sending a response
         * @param res
         * @param outgoingHeaders
         * @returns
         */
        onBeforeResponse: (res: Response, outgoingHeaders: OutgoingHttpHeaders) => {

        }
      });
    }
  }
];

// HTTP/2 request handlers
const http2RequestHandlers = [
  {
    // function to test the incoming request
    // if returns true `handle` function will process the request
    isMatching: (method: HttpMethod, path: string, context: Record<string, any>): boolean => true,

    /**
     * Stream handler
     */
    handle: async (
      stream: ServerHttp2Stream,
      headers: OutgoingHttpHeaders,
      proxyRequest: ProxyRequest,
      method: HttpMethod,
      path: string,
      context: Record<string, any>
    ): Promise<void> => {
      // proxy incoming request to the upstream
      // optionally pass ProxyRequestConfiguration object as a parameter
      await proxyRequest({
        // optionally provide alternative path for the upstream request
        url: '/another/path',

        // optionally provide another HTTP method for the upstream request
        method: 'PUT',

        // optionally use another target host for the upstream request
        target: 'http://127.0.0.1',

        // optionally use another target port for the upstream request
        port: 9999,

        // Proxy request headers to add/replace/remove on top of the Configuration ones (if any)
        proxyRequestHeaders: {
          'X-ADD_TO_UPSTREAM_REQUEST': 'value',
          'X-REMOVE_FROM_REQUEST': null,
        },

        // Proxy response headers to add/replace/remove on top of the Configuration ones (if any)
        proxyResponseHeaders: {
          'X-ADD_TO_RESPONSE': 'value',
          'X-REMOVE_FROM_RESPONSE': null,
        },

        /**
         * Optional handler before making the proxy request
         * @param options - for HTTP/2 connection value is null
         * @param proxyHeaders
         * @returns
         */
        onBeforeProxyRequest: (_: RequestOptions | null, proxyHeaders: OutgoingHttpHeaders) => {

        }

        /**
         * Optional handler before sending a response
         * @param res - for HTTP/2 connection value is null
         * @param outgoingHeaders
         * @returns
         */
        onBeforeResponse: (_: Response, outgoingHeaders: OutgoingHttpHeaders) => {

        }
      }
    }
  }
];

// WS handlers
const webSocketHandlers = [
  {
    // function to test the incoming request
    // if returns true `handle` function will process the request
    isMatching: (path: string, context: Record<string, any>): boolean => true,

    /**
     * Request handler
     */
    handle: async (
      req: Request,
      socket: Socket,
      head: Buffer,
      proxyRequest: ProxyRequest,
      cancelRequest: WebSocketProxyCancelRequest,
      path: string,
      context: Record<string, any>
    ): Promise<void> => {
      // proxy incoming request to the upstream
      // optionally pass ProxyRequestConfiguration object as a parameter
      await proxyRequest(
        // optionally provide alternative path for the upstream request
        url: '/another/path',

        // NOTE: method won't have any affect
        // method: ...

        // optionally use another target host for the upstream request
        target: 'http://127.0.0.1',

        // optionally use another target port for the upstream request
        port: 9999,

        // Proxy request headers to add/replace/remove on top of the Configuration ones (if any)
        proxyRequestHeaders: {
          'X-ADD_TO_UPSTREAM_REQUEST': 'value',
          'X-REMOVE_FROM_REQUEST': null,
        },

        // Proxy response headers to add/replace/remove on top of the Configuration ones (if any)
        proxyResponseHeaders: {
          'X-ADD_TO_RESPONSE': 'value',
          'X-REMOVE_FROM_RESPONSE': null,
        },

        /**
         * Optional handler before making the proxy request
         * @param options request options, can be null for HTTP/2 request
         * @parma proxyHeaders
         * @returns
         */
        onBeforeProxyRequest: (options: RequestOptions | null, proxyHeaders: OutgoingHttpHeaders) => {

        }
      );

      // alternatively cancel request with custom http status code and message
      cancelRequest(418, 'I\'m a teapot');
    }
  }
]

/**
 * Custom error handler
 */
const errorHandler = async (req: Request, res: Response, err?: Error): Promise<void> {
    throw err;
};

/**
 * Custom HTTP/2 error handler
 */
const http2ErrorHandler = async (stream: ServerHttp2Stream, headers: IncomingHttpHeaders, err: Error): Promise<void> {
    throw err;
};

// start the proxy server
// later it can be stopped by calling `stop` method.
await proxy.start();
```

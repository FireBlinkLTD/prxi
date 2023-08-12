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
import { Prxi, HttpMethod, ProxyRequest} from 'prxi';

// Instantiate new Prxi, requires a src/Configuration.ts configuration object
const proxy = new Prxi({
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

      // optional list of request handlers
      requestHandlers,

      // optional list of websocket handlers
      webSocketHandlers,
    }
  ]
});

// Request handlers
const requestHandlers = [
  {
    // function to test the incoming request
    // if returns true `handle` function will process the request
    isMatching: (method: HttpMethod, path: string, context: Record<string, any>): boolean => true,

    /**
     * Request handler
     */
    handle: async (
      req: IncomingMesssage,
      res: ServerResponse,
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
      });
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
      req: IncomingMessage,
      socket: Socket,
      head: Buffer,
      proxyRequest: ProxyRequest,
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
      );
    }
  }
]

/**
 * Custom error handler
 */
const errorHandler = async (req: IncomingMessage, res: ServerResponse, err?: Error): Promise<void> {
    throw err;
};

// start the proxy server
// later it can be stopped by calling `stop` method.
await proxy.start();
```

# @fireblinkltd/fireproxy

FireProxy is a zero dependency reverse proxy module for Node.js

# Installation

```bash
# For NPM users:
npm i @fireblinkltd/fireproxy

# For Yarn users:
yarn add @fireblinkltd/fireproxy
```

# Usage

```typescript
import {FireProxy, HttpMethod, ProxyRequest} from '@fireblinkltd/fireproxy';

// Instantiate new FireProxy, requires a src/Configuration.ts configuration object
const proxy = new FireProxy({
  // port to listen icomming requests on
  port: TestProxy.PORT,
  // optional hostname where proxy should listen for incomming connections
  hostname: 'localhost',
  // optional proxy request timeout (default value: 60,000 - 1 minute)
  proxyRequestTimeout: 30 * 1000,
  // upstream endpoint
  target: `http://${this.host}:${TestServer.PORT}`,
  // log message function
  logInfo: console.log,
  // log errors function
  logError: console.error,
  // error handler
  errorHandler,
  // list of request handlers
  requestHandlers,
  // optional websocket handler
  webSocketHandler,
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
});

// Request handlers
const requestHandlers = [
  {
    // function to test the incomming request
    // if returns true `handle` function will process the request
    isMatching: (method: HttpMethod, path: string): boolean => true,
    handle: async (req: IncomingMesssage, res: ServerResponse, proxyRequest: ProxyRequest): Promise<void> => {
      // proxy incomming request to the upstream
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

/**
 *  WebSocket request handle
 */
const webSocketHandler = async (req: IncomingMessage, socket: Duplex, head: Buffer, handle: () => Promise<void>): Promise<void> => {
  // proxy incomming request to the upstream
  // optionally pass ProxyRequestConfiguration object as a parameter
  await handle(
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

/**
 * Error handler
 */
const errorHandler = async (req: IncomingMessage, res: ServerResponse, err?: Error): Promise<void> {
    throw err;
};

```

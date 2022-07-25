import { Configuration, HttpMethod, ProxyRequestConfiguration } from "./interfaces";
import { createServer, IncomingMessage, ServerResponse, Server, ClientRequest, OutgoingHttpHeaders, IncomingHttpHeaders, OutgoingMessage } from "http";
import { Duplex } from "stream";
import {request as httpRequest, RequestOptions} from 'http';
import {request as httpsRequest} from 'https';
import { ok } from "assert";

// empty object used in cases when default value is not provided
const emptyObj = {};

export class FireProxy {
  private server: Server = null;
  private static readonly HOST_REGEX = /\w+:\/\/([^\/:]+).*/i;
  private static readonly PORT_REGEX = /\w+:\/\/[^\/]+:(\d+).*/i;
  private logInfo = (msg: string) => {};
  private logError = (msg: string, err?: Error) => {};

  constructor(private configuration: Configuration) {
    const {logInfo, logError} = this.configuration;
    this.logInfo = logInfo || this.logInfo;
    this.logError = logError || this.logError;
  }

  /**
   * Start proxy server
   */
  public async start(): Promise<void> {
    let {hostname, port, requestHandlers, errorHandler} = this.configuration;
    hostname = hostname || 'localhost';

    // create server
    const server = this.server = createServer((req: IncomingMessage, res: ServerResponse) => {
      const path = this.getPath(req);
      const handler = requestHandlers.find(i => i.isMatching(req.method as HttpMethod, path));
      if (handler) {
        const headersToSet = this.prepareProxyHeaders(res.getHeaders(), this.configuration.responseHeaders);
        this.updateResponseHeaders(res, headersToSet);

        handler.handle(
          req,
          res,
          async (
            proxyConfiguration?: ProxyRequestConfiguration,
          ): Promise<void> => {
              await this.processProxyRequest(req, res, proxyConfiguration);
          }).catch((err) => {
            this.logError(`Error occurred upon making the "${req.method}:${path}" request`, err);
            errorHandler(req, res, err).catch(err => {
              this.logError('Unable to handle error with errorHandler', err);
              req.destroy();
              res.destroy();
            });
          });
      } else {
        this.logError(`Missing RequestHandler configuration for the "${req.method}:${path}" request`);
        errorHandler(req, res, new Error(`Missing RequestHandler configuration for the "${req.method}:${path}" request`)).catch(err => {
          this.logError(`Unable to handle error with errorHandler`, err);
          req.destroy();
          res.destroy();
        });
      }
    });

    server.on('upgrade', (req: IncomingMessage, socket: Duplex, head: Buffer) => {
      // TODO: handle ws upgrade
    });

    await new Promise<void>(res => {
      server.listen(port, hostname, () => {
        this.logInfo(`FireProxy started listening on ${hostname}:${port}`);
        res();
      });
    });
  }

  /**
   * Stop proxy service if running
   */
  public async stop(): Promise<void> {
    /* istanbul ignore next */
    if (this.server) {
      await new Promise<void>((res, rej) => {
        this.server.close((err) => {
          if (err) {
            this.logError('Failed to stop FireProxy', err);
            return rej(err);
          }

          this.logInfo('FireProxy stopped');
          res();
        });
      });
    } else {
      this.logInfo('Skip stop of FireProxy, not running');
    }

    this.server = null;
  }

  /**
   * Proxy request
   * @param req
   * @param res
   * @param proxyConfiguration
   */
  private async processProxyRequest(
    req: IncomingMessage,
    res: ServerResponse,
    proxyConfiguration?: ProxyRequestConfiguration,
  ): Promise<void> {
    proxyConfiguration = proxyConfiguration || emptyObj;

    let target = proxyConfiguration.target || this.configuration.target;
    const url = proxyConfiguration.url || req.url;
    const httpsTarget = this.isHttpsTarget(target);
    const request = httpsTarget ? httpsRequest : httpRequest;
    const port = proxyConfiguration.port || this.getPort(target) || (httpsTarget ? 443 : 80);
    const host = this.getHost(target);
    const method = proxyConfiguration.method || req.method;

    this.logInfo(`Processing proxy request with method ${method} to ${target}${url}`);

    const options: RequestOptions = {
      method,
      host,
      port,
      headers: this.prepareProxyHeaders(req.headers, this.configuration.proxyRequestHeaders, proxyConfiguration?.proxyRequestHeaders),
      path: url,
      timeout: this.configuration.proxyRequestTimeout || 60 * 1000,
    };

    const client = request(options);

    await new Promise<void>((resolve, reject) => {
      req.pipe(client);

      client.on('error', (err) => {
        reject(err);
      });

      client.on('response', (response: IncomingMessage) => {
        const headersToSet = this.prepareProxyHeaders(response.headers, this.configuration.responseHeaders, proxyConfiguration?.proxyResponseHeaders);
        this.updateResponseHeaders(res, headersToSet);

        if (!res.writableEnded) {
          response.on('end', () => {
            this.logInfo(`Proxy request with method ${method} to ${host}${url} completed`);
            resolve();
          });

          response.pipe(res);
        }
      });
    });
  }

  /**
   * Update response headers with a new set of headers
   * @param res
   * @param headers
   */
  private updateResponseHeaders(res: OutgoingMessage, headers: OutgoingHttpHeaders): void {
    // remove all existing headers
    for (const key of res.getHeaderNames()) {
      res.removeHeader(key);
    }

    // set new headers
    for (const key of Object.keys(headers)) {
      res.setHeader(key, headers[key]);
    }
  }

  /**
   * Prepare proxy headers
   * @param headers
   * @param headersToRewrite
   * @param additionalHeadersToRewrite
   * @returns
   */
  private prepareProxyHeaders(
    headers: IncomingHttpHeaders | OutgoingHttpHeaders,
    headersToRewrite?: Record<string, string | string[]>,
    additionalHeadersToRewrite?: Record<string, string | string[]>
  ): OutgoingHttpHeaders {
    const outgoing: OutgoingHttpHeaders = {};
    headersToRewrite = headersToRewrite || emptyObj;
    additionalHeadersToRewrite = additionalHeadersToRewrite || emptyObj;

    const headersKeys = Object.keys(headers);
    const headersToRewriteKeys = Object.keys(headersToRewrite);
    const additionalHeadersToRewriteKeys = Object.keys(additionalHeadersToRewrite);

    const finalKeys = new Set(headersKeys.map(k => k.toLowerCase()));
    for (const key of headersToRewriteKeys) {
      const lowerKey = key.toLowerCase();
      if (headersToRewrite[key] !== null) {
        finalKeys.add(lowerKey);
      } else {
        finalKeys.delete(lowerKey);
      }
    }

    for (const key of additionalHeadersToRewriteKeys) {
      const lowerKey = key.toLowerCase();
      if (additionalHeadersToRewrite[key] !== null) {
        finalKeys.add(lowerKey);
      } else {
        finalKeys.delete(lowerKey);
      }
    }

    for (const key of finalKeys) {
      const rewriteHeaderKey = headersToRewriteKeys.find(k => k.toLowerCase() === key);
      let rewriteHeader = rewriteHeaderKey && headersToRewrite[rewriteHeaderKey];

      const additionalRewriteHeaderKey = additionalHeadersToRewriteKeys.find(k => k.toLowerCase() === key);
      const additionalRewriteHeader = additionalRewriteHeaderKey && additionalHeadersToRewrite[additionalRewriteHeaderKey];
      if (additionalRewriteHeader !== undefined) {
        rewriteHeader = additionalRewriteHeader;
      }

      if (rewriteHeader !== undefined) {
        outgoing[key] = rewriteHeader;
      } else {
        const headerKey = headersKeys.find(k => k.toLowerCase() === key);
        outgoing[key] = headers[headerKey];
      }
    }

    return outgoing;
  }

  /**
   * Check if target address is HTTPS
   * @param target
   */
  private isHttpsTarget(target: string): boolean {
    return target.toLowerCase().startsWith('https://');
  }

  /**
   * Extract path from the request
   * @param req
   * @returns
   */
  private getPath(req: IncomingMessage): string {
    let path = req.url;
    const attributesIndex = path.indexOf('?');
    if (attributesIndex > 0) {
      path = path.substring(0, attributesIndex);
    }

    return path;
  }

  /**
   * Extract port from the target url (if possible)
   * @param target
   * @returns
   */
  private getPort(target: string): number {
    const match = target.match(FireProxy.PORT_REGEX);
    /* istanbul ignore else */
    if (match) {
      return Number(match[1]);
    } else {
      return null;
    }
  }

  /**
   * Extract host only from the target url
   * @param target
   * @returns
   */
   private getHost(target: string): string {
    const match = target.match(FireProxy.HOST_REGEX);
    ok(match, `Unable to extract host from "${target}"`);

    return match[1];
  }
}

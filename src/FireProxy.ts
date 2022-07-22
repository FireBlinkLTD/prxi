import { Configuration, HttpMethod, ProxyRequestConfiguration } from "./interfaces";
import { createServer, IncomingMessage, ServerResponse, Server, ClientRequest, OutgoingHttpHeaders, IncomingHttpHeaders } from "http";
import { Duplex } from "stream";
import {request as httpRequest, RequestOptions} from 'http';
import {request as httpsRequest} from 'https';

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
        handler.handle(
          req,
          res,
          async (
            proxyConfiguration?: ProxyRequestConfiguration,
            onProxyRequest?: (req: ClientRequest) => Promise<void>,
            onProxyResponse?: (res: IncomingMessage) => Promise<void>,
          ) => {
              await this.processProxyRequest(req, res, proxyConfiguration, onProxyRequest, onProxyResponse);
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
    onRequest?: (req: ClientRequest) => Promise<void>,
    onResponse?: (res: IncomingMessage) => Promise<void>,
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

    // TODO: pass headers

    const options: RequestOptions = {
      method,
      host,
      port,
      headers: this.prepareProxyHeaders(req.headers, this.configuration.proxyRequestHeaders, proxyConfiguration?.proxyRequestHeaders),
      path: url,
      timeout: this.configuration.proxyRequestTimeout || 60 * 1000,
    };

    const client = request(options);
    onRequest && await onRequest(client);

    await new Promise<void>((resolve, reject) => {
      req.pipe(client);

      client.on('error', (err) => {
        reject(err);
      });

      client.on('response', (response: IncomingMessage) => {
        (onResponse && onResponse(response)) || new Promise<void>(res => res())
          .then(
            () => {
              if (!res.writableEnded) {
                response.on('end', () => {
                  this.logInfo(`Proxy request with method ${method} to ${host}${url} completed`);
                  resolve();
                });

                response.pipe(res);
              }
            },
            (err) => {
              reject(err);
            }
          );
      });
    });
  }

  /**
   * Prepare proxy headers
   * @param headers
   * @param headersToRewrite
   * @param additionalHeadersToRewrite
   * @returns
   */
  private prepareProxyHeaders(
    headers: IncomingHttpHeaders,
    headersToRewrite?: Record<string, string | string[]>,
    additionalHeadersToRewrite?: Record<string, string | string[]>
  ): OutgoingHttpHeaders {
    const outgoing: OutgoingHttpHeaders = {};
    headersToRewrite = headersToRewrite || emptyObj;
    additionalHeadersToRewrite = additionalHeadersToRewrite || emptyObj;

    const headersKeys = Object.keys(headers);
    const headersToRewriteKeys = Object.keys(headersToRewrite);
    const additionalHeadersToRewriteKeys = Object.keys(additionalHeadersToRewrite);

    const finalKeys = new Set(headersKeys.map(k => k.toUpperCase()));
    for (const key of headersToRewriteKeys) {
      const upperKey = key.toUpperCase();
      if (headersToRewrite[key] !== null) {
        finalKeys.add(upperKey);
      } else {
        finalKeys.delete(upperKey);
      }
    }

    for (const key of additionalHeadersToRewriteKeys) {
      const upperKey = key.toUpperCase();
      if (additionalHeadersToRewrite[key] !== null) {
        finalKeys.add(upperKey);
      } else {
        finalKeys.delete(upperKey);
      }
    }

    for (const key of finalKeys) {
      const rewriteHeaderKey = headersToRewriteKeys.find(k => k.toUpperCase() === key);
      let rewriteHeader = rewriteHeaderKey && headersToRewrite[rewriteHeaderKey];

      const additionalRewriteHeaderKey = additionalHeadersToRewriteKeys.find(k => k.toUpperCase() === key);
      const additionalRewriteHeader = additionalRewriteHeaderKey && additionalHeadersToRewrite[additionalRewriteHeaderKey];
      if (additionalRewriteHeader !== undefined) {
        rewriteHeader = additionalRewriteHeader;
      }

      if (rewriteHeader !== undefined) {
        outgoing[key] = rewriteHeader;
      } else {
        const headerKey = headersKeys.find(k => k.toUpperCase() === key);
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
    if (match) {
      return Number(match[1]);
    }

    return null;
  }

  /**
   * Extract host only from the target url
   * @param target
   * @returns
   */
   private getHost(target: string): string {
    const match = target.match(FireProxy.HOST_REGEX);
    if (match) {
      return match[1];
    }

    throw new Error(`Unable to extract host from "${target}"`);
  }
}

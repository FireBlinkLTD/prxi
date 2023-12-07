import {request as httpRequest, RequestOptions, IncomingMessage} from 'node:http';
import {request as httpsRequest} from 'node:https';

import { Configuration, ProxyRequestConfiguration, Request, Response } from "../interfaces";
import { UpstreamConfiguration } from "../interfaces/UpstreamConfiguration";
import { RequestUtils } from "../utils";

const emptyObj = {};

export class HttpProxyHandler {
  constructor(
    private logInfo: (msg: string) => void,
    private configuration: Configuration,
    private upstream: UpstreamConfiguration,
  ) {}

  /**
   * Proxy request
   * @param id
   * @param req
   * @param res
   * @param proxyConfiguration
   */
  public async proxy(
    requestId: number,
    req: Request,
    res: Response,
    proxyConfiguration?: ProxyRequestConfiguration,
  ): Promise<void> {
    // istanbul ignore next
    proxyConfiguration = proxyConfiguration || emptyObj;

    let target = proxyConfiguration.target || this.upstream.target;
    const url = proxyConfiguration.url || req.url;
    const httpsTarget = RequestUtils.isHttpsTarget(target);
    // istanbul ignore next
    const request = httpsTarget ? httpsRequest : httpRequest;
    // istanbul ignore next
    const port = proxyConfiguration.port || RequestUtils.getPort(target) || (httpsTarget ? 443 : 80);
    const host = RequestUtils.getHost(target);
    const initialPath = new URL(target).pathname;
    const method = proxyConfiguration.method || req.method;

    this.logInfo(`[${requestId}] [HttpProxyHandler] Processing HTTP/HTTPS proxy request with method ${method} to ${target}${url}`);

    const requestHeadersToSend = RequestUtils.prepareProxyHeaders(
      req.headers,
      this.configuration.proxyRequestHeaders,
      this.upstream.proxyRequestHeaders,
      // istanbul ignore next
      proxyConfiguration?.proxyRequestHeaders,
    );

    const isKeepAliveRequest = req.headers.connection && req.headers.connection.toLowerCase() === 'keep-alive';
    const options: RequestOptions = {
      method,
      host,
      port,
      headers: requestHeadersToSend,
      path: RequestUtils.concatPath(initialPath, url),
      timeout: this.configuration.proxyRequestTimeout,
    };

    /* istanbul ignore else */
    if (proxyConfiguration && proxyConfiguration.onBeforeProxyRequest) {
      proxyConfiguration.onBeforeProxyRequest(options, options.headers);
    }

    const client = request(options);

    await new Promise<void>((resolve, reject) => {
      req.pipe(client);

      client.on('error', (err) => {
        this.logInfo(`[${requestId}] [HttpProxyHandler] Proxy request failed for method ${method} to ${host}${url}, error: ${err.message}`);
        reject(err);
      });

      client.on('response', (response: IncomingMessage) => {
        this.logInfo(`[${requestId}] [HttpProxyHandler] Response received for method ${method} to ${host}${url}, status code ${response.statusCode}`);
        if (isKeepAliveRequest) {
          client.setTimeout(0);
        }

        // map status code
        res.statusCode = response.statusCode;

        const headersToSet = RequestUtils.prepareProxyHeaders(
          response.headers,
          this.configuration.responseHeaders,
          this.upstream.responseHeaders,
          // istanbul ignore next
          proxyConfiguration?.proxyResponseHeaders
        );

        /* istanbul ignore else */
        if (proxyConfiguration && proxyConfiguration.onBeforeResponse) {
          proxyConfiguration.onBeforeResponse(res, headersToSet);
        }

        RequestUtils.updateResponseHeaders(res, headersToSet);

        // istanbul ignore else
        if (!res.writableEnded) {
          response.on('end', () => {
            this.logInfo(`[${requestId}] [HttpProxyHandler] Proxy request with method ${method} to ${host}${url} completed`);
            resolve();
          });

          response.pipe(res);
        } else {
          resolve();
        }
      });
    });
  }
}

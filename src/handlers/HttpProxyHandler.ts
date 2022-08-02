import { IncomingMessage, ServerResponse } from "http";
import {request as httpRequest, RequestOptions} from 'http';
import {request as httpsRequest} from 'https';

import { Configuration, ProxyRequestConfiguration } from "../interfaces";
import { RequestUtils } from "../utils";

const emptyObj = {};

export class HttpProxyHandler {
  constructor(
    private logInfo: (msg: string) => void,
    private configuration: Configuration,
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
    req: IncomingMessage,
    res: ServerResponse,
    proxyConfiguration?: ProxyRequestConfiguration,
  ): Promise<void> {
    // istanbul ignore next
    proxyConfiguration = proxyConfiguration || emptyObj;

    let target = proxyConfiguration.target || this.configuration.target;
    const url = proxyConfiguration.url || req.url;
    const httpsTarget = RequestUtils.isHttpsTarget(target);
    // istanbul ignore next
    const request = httpsTarget ? httpsRequest : httpRequest;
    // istanbul ignore next
    const port = proxyConfiguration.port || RequestUtils.getPort(target) || (httpsTarget ? 443 : 80);
    const host = RequestUtils.getHost(target);
    const method = proxyConfiguration.method || req.method;

    this.logInfo(`[${requestId}] [HttpProxyHandler] Processing HTTP/HTTPS proxy request with method ${method} to ${target}${url}`);

    const options: RequestOptions = {
      method,
      host,
      port,

      headers: RequestUtils.prepareProxyHeaders(
        req.headers,
        this.configuration.proxyRequestHeaders,
        // istanbul ignore next
        proxyConfiguration?.proxyRequestHeaders,
      ),
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
        const headersToSet = RequestUtils.prepareProxyHeaders(
          response.headers,
          this.configuration.responseHeaders,
          // istanbul ignore next
          proxyConfiguration?.proxyResponseHeaders
        );
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

import {request as httpRequest, RequestOptions, IncomingMessage} from 'node:http';
import {request as httpsRequest} from 'node:https';

import { Configuration, LogConfiguration, ProxyRequestConfiguration, Request, Response } from "../interfaces";
import { UpstreamConfiguration } from "../interfaces/UpstreamConfiguration";
import { RequestUtils } from "../utils";

const emptyObj = {};

export class HttpProxyHandler {
  static LOG_CLASS = 'prxi/http';

  constructor(
    private log: LogConfiguration,
    private configuration: Configuration,
    private upstream: UpstreamConfiguration,
  ) {}

  /**
   * Proxy request
   * @param id
   * @param req
   * @param res
   * @param context
   * @param proxyConfiguration
   */
  public async proxy(
    req: Request,
    res: Response,
    context: Record<string, any>,
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

    this.log.debug(
      context,
      'Processing HTTP/HTTPS proxy request',
      {
        class: HttpProxyHandler.LOG_CLASS,
        method,
        target,
        path: url,
      }
    );

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
      proxyConfiguration.onBeforeProxyRequest(options, options.headers, context);
    }

    const client = request(options);

    await new Promise<void>((resolve, reject) => {
      req.pipe(client);

      client.once('error', (err) => {
        this.log.error(context, `Proxy request failed`, err, {
          class: HttpProxyHandler.LOG_CLASS,
          method,
          target,
          path: url,
        });

        reject(err);
      });

      client.once('response', (response: IncomingMessage) => {
        this.log.debug(context, `Response received`,{
          class: HttpProxyHandler.LOG_CLASS,
          method,
          target,
          path: url,
          response,
        });

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
          proxyConfiguration.onBeforeResponse(res, headersToSet, context);
        }

        RequestUtils.updateResponseHeaders(res, headersToSet);

        // istanbul ignore else
        if (!res.writableEnded) {
          response.once('end', () => {
            this.log.debug(context, `Proxy request completed`,{
              class: HttpProxyHandler.LOG_CLASS,
              method,
              target,
              path: url,
              response,
            });
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

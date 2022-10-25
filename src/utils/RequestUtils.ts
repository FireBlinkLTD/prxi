import { ok } from "assert";
import { OutgoingHttpHeaders, OutgoingMessage, IncomingMessage, IncomingHttpHeaders, ServerResponse } from "http";

import { Configuration, ProxyRequestConfiguration } from "../interfaces";

const emptyObj = {};

export class RequestUtils {
  /**
   * Extract path from the request
   * @param req
   * @returns
   */
  public static getPath(req: IncomingMessage): string {
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
  public static getPort(target: string): number {
    const hostWithPort = RequestUtils.extractHostWithPort(target);
    const colonIdx = hostWithPort.indexOf(':');
    if (colonIdx < 0) {
      return null;
    }

    return Number(hostWithPort.substring(colonIdx + 1));
  }

  /**
   * Extract host only from the target url
   * @param target
   * @returns
   */
  public static getHost(target: string): string {
    const hostWithPort = RequestUtils.extractHostWithPort(target);
    const colonIdx = hostWithPort.indexOf(':');
    if (colonIdx < 0) {
      return hostWithPort;
    }

    return hostWithPort.substring(0, colonIdx);
  }

  /**
   * Extract host (with port) from target
   * @param target
   * @returns
   */
  private static extractHostWithPort(target: string): string {
    target = target.substring(target.indexOf('//') + 2);
    const trailingSlashIdx = target.indexOf('/');
    if (trailingSlashIdx > 0) {
      target = target.substring(0, trailingSlashIdx);
    }

    return target;
  }

  /**
   * Check if target address is HTTPS
   * @param target
   */
  public static isHttpsTarget(target: string): boolean {
    return target.toLowerCase().startsWith('https://');
  }

  /**
   * Update response headers with a new set of headers
   * @param res
   * @param headers
   */
  public static updateResponseHeaders(res: OutgoingMessage, headers: OutgoingHttpHeaders): void {
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
  public static prepareProxyHeaders(
    headers: IncomingHttpHeaders | OutgoingHttpHeaders,
    headersToRewrite?: Record<string, string | string[]>,
    additionalHeadersToRewrite?: Record<string, string | string[]>
  ): OutgoingHttpHeaders {
    const outgoing: OutgoingHttpHeaders = {};
    // istanbul ignore next
    headersToRewrite = headersToRewrite || emptyObj;
    // istanbul ignore next
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
}

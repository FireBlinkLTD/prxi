import { IncomingHttpHeaders } from "http";
import { OutgoingHttpHeaders } from "http2";
import { Request, Response } from "../interfaces";

export class RequestUtils {
  /**
   * Extract path from the request
   * @param req
   * @returns
   */
  public static getPath(req: Request): string {
    return RequestUtils.getPathFromStr(req.url);
  }

  /**
   * Extract path from string
   * @param str
   * @returns
   */
  public static getPathFromStr(str: string): string {
    const attributesIndex = str.indexOf('?');
    if (attributesIndex > 0) {
      str = str.substring(0, attributesIndex);
    }

    return str;
  }

  /**
   * Concat path
   * @param base
   * @param path
   */
  public static concatPath(base: string, path: string): string {
    if (base !== '/') {
      return `${base}${path}`;
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
  public static updateResponseHeaders(res: Response, headers: OutgoingHttpHeaders): void {
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
    ...headersToRewrite: Record<string, string | string[]>[]
  ): OutgoingHttpHeaders {
    const outgoing: OutgoingHttpHeaders = {};

    // remove null elements from the array
    headersToRewrite = headersToRewrite.filter(htr => !!htr);

    const headersKeys = Object.keys(headers);
    const finalKeys = new Set(headersKeys.map(k => k.toLowerCase()));

    const rewriteHeaders: Record<string, string | string[]> = {};
    headersToRewrite.forEach(htr => {
      const headersToRewriteKeys = Object.keys(htr);
      for (const key of headersToRewriteKeys) {
        const lowerKey = key.toLowerCase();
        if (htr[key] !== null) {
          finalKeys.add(lowerKey);
          rewriteHeaders[lowerKey] = htr[key];
        } else {
          finalKeys.delete(lowerKey);
          delete rewriteHeaders[lowerKey];
        }
      }
    });

    for (const key of finalKeys) {
      let rewriteHeader = rewriteHeaders[key];

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

import { connect, constants } from 'node:http2';
import path = require('node:path');

export class FetchHelpers {
  constructor(private mode: 'HTTP' | 'HTTP2', private secure: boolean) {}

  public fixUrl(url: string): string {
    if (!this.secure) {
      return url;
    }

    return url.replace(/http:\/\//i, 'https://').replace(/http:\/\//, 'wss://')
  }

  /**
   * Make GET request
   * @param url
   * @param headers
   * @returns
   */
  async get(url: string, headers: Record<string, string> = {}): Promise<{
    data: any,
    headers: Record<string, string>,
  }> {
    url = this.fixUrl(url);
    console.log(`-> [${this.mode}] Making GET request to ${url}`);

    if (this.mode === 'HTTP') {
      return await this.getHttp1(url, headers);
    }

    if (this.mode === 'HTTP2') {
      return await this.getHttp2(url, headers);
    }

    throw new Error(`Unable to make GET request for unhandled mode ${this.mode}`);
  }

  /**
   * Make HTTP/1.1 GET request
   * @param url
   * @param headers
   * @returns
   */
  private async getHttp1(url: string, headers: Record<string, string>): Promise<{
    data: any,
    headers: Record<string, string>,
  }> {
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          ...headers
        },
      });

      const responseHeaders: Record<string, string> = {};
      for (const header of response.headers.keys()) {
        responseHeaders[header] = response.headers.get(header).toString();
      }

      return {
        data: await response.json(),
        headers: responseHeaders,
      };
    } catch (err) {
      console.error(err);
      throw err;
    }
  }

   /**
   * Make HTTP/2 GET request
   * @param url
   * @param headers
   * @returns
   */
   private async getHttp2(url: string, headers: Record<string, string>): Promise<{
    data: any,
    headers: Record<string, string>,
  }> {
    return new Promise<any>((res, rej) => {
      try {
        const { origin, pathname, search } = new URL(url);
        const client = connect(origin);
        const req = client.request({
          [constants.HTTP2_HEADER_PATH]: `${pathname}${search}`,
          [constants.HTTP2_HEADER_METHOD]: constants.HTTP2_METHOD_GET,
          ...headers
        });

        let responseHeaders: Record<string, string> = {};
        req.on('response', (headers, flags) => {
          for (const header of Object.keys(headers)) {
            responseHeaders[header] = headers[header].toString();
          }
        });

        req.setEncoding('utf8');
        let data = '';
        req.on('data', (chunk) => {
            data += chunk;
        });
        req.on('end', () => {
            res({
              data: JSON.parse(data),
              headers: responseHeaders,
            });
            client.close();
        });
        req.end();
      } catch (e) {
        rej(e);
      }
    });
  }

  /**
   * Make POST request
   * @param url
   * @param data
   * @param headers
   * @returns
   */
  async post(url: string, data: unknown, headers: Record<string, string> = {}): Promise<any> {
    url = this.fixUrl(url);
    console.log(`-> [${this.mode}] Making POST request to ${url}`);

    if (this.mode === 'HTTP') {
      return await this.postHttp1(url, data, headers);
    }

    if (this.mode === 'HTTP2') {
      return await this.postHttp2(url, data, headers);
    }

    throw new Error(`Unable to make POST request for unhandled mode ${this.mode}`);
  }

  /**
   * Make HTTP/1.1 POST request
   * @param url
   * @param data
   * @param headers
   * @returns
   */
  private async postHttp1(url: string, data: unknown, headers: Record<string, string>): Promise<any> {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'accept': 'application/json',
          ...headers
        },
        body: JSON.stringify(data),
      });

      return response.json();
    } catch (err) {
      console.error(err);
      throw err;
    }
  }

  /**
   * Make HTTP/2 POST request
   * @param url
   * @param data
   * @param headers
   * @returns
   */
    private async postHttp2(url: string, data: unknown, headers: Record<string, string>): Promise<any> {
      const buffer = Buffer.from(JSON.stringify(data));

      return new Promise<any>((res, rej) => {
        try {
          const { origin, pathname, search } = new URL(url);
          const client = connect(origin);
          const req = client.request({
            [constants.HTTP2_HEADER_PATH]: `${pathname}${search}`,
            [constants.HTTP2_HEADER_METHOD]: constants.HTTP2_METHOD_POST,
            'content-type': 'application/json',
            'accept': 'application/json',
            ...headers,
          });

          req.on('response', (headers, flags) => {
            for (const name in headers) {
                console.log(`${name}: ${headers[name]}`);
            }
          });

          req.setEncoding('utf8');
          let data = '';
          req.on('data', (chunk) => {
            data += chunk;
          });

          req.on('end', () => {
            res(JSON.parse(data));
            client.close();
          });

          req.write(buffer);
          req.end();
        } catch (e) {
          rej(e);
        }
      });
    }
}

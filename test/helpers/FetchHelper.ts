import { connect, constants } from 'node:http2';
import path = require('node:path');

export class FetchHelpers {
  constructor(private mode: 'HTTP' | 'HTTP2', private secure: boolean, private repeat = 1, private delayBetweenRepeats = 0) {}

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
    return await this.makeHttp1Request('GET', url, headers);
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
    return await this.makeHttp2Request(
      constants.HTTP2_METHOD_GET,
      url,
      headers,
    );
  }

  /**
   * Make POST request
   * @param url
   * @param data
   * @param headers
   * @returns
   */
  async post(url: string, data: unknown, headers: Record<string, string> = {}): Promise<{
    data: any,
    headers: Record<string, string>,
  }> {
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
  private async postHttp1(url: string, data: unknown, headers: Record<string, string>): Promise<{
    data: any,
    headers: Record<string, string>,
  }> {
    return await this.makeHttp1Request('POST', url, headers, data);
  }

  /**
   * Make HTTP/2 POST request
   * @param url
   * @param data
   * @param headers
   * @returns
   */
  private async postHttp2(url: string, data: unknown, headers: Record<string, string>): Promise<{
    data: any,
    headers: Record<string, string>,
  }> {
    return await this.makeHttp2Request(
      constants.HTTP2_METHOD_POST,
      url,
      headers,
      data
    );
  }

  private async makeHttp1Request(method: string, url: string, headers: Record<string, string>, data?: unknown): Promise<any> {
    try {
      const response = await fetch(url, {
        method,
        headers: {
          'Connection': 'close',
          'content-type': 'application/json',
          'accept': 'application/json',
          ...headers
        },
        body: data ? JSON.stringify(data) : undefined,
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

  private async makeHttp2Request(method: string, url: string, headers: Record<string, string>, data?: unknown): Promise<any> {
    const buffer = data ? Buffer.from(JSON.stringify(data)) : undefined;

    return new Promise<any>((res, rej) => {
      let count = 0;
      try {
        const { origin, pathname, search } = new URL(url);
        let client = connect(origin);

        client.on('close', () => {
          console.log(`-> Connection closed (${count + 1} / ${this.repeat})`);
        })

        const makeRequest = () => {
          console.log(`-> Making request (${count + 1} / ${this.repeat})`);
          // if client closed, reconnect
          if (client.closed) {
            client.close();
            console.log(`-> Reconnecting for request (${count + 1} / ${this.repeat})`);
            client = connect(origin);
          }

          const req = client.request({
            [constants.HTTP2_HEADER_PATH]: `${pathname}${search}`,
            [constants.HTTP2_HEADER_METHOD]: method,
            'content-type': 'application/json',
            'accept': 'application/json',
            ...headers,
          });

          let responseHeaders: Record<string, string> = {};
          req.once('response', (headers, flags) => {
            for (const header of Object.keys(headers)) {
              responseHeaders[header] = headers[header].toString();
            }
          });

          req.once('error', (err) => {
            console.error('FetchHelper - req error', err);
            rej(err);
          });

          req.setEncoding('utf8');
          let data = '';
          req.on('data', (chunk) => {
            data += chunk;
          });

          req.once('end', () => {
            if (count + 1 === this.repeat) {
              try {
                res({
                  data: data ? JSON.parse(data) : undefined,
                  headers: responseHeaders,
                });
              } catch (e) {
                rej(e);
              }

              client.close();
            } else {
              count++;
              setTimeout(() => {
                makeRequest();
              }, this.delayBetweenRepeats);
            }
          });

          if (buffer) {
            req.write(buffer);
          }
          req.end();
        }

        makeRequest();
      } catch (e) {
        rej(e);
      }
    });
  }
}

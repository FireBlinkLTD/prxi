import { createServer as createHttp1Server, Server as HTTPServer } from 'http';
import { ServerOptions, constants, createServer as createHttp2Server, ServerHttp2Stream, createSecureServer as createSecureHttp2Server} from 'http2';
import { createServer as createSecureHttp1Server } from 'node:https';
import { writeJson } from './ResponseHelper';
import { parse as queryParse } from 'querystring';
import { parse as urlParse } from 'url';
import  { Server as SocketIOServer } from 'socket.io';
import { Request, Response, Server } from '../../src/interfaces';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { Socket } from 'net';

export class TestServer {
  public static readonly PORT = 7777;
  private server: Server;
  private socketIO: SocketIOServer;
  private secureSettings?: {
    key: string,
    cert: string,
  }
  public failHttp2Request = false;
  public initialResponseDelay = 0;
  private sockets = new Set<Socket>();

  constructor(private mode: 'HTTP' | 'HTTP2', private secure: boolean, private wsEnabled: boolean, private prefix: string = '') {
    if (this.secure) {
      this.secureSettings = {
        key: readFileSync(resolve(__dirname, '../key.pem'), 'utf-8'),
        cert: readFileSync(resolve(__dirname, '../cert.pem'), 'utf-8'),
      }
    }
  }

  private get createServer() {
    return ((cb: (req: Request, res: Response) => void): Server => {
      if (this.mode === 'HTTP') {
        if (this.secure) {
          return createSecureHttp1Server(this.secureSettings, cb);
        }

        return createHttp1Server(cb);
      }

      if (this.mode === 'HTTP2') {
        if (this.secure) {
          return createSecureHttp2Server({
            ...this.secureSettings,
            allowHTTP1: true,
          }, cb);
        }

        return createHttp2Server(<ServerOptions> {
          allowHTTP1: true,
        }, cb);
      }

      throw new Error(`Unsupported mode ${this.mode}`);
    });
  }

  /**
   * Start server
   */
  public async start() {
    await new Promise<void>((resolve) => {
      console.log(`-> [${this.mode}] Starting Server`);

      this.server = this.createServer((req: Request, res: Response) => {
        console.log('-> request', req.httpVersion, req.url);
        if (this.mode === 'HTTP2' && req.httpVersion === "2.0") {
          // Ignore HTTP/2 requests
          return;
        }

        try {
          if (req.url === `${this.prefix}/echo`) {
            return this.handleEcho(req, res);
          }

          if (req.url.indexOf(`${this.prefix}/query`) === 0) {
            return this.handleQuery(req, res);
          }

          if (req.url.indexOf(`${this.prefix}/headers`) === 0) {
            return this.handleHeaders(req, res);
          }

          if (req.url.indexOf(`${this.prefix}/hold`) === 0) {
            res.setHeader("Cache-Control", "no-store");
            res.setHeader("Content-Type", "text/event-stream");
            res.write([
              'event: ping',
              'data: {"time": "' + new Date().toISOString() + '"}',
            ].join('\n') + '\n\n');

            return
          }

          console.log(`Unable to find handler for URL: ${req.url}`);
          writeJson(res, JSON.stringify({
            message: 'Not found',
          }), 404);
        } catch (err) {
          console.error(err);
          writeJson(res, JSON.stringify({
            message: err.message,
          }), 500);
        };
      })

      if (this.mode === 'HTTP2') {
        this.server.on('stream', (stream, headers) => {
          stream.on('error', (err) => {
            console.error('-> Stream error', err);
          });
          console.log('-> new stream');
          const path = headers[constants.HTTP2_HEADER_PATH].toString();
          const method = headers[constants.HTTP2_HEADER_METHOD].toString();

          const process = (data?: any) => {
            if (this.failHttp2Request) {
              console.log('-> stream destroyed');
              stream.destroy(new Error('fail'));
              return;
            }

            if (path === `${this.prefix}/echo`) {
              return this.http2respond(stream, 200, data);
            }

            if (path.indexOf(`${this.prefix}/query`) === 0) {
              return this.http2respond(stream, 200, {
                query: queryParse(path.split('?')[1]),
              });
            }

            if (path.indexOf(`${this.prefix}/headers`) === 0) {
              return this.http2respond(stream, 200, {
                headers,
              }, {
                'RES-TEST': 'test-res',
                'RESConfigLevelOverwrite': 'RESConfigLevelOverwrite-test',
                'RESProxyLevelClear': 'RESProxyLevelClear-test',
              })
            }

            if (path.indexOf(`${this.prefix}/hold`) === 0) {
              stream.respond({
                'content-type': 'text/event-stream',
                'Cache-Control': 'no-store',
                [constants.HTTP2_HEADER_STATUS]: 200,
              })

              stream.write([
                'event: ping',
                'data: {"time": "' + new Date().toISOString() + '"}',
              ].join('\n') + '\n\n');

              return;
            }

            console.log(`Unable to find handler for path: ${path}`);
            return this.http2respond(stream, 404, {
              message: 'Not found',
            })
          }

          if (method === 'POST' || method === 'PUT') {
            let data = '';
            stream.setEncoding('utf8');
            stream.on('data', (chunk: string) => {
              data += chunk;
            });

            stream.once('end', () => {
              process(JSON.parse(data));
            });
          } else {
            process();
          }
        });
      }

      if (this.wsEnabled) {
        // add socket.io
        this.socketIO = new SocketIOServer(<HTTPServer> this.server, {
          path: `${this.prefix}/socket.io`
        });
        this.socketIO.on('connection', (socket) => {
          socket.on('echo', (msg) => {
            console.log(`Socket.IO "echo" message received: ${msg}`);
            socket.emit('echo', msg);
          });

          socket.once('disconnect', () => {
            console.log('Socket.IO disconnected');
          });

          console.log('Socket.IO connected');
        });
      }

      this.server.on('connection', (socket) => {
        this.sockets.add(socket);

        socket.once('close', () => {
          this.sockets.delete(socket);
        });
      });

      this.server.listen(TestServer.PORT, () => {
        console.log(`TestServer started on port ${TestServer.PORT}`);
        resolve();
      });
    });
  }

  /**
   * Respond http2 stream
   * @param stream
   * @param status
   * @param body
   */
  private http2respond(stream: ServerHttp2Stream, status: number, body: any, headers = {}): void {
    setTimeout(() => {
      try {
        if (!stream.closed) {
          stream.respond({
            'content-type': 'application/json',
            [constants.HTTP2_HEADER_STATUS]: status,
            ...headers,
          })
          stream.write(JSON.stringify(body));
          stream.end();
        }
      } catch (e) {
        console.error(e);
      }
    }, this.initialResponseDelay);
  }

  /**
   * Handle /echo request
   * @param req
   * @param res
   */
  private handleEcho(req: Request, res: Response): void {
    const chunks: Buffer[] = [];
    req.on('data', chunk => {
      chunks.push(Buffer.from(chunk));
    })
    req.once('end', () => {
      writeJson(res, Buffer.concat(chunks).toString('utf-8'));
    })
  }

  /**
   * Handle /query request
   * @param req
   * @param res
   */
   private handleQuery(req: Request, res: Response): void {
    writeJson(res, JSON.stringify({
      query: queryParse(urlParse(req.url).query),
    }));
  }

  /**
   * Handle /query request
   * @param req
   * @param res
   */
   private handleHeaders(req: Request, res: Response): void {
    res.setHeader('RES-TEST', 'test-res');
    res.setHeader('RESConfigLevelOverwrite', 'RESConfigLevelOverwrite-test');
    res.setHeader('RESProxyLevelClear', 'RESProxyLevelClear-test');

    writeJson(res, JSON.stringify({
      headers: req.headers,
    }));
  }

  /**
   * Stop server
   */
  public async stop() {
    console.log(`[${new Date().toISOString()}] TestServer stopping...`);
    await new Promise<void>((resolve, reject) => {
      this.sockets.forEach(s => {
        s.destroy();
        this.sockets.delete(s);
      });

      this.server.close((err) => {
        if (err) {
          console.log(`TestServer failed`, err);
          return reject(err);
        }

        resolve();
      });
    });
    console.log(`[${new Date().toISOString()}] TestServer stopped`);
  }
}

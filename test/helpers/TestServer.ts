import { createServer, IncomingMessage, Server, ServerResponse } from 'http';
import { parse as urlParse } from 'url';
import { parse as queryParse } from 'querystring';
import { writeJson } from './ResponseHelper';
import  { Server as SocketIOServer } from 'socket.io';

export class TestServer {
  public static readonly PORT = 7777;
  private server: Server;
  private socketIO: SocketIOServer;

  constructor(private wsEnabled: boolean, private prefix: string = '') {
  }

  /**
   * Start server
   */
  public async start() {
    await new Promise<void>((resolve) => {
      this.server = createServer((req: IncomingMessage, res: ServerResponse) => {
        if (req.url === `${this.prefix}/echo`) {
          return this.handleEcho(req, res);
        }

        if (req.url.indexOf(`${this.prefix}/query`) === 0) {
          return this.handleQuery(req, res);
        }

        if (req.url.indexOf(`${this.prefix}/headers`) === 0) {
          return this.handleHeaders(req, res);
        }

        console.log(`Unable to find handler for URL: ${req.url}`);
        writeJson(res, JSON.stringify({
          message: 'Not found',
        }), 404);
      });

      if (this.wsEnabled) {
        // add socket.io
        this.socketIO = new SocketIOServer(this.server, {
          path: `${this.prefix}/socket.io`
        });
        this.socketIO.on('connection', (socket) => {
          socket.on('echo', (msg) => {
            console.log(`Socket.IO "echo" message received: ${msg}`);
            socket.emit('echo', msg);
          });

          socket.on('disconnect', () => {
            console.log('Socket.IO disconnected');
          });

          console.log('Socket.IO connected');
        });
      }

      this.server.listen(TestServer.PORT, () => {
        console.log(`TestServer started on port ${TestServer.PORT}`);
        resolve();
      });
    });
  }

  /**
   * Handle /echo request
   * @param req
   * @param res
   */
  private handleEcho(req: IncomingMessage, res: ServerResponse): void {
    const chunks: Buffer[] = [];
    req.on('data', chunk => {
      chunks.push(chunk);
    })
    req.on('end', () => {
      writeJson(res, Buffer.concat(chunks).toString('utf-8'));
    })
  }

  /**
   * Handle /query request
   * @param req
   * @param res
   */
   private handleQuery(req: IncomingMessage, res: ServerResponse): void {
    writeJson(res, JSON.stringify({
      query: queryParse(urlParse(req.url).query),
    }));
  }

  /**
   * Handle /query request
   * @param req
   * @param res
   */
   private handleHeaders(req: IncomingMessage, res: ServerResponse): void {
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
    await new Promise<void>((resolve, reject) => {
      this.server.close((err) => {
        if (err) {
          console.log(`TestServer failed`, err);
          return reject(err);
        }

        console.log(`TestServer stopped`);
        resolve();
      });
    });
  }
}

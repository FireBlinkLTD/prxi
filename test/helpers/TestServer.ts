import { createServer, IncomingMessage, Server, ServerResponse } from 'http';
import { writeJson } from './ResponseHelper';

export class TestServer {
  public static readonly PORT = 7777;
  private server: Server;

  /**
   * Start server
   */
  public async start() {
    await new Promise<void>((resolve) => {
      this.server = createServer((req: IncomingMessage, res: ServerResponse) => {
        if (req.url === '/echo') {
          return this.handleEcho(req, res);
        }

        if (req.url === '/slow') {
          return this.handleSlow(req, res);
        }

        console.log(`Unable to find handler for URL: ${req.url}`);
        writeJson(res, JSON.stringify({
          message: 'Not found',
        }), 404);
      });

      this.server.listen(TestServer.PORT, () => {
        console.log(`TestServer started on port ${TestServer.PORT}`);
        resolve();
      });
    });
  }

  /**
   * Handle /slow request
   * @param req
   * @param res
   */
   private handleSlow(req: IncomingMessage, res: ServerResponse): void {
    setTimeout(() => {
      writeJson(res, JSON.stringify({slow: true}));
    }, 5 * 1000); // 5 seconds

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

import { Http2Session, IncomingHttpHeaders } from "node:http2";
import { Stream } from "node:stream";
import { IncomingMessage } from "node:http";
import { Socket } from "node:net";
import { Configuration, LogConfiguration, Request, Response } from "./interfaces";

export class Hooks {
  private static LOG_CLASS = 'prxi/hooks';

  constructor(
    private log: LogConfiguration,
    private configuration: Configuration,
  ) {}

  /**
   * On before HTTP/1.1 request
   * @param path
   * @param req
   * @param res
   * @param context
   */
  onBeforeHttpRequest(path: string, req: Request, res: Response, context: Record<string, any>): void {
    try {
      this.log.debug(context, 'New HTTP/1.1 request', {
        class: Hooks.LOG_CLASS,
        path,
        method: req.method,
      });
      this.configuration.on?.beforeHTTPRequest?.(req, res, context);
    } catch (e) {
      /* istanbul ignore next */
      this.log.error(context, 'beforeHTTPRequest hook error', e, {
        class: Hooks.LOG_CLASS,
        method: req.method,
        path,
      });
    }
  }

  /**
   * On after HTTP/1.1 request
   * @param path
   * @param req
   * @param res
   * @param context
   */
  onAfterHttpRequest(path: string, req: Request, res: Response, context: Record<string, any>): void {
    try {
      this.log.debug(context, 'HTTP/1.1 request completed', {
        class: Hooks.LOG_CLASS,
        path,
        method: req.method,
      });
      this.configuration.on?.afterHTTPRequest?.(req, res, context);
    } catch (e) {
      /* istanbul ignore next */
      this.log.error(context, 'afterHTTPRequest hook error', e, {
        class: Hooks.LOG_CLASS,
        method: req.method,
        path,
      });
    }
  }

  /**
   * On before HTTP/2 session
   * @param session
   * @param context
   */
  onBeforeHTTP2Session(session: Http2Session, context: Record<string, any>): void {
    try {
      this.log.debug(context, 'New HTTP/2 session', {
        class: Hooks.LOG_CLASS,
      });
      this.configuration.on?.beforeHTTP2Session?.(session, context);
    } catch (e) {
      /* istanbul ignore next */
      this.log.error(context, 'beforeHTTP2Session hook error', e, {
        class: Hooks.LOG_CLASS,
      });
    }
  }

  /**
   * On after HTTP/2 session
   * @param session
   * @param context
   */
  onAfterHTTP2Session(session: Http2Session, context: Record<string, any>): void {
    try {
      this.log.debug(context, 'HTTP/2 session closed', {
        class: Hooks.LOG_CLASS,
      });
      this.configuration.on?.afterHTTP2Session?.(session, context);
    } catch (e) {
      /* istanbul ignore next */
      this.log.error(context, 'afterHTTP2Session hook error', e, {
        class: Hooks.LOG_CLASS,
      });
    }
  }

  /**
   * On before HTTP/2 request/stream
   * @param method
   * @param path
   * @param stream
   * @param headers
   * @param context
   */
  onBeforeHTTP2Request(method: string, path: string, stream: Stream, headers: IncomingHttpHeaders, context: Record<string, any>): void {
    try {
      this.log.debug(context, 'New HTTP/2 request', {
        class: Hooks.LOG_CLASS,
        path,
        method,
      });
      this.configuration.on?.beforeHTTP2Request?.(stream, headers, context);
    } catch (e) {
      /* istanbul ignore next */
      this.log.error(context, 'beforeHTTP2Request hook error', e, {
        class: Hooks.LOG_CLASS,
        path,
        method,
      });
    }
  }

  /**
   * On after HTTP/2 request/stream
   * @param method
   * @param path
   * @param stream
   * @param headers
   * @param context
   */
  onAfterHTTP2Request(method: string, path: string, stream: Stream, headers: IncomingHttpHeaders, context: Record<string, any>): void {
    try {
      this.log.debug(context, 'HTTP/2 request completed', {
        class: Hooks.LOG_CLASS,
        path,
        method,
      });
      this.configuration.on?.afterHTTP2Request?.(stream, headers, context);
    } catch (e) {
      /* istanbul ignore next */
      this.log.error(context, 'afterHTTP2Request hook error', e, {
        class: Hooks.LOG_CLASS,
        path,
        method,
      });
    }
  }

  /**
   * On upgrade
   * @param path
   * @param req
   * @param socket
   * @param head
   * @param context
   */
  onUpgrade(path: string, req: IncomingMessage, socket: Socket, head: Buffer, context: Record<string, any>): void {
    try {
      this.log.debug(context, 'Upgrade event received', {
        class: Hooks.LOG_CLASS,
        path,
        method: req.method,
      });
      this.configuration.on?.upgrade?.(req, socket, head, context);
    } catch (e) {
      /* istanbul ignore next */
      this.log.error(context, 'upgrade hook error', e, {
        class: Hooks.LOG_CLASS,
        path,
        method: req.method,
      });
    }
  }

  /**
   * On after upgrade
   * @param path
   * @param req
   * @param socket
   * @param head
   * @param context
   */
  onAfterUpgrade(path: string, req: IncomingMessage, socket: Socket, head: Buffer, context: Record<string, any>): void {
    try {
      this.log.debug(context, 'After upgrade processing', {
        class: Hooks.LOG_CLASS,
        path,
        method: req.method,
      });
      this.configuration.on?.afterUpgrade?.(req, socket, head, context);
    } catch (e) {
      /* istanbul ignore next */
      this.log.error(context, 'afterUpgrade hook error', e, {
        class: Hooks.LOG_CLASS,
        path,
        method: req.method,
      });
    }
  }
}

import {IncomingMessage} from 'node:http';
import { Http2ServerRequest } from 'node:http2';

export type Request = IncomingMessage | Http2ServerRequest;

import {IncomingMessage} from 'http';
import { Http2ServerRequest } from 'http2';

export type Request = IncomingMessage | Http2ServerRequest;

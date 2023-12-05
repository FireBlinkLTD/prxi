import { Server as Server1 } from 'http';
import { Http2Server } from 'http2';

export type Server = Server1 | Http2Server;

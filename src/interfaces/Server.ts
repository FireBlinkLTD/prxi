import { Server as Server1 } from 'node:http';
import { Http2Server } from 'node:http2';

export type Server = Server1 | Http2Server;

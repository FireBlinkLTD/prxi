import { ServerResponse } from "http";
import { Http2ServerResponse } from "http2";

export type Response = ServerResponse | Http2ServerResponse;

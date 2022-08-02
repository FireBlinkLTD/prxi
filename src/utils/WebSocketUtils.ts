import { OutgoingHttpHeaders } from "http";
import { Socket } from "net";

export class WebSocketUtils {
  private static readonly LINE_END = '\r\n';

  /**
   * Prepare raw headers string
   * @param head
   * @param other
   * @returns
   */
  public static prepareRawHeadersString(head: string, other: OutgoingHttpHeaders) {
    const result = [head];

    // write other headers
    for (const key of Object.keys(other)) {
      let values = other[key];
      // istanbul ignore else
      if (!Array.isArray(values)) {
        values = [values.toString()];
      }

      for (const value of values) {
        result.push(`${key}: ${value}`);
      }
    }

    // push two more empty lines in the end
    result.push('', '');

    return result.join(WebSocketUtils.LINE_END);
  }

  /**
   * Keep socket alive
   * @param socket
   */
  public static keepAlive(socket: Socket): void {
    socket.setTimeout(0);
    socket.setNoDelay(true);
    socket.setKeepAlive(true, 0);
  }
}

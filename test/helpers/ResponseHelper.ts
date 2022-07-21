import { ServerResponse } from "http";

/**
 * Write successful JSON response
 * @param res
 * @param jsonData
 * @param statusCode
 */
export const writeJson = async (res: ServerResponse, jsonData: string, statusCode = 200): Promise<void> => {
  res.statusCode = statusCode;
  res.setHeader('content-type', 'application/json');
  res.write(jsonData, () => {
    res.end();
  });
}

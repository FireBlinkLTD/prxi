import {ok} from 'assert';

/**
 * Expect promise to get rejected
 * @param promise
 * @param msg
 */
export const assertReject = async (promise: Promise<any>, msg?: string): Promise<any> => {
  try {
    await promise;
  } catch (err) {
    return err;
  }

  ok(false, msg || 'Expected promise to reject but completed successfully');
}

/**
 * Call function that may optionally return a promise
 */
export const callOptionalPromiseFunction = (fn: () => Promise<void> | void, resolve: () => void, reject: (e: Error) => void) => {
  let promise;

  try {
    promise = fn();
  } catch (e) {
    return reject(e);
  }

  if (!promise) {
    return resolve();
  }

  promise.then(
    () => resolve(),
    (e) => reject(e),
  );
}

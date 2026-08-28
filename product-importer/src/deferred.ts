// Shim de Promise.withResolvers (Node 22+) para o runtime Node 20 atual.
// Centralizado: ao subir para Node 22, trocar por `Promise.withResolvers()`.
export function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void; reject: (reason?: unknown) => void } {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

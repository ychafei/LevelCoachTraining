import { functions } from '@/api/appwriteClient';

// Preferred helper for all new call sites: invokes an Appwrite Function and
// returns the parsed response body directly. On a >=400 response it throws a
// plain Error whose message is the server-provided `.error` string so UIs can
// surface it verbatim (toast.error(err.message)).
export async function callFn(name, payload) {
  const exec = await functions.createExecution(
    name,
    JSON.stringify(payload ?? {}),
    false,
  );

  let data;
  try {
    data = exec.responseBody ? JSON.parse(exec.responseBody) : null;
  } catch {
    data = exec.responseBody;
  }

  if (exec.responseStatusCode >= 400) {
    const serverError = (data && typeof data === 'object' && data.error)
      ? String(data.error)
      : `Request to ${name} failed (${exec.responseStatusCode}).`;
    /** @type {any} */
    const err = new Error(serverError);
    err.data = data;
    err.status = exec.responseStatusCode;
    throw err;
  }

  return data;
}

// Thin wrapper that mimics legacy's rpc.invoke shape. Existing callers do
// `const res = await rpc.invoke('foo', payload)` and then read `res.data` —
// preserve that contract.
//
// Each function id matches an Appwrite Function (see appwrite.json).
export const rpc = {
  invoke: async (name, body) => {
    const exec = await functions.createExecution(
      name,
      JSON.stringify(body ?? {}),
      false,
    );

    let data;
    try {
      data = exec.responseBody ? JSON.parse(exec.responseBody) : null;
    } catch {
      data = exec.responseBody;
    }

    if (exec.responseStatusCode >= 400) {
      /** @type {any} */
      const err = new Error(`rpc ${name} failed: ${exec.responseStatusCode}`);
      err.data = data;
      err.status = exec.responseStatusCode;
      throw err;
    }

    return { data };
  },
};

import { functions } from '@/api/appwriteClient';

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

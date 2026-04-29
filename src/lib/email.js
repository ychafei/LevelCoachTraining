import { rpc } from '@/lib/rpc';

// Calls the Appwrite `send-email` function. Existing call sites just await
// the promise and don't read the response, so we keep the shape simple.
export const email = {
  send: async ({ to, subject, body }) => {
    const res = await rpc.invoke('send-email', { to, subject, body });
    return res.data;
  },
};

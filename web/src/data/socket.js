// Thin WebSocket wrapper with token auth + auto-reconnect (exponential backoff).

export function connectSocket(tokenOrGetter, handlers = {}) {
  // Accept a getter so each (re)connect uses the *current* token: a session that
  // refreshed its token mid-stream then reconnects with the fresh one instead of
  // a stale/expired token.
  const readToken = typeof tokenOrGetter === 'function' ? tokenOrGetter : () => tokenOrGetter;
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';

  let ws = null;
  let closedByUser = false;
  let retry = 0;
  let timer = null;

  function open() {
    const url = `${proto}://${window.location.host}/ws?token=${encodeURIComponent(readToken())}`;
    ws = new WebSocket(url);

    ws.onopen = () => {
      retry = 0;
      handlers.onStatus && handlers.onStatus('open');
    };

    ws.onmessage = (ev) => {
      let msg;
      try {
        msg = JSON.parse(ev.data);
      } catch {
        return;
      }
      handlers.onMessage && handlers.onMessage(msg);
    };

    ws.onclose = (ev) => {
      // 4001 = the server rejected our token (expired/invalid). Reconnecting with
      // the same dead token is what caused the ~1/sec "Reconnecting..." self-DoS
      // loop (onopen on the 101 reset the backoff, then the 4001 close fired). So
      // stop retrying and surface an auth failure: the app clears the token and
      // drops to a clean re-login instead of looping forever.
      if (ev && ev.code === 4001) {
        closedByUser = true;
        if (timer) clearTimeout(timer);
        handlers.onStatus && handlers.onStatus('unauthorized');
        handlers.onAuthFailure && handlers.onAuthFailure();
        return;
      }
      handlers.onStatus && handlers.onStatus('closed');
      if (!closedByUser) {
        retry += 1;
        const delay = Math.min(10000, 500 * 2 ** retry);
        timer = setTimeout(open, delay);
      }
    };

    ws.onerror = () => {
      try {
        ws.close();
      } catch {
        /* noop */
      }
    };
  }

  open();

  return {
    send(obj) {
      if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
    },
    close() {
      closedByUser = true;
      if (timer) clearTimeout(timer);
      try {
        ws && ws.close();
      } catch {
        /* noop */
      }
    },
  };
}

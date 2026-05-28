// Thin WebSocket wrapper with token auth + auto-reconnect (exponential backoff).

export function connectSocket(token, handlers = {}) {
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
  const url = `${proto}://${window.location.host}/ws?token=${encodeURIComponent(token)}`;

  let ws = null;
  let closedByUser = false;
  let retry = 0;
  let timer = null;

  function open() {
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

    ws.onclose = () => {
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

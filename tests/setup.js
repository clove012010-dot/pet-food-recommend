const http = require('http');
const path = require('path');
const server = require('../server');

function startServer() {
  return new Promise((resolve, reject) => {
    const s = server.listen(0, '127.0.0.1', () => {
      resolve({ server: s, port: s.address().port });
    });
    s.on('error', reject);
  });
}

function stopServer(s) {
  return new Promise((resolve) => {
    s.close(() => {
      // kill all timers that may keep the event loop alive
      for (const t of Object.values(s._connectionKey ? {} : {})) {
        if (t && t.unref) t.unref();
      }
      resolve();
    });
  });
}

module.exports = { startServer, stopServer };

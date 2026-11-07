const isBrowser = typeof window !== 'undefined';
const host = isBrowser ? window.location.hostname : '127.0.0.1';
const protocol = isBrowser && window.location.protocol === 'https:' ? 'https' : 'http';

const wsPort = 8000;
const portJava = 7000;

export const environment = {
  production: false,
  wsPort,
  wsPath: '/ws/canvas/',
  endpoint_python: `${protocol}://${host}:${wsPort}/`,
  WebSocket_python: `${host}:${wsPort}`,
  endpoint_java: `${protocol}://${host}:${portJava}/`
};

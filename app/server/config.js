const crypto = require('crypto');

const configDefault = {
  listen: {
    ip: '0.0.0.0',
    port: 2222,
  },
  socketio: {
    serveClient: false,
    origins: ['*'],
  },
  express: {
    secret: crypto.randomBytes(20).toString('hex'),
    name: 'WebSSH2',
    resave: true,
    saveUninitialized: false,
    unset: 'destroy',
    ssh: {
      dotfiles: 'ignore',
      etag: false,
      extensions: ['htm', 'html'],
      index: false,
      maxAge: '1s',
      redirect: false,
      setHeaders(res) {
        res.set('x-timestamp', Date.now());
      },
    },
  },
  user: {
    name: null,
    password: null,
    privatekey: null,
    overridebasic: false,
  },
  ssh: {
    host: null,
    port: 22,
    term: 'xterm-color',
    readyTimeout: 20000,
    keepaliveInterval: 120000,
    keepaliveCountMax: 10,
    allowedSubnets: [],
  },
  terminal: {
    cursorBlink: true,
    scrollback: 10000,
    tabStopWidth: 8,
    bellStyle: 'sound',
  },
  header: {
    text: null,
    background: 'green',
  },
  options: {
    challengeButton: true,
    allowreauth: true,
  },
  algorithms: {
    kex: [
      'ecdh-sha2-nistp256',
      'ecdh-sha2-nistp384',
      'ecdh-sha2-nistp521',
      'diffie-hellman-group-exchange-sha256',
      'diffie-hellman-group14-sha1',
    ],
    cipher: [
      'aes128-ctr',
      'aes192-ctr',
      'aes256-ctr',
      'aes128-gcm',
      'aes128-gcm@openssh.com',
      'aes256-gcm',
      'aes256-gcm@openssh.com',
      'aes256-cbc',
    ],
    hmac: ['hmac-sha2-256', 'hmac-sha2-512', 'hmac-sha1'],
    compress: ['none', 'zlib@openssh.com', 'zlib'],
  },
  serverlog: {
    client: false,
    server: false,
  },
  accesslog: false,
  verify: false
};

const config = configDefault;

module.exports = config;

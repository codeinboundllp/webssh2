const config = require('./config');
const path = require('path');
const nodeRoot = path.dirname(require.main.filename);
const publicPath = path.join(nodeRoot, 'client', 'public');
const express = require('express');
const logger = require('morgan');
const app = express();
const server = require('http').createServer(app);
const favicon = require('serve-favicon');
const io = require('socket.io')(server, config.socketio);
const session = require('express-session')(config.express);
const { appSocket } = require('./socket');
const { webssh2debug } = require('./logging');
const { reauth, connect, notfound, handleErrors } = require('./routes');
const { Queue } = require('bullmq');
const { Redis } = require('ioredis');

const redis = new Redis({ host: "0.0.0.0", port: 6380, maxRetriesPerRequest: null, username: "default", password: "mysecretpassword" })
const commQueue = new Queue("CommunicationQueue", { connection: redis  });

let remainingSeconds = config.safeShutdownDuration;
let shutdownMode = false;
let shutdownInterval;
let connectionCount = 0;

function safeShutdownGuard(req, res, next) {
  if (!shutdownMode) return next();
  res.status(503).end('Service unavailable: Server shutting down');
}

app.use(safeShutdownGuard);
app.use(session);
if (config.accesslog) app.use(logger('common'));
app.disable('x-powered-by');
app.use(favicon(path.join(publicPath, 'favicon.ico')));
app.use(express.urlencoded({ extended: true }));
app.post('/ssh/:sessionID', connect(commQueue));
app.get('/ssh/:sessionID', connect(commQueue));
app.post('/ssh', express.static(publicPath, config.express.ssh));
app.use('/ssh', express.static(publicPath, config.express.ssh));
app.get('/ssh/reauth', reauth);
app.use(notfound);
app.use(handleErrors);

function stopApp(reason) {
  shutdownMode = false;
  if (reason) console.info(`Stopping: ${reason}`);
  clearInterval(shutdownInterval);
  io.close();
  server.close();
}

io.on('connection', appSocket(commQueue));

io.use((socket, next) => {
  socket.request.res ? session(socket.request, socket.request.res, next) : next(next);
});

function countdownTimer() {
  if (!shutdownMode) clearInterval(shutdownInterval);
  remainingSeconds -= 1;
  if (remainingSeconds <= 0) {
    stopApp('Countdown is over');
  } else io.emit('shutdownCountdownUpdate', remainingSeconds);
}

const signals = ['SIGTERM', 'SIGINT'];
signals.forEach((signal) =>
  process.on(signal, () => {
    
    if (shutdownMode) stopApp('Safe shutdown aborted, force quitting');
    if (!(connectionCount > 0)) stopApp('All connections ended');
    shutdownMode = true;
    if (!shutdownInterval) shutdownInterval = setInterval(countdownTimer, 1000);
  })
);

const onConnection = (socket) => {
  connectionCount += 1;
  socket.on('disconnect', () => {
    connectionCount -= 1;
    if (connectionCount <= 0 && shutdownMode) {
      stopApp('All clients disconnected');
    }
  });
  socket.on('geometry', (cols, rows) => {
    socket.request.session.ssh.cols = cols;
    socket.request.session.ssh.rows = rows;
    webssh2debug(socket, `SOCKET GEOMETRY: termCols = ${cols}, termRows = ${rows}`);
  });
};

io.on('connection', onConnection);

module.exports = { server, config };
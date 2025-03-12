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
const { appSocket, closeSession } = require('./socket');
const { webssh2debug } = require('./logging');
const { reauth, connect, notfound, handleErrors } = require('./routes');
const { Queue, Worker } = require('bullmq');
const { Redis } = require('ioredis');

const redis = new Redis({ host: "0.0.0.0", port: 6380, maxRetriesPerRequest: null, username: "default", password: "mysecretpassword" });
const commQueue = new Queue("CommunicationQueue", { connection: redis  });

const w = async () => {
  return (new Promise(() => {
    new Worker("CommunicationQueue", closeSession(commQueue), { connection: redis, autorun: true });
}))};

w();

let count = 0;

app.use(session);
if (config.accesslog) app.use(logger('common'));
app.disable('x-powered-by');
app.use(favicon(path.join(publicPath, 'favicon.ico')));
app.use(express.urlencoded({ extended: true }));
app.post('/ssh', express.static(publicPath, config.express.ssh));
app.use('/ssh', express.static(publicPath, config.express.ssh));
app.get('/ssh/reauth', reauth);
app.use('/ssh/:sessionID', connect(commQueue));
app.use(notfound);
app.use(handleErrors);

io.on('connection', appSocket(commQueue));

io.use((socket, next) => {
  socket.request.res ? session(socket.request, socket.request.res, next) : next(next);
});

function countdownTimer() {
  io.emit('shutdownCountdownUpdate', 5);
}

const signals = ['SIGTERM', 'SIGINT'];
signals.forEach((signal) => {
  process.on(signal, () => {
    count++;
    if (count > 1) {
      console.log("forcefully terminating the process!");
      process.exit();
    }
    
    countdownTimer();
    server.close();
  });
});

const onConnection = (socket) => {
  socket.on('geometry', (cols, rows) => {
    socket.request.session.ssh.cols = cols;
    socket.request.session.ssh.rows = rows;
    webssh2debug(socket, `SOCKET GEOMETRY: termCols = ${cols}, termRows = ${rows}`);
  });
};

io.on('connection', onConnection);

module.exports = { server, config };
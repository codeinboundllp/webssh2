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
const { reauth, connect, notfound, handleErrors } = require('./routes');
const { Queue } = require('bullmq');
const { Redis } = require('ioredis');

const redis = new Redis({ 
  host: process.env.REDIS_HOST, 
  port: parseInt(process.env.REDIS_PORT), 
  maxRetriesPerRequest: null, 
  username: process.env.REDIS_USERNAME, 
  password: process.env.REDIS_PASSWORD 
});
const commQueue = new Queue(process.env.COMM_QUEUE_NAME, { connection: redis  });

let count = 0;

app.use(session);
if (config.accesslog) app.use(logger('common'));
app.disable('x-powered-by');
app.use(favicon(path.join(publicPath, 'favicon.ico')));
app.use(express.urlencoded({ extended: true }));
app.post('/ssh', express.static(publicPath, config.express.ssh));
app.use('/ssh', express.static(publicPath, config.express.ssh));
app.get('/ssh/reauth', reauth);
app.post('/ssh/close', closeSession);
app.get('/ssh/:sessionID', connect(commQueue));
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
  });
};

io.on('connection', onConnection);

module.exports = { server, config };
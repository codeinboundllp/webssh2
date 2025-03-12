const debug = require('debug');
const SSH = require('ssh2').Client;
const util = require('util');
const { webssh2debug, auditLog, logError } = require('./logging');
const map = new Map();

exports.closeSession = (commQueue) => {
  return async (job) => {
    if (job.name !== "Close_Session") {
      return;
    }
    console.log(job);
    const sessionID = job.data.session_id;
    const value = map.get(sessionID);
    commQueue.add("Update_Session_Status", { session_id: socket?.request?.session?.session_id, status: 2 });
    map.delete(sessionID);
    value.conn.end();
    value.socket.disconnect(true);
  }
}

exports.appSocket = (commQueue) => {
  return ((socket) => {
    let login = false;

    socket.once('disconnecting', (reason) => {
      webssh2debug(socket, `SOCKET DISCONNECTING: ${reason}`);
      if (login === true) {
        auditLog(
          socket,
          `LOGOUT user=${socket.request.session.username} from=${socket.handshake.address} host=${socket.request.session.ssh.host}:${socket.request.session.ssh.port}`
        );
        login = false;
      }
    });
  
    const setupConnection = async () => {
      if (!socket.request.session) {
        socket.emit('401 UNAUTHORIZED');
        webssh2debug(socket, 'SOCKET: No Express Session / REJECTED');
        socket.disconnect(true);
        return;
      }
    
      const conn = new SSH();
  
      conn.on('banner', (data) => {
        socket.emit('data', data.replace(/\r?\n/g, '\r\n').toString('utf-8'));
      });
  
      conn.on('handshake', () => {
        commQueue.add("Update_Session_Status", { session_id: socket?.request?.session?.session_id, status: 1 });
        socket.emit('setTerminalOpts', socket?.request?.session?.ssh?.terminal);
        socket.emit('menu');
        socket.emit('allowreauth', socket.request.session.ssh.allowreauth);
        socket.emit('title', `ssh://${socket.request.session.ssh.host}`);
        if (socket.request.session.ssh.header.background)
          socket.emit('headerBackground', socket.request.session.ssh.header.background);
        if (socket.request.session.ssh.header.name)
          socket.emit('header', socket.request.session.ssh.header.name);
        socket.emit(
          'footer',
          `ssh://${socket.request.session.username}@${socket.request.session.ssh.host}:${socket.request.session.ssh.port}`
        );
      });
  
      conn.on('ready', () => {
        webssh2debug(
          socket,
          `CONN READY: LOGIN: user=${socket.request.session.username} from=${socket.handshake.address} host=${socket.request.session.ssh.host} port=${socket.request.session.ssh.port} allowreplay=${socket.request.session.ssh.allowreplay} term=${socket.request.session.ssh.term}`
        );
        auditLog(
          socket,
          `LOGIN user=${socket.request.session.username} from=${socket.handshake.address} host=${socket.request.session.ssh.host}:${socket.request.session.ssh.port}`
        );
        login = true;
        map.set(socket.request.session.session_id, { socket: socket, conn: conn });
        socket.emit('status', 'SSH CONNECTION ESTABLISHED');
        socket.emit('statusBackground', 'green');
        socket.emit('allowreplay', socket.request.session.ssh.allowreplay);
        const { term, cols, rows } = socket.request.session.ssh;
        
        conn.shell({ term, cols, rows }, (err, stream) => {
          if (err) {
            logError(socket, `EXEC ERROR`, err);
            commQueue.add("Update_Session_Status", { session_id: socket?.request?.session?.session_id, status: 2 });
            conn.end();
            map.delete(socket.request.session.session_id);
            socket.disconnect(true);
            return;
          }

          socket.once('disconnect', (reason) => {
            webssh2debug(socket, `CLIENT SOCKET DISCONNECT: ${util.inspect(reason)}`);
            commQueue.add("Update_Session_Status", { session_id: socket?.request?.session?.session_id, status: 2 });
            conn.end();
            map.delete(socket.request.session.session_id);
            socket.request.session.destroy();
          });

          socket.on('error', (errMsg) => {
            webssh2debug(socket, `SOCKET ERROR: ${errMsg}`);
            logError(socket, 'SOCKET ERROR', errMsg);
            commQueue.add("Update_Session_Status", { session_id: socket.request.session.session_id, status: 2 });
            conn.end();
            map.delete(socket.request.session.session_id);
            socket.disconnect(true);
          });

          socket.on('control', (controlData) => {
            if (controlData === 'replayCredentials' && socket.request.session.ssh.allowreplay) {
              stream.write(`${socket.request.session.userpassword}\n`);
            }
            if (controlData === 'reauth' && socket.request.session.username && login === true) {
              auditLog(
                socket,
                `LOGOUT user=${socket.request.session.username} from=${socket.handshake.address} host=${socket.request.session.ssh.host}:${socket.request.session.ssh.port}`
              );
              login = false;
              commQueue.add("Update_Session_Status", { session_id: socket?.request?.session?.session_id, status: 2 });
              conn.end();
              map.delete(socket.request.session.session_id);
              socket.disconnect(true);
            }
            webssh2debug(socket, `SOCKET CONTROL: ${controlData}`);
          });

          socket.on('resize', (data) => {
            stream.setWindow(data.rows, data.cols);
            webssh2debug(socket, `SOCKET RESIZE: ${JSON.stringify([data.rows, data.cols])}`);
          });

          socket.on('data', (data) => {
            stream.write(data);
          });

          stream.on('data', (data) => {
            socket.emit('data', data.toString('utf-8'));
          });

          stream.on('close', (code, signal) => {
            webssh2debug(socket, `STREAM CLOSE: ${util.inspect([code, signal])}`);
            if (socket.request.session?.username && login === true) {
              auditLog(
                socket,
                `LOGOUT user=${socket.request.session.username} from=${socket.handshake.address} host=${socket.request.session.ssh.host}:${socket.request.session.ssh.port}`
              );
              login = false;
            }
            if (code !== 0 && typeof code !== 'undefined')
              logError(socket, 'STREAM CLOSE', util.inspect({ message: [code, signal] }));
            commQueue.add("Update_Session_Status", { session_id: socket?.request?.session?.session_id, status: 2 });
            conn.end();
            map.delete(socket.request.session.session_id);
            socket.disconnect(true);
          });

          stream.stderr.on('data', (data) => {
            console.error(`STDERR: ${data}`);
          });
        });
      });
  
      conn.on('end', (err) => {
        if (err) logError(socket, 'CONN END BY HOST', err);
        webssh2debug(socket, 'CONN END BY HOST');
        commQueue.add("Update_Session_Status", { session_id: socket?.request?.session?.session_id, status: 2 });
        map.delete(socket.request.session.session_id);
        socket.disconnect(true);
      });

      conn.on('close', (err) => {
        if (err) logError(socket, 'CONN CLOSE', err);
        webssh2debug(socket, 'CONN CLOSE');
        commQueue.add("Update_Session_Status", { session_id: socket?.request?.session?.session_id, status: 2 });
        map.delete(socket.request.session.session_id);
        socket.disconnect(true);
      });

      conn.on('error', (err) => connError(socket, err));
  
      conn.on('keyboard-interactive', (_name, _instructions, _instructionsLang, _prompts, finish) => {
        webssh2debug(socket, 'CONN keyboard-interactive');
        finish([socket.request.session.userpassword]);
      });
  
      if (
        socket.request.session.username &&
        (socket.request.session.userpassword || socket.request.session.privatekey) &&
        socket.request.session.ssh
      ) {
        const { ssh } = socket.request.session;
        ssh.username = socket.request.session.username;
        ssh.password = socket.request.session.userpassword;
        ssh.tryKeyboard = true;
        ssh.debug = debug('ssh2');
        conn.connect(ssh);
      } else {
        webssh2debug(
          socket,
          `CONN CONNECT: Attempt to connect without session.username/password or session varialbles defined, potentially previously abandoned client session. disconnecting websocket client.\r\nHandshake information: \r\n  ${util.inspect(
            socket.handshake
          )}`
        );
        socket.emit('ssherror', 'WEBSOCKET ERROR - Refresh the browser and try again');
        map.delete(socket.request.session.session_id);
        socket.request.session.destroy();
        socket.disconnect(true);
      }
    }
    
    setupConnection();
  })
};

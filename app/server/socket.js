const debug = require('debug');
const SSH = require('ssh2').Client;
const map = new Map();

exports.closeSession = (req, res) => {
  const sessionID = req.query.sessionID;
  const value = map.get(sessionID);
  if (value === null || value === undefined) {
    res.status(400);
    res.send("error: socket not found");
  } else {
    value.socket.emit('status', 'CONNECTION CLOSED BY THE ADMIN');
    value.socket.emit('statusBackground', 'red');
    value.socket.disconnect(true);
    res.status(200);
    res.send("success: socket removed");
  }
}

exports.appSocket = (commQueue) => {
  return ((socket) => {
    let login = false;

    socket.once('disconnecting', (_) => {
      if (login === true) {
        login = false;
      }
    });
  
    const setupConnection = async () => {
      if (!socket.request.session) {
        socket.emit('401 UNAUTHORIZED');
        socket.disconnect(true);
        return;
      }
    
      const conn = new SSH();
  
      conn.on('banner', (data) => {
        socket.emit('data', data.replace(/\r?\n/g, '\r\n').toString('utf-8'));
      });
  
      conn.on('handshake', () => {
        socket.emit('setTerminalOpts', socket.request.session.ssh.terminal);
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
        commQueue.add("Update_Session_Status", { 
          session_id: socket.request.session.session_id, 
          status: 1, 
          remote_address: socket.request.socket.remoteAddress
        });
      });
  
      conn.on('ready', () => {
        login = true;
        socket.emit('status', 'SSH CONNECTION ESTABLISHED');
        socket.emit('statusBackground', 'green');
        socket.emit('allowreplay', socket.request.session.ssh.allowreplay);
        map.set(socket.request.session.session_id, { socket: socket });
        const { term, cols, rows } = socket.request.session.ssh;
        
        conn.shell({ term, cols, rows }, (err, stream) => {
          if (err) {
            socket.disconnect(true);
            return;
          }

          socket.once('disconnect', (_) => {
            console.log("disconnected -> ", map);
            conn.end();
            commQueue.add("Update_Session_Status", { session_id: socket.request.session.session_id, status: 2 });
            map.delete(socket.request.session.session_id);
            socket.request.session.destroy();
          });

          socket.on('error', (_) => {
            socket.disconnect(true);
          });

          socket.on('control', (controlData) => {
            if (controlData === 'replayCredentials' && socket.request.session.ssh.allowreplay) {
              stream.write(`${socket.request.session.userpassword}\n`);
            }
            if (controlData === 'reauth' && socket.request.session.username && login === true) {
              login = false;
              socket.disconnect(true);
            }
          });

          socket.on('resize', (data) => {
            stream.setWindow(data.rows, data.cols);
          });

          socket.on('data', (data) => {
            stream.write(data);
          });

          stream.on('data', (data) => {
            socket.emit('data', data.toString('utf-8'));
          });

          stream.on('close', (_) => {
            if (login === true) {
              login = false;
            }
            socket.disconnect(true);
          });

          stream.stderr.on('data', (data) => {
            console.error(`STDERR: ${data}`);
          });
        });
      });
  
      conn.on('end', (_) => {
        socket.disconnect(true);
      });

      conn.on('close', (_) => {
        socket.disconnect(true);
      });

      conn.on('error', (err) => {
        console.error(err);
      });
  
      conn.on('keyboard-interactive', (_name, _instructions, _instructionsLang, _prompts, finish) => {
        finish([socket.request.session.userpassword]);
      });
  
      if (socket.request.session.username && socket.request.session.userpassword && socket.request.session.ssh) {
        const { ssh } = socket.request.session;
        ssh.username = socket.request.session.username;
        ssh.password = socket.request.session.userpassword;
        ssh.tryKeyboard = true;
        ssh.debug = debug('ssh2');
        conn.connect(ssh);
      } else {
        socket.emit('ssherror', 'WEBSOCKET ERROR - Refresh the browser and try again');
        socket.request.session.destroy();
        socket.disconnect(true);
      }
    }
    
    setupConnection();
  })
};

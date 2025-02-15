const debug = require('debug');
const util = require('util');

function prefix(socket) {
  return `(${socket.request.sessionID}/${socket.id})`;
}

function webssh2debug(socket, msg) {
  debug('WebSSH2')(`${prefix(socket)} ${msg}`);
}

function auditLog(socket, msg) {
  console.info(`WebSSH2 ${prefix(socket)} AUDIT: ${msg}`);
}

function logError(socket, myFunc, err) {
  console.error(`WebSSH2 ${prefix(socket)} ERROR: ${myFunc}: ${err}`);
  webssh2debug(socket, `logError: ${myFunc}: ${util.inspect(err)}`);
  if (!socket.request.session) return;
  socket.emit('ssherror', `SSH ${myFunc}: ${err}`);
}

module.exports = { logError, auditLog, webssh2debug };

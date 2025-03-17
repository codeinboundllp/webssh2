const { config } = require('./server/app');
const { server } = require('./server/app');

console.log(process.env.CHECK_ENV);
server.listen({ host: config.listen.ip, port: config.listen.port });

server.on('error', (err) => { console.error(err.message); });

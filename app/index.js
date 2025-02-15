const { config } = require('./server/app');
const { server } = require('./server/app');

server.listen({ host: config.listen.ip, port: config.listen.port });

server.on('error', (err) => {

  if (err.code === 'EADDRINUSE') {
  
    config.listen.port += 1;
    setTimeout(() => { server.listen(config.listen.port) }, 250);
  
  }
});

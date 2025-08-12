const validator = require('validator');
const path = require('path');

const nodeRoot = path.dirname(require.main.filename);

const publicPath = path.join(nodeRoot, 'client', 'public');
const { parseBool } = require('./util');
const config = require('./config');

exports.reauth = function reauth(req, res) {
  let { referer } = req.headers;
  if (!validator.isURL(referer, { host_whitelist: ['localhost'] })) {
    console.error(
      `WebSSH2 (${req.sessionID}) ERROR: Referrer '${referer}' for '/reauth' invalid. Setting to '/' which will probably fail.`
    );
    referer = '/';
  }
  res
    .status(401)
    .send(
      `<!DOCTYPE html><html><head><meta http-equiv="refresh" content="0; url=${referer}"></head><body bgcolor="#000"></body></html>`
    );
};

exports.connect = (commQueue) => {
  return async (req, res) => {

    let { host, port } = config.ssh;
    let { text: header, background: headerBackground } = config.header;
    let { term: sshterm, readyTimeout } = config.ssh;
    let {
      cursorBlink,
      scrollback,
      tabStopWidth,
      bellStyle,
      fontSize,
      fontFamily,
      letterSpacing,
      lineHeight,
    } = config.terminal;
    
    const sessionID = req.params.sessionID;

    if (sessionID === null || sessionID === undefined) {
      res.status(400).send("No SessionID!");
      return;
    }

    let job = await commQueue.add(process.env.GET_SESSION_JOB_NAME, sessionID);
    
    const r = async () => {

      return await new Promise((resolve) => {
        
        const m = (count) => {
          if (count === 0) {
            setTimeout(() => { resolve() }, 50000);
          }

          setTimeout(async () => {
            if (count === 50) {
              return resolve();
            }

            const state = await commQueue.getJobState(job.id);
            if (state === "completed") {
                job = (await commQueue.getJob(job.id));
                
                return resolve();
            } else {
              m((count+1));
            }
          }, 1000);  
        }

        m(0);
      })
    }
    
    await r();

    const sessionDetails = job.returnvalue;
    
    if (sessionDetails === null || sessionDetails === undefined) {
      res.status(400).send("Bad Request!");
      return;
    }

    if (sessionDetails === false || typeof sessionDetails !== "object") {
      res.status(400).send("Expired SSH Session!");
      return;      
    }

    if (sessionDetails.status === 2) {
      res.status(400).send("Expired SSH Session!");
      return;
    }

    req.session.session_id = sessionID;

    host = sessionDetails.nodeip;
    port = sessionDetails.servicePort;

    req.session.username = sessionDetails.username;
    req.session.userpassword = sessionDetails.password;

    req.session.ssh = {
      host,
      port,
      header: {
        name: header,
        background: headerBackground,
      },
      keepaliveInterval: config.ssh.keepaliveInterval,
      keepaliveCountMax: config.ssh.keepaliveCountMax,
      allowedSubnets: config.ssh.allowedSubnets,
      term: sshterm,
      terminal: {
        cursorBlink,
        scrollback,
        tabStopWidth,
        bellStyle,
        fontSize,
        fontFamily,
        letterSpacing,
        lineHeight,
      },
      cols: null,
      rows: null,
      allowreplay:
        config.options.challengeButton ||
        (validator.isBoolean(`${req.headers.allowreplay}`)
          ? parseBool(req.headers.allowreplay)
          : false),
      allowreauth: config.options.allowreauth || false,
      mrhsession:
        validator.isAlphanumeric(`${req.headers.mrhsession}`) && req.headers.mrhsession
          ? req.headers.mrhsession
          : 'none',
      serverlog: {
        client: config.serverlog.client || false,
        server: config.serverlog.server || false,
      },
      readyTimeout,
    };
    if (req.session.ssh.header.name) validator.escape(req.session.ssh.header.name);
    if (req.session.ssh.header.background) validator.escape(req.session.ssh.header.background);

    res.sendFile(path.join(path.join(publicPath, 'client.htm')));
  }
}

exports.notfound = function notfound(_req, res) {
  res.status(404).send("Sorry, can't find that!");
};

exports.handleErrors = function handleErrors(err, _req, res) {
  console.error(err.stack);
  res.status(500).send('Something broke!');
};

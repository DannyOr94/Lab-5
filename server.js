'use strict';

var validation = require('./libs/unalib');
var express = require('express');
var rateLimit = require('express-rate-limit');
var http = require('http');
var createAuth = require('./server/auth');
var readAuth0ClientSecret = require('./server/vault').readAuth0ClientSecret;

var app = express();
var server = http.createServer(app);
var io = require('socket.io')(server);
var port = process.env.PORT || 3000;
var auth = createAuth(process.env);

app.disable('x-powered-by');
app.use(function (_req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  standardHeaders: true,
  legacyHeaders: false
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(auth.router);

app.get('/', function (req, res) {
  if (auth.isReady()) {
    var session = auth.getSession(req);
    if (session && session.user) return res.redirect(303, '/sala');
    return res.sendFile(__dirname + '/login.html');
  }
  return res.sendFile(__dirname + '/index.html');
});

app.get('/sala', auth.requireAuth, function (_req, res) {
  res.sendFile(__dirname + '/index.html');
});

app.post('/mensaje', auth.requireAuth, function (req, res) {
  try {
    var raw = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    var validado = validation.validarMensaje(raw);
    var resultado = JSON.parse(validado);
    res.status(200).json(resultado);
  } catch (_) {
    res.status(400).json({ error: 'Error procesando el mensaje' });
  }
});

io.use(auth.socketMiddleware);
io.on('connection', function (socket) {
  socket.on('Evento-Mensaje-Server', function (msg) {
    try {
      var user = auth.isReady()
        ? socket.data.user
        : null;
      if (auth.isReady() && !user) {
        socket.disconnect(true);
        return;
      }

      var input = typeof msg === 'string' ? JSON.parse(msg) : msg;
      if (!input || typeof input !== 'object' || Array.isArray(input)) return;
      if (user) input.nombre = user.name;
      var validated = validation.validarMensaje(JSON.stringify(input));
      io.emit('Evento-Mensaje-Server', validated);
    } catch (_) {
      socket.emit('chat:error', { error: 'invalid_message' });
    }
  });
});

async function start() {
  if (auth.hasConfig()) {
    var secret = await readAuth0ClientSecret();
    auth.setClientSecret(secret);
  }

  return new Promise(function (resolve, reject) {
    server.once('error', reject);
    server.listen(port, function () {
      server.removeListener('error', reject);
      console.log('listening on *:' + port);
      resolve(server);
    });
  });
}

if (require.main === module) {
  start().catch(function (error) {
    var code = error && (error.code || error.message);
    console.error('Server initialization failed:', code || 'unknown_error');
    process.exitCode = 1;
  });
}

module.exports = { app: app, server: server, io: io, auth: auth, start: start };

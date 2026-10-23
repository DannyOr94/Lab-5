
// npm install para descargar los paquetes...

// libreriuas
var validation = require('./libs/unalib');
var express = require('express');
var rateLimit = require('express-rate-limit');
var app = express();
var http = require('http').Server(app);
var io = require('socket.io')(http);
var port = process.env.PORT || 3000;

// Deshabilitar la cabecera X-Powered-By para mitigar fuga de información
app.disable('x-powered-by');

// Limitar la tasa de peticiones para prevenir DoS en rutas web
var limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  standardHeaders: true,
  legacyHeaders: false
});
app.use(limiter);

// Middleware para procesar cuerpos JSON y formularios
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// root: presentar html
app.get('/', function(req, res){
  res.sendFile(__dirname + '/index.html');
});

// Ruta HTTP para recibir y validar mensajes (Paso 9 - Integración con Supertest)
app.post('/mensaje', function(req, res){
  try {
    var raw = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    var validado = validation.validarMensaje(raw);
    var resultado = JSON.parse(validado);
    res.status(200).json(resultado);
  } catch (e) {
    res.status(400).json({ error: 'Error procesando el mensaje' });
  }
});

// escuchar una conexion por socket
io.on('connection', function(socket){
  // si se escucha "chat message"
  socket.on('Evento-Mensaje-Server', function(msg){

    msg =  validation.validarMensaje(msg);
    // volvemos a emitir el mismo mensaje
    io.emit('Evento-Mensaje-Server', msg);
  });
});

if (require.main === module) {
  http.listen(port, function(){
    console.log('listening on *:' + port);
  });
}

module.exports = { app: app, server: http, io: io };


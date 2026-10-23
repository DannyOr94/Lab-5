const request = require('supertest');
const ioClient = require('socket.io-client');
const { app, server, io } = require('../../server');

describe('Pruebas de Integración - Backend Node.js y una-lib', () => {
  let serverInstance;
  let socketClient;
  let port;

  beforeAll((done) => {
    serverInstance = server.listen(0, () => {
      port = serverInstance.address().port;
      done();
    });
  });

  afterAll((done) => {
    if (socketClient && socketClient.connected) {
      socketClient.disconnect();
    }
    serverInstance.close(() => {
      done();
    });
  });

  describe('Rutas HTTP con Supertest', () => {
    test('GET / debe responder con status 200 y servir el HTML del chat', async () => {
      const res = await request(app).get('/');
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/html/);
    });

    test('POST /mensaje con URL de imagen válida: el backend acepta y formatea con <img>', async () => {
      const payload = {
        nombre: 'UsuarioPrueba',
        mensaje: 'https://sitio.com/foto.png'
      };

      const res = await request(app)
        .post('/mensaje')
        .send(payload);

      expect(res.status).toBe(200);
      expect(res.body.nombre).toBe('UsuarioPrueba');
      expect(res.body.mensaje).toContain('<img src="https://sitio.com/foto.png"');
      expect(res.body.mensaje).toContain('alt="Imagen compartida"');
    });

    test('POST /mensaje con URL de video válida: el backend acepta y formatea con <video>', async () => {
      const payload = {
        nombre: 'UsuarioPrueba',
        mensaje: 'https://sitio.com/clip.mp4'
      };

      const res = await request(app)
        .post('/mensaje')
        .send(payload);

      expect(res.status).toBe(200);
      expect(res.body.nombre).toBe('UsuarioPrueba');
      expect(res.body.mensaje).toContain('<video controls');
      expect(res.body.mensaje).toContain('src="https://sitio.com/clip.mp4"');
    });

    test('POST /mensaje con URL de YouTube: el backend acepta y formatea con <iframe>', async () => {
      const payload = {
        nombre: 'UsuarioPrueba',
        mensaje: 'https://www.youtube.com/watch?v=qYwlqx-JLok'
      };

      const res = await request(app)
        .post('/mensaje')
        .send(payload);

      expect(res.status).toBe(200);
      expect(res.body.mensaje).toContain('<iframe');
      expect(res.body.mensaje).toContain('https://www.youtube.com/embed/qYwlqx-JLok');
    });

    test('POST /mensaje con script malicioso: la validación elimina o devuelve contenido saneado', async () => {
      const payload = {
        nombre: 'Atacante',
        mensaje: "<script>alert('Inyección de script');</script>"
      };

      const res = await request(app)
        .post('/mensaje')
        .send(payload);

      expect(res.status).toBe(200);
      // Comprueba que no exista la etiqueta ejecutable de script
      expect(res.body.mensaje).not.toContain('<script>');
      expect(res.body.mensaje).not.toContain("alert('Inyección de script')");
      // Debe retornar contenido bloqueado o saneado
      expect(res.body.mensaje).toMatch(/bloqueado|saneado|^$/);
    });

    test('POST /mensaje con texto normal: el backend preserva el mensaje legítimo', async () => {
      const payload = {
        nombre: 'Danny',
        mensaje: 'Mensaje de prueba de integración'
      };

      const res = await request(app)
        .post('/mensaje')
        .send(payload);

      expect(res.status).toBe(200);
      expect(res.body.nombre).toBe('Danny');
      expect(res.body.mensaje).toBe('Mensaje de prueba de integración');
    });
  });

  describe('Eventos Socket.IO con socket.io-client', () => {
    test('Evento-Mensaje-Server procesa el mensaje a través de una-lib', (done) => {
      socketClient = ioClient(`http://localhost:${port}`);

      socketClient.on('connect', () => {
        const msg = JSON.stringify({
          nombre: 'TesterSocket',
          mensaje: 'https://sitio.com/foto.jpg',
          color: '#123456'
        });

        socketClient.emit('Evento-Mensaje-Server', msg);
      });

      socketClient.on('Evento-Mensaje-Server', (data) => {
        const parsed = JSON.parse(data);
        expect(parsed.nombre).toBe('TesterSocket');
        expect(parsed.mensaje).toContain('<img src="https://sitio.com/foto.jpg"');
        done();
      });
    });
  });
});

var val = require('../libs/unalib');
var assert = require('assert');

describe('unalib', function(){

  // Pruebas existentes de teléfono
  describe('funcion is_valid_phone', function(){
    it('deberia devolver true para 8297-8547', function(){
      assert.equal(val.is_valid_phone('8297-8547'), true);
    });

    it('deberia devolver false para 8297p-8547', function(){
      assert.equal(val.is_valid_phone('8297p-8547'), false);
    });
  });

  // Paso 7.1: Validación de URLs de Imágenes
  describe('Validación de URLs de Imágenes', function(){
    it('deberia devolver true para http://image.com/image.jpg', function(){
      assert.equal(val.is_valid_url_image('http://image.com/image.jpg'), true);
    });

    it('deberia devolver true para http://image.com/image.gif', function(){
      assert.equal(val.is_valid_url_image('http://image.com/image.gif'), true);
    });

    it('deberia devolver true para https://sitio.com/foto.png', function(){
      assert.equal(val.is_valid_url_image('https://sitio.com/foto.png'), true);
    });

    it('deberia devolver true para https://sitio.com/grafico.webp', function(){
      assert.equal(val.is_valid_url_image('https://sitio.com/grafico.webp'), true);
    });

    it('deberia devolver true para miniaturas de Google Images (gstatic.com)', function(){
      assert.equal(val.is_valid_url_image('https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRAqwsKKbAS_1s-Cty5m_iGVVb0NxK8yW2nxqiXVHZisg&s=10'), true);
    });

    it('deberia devolver false para archivos que no son imagen (ej. .pdf, .exe)', function(){
      assert.equal(val.is_valid_url_image('https://sitio.com/documento.pdf'), false);
      assert.equal(val.is_valid_url_image('https://sitio.com/programa.exe'), false);
    });

    it('deberia generar correctamente el tag <img> para una imagen valida', function(){
      var tag = val.getImageTag('https://sitio.com/foto.jpg');
      assert.ok(tag.includes('<img src="https://sitio.com/foto.jpg"'));
      assert.ok(tag.includes('alt="Imagen compartida"'));
    });
  });

  // Paso 7.2: Validación de URLs de Videos
  describe('Validación de URLs de Videos', function(){
    it('deberia devolver true para videos directos .mp4 y .webm', function(){
      assert.equal(val.is_valid_url_video('https://sitio.com/video.mp4'), true);
      assert.equal(val.is_valid_url_video('https://sitio.com/animacion.webm'), true);
    });

    it('deberia devolver false para URLs que no son video', function(){
      assert.equal(val.is_valid_url_video('https://sitio.com/archivo.zip'), false);
    });

    it('deberia generar el tag <video> con controles para video directo', function(){
      var tag = val.getVideoTag('https://sitio.com/video.mp4');
      assert.ok(tag.includes('<video controls'));
      assert.ok(tag.includes('src="https://sitio.com/video.mp4"'));
    });

    it('deberia devolver true para enlaces de YouTube estandar y cortos', function(){
      assert.equal(val.is_valid_yt_video('https://www.youtube.com/watch?v=qYwlqx-JLok'), true);
      assert.equal(val.is_valid_yt_video('https://youtu.be/qYwlqx-JLok'), true);
    });

    it('deberia generar el <iframe> de YouTube con getEmbeddedCode', function(){
      var embed = val.getEmbeddedCode('https://www.youtube.com/watch?v=qYwlqx-JLok');
      assert.ok(embed.includes('<iframe'));
      assert.ok(embed.includes('https://www.youtube.com/embed/qYwlqx-JLok'));
    });
  });

  // Paso 7.3: Prevención de Inyección de Scripts
  describe('Prevención de Inyección de Scripts (XSS)', function(){
    it('deberia detectar intentos de inyeccion de scripts con etiqueta <script>', function(){
      var xss = "<script>alert('Inyección de script');</script>";
      assert.equal(val.has_script_injection(xss), true);
    });

    it('deberia detectar intentos de inyeccion con eventos maliciosos (onerror, onload)', function(){
      assert.equal(val.has_script_injection('<img src=x onerror=alert(1)>'), true);
      assert.equal(val.has_script_injection('javascript:alert(1)'), true);
    });

    it('deberia devolver false en has_script_injection para texto normal', function(){
      assert.equal(val.has_script_injection('Hola a todos en el chat!'), false);
    });

    it('validarMensaje deberia eliminar y bloquear la inyeccion de script del paso 2', function(){
      var msgEntrada = JSON.stringify({
        nombre: 'Atacante',
        mensaje: "<script>alert('Inyección de script');</script>"
      });
      var resultado = JSON.parse(val.validarMensaje(msgEntrada));
      // No debe contener la etiqueta script ejecutable
      assert.equal(resultado.mensaje.includes('<script>'), false);
      assert.equal(resultado.mensaje.includes("alert('Inyección de script')"), false);
      assert.ok(resultado.mensaje.includes('bloqueado') || resultado.mensaje === '');
    });

    it('validarMensaje deberia neutralizar atributos HTML peligrosos escapando caracteres', function(){
      var msgEntrada = JSON.stringify({
        nombre: 'Usuario',
        mensaje: '<img src=x onerror=alert("XSS")>'
      });
      var resultado = JSON.parse(val.validarMensaje(msgEntrada));
      // Debe haber escapado < y > para evitar ejecucion en DOM
      assert.ok(resultado.mensaje.includes('&lt;img'));
      assert.equal(resultado.mensaje.includes('<img src=x'), false);
    });

    it('validarMensaje deberia permitir y preservar mensajes de texto normales', function(){
      var msgEntrada = JSON.stringify({
        nombre: 'Danny',
        mensaje: 'Hola profesor, este es un mensaje normal de prueba'
      });
      var resultado = JSON.parse(val.validarMensaje(msgEntrada));
      assert.equal(resultado.nombre, 'Danny');
      assert.equal(resultado.mensaje, 'Hola profesor, este es un mensaje normal de prueba');
    });
  });

});








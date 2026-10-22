// modulo de ejemplo.

module.exports = {


    // logica que valida si un telefono esta correcto...
    is_valid_phone: function (phone) {
      // inicializacion lazy
      var isValid = false;
      // expresion regular copiada de StackOverflow
      var re = /^[+]*[(]{0,1}[0-9]{1,4}[)]{0,1}[-\s\./0-9]*$/i;
  
      // validacion Regex
      try {
        isValid = re.test(phone);
      } catch (e) {
        console.log(e);
      } finally {
          return isValid;
      }
      // fin del try-catch block
    },
  
    // Only complete HTTP(S) URLs are used as media sources.
    parseMediaUrl: function (value) {
      if (typeof value !== 'string') return null;
      try {
        var url = new URL(value.trim());
        if (!['http:', 'https:'].includes(url.protocol)) return null;
        if (url.username || url.password) return null;
        return url;
      } catch (e) {
        return null;
      }
    },

    is_valid_url_image: function (value) {
      var url = this.parseMediaUrl(value);
      if (!url) return false;
      // Extensiones de imagen soportadas
      var hasImageExt = /\.(jpg|jpeg|png|gif|webp|bmp)$/i.test(url.pathname);
      // URLs con extension en query params (ej. ?format=png o &ext=jpg)
      var hasQueryImageExt = /[?&](?:format|ext|fmt)=(?:jpg|jpeg|png|gif|webp|bmp)/i.test(url.search);
      // Miniaturas de Google Images (gstatic.com/images?q=...)
      var isGoogleThumbnail = /(?:^|\.)gstatic\.com$/i.test(url.hostname) && url.pathname.startsWith('/images');

      return hasImageExt || hasQueryImageExt || isGoogleThumbnail;
    },

    is_valid_url_video: function (value) {
      var url = this.parseMediaUrl(value);
      return !!url && /\.(mp4|webm|ogv)$/i.test(url.pathname);
    },

    getYTVideoId: function (value) {
      var url = this.parseMediaUrl(value);
      if (!url) return null;
      var id = null;
      if (url.hostname === 'youtu.be') {
        id = url.pathname.slice(1);
      } else if (['youtube.com', 'www.youtube.com', 'm.youtube.com'].includes(url.hostname)) {
        if (url.pathname === '/watch') id = url.searchParams.get('v');
        else {
          var match = url.pathname.match(/^\/(?:embed|shorts|v)\/([\w-]{11})$/);
          if (match) id = match[1];
        }
      }
      return /^[\w-]{11}$/.test(id || '') ? id : null;
    },

    is_valid_yt_video: function (value) {
      return this.getYTVideoId(value) !== null;
    },

    cleanHtml: function (value) {
      if (typeof value !== 'string') return '';
      return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    },

    has_script_injection: function (value) {
      if (typeof value !== 'string') return false;
      var pattern = /<script\b|javascript\s*:|onerror\s*=|onload\s*=|onclick\s*=/i;
      return pattern.test(value);
    },

    sanitize: function (value) {
      if (typeof value !== 'string') return '';
      // Elimina cualquier etiqueta <script>...</script> y su contenido
      var clean = value.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
      // Elimina prefijos javascript:
      clean = clean.replace(/javascript\s*:/gi, '');
      // Escapa caracteres HTML restantes para neutralizar cualquier otra inyección
      return this.cleanHtml(clean).trim();
    },

    escapeAttribute: function (value) {
      return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;')
        .replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/'/g, '&#39;');
    },

    getEmbeddedCode: function (value) {
      var id = this.getYTVideoId(value);
      if (!id) return '';
      return '<iframe title="Video de YouTube" width="560" height="315" style="max-width:100%" src="https://www.youtube.com/embed/' + id + '" allowfullscreen></iframe>';
    },

    getImageTag: function (value) {
      if (!this.is_valid_url_image(value)) return '';
      var src = this.escapeAttribute(this.parseMediaUrl(value).href);
      return '<img src="' + src + '" alt="Imagen compartida" style="display:block;max-height:400px;max-width:100%;">';
    },

    getVideoTag: function (value) {
      if (!this.is_valid_url_video(value)) return '';
      var src = this.escapeAttribute(this.parseMediaUrl(value).href);
      return '<video controls preload="metadata" src="' + src + '" style="display:block;max-height:400px;max-width:100%;">Tu navegador no admite este video.</video>';
    },

    validateMessage: function(msg){
      return this.validarMensaje(msg);
    },

    validarMensaje: function(msg){
      // Manejo de entrada inválida
      if (!msg || typeof msg !== 'string') {
        return JSON.stringify({ mensaje: '' });
      }

      try {
        var obj = JSON.parse(msg);
        if (!obj || typeof obj !== 'object') {
          return JSON.stringify({ mensaje: '' });
        }

        // Sanitizar el nombre si está presente
        if (obj.nombre && typeof obj.nombre === 'string') {
          obj.nombre = this.sanitize(obj.nombre) || 'Anonimo';
        }

        var contenido = typeof obj.mensaje === 'string' ? obj.mensaje.trim() : '';

        if (this.is_valid_url_image(contenido)) {
          console.log("Es una imagen!");
          obj.mensaje = this.getImageTag(contenido);
        }
        else if (this.is_valid_url_video(contenido)) {
          console.log("Es un video directo!");
          obj.mensaje = this.getVideoTag(contenido);
        }
        else if (this.is_valid_yt_video(contenido)) {
          console.log("Es un video de YouTube!");
          obj.mensaje = this.getEmbeddedCode(contenido);
        }
        else {
          console.log("Es un texto o script!");
          var hadScript = this.has_script_injection(contenido);
          var saneado = this.sanitize(contenido);

          if (hadScript && saneado.length === 0) {
            obj.mensaje = '[Mensaje bloqueado: inyección de script detectada]';
          } else {
            obj.mensaje = saneado;
          }
        }

        return JSON.stringify(obj);
      } catch (e) {
        console.log('Error processing message:', e);
        var safe = this.sanitize(String(msg));
        return JSON.stringify({ mensaje: safe });
      }
    }

  // fin del modulo
  };
  
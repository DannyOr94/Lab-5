const assert = require('assert');

describe('Evidencia del control de despliegue', function () {
  it('falla temporalmente para demostrar que CI bloquea Render', function () {
    assert.strictEqual(true, false);
  });
});

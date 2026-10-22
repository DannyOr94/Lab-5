const { test, expect } = require('@playwright/test');

test.describe('Pruebas End-to-End - UNA Chat', () => {

  test('Enviar una URL de imagen y verificar que la imagen se muestra y termina de cargar en el chat', async ({ page }) => {
    await page.goto('/');

    await page.getByPlaceholder('Username').fill('UsuarioImagen');
    const imageUrl = 'https://picsum.photos/200/200.jpg';
    await page.getByPlaceholder('Escriba un mensaje').fill(imageUrl);
    await page.getByRole('button', { name: 'Send' }).click();

    // Verificar que la imagen aparezca en la lista de mensajes
    const imgLocator = page.locator('#messages img').last();
    await expect(imgLocator).toBeVisible({ timeout: 10000 });

    // Verificar que la imagen termine de cargar completamente
    await expect.poll(async () => {
      return await imgLocator.evaluate((img) => img.complete && img.naturalWidth > 0);
    }, {
      message: 'La imagen debe terminar de cargar con naturalWidth > 0',
      timeout: 10000
    }).toBe(true);
  });

  test('Enviar una URL de video y verificar que el reproductor aparece y carga el contenido', async ({ page }) => {
    await page.goto('/');

    await page.getByPlaceholder('Username').fill('UsuarioVideo');
    const videoUrl = 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4';
    await page.getByPlaceholder('Escriba un mensaje').fill(videoUrl);
    await page.getByRole('button', { name: 'Send' }).click();

    // Verificar que el reproductor de video aparezca en el chat
    const videoLocator = page.locator('#messages video').last();
    await expect(videoLocator).toBeVisible({ timeout: 10000 });
    await expect(videoLocator).toHaveAttribute('src', videoUrl);

    // En navegadores headless, asegurar inicio de carga llamando a load()
    await videoLocator.evaluate((v) => v.load());

    // Verificar que el reproductor de video comience o termine de cargar contenido
    await expect.poll(async () => {
      return await videoLocator.evaluate((v) => v.readyState >= 1 || v.networkState >= 1);
    }, {
      message: 'El reproductor de video debe inicializar la carga del medio',
      timeout: 10000
    }).toBe(true);
  });

  test('Enviar el script del paso 2: verificar que no se dispare alert y comprobar rechazo/saneamiento', async ({ page }) => {
    await page.goto('/');

    let alertFired = false;
    let alertText = '';

    // Registrar listener antes del envío para detectar alert y hacer fallar la prueba si se ejecuta
    page.on('dialog', async (dialog) => {
      alertFired = true;
      alertText = dialog.message();
      await dialog.dismiss();
    });

    await page.getByPlaceholder('Username').fill('Atacante');
    const maliciousScript = "<script>alert('Inyección de script');</script>";
    await page.getByPlaceholder('Escriba un mensaje').fill(maliciousScript);
    await page.getByRole('button', { name: 'Send' }).click();

    // Esperar a que el mensaje aparezca en la lista
    const lastMessage = page.locator('#messages li').last();
    await expect(lastMessage).toBeVisible({ timeout: 10000 });

    // 1. Confirmar que no se disparó ninguna ventana emergente (alert)
    expect(alertFired).toBe(false);

    // 2. Comprobar el rechazo o saneamiento del mensaje
    const content = await lastMessage.textContent();
    expect(content).not.toContain('<script>');
    expect(content).not.toContain("alert('Inyección de script')");
    expect(content).toMatch(/bloqueado|inyección de script/i);
  });

});

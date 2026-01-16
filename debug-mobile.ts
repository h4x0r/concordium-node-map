import { chromium } from 'playwright';

async function debugMobile() {
  const browser = await chromium.launch({ headless: true });

  // Test various mobile viewport sizes
  const viewports = [
    { name: 'iphone-se', width: 375, height: 667 },
    { name: 'iphone-12', width: 390, height: 844 },
    { name: 'iphone-14-pro-max', width: 430, height: 932 },
    { name: 'pixel-5', width: 393, height: 851 },
    { name: 'galaxy-s21', width: 360, height: 800 },
  ];

  for (const vp of viewports) {
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: 2,
    });

    const page = await context.newPage();

    // Navigate to the app
    await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });

    // Wait for the app to render
    await page.waitForTimeout(2000);

    // Take full page screenshot
    await page.screenshot({
      path: `debug-${vp.name}.png`,
      fullPage: true
    });

    console.log(`Captured: ${vp.name} (${vp.width}x${vp.height})`);

    await context.close();
  }

  await browser.close();
  console.log('\nScreenshots saved. Check debug-*.png files.');
}

debugMobile().catch(console.error);

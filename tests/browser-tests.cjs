/** Real Chromium DOM + mocked Foundry hooks. Run: node tests/browser-tests.cjs */
const { createServer } = require('node:http');
const { readFileSync, writeFileSync } = require('node:fs');
const { join, resolve, extname } = require('node:path');
const { createRequire } = require('node:module');
const root = resolve(__dirname, '..');
const playwright = require('playwright');

(async () => {
  const server = createServer((req, res) => {
    const path = resolve(root, '.' + req.url.split('?')[0]);
    if (!path.startsWith(root + '/')) {
      res.end('<!doctype html><body></body>');
      return;
    }
    try {
      res.setHeader(
        'Content-Type',
        ['.js', '.mjs'].includes(extname(path)) ? 'text/javascript' : 'text/plain',
      );
      res.end(readFileSync(path));
    } catch {
      res.writeHead(404).end();
    }
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  let browser;
  try {
    browser = await playwright.chromium.launch({
      headless: true,
      executablePath: process.env.GCS_CHROMIUM_EXECUTABLE || undefined,
    });
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    const results = await page.evaluate(async () => (await import('/tests/suite.js')).runSuite());
    for (const result of results)
      console.log(
        `${result.pass ? 'PASS' : 'FAIL'} ${result.name}${result.error ? ': ' + result.error : ''}`,
      );
    const failed = results.filter((r) => !r.pass);
    console.log(
      `${results.length - failed.length}/${results.length} passed. Real Chromium DOM; Foundry lifecycle mocked.`,
    );
    writeFileSync(
      join(root, 'tests', 'results.json'),
      JSON.stringify(
        {
          environment:
            'Chromium via Playwright; mocked Foundry V14 lifecycle; not a live Foundry world',
          results,
        },
        null,
        2,
      ),
    );
    if (failed.length) process.exitCode = 1;
  } finally {
    await browser?.close();
    await new Promise((r) => server.close(r));
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

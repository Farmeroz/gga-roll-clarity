/** Alternative runner: Happy DOM + mocked Foundry hooks (not a real browser). */
const { writeFileSync } = require('node:fs');
const { join } = require('node:path');
const { pathToFileURL } = require('node:url');

(async () => {
  const moduleURL = process.env.GRC_HAPPY_DOM_PATH
    ? pathToFileURL(process.env.GRC_HAPPY_DOM_PATH).href
    : 'happy-dom';
  const { Window } = await import(moduleURL);
  const window = new Window();
  globalThis.document = window.document;
  globalThis.DOMParser = window.DOMParser;
  const { runSuite } = await import('./suite.js');
  const results = await runSuite();
  for (const result of results)
    console.log(
      `${result.pass ? 'PASS' : 'FAIL'} ${result.name}${result.error ? ': ' + result.error : ''}`,
    );
  const failed = results.filter((r) => !r.pass);
  console.log(
    `${results.length - failed.length}/${results.length} passed. Happy DOM; Foundry lifecycle mocked.`,
  );
  writeFileSync(
    join(__dirname, 'results.json'),
    JSON.stringify(
      {
        environment:
          'Node.js with Happy DOM; mocked Foundry V14 lifecycle; not a real browser or live Foundry world',
        results,
      },
      null,
      2,
    ),
  );
  await window.happyDOM.close();
  if (failed.length) process.exitCode = 1;
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

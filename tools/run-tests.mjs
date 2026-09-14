import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { testEnvironment } from './test-sources.mjs';

const root = new URL('../', import.meta.url);
const manifest = JSON.parse(await readFile(new URL('module.json', root), 'utf8'));
const env = await testEnvironment();
const files = (await readdir(new URL('tests/', root)))
  .filter((name) => /\.test\.[cm]?js$/.test(name))
  .sort();
const args =
  manifest.id === 'gga-roll-clarity'
    ? ['tests/dom-tests.cjs']
    : ['--test', '--test-reporter=tap', ...files.map((name) => `tests/${name}`)];
if (!files.length && manifest.id !== 'gga-roll-clarity')
  throw new Error('No automated tests found.');
if (manifest.id === 'gga-roll-clarity') {
  const helpRun = spawnSync(process.execPath, ['--test', 'tests/tooltip.test.mjs'], {
    cwd: fileURLToPath(root),
    env,
    stdio: 'inherit',
  });
  if (helpRun.status !== 0) process.exit(helpRun.status ?? 1);
}
const run = spawnSync(process.execPath, args, {
  cwd: fileURLToPath(root),
  env,
  encoding: 'utf8',
  maxBuffer: 16 * 1024 * 1024,
});
process.stdout.write(run.stdout || '');
process.stderr.write(run.stderr || '');
await mkdir(new URL('test-output/', root), { recursive: true });
await writeFile(
  new URL('test-output/automated-tests.txt', root),
  (run.stdout || '') + (run.stderr || ''),
);
if (/^# skipped [1-9]\d*$/m.test(run.stdout || '')) {
  console.error(
    'Tests were skipped. Check the documented development dependencies and fixture setup.',
  );
  process.exitCode = 1;
} else process.exitCode = run.status ?? 1;

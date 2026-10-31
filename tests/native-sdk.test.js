import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

test('native macOS SDK compiles and passes normalization and socket IPC tests', { skip: process.platform !== 'darwin' }, () => {
  const build = spawnSync('sh', ['native/build.sh'], { cwd: root, encoding: 'utf8' });
  assert.equal(build.status, 0, build.stderr);

  const compileTest = spawnSync('xcrun', [
    'clang',
    '-O2',
    '-Wall',
    '-Wextra',
    '-Werror',
    'native/tests/test-client.c',
    'native/build/libpadkit.a',
    '-I', 'native/include',
    '-o', 'native/build/test-client'
  ], { cwd: root, encoding: 'utf8' });
  assert.equal(compileTest.status, 0, compileTest.stderr);

  const runTest = spawnSync('./native/build/test-client', [], { cwd: root, encoding: 'utf8' });
  assert.equal(runTest.status, 0, runTest.stderr);
  assert.match(runTest.stdout, /PASS: Padkit macOS SDK C client/);
});

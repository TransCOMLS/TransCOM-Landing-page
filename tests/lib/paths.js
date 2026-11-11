// Paths shared by the test suites (everything relative to the repo, so the tests run from any checkout).
const path = require('path'), fs = require('fs');
const ROOT = path.resolve(__dirname, '..', '..');
const CODE_GS = path.join(ROOT, 'apps-script', 'Code.gs');
const BASE = 'http://localhost:' + (process.env.TEST_PORT || 8765) + '/';
// Screenshots and files a suite writes go to tests/out/<suite>/ (git-ignored)
function out(file) {
  const dir = path.join(ROOT, 'tests', 'out', path.basename(path.dirname(file)) + '-' + path.basename(file, '.js'));
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}
module.exports = { ROOT, CODE_GS, BASE, out };

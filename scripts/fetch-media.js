// Downloads the test audio and pictures listed in content/media.txt into content/media/
// (same path as on the file host), so the platform serves them itself.
//   node scripts/fetch-media.js          download what is missing
//   node scripts/fetch-media.js --check  only count what is missing
// Docker runs it once in the `media` service (see docker-compose.yaml); files already
// on disk are skipped, so it is safe to run again.
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

const ROOT = path.join(__dirname, '..', 'content');
const LIST = path.join(ROOT, 'media.txt');
const OUT = path.join(ROOT, 'media');
const PARALLEL = +process.env.MEDIA_PARALLEL || 4;
const CHECK = process.argv.includes('--check');

const urls = fs.readFileSync(LIST, 'utf8').split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
const dest = (u) => path.join(OUT, ...new URL(u).pathname.split('/').filter(Boolean));
const missing = urls.filter((u) => { try { return !fs.statSync(dest(u)).size; } catch { return true; } });
console.log(`media: ${urls.length} listed, ${urls.length - missing.length} on disk, ${missing.length} missing`);
if (CHECK || !missing.length) process.exit(0);

function get(u, file, hops = 0) {
  return new Promise((resolve, reject) => {
    (u.startsWith('http:') ? http : https).get(u, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && hops < 5) {
        res.resume();
        return resolve(get(new URL(res.headers.location, u).href, file, hops + 1));
      }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error('HTTP ' + res.statusCode)); }
      const tmp = file + '.part';
      const w = fs.createWriteStream(tmp);
      res.pipe(w);
      w.on('finish', () => w.close(() => fs.rename(tmp, file, (e) => (e ? reject(e) : resolve()))));
      w.on('error', reject);
      res.on('error', reject);
    }).on('error', reject);
  });
}

let done = 0, failed = 0, next = 0;
async function worker() {
  while (next < missing.length) {
    const u = missing[next++];
    const file = dest(u);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    let ok = false;
    for (let i = 0; i < 3 && !ok; i++) {
      try { await get(u, file); ok = true; } catch (e) { if (i === 2) console.warn('failed', u, e.message); }
    }
    ok ? done++ : failed++;
    if ((done + failed) % 20 === 0) console.log(`media: ${done + failed}/${missing.length}`);
  }
}
Promise.all(Array.from({ length: PARALLEL }, worker)).then(() => {
  console.log(`media: downloaded ${done}, failed ${failed}`);
  process.exit(failed ? 1 : 0);
});

/* ==========================================================================
   The test bank on disk is two layers: the copy built into the image (content/)
   and what the sync has brought from the admin bank since (CONTENT_LIVE, a volume
   shared by the API and the site, see sync.js). A file in the live folder wins.
   When the sync finishes it writes version.txt; readers drop their caches when it
   changes (checked at most every few seconds).
   ========================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');

const EVERY_MS = 5000;

function create(baseDir, liveDir = process.env.CONTENT_LIVE || '') {
  let stamp, checkedAt = 0;
  const listeners = [];
  /** Drops the readers' caches when the sync has written something new. */
  function fresh() {
    if (!liveDir || Date.now() - checkedAt < EVERY_MS) return;
    checkedAt = Date.now();
    let s = null;
    try { s = fs.readFileSync(path.join(liveDir, 'version.txt'), 'utf8').trim(); } catch {}
    if (s === stamp) return;
    stamp = s;
    for (const f of listeners) f();
  }
  /** The path to read a content file from: the live copy if there is one. */
  function file(...rel) {
    if (liveDir) {
      const p = path.join(liveDir, ...rel);
      if (fs.existsSync(p)) return p;
    }
    return path.join(baseDir, ...rel);
  }
  return { file, fresh, onChange: (f) => listeners.push(f), dir: liveDir || null };
}

module.exports = { create };

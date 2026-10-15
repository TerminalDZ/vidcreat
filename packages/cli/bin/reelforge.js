#!/usr/bin/env node
import('../dist/index.js').then((m) => m.main(process.argv)).catch((e) => {
  console.error(e?.stack ?? e);
  process.exit(1);
});

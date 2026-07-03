const fs = require('fs');
const src = fs.readFileSync('server.js', 'utf8');
const lines = src.split('\n');

const destructureRe = /const\s*\{([^}]+)\}\s*=\s*require\('\.\/(src\/[^']+)'\)/g;
const requiredNames = new Map();
lines.forEach((line, idx) => {
  destructureRe.lastIndex = 0;
  let mm;
  while ((mm = destructureRe.exec(line))) {
    const names = mm[1].split(',').map(s => s.trim().split(':')[0].trim()).filter(Boolean);
    for (const n of names) {
      if (!requiredNames.has(n)) requiredNames.set(n, []);
      requiredNames.get(n).push({ line: idx + 1, module: mm[2] });
    }
  }
});

for (const [name, occs] of requiredNames) {
  const declRe = new RegExp('(function\\s+' + name + '\\s*\\(|\\b(?:const|let|var)\\s+' + name + '\\s*=)');
  lines.forEach((line, idx) => {
    if (declRe.test(line) && !line.includes("require('./")) {
      console.log('DUP:', name, '-> declared at line', idx + 1, '| required at line', occs.map(o => o.line).join(','), '| text:', line.trim().slice(0, 100));
    }
  });
}

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { spawnSync } = require('node:child_process');

const repositoryRoot = path.join(__dirname, '..');
const repositoryBuildScript = path.join(repositoryRoot, 'scripts', 'build-static.js');

const vendorAssets = [
  ['vendor/marked/marked.umd.js', 'marked'],
  ['vendor/turndown/turndown.umd.js', 'TurndownService'],
  ['vendor/js-yaml/js-yaml.min.js', 'jsyaml'],
  ['vendor/papaparse/papaparse.min.js', 'Papa']
];

const vendorSources = [
  'node_modules/marked/lib/marked.umd.js',
  'node_modules/turndown/lib/turndown.browser.umd.js',
  'node_modules/js-yaml/dist/browser/js-yaml.umd.min.js',
  'node_modules/papaparse/papaparse.min.js',
  'node_modules/marked/LICENSE',
  'node_modules/turndown/LICENSE',
  'node_modules/js-yaml/LICENSE',
  'node_modules/papaparse/LICENSE'
];

const ignoredDirectoryCases = [
  'tests',
  'docs',
  '.worktrees',
  '.github',
  '.openai',
  'coverage',
  'tmp-cache',
  'temp-build',
  'backup-old',
  'bak-copy',
  '.tmp-cache',
  '.backup-old',
  '.dist-staging-stale',
  '.dist-backup-stale',
  '.site-staging-stale',
  '.site-backup-stale'
];

function copyRepositoryFile(relativePath, targetRoot) {
  const source = path.join(repositoryRoot, relativePath);
  const target = path.join(targetRoot, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
}

function writeFixtureFile(root, relativePath, content) {
  const target = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
}

function createFixture(t) {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'build-static-'));
  const sourceRoot = path.join(fixtureRoot, 'source');
  const outDir = path.join(fixtureRoot, 'output', 'site');
  const fixtureBuildScript = path.join(sourceRoot, 'scripts', 'build-static.js');
  t.after(() => fs.rmSync(fixtureRoot, { recursive: true, force: true }));

  fs.mkdirSync(path.dirname(fixtureBuildScript), { recursive: true });
  fs.copyFileSync(repositoryBuildScript, fixtureBuildScript);
  for (const relativePath of [
    'TextFormatterTool.html',
    'shared-ui.css',
    'shared-ui.js',
    'text-formatter-core.js',
    'text-codecs.js',
    'text-generators.js',
    'markdown-table.js',
    'text-formatter.js',
    'markdown-table-ui.js',
    'vendor/he/he.js',
    'vendor/he/LICENSE-MIT.txt',
    'vendor/sax/sax.js',
    'vendor/sax/LICENSE.txt',
    ...vendorSources
  ]) {
    copyRepositoryFile(relativePath, sourceRoot);
  }

  writeFixtureFile(sourceRoot, 'index.html', '<!doctype html><title>fixture</title>');
  writeFixtureFile(sourceRoot, 'img/keep.js', 'window.fixtureImageAsset = true;');
  writeFixtureFile(sourceRoot, 'vendor/custom/tool.js', 'window.fixtureVendorAsset = true;');
  writeFixtureFile(sourceRoot, 'future-tool-assets/tool.js', 'window.futureTool = true;');
  writeFixtureFile(sourceRoot, 'templates/template.js', 'window.templateAsset = true;');
  for (const directory of ignoredDirectoryCases) {
    writeFixtureFile(sourceRoot, `${directory}/leak.js`, 'throw new Error("must not publish");');
  }

  return { fixtureRoot, sourceRoot, outDir, fixtureBuildScript };
}

function loadBuilder(fixtureBuildScript) {
  delete require.cache[require.resolve(fixtureBuildScript)];
  return require(fixtureBuildScript);
}

function createFsOps(overrides) {
  return Object.assign(Object.create(fs), overrides);
}

function collectFiles(currentPath, basePath, files) {
  for (const entry of fs.readdirSync(currentPath, { withFileTypes: true })) {
    const entryPath = path.join(currentPath, entry.name);
    if (entry.isDirectory()) {
      collectFiles(entryPath, basePath, files);
    } else if (entry.isFile()) {
      files.push(path.relative(basePath, entryPath).replaceAll(path.sep, '/'));
    }
  }
}

function filesUnder(directory) {
  const files = [];
  collectFiles(directory, directory, files);
  return files.sort();
}

function digest(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function temporaryBuildEntries(outDir) {
  const parent = path.dirname(outDir);
  const prefix = `.${path.basename(outDir)}-`;
  if (!fs.existsSync(parent)) return [];
  return fs.readdirSync(parent).filter((entry) => entry.startsWith(prefix)).sort();
}

test('builds an isolated repeatable bundle and publishes only runtime assets', (t) => {
  const fixture = createFixture(t);
  const { buildStatic } = loadBuilder(fixture.fixtureBuildScript);

  assert.equal(
    fs.existsSync(path.join(fixture.sourceRoot, 'dist')),
    false,
    'requiring the module must not execute the CLI build'
  );
  assert.equal(typeof buildStatic, 'function');

  writeFixtureFile(fixture.outDir, 'old-sentinel.txt', 'old output');
  const result = buildStatic({
    rootDir: fixture.sourceRoot,
    outDir: fixture.outDir,
    buildId: 'successful-build-one'
  });
  assert.equal(result.outDir, fixture.outDir);
  assert.equal(fs.existsSync(path.join(fixture.outDir, 'old-sentinel.txt')), false);
  assert.deepEqual(temporaryBuildEntries(fixture.outDir), []);

  for (const [asset] of vendorAssets) {
    assert.ok(fs.statSync(path.join(fixture.outDir, asset)).size > 0);
  }
  for (const packageName of ['marked', 'turndown', 'js-yaml', 'papaparse']) {
    assert.ok(
      fs.statSync(path.join(fixture.outDir, 'vendor', packageName, 'LICENSE')).size > 0
    );
  }
  for (const preservedAsset of [
    'vendor/he/he.js',
    'vendor/sax/sax.js',
    'img/keep.js',
    'vendor/custom/tool.js',
    'future-tool-assets/tool.js',
    'templates/template.js'
  ]) {
    assert.ok(fs.statSync(path.join(fixture.outDir, preservedAsset)).size > 0);
  }
  for (const directory of ignoredDirectoryCases) {
    assert.equal(
      fs.existsSync(path.join(fixture.outDir, directory)),
      false,
      `${directory} must stay outside the deployment`
    );
  }
  assert.equal(fs.existsSync(path.join(fixture.outDir, 'node_modules')), false);

  const html = fs.readFileSync(
    path.join(fixture.outDir, 'TextFormatterTool.html'),
    'utf8'
  );
  const expectedScripts = [
    'shared-ui.js',
    ...vendorAssets.map(([asset]) => asset),
    'vendor/he/he.js',
    'vendor/sax/sax.js',
    'text-formatter-core.js',
    'text-codecs.js',
    'text-generators.js',
    'markdown-table.js',
    'text-formatter.js',
    'markdown-table-ui.js'
  ];
  let previousIndex = -1;
  for (const script of expectedScripts) {
    const index = html.indexOf(`src="${script}"`);
    assert.ok(index > previousIndex, `${script} should load in dependency order`);
    previousIndex = index;
  }
  assert.doesNotMatch(html, /https?:\/\/[^"' ]+\.js/i);

  const localScripts = Array.from(
    html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi),
    (match) => match[1]
  );
  for (const script of localScripts) {
    const scriptPath = path.join(fixture.outDir, script);
    assert.ok(fs.existsSync(scriptPath), `${script} should exist in the build`);
    assert.ok(fs.statSync(scriptPath).isFile(), `${script} should be a file`);
    assert.ok(fs.statSync(scriptPath).size > 0, `${script} should be non-empty`);
  }

  const localStylesheets = Array.from(
    html.matchAll(/<link\b[^>]*>/gi),
    (match) => match[0]
  )
    .filter((tag) => /\brel=["']stylesheet["']/i.test(tag))
    .map((tag) => tag.match(/\bhref=["']([^"']+)["']/i)?.[1])
    .filter((href) => href && !/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(href));
  for (const stylesheet of localStylesheets) {
    const stylesheetPath = path.join(fixture.outDir, stylesheet);
    assert.ok(
      fs.existsSync(stylesheetPath),
      `${stylesheet} should exist in the build`
    );
    assert.ok(
      fs.statSync(stylesheetPath).isFile(),
      `${stylesheet} should be a file`
    );
    assert.ok(
      fs.statSync(stylesheetPath).size > 0,
      `${stylesheet} should be non-empty`
    );
  }

  const browser = {
    console,
    setTimeout,
    clearTimeout,
    TextDecoder,
    TextEncoder,
    URL
  };
  browser.window = browser;
  browser.self = browser;
  browser.globalThis = browser;
  vm.createContext(browser);
  for (const [asset] of vendorAssets) {
    vm.runInContext(
      fs.readFileSync(path.join(fixture.outDir, asset), 'utf8'),
      browser,
      { filename: asset }
    );
  }
  assert.equal(typeof browser.marked.parse, 'function');
  assert.equal(typeof browser.TurndownService, 'function');
  assert.equal(typeof browser.jsyaml.load, 'function');
  assert.equal(typeof browser.Papa.parse, 'function');

  const controller = fs.readFileSync(
    path.join(fixture.outDir, 'text-formatter.js'),
    'utf8'
  );
  for (const [, globalName] of vendorAssets) {
    assert.match(controller, new RegExp(`${globalName}:\\s*host\\.${globalName}`));
  }
  for (const [packageName, expectedFiles] of [
    ['marked', ['LICENSE', 'marked.umd.js']],
    ['turndown', ['LICENSE', 'turndown.umd.js']],
    ['js-yaml', ['LICENSE', 'js-yaml.min.js']],
    ['papaparse', ['LICENSE', 'papaparse.min.js']]
  ]) {
    assert.deepEqual(
      filesUnder(path.join(fixture.outDir, 'vendor', packageName)),
      expectedFiles
    );
  }

  const firstFiles = filesUnder(fixture.outDir);
  const firstDigests = Object.fromEntries(
    firstFiles.map((file) => [file, digest(path.join(fixture.outDir, file))])
  );
  writeFixtureFile(fixture.outDir, 'stale.txt', 'remove on next build');
  buildStatic({
    rootDir: fixture.sourceRoot,
    outDir: fixture.outDir,
    buildId: 'successful-build-two'
  });
  assert.deepEqual(filesUnder(fixture.outDir), firstFiles);
  assert.deepEqual(
    Object.fromEntries(
      firstFiles.map((file) => [file, digest(path.join(fixture.outDir, file))])
    ),
    firstDigests
  );
  assert.deepEqual(temporaryBuildEntries(fixture.outDir), []);
});

test('validates every mapped source before touching the old output', (t) => {
  for (const [index, missingSource] of vendorSources.entries()) {
    const fixture = createFixture(t);
    const { buildStatic } = loadBuilder(fixture.fixtureBuildScript);
    writeFixtureFile(fixture.outDir, 'old-sentinel.txt', `old output ${index}`);
    fs.rmSync(path.join(fixture.sourceRoot, missingSource));

    assert.throws(
      () => buildStatic({
        rootDir: fixture.sourceRoot,
        outDir: fixture.outDir,
        buildId: `missing-source-${index}`
      }),
      new RegExp(
        `Missing vendor source: ${missingSource.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`
      )
    );
    assert.equal(
      fs.readFileSync(path.join(fixture.outDir, 'old-sentinel.txt'), 'utf8'),
      `old output ${index}`
    );
    assert.deepEqual(temporaryBuildEntries(fixture.outDir), []);
  }
});

test('rejects temporary path escapes before touching the old output', (t) => {
  const fixture = createFixture(t);
  const { buildStatic } = loadBuilder(fixture.fixtureBuildScript);
  writeFixtureFile(fixture.outDir, 'old-sentinel.txt', 'old output');

  assert.throws(
    () => buildStatic({
      rootDir: fixture.sourceRoot,
      outDir: fixture.outDir,
      buildId: '../outside'
    }),
    /Unsafe build temporary path/
  );
  assert.equal(
    fs.readFileSync(path.join(fixture.outDir, 'old-sentinel.txt'), 'utf8'),
    'old output'
  );
  assert.deepEqual(temporaryBuildEntries(fixture.outDir), []);
});

test('keeps the old output and cleans temporary directories after a copy failure', (t) => {
  const fixture = createFixture(t);
  const { buildStatic } = loadBuilder(fixture.fixtureBuildScript);
  writeFixtureFile(fixture.outDir, 'old-sentinel.txt', 'old output');
  let injected = false;
  const failedSource = path.join(fixture.sourceRoot, 'index.html');
  const fsOps = createFsOps({
    copyFileSync(source, target) {
      if (path.resolve(source) === path.resolve(failedSource)) {
        injected = true;
        throw new Error('injected copy failure');
      }
      fs.copyFileSync(source, target);
    }
  });

  assert.throws(
    () => buildStatic({
      rootDir: fixture.sourceRoot,
      outDir: fixture.outDir,
      buildId: 'copy-failure',
      fsOps
    }),
    /injected copy failure/
  );
  assert.equal(injected, true);
  assert.equal(
    fs.readFileSync(path.join(fixture.outDir, 'old-sentinel.txt'), 'utf8'),
    'old output'
  );
  assert.deepEqual(temporaryBuildEntries(fixture.outDir), []);
});

test('restores the old output when replacing it with staging fails', (t) => {
  const fixture = createFixture(t);
  const { buildStatic } = loadBuilder(fixture.fixtureBuildScript);
  writeFixtureFile(fixture.outDir, 'old-sentinel.txt', 'old output');
  let injected = false;
  const fsOps = createFsOps({
    renameSync(source, target) {
      const isStagingPublish =
        path.resolve(target) === path.resolve(fixture.outDir) &&
        path.basename(source).startsWith(`.${path.basename(fixture.outDir)}-staging-`);
      if (isStagingPublish) {
        injected = true;
        throw new Error('injected replacement failure');
      }
      fs.renameSync(source, target);
    }
  });

  assert.throws(
    () => buildStatic({
      rootDir: fixture.sourceRoot,
      outDir: fixture.outDir,
      buildId: 'replacement-failure',
      fsOps
    }),
    /injected replacement failure/
  );
  assert.equal(injected, true);
  assert.equal(
    fs.readFileSync(path.join(fixture.outDir, 'old-sentinel.txt'), 'utf8'),
    'old output'
  );
  assert.deepEqual(temporaryBuildEntries(fixture.outDir), []);
});

test('executes the default build only through the CLI main guard', (t) => {
  const fixture = createFixture(t);
  const defaultOutDir = path.join(fixture.sourceRoot, 'dist');
  const initialTemporaryEntries = temporaryBuildEntries(defaultOutDir);
  const result = spawnSync(process.execPath, [fixture.fixtureBuildScript], {
    cwd: fixture.sourceRoot,
    encoding: 'utf8'
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Static site built to dist/);
  assert.ok(
    fs.statSync(
      path.join(fixture.sourceRoot, 'dist', 'vendor', 'marked', 'marked.umd.js')
    ).size > 0
  );
  assert.deepEqual(temporaryBuildEntries(defaultOutDir), initialTemporaryEntries);
});

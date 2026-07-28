const fs = require("fs");
const path = require("path");
const { randomUUID } = require("crypto");

const defaultRootDir = path.resolve(__dirname, "..");

const allowedExtensions = new Set([
  ".css",
  ".gif",
  ".html",
  ".ico",
  ".jpg",
  ".jpeg",
  ".js",
  ".json",
  ".map",
  ".png",
  ".svg",
  ".txt",
  ".webmanifest",
  ".webp",
  ".xml"
]);

const allowedSpecialFiles = new Set([
  ".nojekyll",
  "_headers",
  "_redirects"
]);

const ignoredFiles = new Set([
  "package.json",
  "package-lock.json",
  "README.md"
]);

const ignoredDirectories = new Set([
  ".git",
  ".wrangler",
  "dist",
  "node_modules",
  "scripts",
  "tests",
  "docs",
  ".worktrees",
  ".github",
  ".openai",
  "coverage"
]);

const ignoredDirectoryPrefix = /^(?:\.?tmp|\.?temp|\.?backup|\.?bak)(?:[._-]|$)/i;
const atomicBuildDirectoryPrefix = /^\..+-(?:staging|backup)-/i;

const vendorFiles = [
  ["node_modules/marked/lib/marked.umd.js", "vendor/marked/marked.umd.js"],
  ["node_modules/turndown/lib/turndown.browser.umd.js", "vendor/turndown/turndown.umd.js"],
  ["node_modules/js-yaml/dist/browser/js-yaml.umd.min.js", "vendor/js-yaml/js-yaml.min.js"],
  ["node_modules/papaparse/papaparse.min.js", "vendor/papaparse/papaparse.min.js"]
];

const vendorLicenses = [
  ["node_modules/marked/LICENSE", "vendor/marked/LICENSE"],
  ["node_modules/turndown/LICENSE", "vendor/turndown/LICENSE"],
  ["node_modules/js-yaml/LICENSE", "vendor/js-yaml/LICENSE"],
  ["node_modules/papaparse/LICENSE", "vendor/papaparse/LICENSE"]
];

function shouldCopyFile(fileName) {
  if (ignoredFiles.has(fileName)) {
    return false;
  }

  return allowedSpecialFiles.has(fileName) ||
    allowedExtensions.has(path.extname(fileName).toLowerCase());
}

function comparablePath(filePath) {
  const normalized = path.normalize(path.resolve(filePath));
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}

function shouldIgnoreDirectory(directoryName) {
  return ignoredDirectories.has(directoryName) ||
    ignoredDirectoryPrefix.test(directoryName) ||
    atomicBuildDirectoryPrefix.test(directoryName);
}

function copyStaticFiles(fromDir, toDir, options) {
  const { fsOps, excludedPaths } = options;

  for (const entry of fsOps.readdirSync(fromDir, { withFileTypes: true })) {
    const sourcePath = path.join(fromDir, entry.name);
    const targetPath = path.join(toDir, entry.name);

    if (entry.isDirectory()) {
      if (
        shouldIgnoreDirectory(entry.name) ||
        excludedPaths.has(comparablePath(sourcePath))
      ) {
        continue;
      }
      copyStaticFiles(sourcePath, targetPath, options);
      continue;
    }

    if (!entry.isFile() || !shouldCopyFile(entry.name)) {
      continue;
    }

    fsOps.mkdirSync(toDir, { recursive: true });
    fsOps.copyFileSync(sourcePath, targetPath);
  }
}

function copyMappedFiles(files, rootDir, targetDir, fsOps) {
  for (const [source, target] of files) {
    const targetPath = path.join(targetDir, target);
    fsOps.mkdirSync(path.dirname(targetPath), { recursive: true });
    fsOps.copyFileSync(path.join(rootDir, source), targetPath);
  }
}

function validateMappedSources(files, rootDir, fsOps) {
  for (const [source] of files) {
    const sourcePath = path.join(rootDir, source);
    if (!fsOps.existsSync(sourcePath) || !fsOps.statSync(sourcePath).isFile()) {
      throw new Error(`Missing vendor source: ${source}`);
    }
  }
}

function createTemporaryPath(outDir, kind, buildId) {
  const outParent = path.dirname(outDir);
  const prefix = `.${path.basename(outDir)}-${kind}-`;
  const temporaryPath = path.resolve(outParent, `${prefix}${buildId}`);

  if (
    comparablePath(path.dirname(temporaryPath)) !== comparablePath(outParent) ||
    !path.basename(temporaryPath).startsWith(prefix) ||
    comparablePath(temporaryPath) === comparablePath(outDir)
  ) {
    throw new Error(`Unsafe build temporary path: ${temporaryPath}`);
  }

  return temporaryPath;
}

function buildStatic(options = {}) {
  const fsOps = options.fsOps || fs;
  const rootDir = path.resolve(options.rootDir || defaultRootDir);
  const outDir = path.resolve(options.outDir || path.join(rootDir, "dist"));
  const buildId = options.buildId || randomUUID();
  const stagingDir = createTemporaryPath(outDir, "staging", buildId);
  const backupDir = createTemporaryPath(outDir, "backup", buildId);
  const mappedFiles = [...vendorFiles, ...vendorLicenses];

  validateMappedSources(mappedFiles, rootDir, fsOps);

  fsOps.rmSync(stagingDir, { recursive: true, force: true });
  fsOps.rmSync(backupDir, { recursive: true, force: true });
  try {
    fsOps.mkdirSync(stagingDir, { recursive: true });

    const excludedPaths = new Set([
      comparablePath(outDir),
      comparablePath(stagingDir),
      comparablePath(backupDir)
    ]);
    copyStaticFiles(rootDir, stagingDir, { fsOps, excludedPaths });
    copyMappedFiles(vendorFiles, rootDir, stagingDir, fsOps);
    copyMappedFiles(vendorLicenses, rootDir, stagingDir, fsOps);
  } catch (error) {
    fsOps.rmSync(stagingDir, { recursive: true, force: true });
    fsOps.rmSync(backupDir, { recursive: true, force: true });
    throw error;
  }

  const hadPreviousOutput = fsOps.existsSync(outDir);
  try {
    if (hadPreviousOutput) {
      fsOps.renameSync(outDir, backupDir);
    }
    fsOps.renameSync(stagingDir, outDir);
    if (hadPreviousOutput) {
      fsOps.rmSync(backupDir, { recursive: true, force: true });
    }
  } catch (error) {
    if (fsOps.existsSync(backupDir)) {
      fsOps.rmSync(outDir, { recursive: true, force: true });
      fsOps.renameSync(backupDir, outDir);
    }
    fsOps.rmSync(stagingDir, { recursive: true, force: true });
    throw error;
  }

  return { rootDir, outDir };
}

if (require.main === module) {
  try {
    const result = buildStatic();
    console.log(`Static site built to ${path.relative(result.rootDir, result.outDir)}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

module.exports = {
  buildStatic
};

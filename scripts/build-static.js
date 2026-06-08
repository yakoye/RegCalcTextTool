const fs = require("fs");
const path = require("path");

const rootDir = path.resolve(__dirname, "..");
const outDir = path.join(rootDir, "dist");

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
  "scripts"
]);

function shouldCopyFile(fileName) {
  if (ignoredFiles.has(fileName)) {
    return false;
  }

  return allowedSpecialFiles.has(fileName) || allowedExtensions.has(path.extname(fileName).toLowerCase());
}

function copyStaticFiles(fromDir, toDir) {
  for (const entry of fs.readdirSync(fromDir, { withFileTypes: true })) {
    const sourcePath = path.join(fromDir, entry.name);
    const targetPath = path.join(toDir, entry.name);

    if (entry.isDirectory()) {
      if (ignoredDirectories.has(entry.name)) {
        continue;
      }
      copyStaticFiles(sourcePath, targetPath);
      continue;
    }

    if (!entry.isFile() || !shouldCopyFile(entry.name)) {
      continue;
    }

    fs.mkdirSync(toDir, { recursive: true });
    fs.copyFileSync(sourcePath, targetPath);
  }
}

fs.rmSync(outDir, { recursive: true, force: true });
copyStaticFiles(rootDir, outDir);

console.log(`Static site built to ${path.relative(rootDir, outDir)}`);

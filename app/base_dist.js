// Builds the "before" app for logging_exact_test / drift_exact_test: the base commit's app code with the CURRENT engine
// (engine.js, engine_data.json). Those tests prove a feature (full-mix logging, drift notes) changes no call, field for
// field. Pinned to the base commit's whole dist, they failed for every new engine at event 0 on the engine numbers alone
// (audit Nov 27, ruling: re-pin what's provably stale). Swapping in the current engine keeps the property for any engine.
const fs = require("fs"), os = require("os"), path = require("path"), { execFileSync } = require("child_process");

function baseDistWithCurrentEngine(baseRef) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `pc-base-${baseRef}-`));
  const tar = execFileSync("git", ["archive", baseRef, "app"], { cwd: path.join(__dirname, ".."), maxBuffer: 256 << 20 });
  execFileSync("tar", ["-x", "-C", dir], { input: tar, maxBuffer: 256 << 20 });
  for (const f of ["engine.js", "engine_data.json"]) fs.copyFileSync(path.join(__dirname, f), path.join(dir, "app", f));
  execFileSync("python3", [path.join(dir, "app", "build.py")], { cwd: path.join(dir, "app"), stdio: "ignore" });
  return path.join(dir, "app", "dist", "pitch-caller.html");
}

module.exports = { baseDistWithCurrentEngine };

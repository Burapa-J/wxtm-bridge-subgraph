// Runs scripts/deploy-wtari.sh against a throwaway fixture checkout, with
// `graph` and `goldsky` replaced by stubs on PATH. Nothing is built or uploaded.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import {
  chmodSync,
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, test } from "node:test";

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), "deploy-wtari.sh");
const MANIFEST = "network: base-sepolia\n# original manifest\n";
const NETWORKS = {
  base: { wTARIBridge: { address: "0x1111111111111111111111111111111111111111", startBlock: 5 } },
  "base-sepolia": {
    wTARIBridge: { address: "0x2222222222222222222222222222222222222222", startBlock: 7 },
  },
};

// graph stub: records each call, mimics `--network` rewriting the manifest and
// writing build/, and can signal the deploy script ($PPID) mid-build.
const GRAPH_STUB = `#!/bin/sh
echo "graph $* cwd=$PWD" >> "$STUB_LOG"
net=""
prev=""
for a in "$@"; do
  if [ "$prev" = "--network" ]; then net=$a; fi
  prev=$a
done
case "$1" in
  codegen) mkdir -p generated ;;
  build|deploy)
    printf 'network: %s\\n' "$net" > subgraph.wtari.yaml
    mkdir -p build
    echo "$net" > build/net
    if [ -n "\${STUB_SIGNAL:-}" ]; then
      kill -"$STUB_SIGNAL" "$PPID"
      sleep 0.3
    fi
    if [ -n "\${STUB_SLEEP:-}" ]; then sleep "$STUB_SLEEP"; fi
    ;;
esac
exit 0
`;

const GOLDSKY_STUB = `#!/bin/sh
echo "goldsky $* built=$(cat build/net) cwd=$PWD" >> "$STUB_LOG"
`;

let root: string;
let repo: string;
let bin: string;
let tmp: string;

function run(
  args: string[],
  env: Record<string, string> = {},
): Promise<{ code: number | null; signal: NodeJS.Signals | null; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn("sh", [join(repo, "scripts", "deploy-wtari.sh"), ...args], {
      cwd: repo,
      env: {
        ...process.env,
        PATH: `${bin}:${process.env.PATH}`,
        TMPDIR: tmp,
        STUB_LOG: join(root, "calls.log"),
        ...env,
      },
    });
    let stderr = "";
    child.stderr.on("data", (d) => (stderr += d));
    child.on("close", (code, signal) => resolve({ code, signal, stderr }));
  });
}

function calls(): string[] {
  try {
    return readFileSync(join(root, "calls.log"), "utf8").trim().split("\n").filter(Boolean);
  } catch {
    return [];
  }
}

function assertCheckoutUntouched() {
  assert.equal(readFileSync(join(repo, "subgraph.wtari.yaml"), "utf8"), MANIFEST);
  const entries = readdirSync(repo).sort();
  assert.ok(!entries.includes("build"), "build/ written into checkout");
  assert.ok(!entries.includes("generated"), "generated/ written into checkout");
  assert.deepEqual(readdirSync(tmp), [], "workspace not cleaned up");
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "deploy-wtari-test-"));
  repo = join(root, "repo");
  bin = join(root, "bin");
  tmp = join(root, "tmp");
  for (const d of [join(repo, "scripts"), join(repo, "abis"), join(repo, "src"), bin, tmp]) {
    mkdirSync(d, { recursive: true });
  }
  copyFileSync(SCRIPT, join(repo, "scripts", "deploy-wtari.sh"));
  writeFileSync(join(repo, "subgraph.wtari.yaml"), MANIFEST);
  writeFileSync(join(repo, "schema.graphql"), "");
  writeFileSync(join(repo, "abis", "wTARIBridge.json"), "[]");
  writeFileSync(join(repo, "src", "w-tari-bridge.ts"), "");
  writeFileSync(join(repo, "networks.json"), JSON.stringify(NETWORKS));
  writeFileSync(join(bin, "graph"), GRAPH_STUB);
  writeFileSync(join(bin, "goldsky"), GOLDSKY_STUB);
  chmodSync(join(bin, "graph"), 0o755);
  chmodSync(join(bin, "goldsky"), 0o755);
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("deploy-wtari.sh", () => {
  test("goldsky deploy builds and uploads from an isolated workspace", async () => {
    const res = await run(["goldsky", "--network", "base", "--version", "v1"]);
    assert.equal(res.code, 0, res.stderr);
    const log = calls();
    assert.equal(log.length, 3);
    const upload = log[2];
    assert.match(upload, /^goldsky subgraph deploy wtari-bridge-base\/v1 --path build built=base /);
    assert.ok(!upload.includes(`cwd=${repo}`), "uploaded from the checkout");
    assert.ok(upload.includes(`cwd=${tmp}/wtari-deploy.`), upload);
    assertCheckoutUntouched();
  });

  test("studio deploy runs graph deploy in the workspace", async () => {
    const res = await run(["studio", "--network", "base-sepolia", "--version", "v2"]);
    assert.equal(res.code, 0, res.stderr);
    const log = calls();
    assert.match(log[1], /^graph deploy wtari-bridge-base-sepolia subgraph.wtari.yaml .* --network base-sepolia --version-label v2 cwd=/);
    assert.ok(log[1].includes(`cwd=${tmp}/wtari-deploy.`));
    assertCheckoutUntouched();
  });

  for (const [sig, code] of [
    ["TERM", 143],
    ["INT", 130],
    ["HUP", 129],
  ] as const) {
    test(`SIG${sig} during build exits ${code} without uploading`, async () => {
      const res = await run(["goldsky", "--network", "base", "--version", "v1"], {
        STUB_SIGNAL: sig,
      });
      assert.equal(res.code, code, res.stderr);
      assert.match(res.stderr, new RegExp(`received SIG${sig}, aborting before deploy`));
      assert.ok(!calls().some((l) => l.startsWith("goldsky")), "deploy reached after signal");
      assertCheckoutUntouched();
    });
  }

  test("SIGTERM during studio graph deploy exits non-zero", async () => {
    const res = await run(["studio", "--network", "base", "--version", "v1"], {
      STUB_SIGNAL: "TERM",
    });
    assert.equal(res.code, 143, res.stderr);
    assertCheckoutUntouched();
  });

  test("concurrent deploys each upload their own chain's build", async () => {
    // A builds first and is slow to upload; B builds in between. With a shared
    // build/ directory A would upload B's base-sepolia artifact as base.
    const [a, b] = await Promise.all([
      run(["goldsky", "--network", "base", "--version", "v1"], { STUB_SLEEP: "0.8" }),
      new Promise<Awaited<ReturnType<typeof run>>>((resolve) =>
        setTimeout(() => resolve(run(["goldsky", "--network", "base-sepolia", "--version", "v1"])), 200),
      ),
    ]);
    assert.equal(a.code, 0, a.stderr);
    assert.equal(b.code, 0, b.stderr);
    const uploads = calls().filter((l) => l.startsWith("goldsky"));
    assert.equal(uploads.length, 2);
    for (const u of uploads) {
      const m = u.match(/wtari-bridge-([a-z-]+)\/v1 --path build built=([a-z-]+) /);
      assert.ok(m, u);
      assert.equal(m[1], m[2], `uploaded ${m[2]} build as ${m[1]}`);
    }
    assertCheckoutUntouched();
  });

  test("refuses a placeholder network before building", async () => {
    writeFileSync(
      join(repo, "networks.json"),
      JSON.stringify({ base: { wTARIBridge: { address: `0x${"0".repeat(40)}`, startBlock: 0 } } }),
    );
    const res = await run(["goldsky", "--network", "base", "--version", "v1"]);
    assert.equal(res.code, 1);
    assert.deepEqual(calls(), []);
    assertCheckoutUntouched();
  });
});

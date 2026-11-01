#!/bin/sh
# Deploys subgraph.wtari.yaml for one network as wtari-bridge-<network>.
# Usage: deploy-wtari.sh <studio|goldsky> [--] --network <name> [--version <label>]
# --version is required for goldsky; studio prompts for it when omitted.
set -eu

usage() {
  echo "usage: deploy-wtari.sh <studio|goldsky> --network <name> [--version <label>]" >&2
  exit 1
}

if [ $# -lt 1 ]; then
  usage
fi

target=$1
shift
case "$target" in
  studio|goldsky) ;;
  *)
    echo "unknown target: $target (expected studio or goldsky)" >&2
    exit 1
    ;;
esac

network=""
version=""
while [ $# -gt 0 ]; do
  case "$1" in
    --) shift ;;
    --network)
      if [ $# -lt 2 ]; then
        usage
      fi
      case "$2" in
        ""|-*) usage ;;
      esac
      network=$2
      shift 2
      ;;
    --version)
      if [ $# -lt 2 ]; then
        usage
      fi
      case "$2" in
        ""|-*) usage ;;
      esac
      version=$2
      shift 2
      ;;
    *) echo "unknown argument: $1" >&2; exit 1 ;;
  esac
done

if [ -z "$network" ]; then
  usage
fi

if [ "$target" = "goldsky" ] && [ -z "$version" ]; then
  echo "goldsky needs --version <label>" >&2
  exit 1
fi

if [ -n "$version" ]; then
  if ! jq -n -e --arg v "$version" '$v | test("\\A[0-9A-Za-z._-]+\\z")' >/dev/null; then
    echo "invalid version label: $version (expected ASCII alphanumeric, '.', '_', or '-')" >&2
    exit 1
  fi
fi

name="wtari-bridge-$network"

# Refuse placeholder or missing entries; run `pnpm sync-wtari-networks` first.
if ! jq -e --arg n "$network" '
  type == "object" and has($n)
  and ($n | test("\\A[a-z0-9-]+\\z"))
  and (.[$n] | type == "object" and has("wTARIBridge"))
  and (.[$n].wTARIBridge
    | type == "object" and keys == ["address", "startBlock"]
    and (.address | type == "string" and test("\\A0x[0-9a-fA-F]{40}\\z") and (test("\\A0x0{40}\\z") | not))
    and (.startBlock | type == "number" and . > 0 and . <= 9007199254740991 and floor == .))
' networks.json >/dev/null; then
  echo "networks.json: $network needs a wTARIBridge entry with exactly a non-zero 20-byte hex address and an integer startBlock > 0" >&2
  exit 1
fi

manifest_backup=$(mktemp "${TMPDIR:-/tmp}/subgraph.wtari.yaml.XXXXXX")
cp subgraph.wtari.yaml "$manifest_backup"
restore_manifest() {
  cp "$manifest_backup" subgraph.wtari.yaml
  rm -f "$manifest_backup"
}
trap restore_manifest EXIT INT TERM

graph codegen subgraph.wtari.yaml

case "$target" in
  studio)
    if [ -n "$version" ]; then
      graph deploy "$name" subgraph.wtari.yaml --node https://api.studio.thegraph.com/deploy/ --network "$network" --version-label "$version"
    else
      graph deploy "$name" subgraph.wtari.yaml --node https://api.studio.thegraph.com/deploy/ --network "$network"
    fi
    ;;
  goldsky)
    graph build subgraph.wtari.yaml --network "$network"
    goldsky subgraph deploy "$name/$version" --path build
    ;;
esac

// Regenerates the wTARIBridge entries in networks.json from the contracts repo's deployments.json.
// Usage: pnpm sync-wtari-networks [path/to/deployments.json]
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const DEFAULT_DEPLOYMENTS =
  "../wxtm-bridge-contracts/wxtm-bridge-contracts-typechain/deployments/deployments.json";
const NETWORKS_FILE = "networks.json";

// Chain id -> graph network name (as used by `graph deploy --network`).
export const NETWORK_NAMES: { [chainId: string]: string } = {
  "8453": "base",
  "84532": "base-sepolia",
};

function isPlainObject(value: unknown): value is { [key: string]: unknown } {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function isNonZeroAddress(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^0x[0-9a-fA-F]{40}$/.test(value) &&
    !/^0x0{40}$/.test(value)
  );
}

export function syncWtariNetworks(
  deployments: unknown,
  networks: unknown,
  log: (msg: string) => void = console.log
): { [network: string]: unknown } {
  if (!isPlainObject(deployments)) {
    throw new Error("deployments.json must be a JSON object");
  }
  if (!isPlainObject(networks)) {
    throw new Error("networks.json must be a JSON object");
  }

  const updated: { [network: string]: unknown } = { ...networks };

  // Same selection as wtariPackageProblems(): every chain whose entry has any wTARI* key.
  for (const chainId of Object.keys(deployments)) {
    const dep = deployments[chainId];
    if (!isPlainObject(dep)) {
      throw new Error(`Chain ${chainId} entry in deployments.json must be a JSON object`);
    }
    const wtariKeys = Object.keys(dep).filter((key) => key.startsWith("wTARI"));
    if (wtariKeys.length === 0) {
      continue;
    }

    if (!/^[0-9]+$/.test(chainId) || !Object.hasOwn(NETWORK_NAMES, chainId)) {
      throw new Error(`No graph network name for chain ${chainId}; add it to NETWORK_NAMES`);
    }
    const network = NETWORK_NAMES[chainId];
    if (!isNonZeroAddress(dep.wTARI)) {
      throw new Error(
        `Chain ${chainId} has wTARI keys (${wtariKeys.join(", ")}) but no valid non-zero wTARI address (got ${dep.wTARI})`
      );
    }
    const address = dep.wTARIBridge;
    if (!isNonZeroAddress(address)) {
      throw new Error(`Chain ${chainId} has wTARI but no valid non-zero wTARIBridge address (got ${address})`);
    }
    if (address.toLowerCase() === dep.wTARI.toLowerCase()) {
      throw new Error(`Chain ${chainId} wTARIBridge address ${address} must not equal wTARI token address`);
    }
    if (Object.hasOwn(dep, "wTARIBridge_Proxy") && dep.wTARIBridge_Proxy !== address) {
      throw new Error(
        `Chain ${chainId} wTARIBridge (${address}) does not match wTARIBridge_Proxy (${dep.wTARIBridge_Proxy})`
      );
    }
    if (
      Object.hasOwn(dep, "wTARIBridge_Implementation") &&
      (!isNonZeroAddress(dep.wTARIBridge_Implementation) ||
        address.toLowerCase() === dep.wTARIBridge_Implementation.toLowerCase())
    ) {
      throw new Error(
        `Chain ${chainId} wTARIBridge (${address}) must not equal wTARIBridge_Implementation (${dep.wTARIBridge_Implementation})`
      );
    }
    const startBlock = dep.wTARIBridgeStartBlock;
    if (!Number.isSafeInteger(startBlock) || (startBlock as number) <= 0) {
      throw new Error(`Chain ${chainId} has wTARI but wTARIBridgeStartBlock is not > 0 (got ${startBlock})`);
    }

    const existingNetwork = Object.hasOwn(updated, network) ? updated[network] : {};
    if (!isPlainObject(existingNetwork)) {
      throw new Error(`networks.json entry for ${network} must be a JSON object`);
    }

    updated[network] = {
      ...existingNetwork,
      wTARIBridge: { address, startBlock },
    };
    log(`${network}: wTARIBridge ${address} from block ${startBlock}`);
  }

  return updated;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const deploymentsPath = process.argv[2] ?? DEFAULT_DEPLOYMENTS;
  const deployments = JSON.parse(readFileSync(deploymentsPath, "utf8"));
  const networks = JSON.parse(readFileSync(NETWORKS_FILE, "utf8"));
  const updated = syncWtariNetworks(deployments, networks);
  writeFileSync(NETWORKS_FILE, JSON.stringify(updated, null, 2) + "\n");
}

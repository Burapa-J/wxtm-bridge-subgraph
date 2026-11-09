# wxtm-bridge-subgraph

Indexes `TokensUnwrapped` events from the bridge contracts into `TokensUnwrappedRecord` entities (`schema.graphql`).

Two manifests share the schema:

- `subgraph.yaml`: wXTMBridge on Ethereum (`mainnet`). Handler `src/w-xtm-bridge.ts`.
- `subgraph.wtari.yaml`: wTARIBridge, deployed once per EVM registry chain (`base-sepolia`, `base`, ...). Handler `src/w-tari-bridge.ts`.

A subgraph deployment indexes one network. The address and start block per network come from `networks.json`.

## Setup

Use pnpm (the version is pinned in `package.json` `packageManager`); there is no npm or yarn lockfile.

```sh
pnpm install
pnpm codegen && pnpm build                  # wXTM
pnpm codegen:wtari && pnpm build:wtari --network base-sepolia   # wTARI
pnpm test
```

`graph build` / `graph deploy` with `--network` rewrite the network, address and start block in the manifest file. Do not commit that change (`git checkout subgraph.wtari.yaml`).

## wXTM

Studio: `pnpm run deploy` (name `wxtm-bridge`).

Prod runs on Goldsky under the name `wxtm-dev`. At its next redeploy, move it to `wxtm-bridge`.

## wTARI: per-chain deploys

The deployment name is `wtari-bridge-<network>`. The deploy scripts need `jq` and refuse a network whose `networks.json` entry is missing, has the zero address, or has start block 0.

Each deploy copies the manifest, schema, ABIs, mappings and `networks.json` into a fresh temporary directory and runs codegen, build and upload there. The checkout's `subgraph.wtari.yaml` and `build/` are never touched, so concurrent deploys from one checkout cannot publish each other's build. `SIGINT`, `SIGTERM` or `SIGHUP` aborts the script with a non-zero status before the upload step. If the signal arrives while the upload command itself is running, check the remote deployment state before retrying.

```sh
# The Graph Studio (dev). Authenticate first with `pnpm graph auth` (it prompts for the deploy key).
pnpm deploy:wtari:studio -- --network base-sepolia [--version v0.0.1]

# Goldsky (prod). Needs the goldsky CLI, logged in.
pnpm deploy:wtari:goldsky -- --network base --version v0.0.1
```

Record each deployment's query URL as that chain's `subgraphUrl` in `OOTLE_EVM_CHAINS`.

### Placeholder addresses

The `base-sepolia` and `base` wTARIBridge entries in `networks.json` are placeholders (zero address, start block 0) so they build in CI. Run `sync-wtari-networks` before deploying.

### Adding a chain

1. Deploy wTARI on the chain in `wxtm-bridge-contracts`. Its `deployments.json` must have `wTARI`, `wTARIBridge` and `wTARIBridgeStartBlock` for the chain id.
2. If the chain id is new, add its graph network name to `NETWORK_NAMES` in `scripts/sync-wtari-networks.ts`. Check the name in the supported-network lists of The Graph Studio and Goldsky.
3. Regenerate the wTARIBridge entries in `networks.json`:
   ```sh
   pnpm sync-wtari-networks [path/to/deployments.json]
   ```
   The default path is `../wxtm-bridge-contracts/wxtm-bridge-contracts-typechain/deployments/deployments.json`.
4. Review the `networks.json` diff (address and start block against the contracts deployment) and commit it.
5. Deploy with `deploy:wtari:studio` / `deploy:wtari:goldsky` and `--network <name>`.
6. Record the URL as the chain's `subgraphUrl` in `OOTLE_EVM_CHAINS`.

### Retiring a chain

Keep the chain's deployment running until every unwrap row for that chain is terminal. Then delete the deployment.

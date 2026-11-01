import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { syncWtariNetworks } from "./sync-wtari-networks.ts";

const VALID_WTARI = "0x1111111111111111111111111111111111111111";
const VALID_BRIDGE_PROXY = "0x2222222222222222222222222222222222222222";
const VALID_BRIDGE_IMPL = "0x3333333333333333333333333333333333333333";

describe("syncWtariNetworks", () => {
  test("updates wTARIBridge entries for valid wTARI chain deployments", () => {
    const deployments = {
      "1": {
        wXTM: "0xfD36fA88bb3feA8D1264fc89d70723b6a2B56958",
      },
      "84532": {
        wTARI: VALID_WTARI,
        wTARIBridge: VALID_BRIDGE_PROXY,
        wTARIBridge_Proxy: VALID_BRIDGE_PROXY,
        wTARIBridge_Implementation: VALID_BRIDGE_IMPL,
        wTARIBridgeStartBlock: 123456,
      },
    };
    const networks = {
      mainnet: {
        wXTMBridge: {
          address: "0x810be828EFA687667B289C488A57a7B48Fb4523E",
          startBlock: 23332014,
        },
      },
      "base-sepolia": {
        wTARIBridge: {
          address: "0x0000000000000000000000000000000000000000",
          startBlock: 0,
        },
      },
    };

    const logs: string[] = [];
    const updated = syncWtariNetworks(deployments, networks, (msg) => logs.push(msg));
    assert.deepEqual(updated["base-sepolia"], {
      wTARIBridge: {
        address: VALID_BRIDGE_PROXY,
        startBlock: 123456,
      },
    });
    assert.equal(logs.length, 1);
  });

  test("rejects partial wTARI exports where wTARI is missing but wTARIBridge is present", () => {
    const deployments = {
      "84532": {
        wTARIBridge: VALID_BRIDGE_PROXY,
        wTARIBridgeStartBlock: 123456,
      },
    };
    assert.throws(
      () => syncWtariNetworks(deployments, {}),
      /has wTARI keys .* but no valid non-zero wTARI address/
    );
  });

  test("rejects zero-address wTARI or wTARIBridge", () => {
    assert.throws(
      () =>
        syncWtariNetworks(
          {
            "84532": {
              wTARI: "0x0000000000000000000000000000000000000000",
              wTARIBridge: VALID_BRIDGE_PROXY,
              wTARIBridgeStartBlock: 100,
            },
          },
          {}
        ),
      /no valid non-zero wTARI address/
    );
  });

  test("rejects wTARIBridge mismatching wTARIBridge_Proxy or matching wTARIBridge_Implementation", () => {
    assert.throws(
      () =>
        syncWtariNetworks(
          {
            "84532": {
              wTARI: VALID_WTARI,
              wTARIBridge: VALID_BRIDGE_IMPL,
              wTARIBridge_Proxy: VALID_BRIDGE_PROXY,
              wTARIBridgeStartBlock: 100,
            },
          },
          {}
        ),
      /does not match wTARIBridge_Proxy/
    );

    assert.throws(
      () =>
        syncWtariNetworks(
          {
            "84532": {
              wTARI: VALID_WTARI,
              wTARIBridge: VALID_BRIDGE_IMPL,
              wTARIBridge_Implementation: VALID_BRIDGE_IMPL,
              wTARIBridgeStartBlock: 100,
            },
          },
          {}
        ),
      /must not equal wTARIBridge_Implementation/
    );

    assert.throws(
      () =>
        syncWtariNetworks(
          {
            "84532": {
              wTARI: VALID_WTARI,
              wTARIBridge: VALID_WTARI,
              wTARIBridgeStartBlock: 100,
            },
          },
          {}
        ),
      /must not equal wTARI token address/
    );
  });
});

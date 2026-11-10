import {
  assert,
  describe,
  test,
  clearStore,
  afterAll,
} from "matchstick-as/assembly/index";
import { Address, BigInt, ethereum } from "@graphprotocol/graph-ts";
import { handleTokensUnwrapped } from "../src/w-tari-bridge";
import { handleTokensUnwrapped as handleWxtmTokensUnwrapped } from "../src/w-xtm-bridge";
import {
  buildTokensUnwrappedRecordId,
  encodeTokensUnwrappedNotification,
} from "../src/tokens-unwrapped";
import { TokensUnwrappedRecord } from "../generated/schema";
import { createTokensUnwrappedEvent } from "./w-tari-bridge-utils";
import { createTokensUnwrappedEvent as createWxtmTokensUnwrappedEvent } from "./w-xtm-bridge-utils";

describe("wTARI Bridge Entity Assertions", () => {
  afterAll(() => {
    clearStore();
  });

  test("TokensUnwrapped produces one record with contract and transactionData", () => {
    let bridge = Address.fromString("0x2222222222222222222222222222222222222222");
    let from = Address.fromString("0x1234567890123456789012345678901234567890");
    let targetTariAddress = "tari1wtari_target_address";
    let amount = BigInt.fromI32(1000000000);
    let nonce = BigInt.fromI32(42);

    let event = createTokensUnwrappedEvent(from, targetTariAddress, amount, nonce);
    event.address = bridge;

    handleTokensUnwrapped(event);

    assert.entityCount("TokensUnwrappedRecord", 1);

    let id = buildTokensUnwrappedRecordId(
      event.transaction.hash,
      event.logIndex,
      nonce
    );

    assert.fieldEquals("TokensUnwrappedRecord", id, "contract", bridge.toHexString());
    assert.fieldEquals("TokensUnwrappedRecord", id, "nonce", "42");
    assert.fieldEquals("TokensUnwrappedRecord", id, "signature", "TokensUnwrapped");
    assert.fieldEquals(
      "TokensUnwrappedRecord",
      id,
      "transactionHash",
      event.transaction.hash.toHexString()
    );
    assert.fieldEquals(
      "TokensUnwrappedRecord",
      id,
      "logIndex",
      event.logIndex.toString()
    );

    let record = TokensUnwrappedRecord.load(id)!;
    assert.bytesEquals(
      record.transactionData!,
      encodeTokensUnwrappedNotification(from, targetTariAddress, amount)
    );
    let decoded = ethereum
      .decode("((address,string),uint256)", record.transactionData!)!
      .toTuple();
    let sender = decoded[0].toTuple();

    assert.addressEquals(sender[0].toAddress(), from);
    assert.stringEquals(sender[1].toString(), targetTariAddress);
    assert.bigIntEquals(decoded[1].toBigInt(), amount);
  });

  test("wTARI and wXTM handlers produce identical ABI payloads and distinct contract records", () => {
    let wtariBridge = Address.fromString("0x3333333333333333333333333333333333333333");
    let wxtmBridge = Address.fromString("0x4444444444444444444444444444444444444444");
    let from = Address.fromString("0xabcdefabcdefabcdefabcdefabcdefabcdefabcd");
    let targetTariAddress = "tari1shared_handler_parity";
    let amount = BigInt.fromString("18446744073709551615");
    let wtariNonce = BigInt.fromI32(101);
    let wxtmNonce = BigInt.fromI32(102);

    let wtariEvent = createTokensUnwrappedEvent(from, targetTariAddress, amount, wtariNonce);
    wtariEvent.address = wtariBridge;
    wtariEvent.logIndex = BigInt.fromI32(10);

    let wxtmEvent = createWxtmTokensUnwrappedEvent(from, targetTariAddress, amount, wxtmNonce);
    wxtmEvent.address = wxtmBridge;
    wxtmEvent.logIndex = BigInt.fromI32(11);

    handleTokensUnwrapped(wtariEvent);
    handleWxtmTokensUnwrapped(wxtmEvent);

    let wtariId = buildTokensUnwrappedRecordId(
      wtariEvent.transaction.hash,
      wtariEvent.logIndex,
      wtariNonce
    );
    let wxtmId = buildTokensUnwrappedRecordId(
      wxtmEvent.transaction.hash,
      wxtmEvent.logIndex,
      wxtmNonce
    );

    let wtariRecord = TokensUnwrappedRecord.load(wtariId)!;
    let wxtmRecord = TokensUnwrappedRecord.load(wxtmId)!;

    assert.bytesEquals(wtariRecord.transactionData!, wxtmRecord.transactionData!);
    assert.bytesEquals(wtariRecord.contract, wtariBridge);
    assert.bytesEquals(wxtmRecord.contract, wxtmBridge);
  });
});

import { TokensUnwrappedRecord } from "../generated/schema";
import { Address, Bytes, ethereum, BigInt } from "@graphprotocol/graph-ts";

export function buildTokensUnwrappedRecordId(
  transactionHash: Bytes,
  logIndex: BigInt,
  nonce: BigInt
): string {
  return `${transactionHash.toHex()}-${logIndex.toString()}-${nonce.toString()}`;
}

// Shared by the wXTMBridge and wTARIBridge handlers; both emit the same TokensUnwrapped event.
export function saveTokensUnwrappedRecord(
  event: ethereum.Event,
  from: Address,
  targetTariAddress: string,
  amount: BigInt,
  nonce: BigInt
): void {
  const data = encodeTokensUnwrappedNotification(from, targetTariAddress, amount);

  insertTokensUnwrappedRecord(
    event,
    TokensUnwrappedRecordSignature.TokensUnwrapped,
    nonce,
    data
  );
}

function insertTokensUnwrappedRecord(
  event: ethereum.Event,
  transactionDataSignature: TokensUnwrappedRecordSignature,
  nonce: BigInt,
  transactionData: Bytes
): void {
  let tokensUnwrappedRecord = new TokensUnwrappedRecord(
    buildTokensUnwrappedRecordId(event.transaction.hash, event.logIndex, nonce)
  );

  tokensUnwrappedRecord.nonce = nonce;
  tokensUnwrappedRecord.contract = event.address;
  tokensUnwrappedRecord.timestamp = event.block.timestamp;
  tokensUnwrappedRecord.blockHash = event.block.hash;
  tokensUnwrappedRecord.blockNumber = event.block.number;
  tokensUnwrappedRecord.transactionHash = event.transaction.hash;
  tokensUnwrappedRecord.logIndex = event.logIndex;
  tokensUnwrappedRecord.signature = transactionDataSignature;
  tokensUnwrappedRecord.transactionData = transactionData;

  tokensUnwrappedRecord.save();
}

export function encodeTokensUnwrappedNotification(
  from: Address,
  targetTariAddress: string,
  amount: BigInt
): Bytes {
  const fixedSizedArray = ethereum.Value.fromFixedSizedArray([
    ethereum.Value.fromAddress(from),
    ethereum.Value.fromString(targetTariAddress),
  ]);

  const tupleArray: Array<ethereum.Value> = [
    fixedSizedArray,
    ethereum.Value.fromUnsignedBigInt(amount),
  ];
  const tuple = changetype<ethereum.Tuple>(tupleArray);
  const encoded = ethereum.encode(ethereum.Value.fromTuple(tuple))!;

  return encoded;
}

export namespace TokensUnwrappedRecordSignature {
  export const TokensUnwrapped = "TokensUnwrapped";
}

export type TokensUnwrappedRecordSignature = string;

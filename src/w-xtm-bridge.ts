import { TokensUnwrapped as TokensUnwrappedEvent } from "../generated/wXTMBridge/wXTMBridge";
import {
  saveTokensUnwrappedRecord,
  TokensUnwrappedRecordSignature,
} from "./tokens-unwrapped";

export { TokensUnwrappedRecordSignature };

export function handleTokensUnwrapped(event: TokensUnwrappedEvent): void {
  saveTokensUnwrappedRecord(
    event,
    event.params.from,
    event.params.targetTariAddress,
    event.params.amount,
    event.params.nonce
  );
}

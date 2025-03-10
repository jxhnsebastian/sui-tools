import { SuiClient } from "@mysten/sui/client";
import { WalletContextState } from "@suiet/wallet-kit";
import BN from "bn.js";

// We allow at most 8 chars (and at least 2) for symbol
const MAX_SYMBOL_LENGTH = 8;
// How many decimal places at most do we support (defaults 0)
const MAX_DECIMAL_PLACES = 12;
// The max length of the currency name (min 0)
const MAX_NAME_LENGTH = 32;
// The max length of the currency description (min 0)
const MAX_DESCRIPTION_LENGTH = 320;
// If empty, then icon is option None, otherwise should be a URL
const MAX_ICON_LENGTH = 320;

export interface PoolData extends Digest {
  pool: string;
}

export interface Digest {
  digest: string;
  explorer: string;
}

export interface DropParams {
  token: string;
  accounts: DropAccounts[];
}

export interface DropAccounts {
  address: string;
  amount: bigint;
}

export interface SwapParams {
  poolAddress: string;
  amount: BN;
}

export interface MintParams {
  treasury: string;
  coinType: string;
  amount: bigint;
  recipient: string;
}

export interface CreateLiquidityPoolParams {
  baseToken: string;
  quoteToken: string;
  baseTokenAmount: BN;
  quoteTokenAmount: BN;
  feePercent: number;
  minPrice: number;
  maxPrice: number;
}

export interface PublishData {
  digest: string;
  treasuryAddress: string;
  treasuryObjectType: string;
  coinType: string;
  coinAddress: string;
  explorer: string;
}

export interface TreasuryCap {
  address: string;
  innerType: {
    address: string;
    module: string;
    name: string;
  };
}

export interface TokenConfig {
  symbol: string; // 2-8 chars
  decimals: number; // 0-12
  name: string; // 0-32 chars
  description: string; // 0-320 chars
  iconUrl: string; // 0-320 chars
}

async function getTreasuryInfoForToken(
  wallet: WalletContextState,
  digest: string
): Promise<PublishData> {
  try {
    if (
      !wallet.connected ||
      !wallet.account?.address ||
      !wallet.chain?.rpcUrl
    ) {
      throw new Error("Wallet not connected!");
    }

    const client = new SuiClient({
      url: wallet.chain.rpcUrl,
    });

    const treasuryObjects = await client.getTransactionBlock({
      digest,
      options: {
        showEffects: true,
        showInput: true,
        showEvents: true,
        showObjectChanges: true,
      },
    });

    for (const obj of treasuryObjects.effects?.created || []) {
      const objectDetails = await client.getObject({
        id: obj.reference.objectId,
        options: {
          showContent: true,
          showType: true,
        },
      });
      console.log(objectDetails);
      if (
        objectDetails?.data &&
        objectDetails.data.type?.includes("::coin::TreasuryCap<")
      ) {
        console.log(objectDetails);
        return {
          digest,
          treasuryAddress: objectDetails.data.objectId,
          treasuryObjectType: objectDetails.data.type,
          coinType: objectDetails.data.type.match(/<([^>]+)>/)?.[1]!,
          coinAddress: "",
          explorer: `https://suiscan.xyz/${wallet.chain.name.toLowerCase()}/tx/${digest}`,
        };
      }
    }

    throw new Error("No TreasuryCap found in the transaction block");
  } catch (error) {
    console.error("Error retrieving treasury information:", error);
    throw error;
  }
}

function getTreasury(data: PublishData): TreasuryCap {
  try {
    if (!data || !data.treasuryObjectType || !data.treasuryAddress) {
      throw new Error("Missing required fields in publish data.");
    }

    const [address, module, name] = data.treasuryObjectType
      .slice(
        data.treasuryObjectType.indexOf("<") + 1,
        data.treasuryObjectType.length - 1
      )
      .split("::");
    return {
      address: data.treasuryAddress,
      innerType: { address, module, name },
    };
  } catch (error: any) {
    throw new Error("Failed to get treasury details!");
  }
}

/**
 * Generates a Move package bytecode for a new contract that has
 * - symbol chosen by user
 * - module name and witness name derived from the symbol
 * - decimals between 0-12 (defaults to 0)
 * - (opt) currency name
 * - (opt) currency description
 * - (opt) icon url
 */
export function intoBase64(f: TokenConfig) {
  let { decimals, name, symbol, description, iconUrl } = f;

  iconUrl = iconUrl.trim();
  description = description.trim();

  if (description === iconUrl) {
    // icon and description buffers can never be equal to the same value
    // otherwise package verifier goes brrr
    description = description + "\n";
  }

  // determines witness, module and ... symbol!
  const symLen = symbol.length;

  if (symLen < 2 || symLen > MAX_SYMBOL_LENGTH) {
    throw new Error(
      `Symbol must be between 2 and ${MAX_SYMBOL_LENGTH} characters`
    );
  }
  if (!isAscii(symbol)) {
    throw new Error("Symbol must be ASCII only");
  }
  if (name.length > MAX_NAME_LENGTH) {
    throw new Error(`Name length can be at most ${MAX_NAME_LENGTH} characters`);
  }
  if (!isAscii(name)) {
    throw new Error("Name must be ASCII only");
  }
  if (description.length > MAX_DESCRIPTION_LENGTH) {
    throw new Error(
      `Description length can be at most ${MAX_DESCRIPTION_LENGTH} characters`
    );
  }
  if (!isAscii(description)) {
    throw new Error("Description must be ASCII only");
  }
  if (iconUrl.length > MAX_ICON_LENGTH) {
    throw new Error(
      `Icon URL length can be at most ${MAX_ICON_LENGTH} characters`
    );
  }
  if (!isAscii(iconUrl)) {
    throw new Error("Icon URL must be ASCII only");
  }
  if (!Number.isFinite(decimals) || !Number.isInteger(decimals)) {
    throw new Error(
      `Currency decimals must be an integer between 0 and ${MAX_DECIMAL_PLACES}`
    );
  }
  if (decimals < 0 || decimals > MAX_DECIMAL_PLACES) {
    throw new Error(
      `Currency decimals must be between 0 and ${MAX_DECIMAL_PLACES}`
    );
  }

  // a trick! see PGKS var docs
  const pkgBytes = Buffer.from(PGKS[symLen - 2], "base64");

  // a trick! see PGKS var docs
  const replacables = {
    RDECIM: {
      i: findIndex(pkgBytes, "RDECIM"),
      v: "1".repeat(decimals).padEnd(MAX_DECIMAL_PLACES, " "),
    },
    RSYMBL: {
      i: findIndex(pkgBytes, "RSYMBL"),
      v: symbol.padEnd(MAX_SYMBOL_LENGTH, " "),
    },
    RNAMEE: {
      i: findIndex(pkgBytes, "RNAMEE"),
      v: name.padEnd(MAX_NAME_LENGTH, " "),
    },
    RDESCR: {
      i: findIndex(pkgBytes, "RDESCR"),
      v: description.padEnd(MAX_DESCRIPTION_LENGTH, " "),
    },
    RICONN: {
      i: findIndex(pkgBytes, "RICONU"),
      v: iconUrl.padEnd(MAX_ICON_LENGTH, " "),
    },
    witness: {
      i: findIndex(pkgBytes, "A".repeat(symLen)),
      v: symbol.toUpperCase(),
    },
    module: {
      i: findIndex(pkgBytes, "a".repeat(symLen)),
      v: symbol.toLowerCase(),
    },
  };

  for (const [n, { i, v }] of Object.entries(replacables)) {
    if (i === -1) {
      console.error("Index is -1", n, v.length, v);
      throw new Error("Invalid blueprint, please contact devs");
    }

    pkgBytes.set(Buffer.from(v), i);
  }

  return pkgBytes.toString("base64");
}

function isAscii(s: string) {
  return /^[\x00-\x7F]*$/.test(s);
}

// In given byte array, find the index of the first occurrence of the given
// string
function findIndex(inputArray: Buffer, search: string): number {
  const searchArray = Buffer.from(search, "utf8");

  if (searchArray.length === 0) {
    throw new Error("Search string cannot be empty.");
  }

  let foundAtIndex = -1;
  for (
    let readIndex = 0;
    readIndex < inputArray.length - searchArray.length - 1;
    readIndex++
  ) {
    let s = inputArray.subarray(readIndex, readIndex + searchArray.length);
    if (!s.equals(searchArray)) {
      continue;
    }

    foundAtIndex = readIndex;
    break;
  }

  return foundAtIndex;
}

/**
 * A trick!
 *
 * Bytecode for Move packages changes a lot based on the length of buffers and
 * module and struct names.
 *
 * We pregenerated 6 different bytecode packages for different lengths of
 * the module and witness names.
 *
 * The first package is for 2 character long names, the second for 3 character
 * and so on.
 *
 * See the `sui_token` for the source code for these packages.
 *
 * In each bytecode, we allocate a buffer for the different configurable parts
 * of a coin metadata.
 * Each buffer contains starts with a placeholder string, e.g. `RDESCR` for
 * description.
 * Then we search for these in `findIndex` and replace them with the user input.
 *
 * The lengths of buffers are defined in the head of this file, in the `MAX_*`
 * constants.
 */
const PGKS = [
  // 2 chars ("aa") module+witness
  "oRzrCwYAAAAKAQAQAhAmAzZBBHcKBYEBcwf0AfwBCPADYAbQBMwFCpwKBQyhCrcBAAcBCAEQARUC\
    CQIXAhkCGgAAAgABAwcAAgIHAQAAAwMHAAQBDAEAAQQEDAEAAQYFAgAHBgcAAAwAAQAAGAICAAENB\
    gIAAg8BCAEAAhQJCAEAAxYFBgADGwIFAAQKCwwBAgURCQEBDAUSEAEBDAYTDQ4ABw4CBwADBwQHBw\
    oJDwgRAggABwgGAAEKAgkKAgsCAQgHAwoCCgILAgEIBwsEAQgACgIKAgECAQgDAQgBAQgHAQsCAQk\
    AAQkAAQgABwkAAgoCCgIKAgsCAQgHBwgGAgsFAQkACwQBCQABBggGAQUBCwUBCAACCQAFAQsEAQgA\
    AgIGAgJBQQxDb2luTWV0YWRhdGEGT3B0aW9uBlN0cmluZwtUcmVhc3VyeUNhcAlUeENvbnRleHQDV\
    XJsAmFhBWFzY2lpBGNvaW4PY3JlYXRlX2N1cnJlbmN5C2R1bW15X2ZpZWxkBGluaXQKaW50b19ieX\
    RlcxVuZXdfdW5zYWZlX2Zyb21fYnl0ZXMEbm9uZQZvcHRpb24TcHVibGljX3NoYXJlX29iamVjdA9\
    wdWJsaWNfdHJhbnNmZXIGc2VuZGVyBHNvbWUGc3RyaW5nCHRvX2FzY2lpCHRyYW5zZmVyCnRyaW1f\
    cmlnaHQKdHhfY29udGV4dAN1cmwEdXRmOAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA\
    AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA\
    AAAAAAAgoCDQxSREVDSU0gICAgICAKAgkIUlNZTUJMICAKAiEgUk5BTUVFICAgICAgICAgICAgICA\
    gICAgICAgICAgICAKAsICwAJSREVTQ1IgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAg\
    ICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgI\
    CAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC\
    AgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA\
    gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAg\
    ICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAoCwgLAAlJJQ\
    09OVSAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC\
    AgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA\
    gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAg\
    ICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgI\
    CAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC\
    AgICAgICAgICAgICAgICAgICAgICAgICAgICAgAAIBCwEAAAAAAzQHABEBDAIOAkEEDAQHAREBEQY\
    RBRECDAoHAhEBDAkHAxEBDAUHBBEBDAYOBkEEBgAAAAAAAAAAIQQdOAAMAwUhCwYRCzgBDAMLAwwH\
    CwALBDMLCgsJCwULBwoBOAIMCAsBLhEKOAMLCDgEAgEAAAASHDEgDAEOAQwCDgBBBAYAAAAAAAAAA\
    CQEGgUKDgAOAEEEBgEAAAAAAAAAF0IECgIiBBYLAgEFGg0ARQQBBQQLAAIA",
  // 3 chars ("aaa") module+witness
  "oRzrCwYAAAAKAQAQAhAmAzZBBHcKBYEBcwf0Af4BCPIDYAbSBMwFCp4KBQyjCrcBAAcBCAEQARUC\
    CQIXAhkCGgAAAgABAwcAAgIHAQAAAwMHAAQBDAEAAQQEDAEAAQYFAgAHBgcAAAwAAQAAGAICAAENB\
    gIAAg8BCAEAAhQJCAEAAxYFBgADGwIFAAQKCwwBAgURCQEBDAUSEAEBDAYTDQ4ABw4CBwADBwQHBw\
    oJDwgRAggABwgGAAEKAgkKAgsCAQgHAwoCCgILAgEIBwsEAQgACgIKAgECAQgDAQgBAQgHAQsCAQk\
    AAQkAAQgABwkAAgoCCgIKAgsCAQgHBwgGAgsFAQkACwQBCQABBggGAQUBCwUBCAACCQAFAQsEAQgA\
    AgIGAgNBQUEMQ29pbk1ldGFkYXRhBk9wdGlvbgZTdHJpbmcLVHJlYXN1cnlDYXAJVHhDb250ZXh0A\
    1VybANhYWEFYXNjaWkEY29pbg9jcmVhdGVfY3VycmVuY3kLZHVtbXlfZmllbGQEaW5pdAppbnRvX2\
    J5dGVzFW5ld191bnNhZmVfZnJvbV9ieXRlcwRub25lBm9wdGlvbhNwdWJsaWNfc2hhcmVfb2JqZWN\
    0D3B1YmxpY190cmFuc2ZlcgZzZW5kZXIEc29tZQZzdHJpbmcIdG9fYXNjaWkIdHJhbnNmZXIKdHJp\
    bV9yaWdodAp0eF9jb250ZXh0A3VybAR1dGY4AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA\
    AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA\
    AAAAAAAAACCgINDFJERUNJTSAgICAgIAoCCQhSU1lNQkwgIAoCISBSTkFNRUUgICAgICAgICAgICA\
    gICAgICAgICAgICAgIAoCwgLAAlJERVNDUiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAg\
    ICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgI\
    CAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC\
    AgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA\
    gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAg\
    ICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgCgLCAsACU\
    klDT05VICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC\
    AgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA\
    gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAg\
    ICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgI\
    CAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC\
    AgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAAAgELAQAAAAADNAcAEQEMAg4CQQQMBAcBEQE\
    RBhEFEQIMCgcCEQEMCQcDEQEMBQcEEQEMBg4GQQQGAAAAAAAAAAAhBB04AAwDBSELBhELOAEMAwsD\
    DAcLAAsEMwsKCwkLBQsHCgE4AgwICwEuEQo4AwsIOAQCAQAAABIcMSAMAQ4BDAIOAEEEBgAAAAAAA\
    AAAJAQaBQoOAA4AQQQGAQAAAAAAAAAXQgQKAiIEFgsCAQUaDQBFBAEFBAsAAgA=",
  // 4 chars ("aaaa") module+witness
  "oRzrCwYAAAAKAQAQAhAmAzZBBHcKBYEBcwf0AYACCPQDYAbUBMwFCqAKBQylCrcBAAcBCAEQARUC\
    CQIXAhkCGgAAAgABAwcAAgIHAQAAAwMHAAQBDAEAAQQEDAEAAQYFAgAHBgcAAAwAAQAAGAICAAENB\
    gIAAg8BCAEAAhQJCAEAAxYFBgADGwIFAAQKCwwBAgURCQEBDAUSEAEBDAYTDQ4ABw4CBwADBwQHBw\
    oJDwgRAggABwgGAAEKAgkKAgsCAQgHAwoCCgILAgEIBwsEAQgACgIKAgECAQgDAQgBAQgHAQsCAQk\
    AAQkAAQgABwkAAgoCCgIKAgsCAQgHBwgGAgsFAQkACwQBCQABBggGAQUBCwUBCAACCQAFAQsEAQgA\
    AgIGAgRBQUFBDENvaW5NZXRhZGF0YQZPcHRpb24GU3RyaW5nC1RyZWFzdXJ5Q2FwCVR4Q29udGV4d\
    ANVcmwEYWFhYQVhc2NpaQRjb2luD2NyZWF0ZV9jdXJyZW5jeQtkdW1teV9maWVsZARpbml0CmludG\
    9fYnl0ZXMVbmV3X3Vuc2FmZV9mcm9tX2J5dGVzBG5vbmUGb3B0aW9uE3B1YmxpY19zaGFyZV9vYmp\
    lY3QPcHVibGljX3RyYW5zZmVyBnNlbmRlcgRzb21lBnN0cmluZwh0b19hc2NpaQh0cmFuc2Zlcgp0\
    cmltX3JpZ2h0CnR4X2NvbnRleHQDdXJsBHV0ZjgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA\
    AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA\
    AAAAAAAAAAAAIKAg0MUkRFQ0lNICAgICAgCgIJCFJTWU1CTCAgCgIhIFJOQU1FRSAgICAgICAgICA\
    gICAgICAgICAgICAgICAgCgLCAsACUkRFU0NSICAgICAgICAgICAgICAgICAgICAgICAgICAgICAg\
    ICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgI\
    CAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC\
    AgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA\
    gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAg\
    ICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKAsICw\
    AJSSUNPTlUgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC\
    AgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA\
    gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAg\
    ICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgI\
    CAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC\
    AgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAACAQsBAAAAAAM0BwARAQwCDgJBBAwEBwE\
    RAREGEQURAgwKBwIRAQwJBwMRAQwFBwQRAQwGDgZBBAYAAAAAAAAAACEEHTgADAMFIQsGEQs4AQwD\
    CwMMBwsACwQzCwoLCQsFCwcKATgCDAgLAS4RCjgDCwg4BAIBAAAAEhwxIAwBDgEMAg4AQQQGAAAAA\
    AAAAAAkBBoFCg4ADgBBBAYBAAAAAAAAABdCBAoCIgQWCwIBBRoNAEUEAQUECwACAA==",
  // 5 chars ("aaaaa") module+witness
  "oRzrCwYAAAAKAQAQAhAmAzZBBHcKBYEBcwf0AYICCPYDYAbWBMwFCqIKBQynCrcBAAcBCAEQARUC\
    CQIXAhkCGgAAAgABAwcAAgIHAQAAAwMHAAQBDAEAAQQEDAEAAQYFAgAHBgcAAAwAAQAAGAICAAENB\
    gIAAg8BCAEAAhQJCAEAAxYFBgADGwIFAAQKCwwBAgURCQEBDAUSEAEBDAYTDQ4ABw4CBwADBwQHBw\
    oJDwgRAggABwgGAAEKAgkKAgsCAQgHAwoCCgILAgEIBwsEAQgACgIKAgECAQgDAQgBAQgHAQsCAQk\
    AAQkAAQgABwkAAgoCCgIKAgsCAQgHBwgGAgsFAQkACwQBCQABBggGAQUBCwUBCAACCQAFAQsEAQgA\
    AgIGAgVBQUFBQQxDb2luTWV0YWRhdGEGT3B0aW9uBlN0cmluZwtUcmVhc3VyeUNhcAlUeENvbnRle\
    HQDVXJsBWFhYWFhBWFzY2lpBGNvaW4PY3JlYXRlX2N1cnJlbmN5C2R1bW15X2ZpZWxkBGluaXQKaW\
    50b19ieXRlcxVuZXdfdW5zYWZlX2Zyb21fYnl0ZXMEbm9uZQZvcHRpb24TcHVibGljX3NoYXJlX29\
    iamVjdA9wdWJsaWNfdHJhbnNmZXIGc2VuZGVyBHNvbWUGc3RyaW5nCHRvX2FzY2lpCHRyYW5zZmVy\
    CnRyaW1fcmlnaHQKdHhfY29udGV4dAN1cmwEdXRmOAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA\
    AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAA\
    AAAAAAAAAAAAAAAgoCDQxSREVDSU0gICAgICAKAgkIUlNZTUJMICAKAiEgUk5BTUVFICAgICAgICA\
    gICAgICAgICAgICAgICAgICAKAsICwAJSREVTQ1IgICAgICAgICAgICAgICAgICAgICAgICAgICAg\
    ICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgI\
    CAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC\
    AgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA\
    gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAg\
    ICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAoCw\
    gLAAlJJQ09OVSAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC\
    AgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA\
    gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAg\
    ICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgI\
    CAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC\
    AgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgAAIBCwEAAAAAAzQHABEBDAIOAkEEDAQ\
    HAREBEQYRBRECDAoHAhEBDAkHAxEBDAUHBBEBDAYOBkEEBgAAAAAAAAAAIQQdOAAMAwUhCwYRCzgB\
    DAMLAwwHCwALBDMLCgsJCwULBwoBOAIMCAsBLhEKOAMLCDgEAgEAAAASHDEgDAEOAQwCDgBBBAYAA\
    AAAAAAAACQEGgUKDgAOAEEEBgEAAAAAAAAAF0IECgIiBBYLAgEFGg0ARQQBBQQLAAIA",
  // 6 chars ("aaaaaa") module+witness
  "oRzrCwYAAAAKAQAQAhAmAzZBBHcKBYEBcwf0AYQCCPgDYAbYBMwFCqQKBQypCrcBAAcBCAEQARUC\
    CQIXAhkCGgAAAgABAwcAAgIHAQAAAwMHAAQBDAEAAQQEDAEAAQYFAgAHBgcAAAwAAQAAGAICAAENB\
    gIAAg8BCAEAAhQJCAEAAxYFBgADGwIFAAQKCwwBAgURCQEBDAUSEAEBDAYTDQ4ABw4CBwADBwQHBw\
    oJDwgRAggABwgGAAEKAgkKAgsCAQgHAwoCCgILAgEIBwsEAQgACgIKAgECAQgDAQgBAQgHAQsCAQk\
    AAQkAAQgABwkAAgoCCgIKAgsCAQgHBwgGAgsFAQkACwQBCQABBggGAQUBCwUBCAACCQAFAQsEAQgA\
    AgIGAgZBQUFBQUEMQ29pbk1ldGFkYXRhBk9wdGlvbgZTdHJpbmcLVHJlYXN1cnlDYXAJVHhDb250Z\
    Xh0A1VybAZhYWFhYWEFYXNjaWkEY29pbg9jcmVhdGVfY3VycmVuY3kLZHVtbXlfZmllbGQEaW5pdA\
    ppbnRvX2J5dGVzFW5ld191bnNhZmVfZnJvbV9ieXRlcwRub25lBm9wdGlvbhNwdWJsaWNfc2hhcmV\
    fb2JqZWN0D3B1YmxpY190cmFuc2ZlcgZzZW5kZXIEc29tZQZzdHJpbmcIdG9fYXNjaWkIdHJhbnNm\
    ZXIKdHJpbV9yaWdodAp0eF9jb250ZXh0A3VybAR1dGY4AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA\
    AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAA\
    AAAAAAAAAAAAAAAAACCgINDFJERUNJTSAgICAgIAoCCQhSU1lNQkwgIAoCISBSTkFNRUUgICAgICA\
    gICAgICAgICAgICAgICAgICAgIAoCwgLAAlJERVNDUiAgICAgICAgICAgICAgICAgICAgICAgICAg\
    ICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgI\
    CAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC\
    AgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA\
    gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAg\
    ICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgC\
    gLCAsACUklDT05VICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC\
    AgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA\
    gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAg\
    ICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgI\
    CAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC\
    AgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAAAgELAQAAAAADNAcAEQEMAg4CQQQ\
    MBAcBEQERBhEFEQIMCgcCEQEMCQcDEQEMBQcEEQEMBg4GQQQGAAAAAAAAAAAhBB04AAwDBSELBhEL\
    OAEMAwsDDAcLAAsEMwsKCwkLBQsHCgE4AgwICwEuEQo4AwsIOAQCAQAAABIcMSAMAQ4BDAIOAEEEB\
    gAAAAAAAAAAJAQaBQoOAA4AQQQGAQAAAAAAAAAXQgQKAiIEFgsCAQUaDQBFBAEFBAsAAgA=",
  // 7 chars ("aaaaaaa") module+witness
  "oRzrCwYAAAAKAQAQAhAmAzZBBHcKBYEBcwf0AYYCCPoDYAbaBMwFCqYKBQyrCrcBAAcBCAEQARUC\
    CQIXAhkCGgAAAgABAwcAAgIHAQAAAwMHAAQBDAEAAQQEDAEAAQYFAgAHBgcAAAwAAQAAGAICAAENB\
    gIAAg8BCAEAAhQJCAEAAxYFBgADGwIFAAQKCwwBAgURCQEBDAUSEAEBDAYTDQ4ABw4CBwADBwQHBw\
    oJDwgRAggABwgGAAEKAgkKAgsCAQgHAwoCCgILAgEIBwsEAQgACgIKAgECAQgDAQgBAQgHAQsCAQk\
    AAQkAAQgABwkAAgoCCgIKAgsCAQgHBwgGAgsFAQkACwQBCQABBggGAQUBCwUBCAACCQAFAQsEAQgA\
    AgIGAgdBQUFBQUFBDENvaW5NZXRhZGF0YQZPcHRpb24GU3RyaW5nC1RyZWFzdXJ5Q2FwCVR4Q29ud\
    GV4dANVcmwHYWFhYWFhYQVhc2NpaQRjb2luD2NyZWF0ZV9jdXJyZW5jeQtkdW1teV9maWVsZARpbm\
    l0CmludG9fYnl0ZXMVbmV3X3Vuc2FmZV9mcm9tX2J5dGVzBG5vbmUGb3B0aW9uE3B1YmxpY19zaGF\
    yZV9vYmplY3QPcHVibGljX3RyYW5zZmVyBnNlbmRlcgRzb21lBnN0cmluZwh0b19hc2NpaQh0cmFu\
    c2Zlcgp0cmltX3JpZ2h0CnR4X2NvbnRleHQDdXJsBHV0ZjgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA\
    AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAA\
    AAAAAAAAAAAAAAAAAAAAIKAg0MUkRFQ0lNICAgICAgCgIJCFJTWU1CTCAgCgIhIFJOQU1FRSAgICA\
    gICAgICAgICAgICAgICAgICAgICAgCgLCAsACUkRFU0NSICAgICAgICAgICAgICAgICAgICAgICAg\
    ICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgI\
    CAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC\
    AgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA\
    gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAg\
    ICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgI\
    CAKAsICwAJSSUNPTlUgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC\
    AgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA\
    gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAg\
    ICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgI\
    CAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC\
    AgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAACAQsBAAAAAAM0BwARAQwCDgJ\
    BBAwEBwERAREGEQURAgwKBwIRAQwJBwMRAQwFBwQRAQwGDgZBBAYAAAAAAAAAACEEHTgADAMFIQsG\
    EQs4AQwDCwMMBwsACwQzCwoLCQsFCwcKATgCDAgLAS4RCjgDCwg4BAIBAAAAEhwxIAwBDgEMAg4AQ\
    QQGAAAAAAAAAAAkBBoFCg4ADgBBBAYBAAAAAAAAABdCBAoCIgQWCwIBBRoNAEUEAQUECwACAA==",
  // 8 chars ("aaaaaaaa") module+witness
  "oRzrCwYAAAAKAQAQAhAmAzZBBHcKBYEBcwf0AYgCCPwDYAbcBMwFCqgKBQytCrcBAAcBCAEQARUC\
    CQIXAhkCGgAAAgABAwcAAgIHAQAAAwMHAAQBDAEAAQQEDAEAAQYFAgAHBgcAAAwAAQAAGAICAAENB\
    gIAAg8BCAEAAhQJCAEAAxYFBgADGwIFAAQKCwwBAgURCQEBDAUSEAEBDAYTDQ4ABw4CBwADBwQHBw\
    oJDwgRAggABwgGAAEKAgkKAgsCAQgHAwoCCgILAgEIBwsEAQgACgIKAgECAQgDAQgBAQgHAQsCAQk\
    AAQkAAQgABwkAAgoCCgIKAgsCAQgHBwgGAgsFAQkACwQBCQABBggGAQUBCwUBCAACCQAFAQsEAQgA\
    AgIGAghBQUFBQUFBQQxDb2luTWV0YWRhdGEGT3B0aW9uBlN0cmluZwtUcmVhc3VyeUNhcAlUeENvb\
    nRleHQDVXJsCGFhYWFhYWFhBWFzY2lpBGNvaW4PY3JlYXRlX2N1cnJlbmN5C2R1bW15X2ZpZWxkBG\
    luaXQKaW50b19ieXRlcxVuZXdfdW5zYWZlX2Zyb21fYnl0ZXMEbm9uZQZvcHRpb24TcHVibGljX3N\
    oYXJlX29iamVjdA9wdWJsaWNfdHJhbnNmZXIGc2VuZGVyBHNvbWUGc3RyaW5nCHRvX2FzY2lpCHRy\
    YW5zZmVyCnRyaW1fcmlnaHQKdHhfY29udGV4dAN1cmwEdXRmOAAAAAAAAAAAAAAAAAAAAAAAAAAAA\
    AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAA\
    AAAAAAAAAAAAAAAAAAAAAAAgoCDQxSREVDSU0gICAgICAKAgkIUlNZTUJMICAKAiEgUk5BTUVFICA\
    gICAgICAgICAgICAgICAgICAgICAgICAKAsICwAJSREVTQ1IgICAgICAgICAgICAgICAgICAgICAg\
    ICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgI\
    CAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC\
    AgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA\
    gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAg\
    ICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgI\
    CAgIAoCwgLAAlJJQ09OVSAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC\
    AgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA\
    gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAg\
    ICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgI\
    CAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC\
    AgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgAAIBCwEAAAAAAzQHABEBDAI\
    OAkEEDAQHAREBEQYRBRECDAoHAhEBDAkHAxEBDAUHBBEBDAYOBkEEBgAAAAAAAAAAIQQdOAAMAwUh\
    CwYRCzgBDAMLAwwHCwALBDMLCgsJCwULBwoBOAIMCAsBLhEKOAMLCDgEAgEAAAASHDEgDAEOAQwCD\
    gBBBAYAAAAAAAAAACQEGgUKDgAOAEEEBgEAAAAAAAAAF0IECgIiBBYLAgEFGg0ARQQBBQQLAAIA",
];

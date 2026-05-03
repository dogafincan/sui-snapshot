import {
  SuiGraphQLClient,
  type GraphQLDocument,
  type GraphQLQueryOptions,
  type GraphQLQueryResult,
} from "@mysten/sui/graphql";
import { graphql, type ResultOf, type VariablesOf } from "@mysten/sui/graphql/schema";

import {
  normalizeSuiAddress,
  type SnapshotAssetKind,
  type SnapshotPageBatchInput,
  type SnapshotPageBatchResult,
} from "@/lib/sui-snapshot";

const DEFAULT_ENDPOINT = "https://graphql.mainnet.sui.io/graphql";
const REQUEST_TIMEOUT_MS = 45_000;
const COIN_PAGE_SIZE = 50;
const OBJECT_PAGE_SIZE = 10;
const WORKERS_FREE_SUBREQUEST_LIMIT = 50;
const RETRY_SUBREQUEST_HEADROOM = 10;
const COIN_METADATA_SUBREQUESTS = 1;
const OWNER_RESOLUTION_DEPTH = 3;
const KIOSK_CREATION_TRANSACTION_BATCH_SIZE = 10;
const PERSONAL_KIOSK_OWNER_MARKER_TYPE =
  "0x0cb4bcc0560340eb1a1b929cabe56b33fc6449820ec8c1980d69bb98b649b802::personal_kiosk::OwnerMarker";
const PERSONAL_KIOSK_OWNER_MARKER_BCS = "AA==";
const KIOSK_TYPE_SUFFIX = "::kiosk::Kiosk";
const KIOSK_OWNER_CAP_TYPE_SUFFIX = "::kiosk::KioskOwnerCap";
const TRANSIENT_HTTP_STATUS_CODES = new Set([429, 500, 502, 503, 504]);
const MAX_TRANSIENT_RETRIES = 3;
const BASE_RETRY_DELAY_MS = 250;
const RETRY_JITTER_RATIO = 0.5;

const COIN_METADATA_QUERY = graphql(`
  query CoinMetadata($coinType: String!) {
    coinMetadata(coinType: $coinType) {
      decimals
    }
  }
`);

const OBJECTS_QUERY = graphql(`
  query Snapshot($type: String!, $first: Int!, $after: String) {
    objects(first: $first, after: $after, filter: { type: $type }) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        owner {
          __typename
          ... on AddressOwner {
            address {
              address
            }
          }
          ... on ConsensusAddressOwner {
            address {
              address
            }
          }
          ... on ObjectOwner {
            address {
              address
            }
          }
          ... on Shared {
            initialSharedVersion
          }
          ... on Immutable {
            _
          }
        }
        asMoveObject {
          contents {
            json
          }
        }
      }
    }
  }
`);

const OWNER_OBJECTS_QUERY = graphql(`
  query SnapshotObjectOwners(
    $keys: [ObjectKey!]!
    $personalKioskOwnerMarkerType: String!
    $personalKioskOwnerMarkerBcs: Base64!
  ) {
    multiGetObjects(keys: $keys) {
      address
      owner {
        __typename
        ... on AddressOwner {
          address {
            address
          }
        }
        ... on ConsensusAddressOwner {
          address {
            address
          }
        }
        ... on ObjectOwner {
          address {
            address
          }
        }
        ... on Shared {
          initialSharedVersion
        }
        ... on Immutable {
          _
        }
      }
      asMoveObject {
        contents {
          type {
            repr
          }
          json
        }
      }
      personalKioskOwnerMarker: dynamicField(
        name: { type: $personalKioskOwnerMarkerType, bcs: $personalKioskOwnerMarkerBcs }
      ) {
        value {
          __typename
          ... on MoveValue {
            json
            type {
              repr
            }
          }
        }
      }
    }
  }
`);

const KIOSK_OWNER_CAPS_QUERY = graphql(`
  query SnapshotKioskOwnerCaps($digest: String!, $after: String) {
    transactionEffects(digest: $digest) {
      objectChanges(first: 100, after: $after) {
        pageInfo {
          hasNextPage
          endCursor
        }
        nodes {
          address
          inputState {
            address
            owner {
              __typename
              ... on AddressOwner {
                address {
                  address
                }
              }
              ... on ConsensusAddressOwner {
                address {
                  address
                }
              }
              ... on ObjectOwner {
                address {
                  address
                }
              }
              ... on Shared {
                initialSharedVersion
              }
              ... on Immutable {
                _
              }
            }
            asMoveObject {
              contents {
                type {
                  repr
                }
                json
              }
            }
          }
          outputState {
            address
            owner {
              __typename
              ... on AddressOwner {
                address {
                  address
                }
              }
              ... on ConsensusAddressOwner {
                address {
                  address
                }
              }
              ... on ObjectOwner {
                address {
                  address
                }
              }
              ... on Shared {
                initialSharedVersion
              }
              ... on Immutable {
                _
              }
            }
            asMoveObject {
              contents {
                type {
                  repr
                }
                json
              }
            }
          }
        }
      }
    }
  }
`);

interface CloudflareEnv {
  SUI_GRAPHQL_ENDPOINT?: string;
  SUI_GRAPHQL_MAX_SUBREQUESTS?: string;
  SUI_GRAPHQL_RETRY_HEADROOM?: string;
}

interface GraphQLRuntimeConfig {
  endpoint: string;
  maxSubrequests: number;
  retryHeadroom: number;
}

type CoinMetadataResponse = ResultOf<typeof COIN_METADATA_QUERY>;
type ObjectsResponse = ResultOf<typeof OBJECTS_QUERY>;
type OwnerObjectsResponse = ResultOf<typeof OWNER_OBJECTS_QUERY>;
type KioskOwnerCapsResponse = ResultOf<typeof KIOSK_OWNER_CAPS_QUERY>;
type MoveJsonBalance = { balance?: number | string | null };
type MoveJsonKioskOwnerCap = { for?: string | null };

export function getSnapshotBatchPageBudget({
  hasCarriedDecimals,
  assetKind = "coin",
  maxSubrequests = WORKERS_FREE_SUBREQUEST_LIMIT,
  retryHeadroom = RETRY_SUBREQUEST_HEADROOM,
}: {
  hasCarriedDecimals: boolean;
  assetKind?: SnapshotAssetKind;
  maxSubrequests?: number;
  retryHeadroom?: number;
}) {
  if (assetKind === "object") {
    return 1;
  }

  const metadataSubrequests = hasCarriedDecimals ? 0 : COIN_METADATA_SUBREQUESTS;
  const availableSubrequests = maxSubrequests - retryHeadroom - metadataSubrequests;
  return Math.max(1, availableSubrequests);
}

function isTransientHttpStatus(status: number) {
  return TRANSIENT_HTTP_STATUS_CODES.has(status);
}

function addRetryJitter(ms: number) {
  if (ms <= 0) {
    return 0;
  }

  return ms + Math.random() * ms * RETRY_JITTER_RATIO;
}

function readRetryDelay(response: Response, attempt: number) {
  const retryAfter = response.headers.get("retry-after");

  if (retryAfter) {
    const retryAfterSeconds = Number.parseFloat(retryAfter);
    if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds >= 0) {
      return retryAfterSeconds * 1000;
    }

    const retryAfterDate = Date.parse(retryAfter);
    if (Number.isFinite(retryAfterDate)) {
      return Math.max(retryAfterDate - Date.now(), 0);
    }
  }

  return addRetryJitter(BASE_RETRY_DELAY_MS * 2 ** attempt);
}

function readNetworkRetryDelay(attempt: number) {
  return addRetryJitter(BASE_RETRY_DELAY_MS * 2 ** attempt);
}

function isAbortError(error: unknown) {
  return error instanceof Error && error.name === "AbortError";
}

function buildNetworkRequestError(error: unknown) {
  const requestError = new Error("Sui GraphQL request failed due to a network error.");
  requestError.cause = error;
  return requestError;
}

async function cancelResponseBody(response: Response) {
  try {
    await response.body?.cancel();
  } catch {
    // Best-effort cleanup before retrying transient responses.
  }
}

async function waitForRetry(ms: number, signal: AbortSignal) {
  if (ms <= 0) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      signal.removeEventListener("abort", handleAbort);
      resolve();
    }, ms);

    function handleAbort() {
      clearTimeout(timeout);
      signal.removeEventListener("abort", handleAbort);
      reject(new DOMException("The operation was aborted.", "AbortError"));
    }

    if (signal.aborted) {
      handleAbort();
      return;
    }

    signal.addEventListener("abort", handleAbort, { once: true });
  });
}

function readIntegerConfigValue(value: string | undefined, fallback: number, min: number) {
  if (!value?.trim()) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= min ? parsed : fallback;
}

async function resolveCloudflareEnv() {
  try {
    const cloudflare = (await import("cloudflare:workers")) as {
      env?: CloudflareEnv;
    };

    return cloudflare.env;
  } catch {
    // Tests and non-Worker tooling resolve optional endpoint overrides below.
  }

  return undefined;
}

async function resolveGraphQLRuntimeConfig(): Promise<GraphQLRuntimeConfig> {
  const cloudflareEnv = await resolveCloudflareEnv();
  const endpoint =
    cloudflareEnv?.SUI_GRAPHQL_ENDPOINT?.trim() ||
    process.env.SUI_GRAPHQL_ENDPOINT?.trim() ||
    DEFAULT_ENDPOINT;

  return {
    endpoint,
    maxSubrequests: readIntegerConfigValue(
      cloudflareEnv?.SUI_GRAPHQL_MAX_SUBREQUESTS ?? process.env.SUI_GRAPHQL_MAX_SUBREQUESTS,
      WORKERS_FREE_SUBREQUEST_LIMIT,
      1,
    ),
    retryHeadroom: readIntegerConfigValue(
      cloudflareEnv?.SUI_GRAPHQL_RETRY_HEADROOM ?? process.env.SUI_GRAPHQL_RETRY_HEADROOM,
      RETRY_SUBREQUEST_HEADROOM,
      0,
    ),
  };
}

function createRetryingFetch(): typeof fetch {
  return async function retryingFetch(input, init) {
    const signal = init?.signal instanceof AbortSignal ? init.signal : undefined;
    const retrySignal = signal ?? new AbortController().signal;
    let response: Response | null = null;

    for (let attempt = 0; ; attempt += 1) {
      try {
        response = await fetch(input, init);
      } catch (error) {
        if (signal?.aborted || isAbortError(error)) {
          throw error;
        }

        if (attempt >= MAX_TRANSIENT_RETRIES) {
          throw buildNetworkRequestError(error);
        }

        await waitForRetry(readNetworkRetryDelay(attempt), retrySignal);
        continue;
      }

      if (
        response.ok ||
        !isTransientHttpStatus(response.status) ||
        attempt >= MAX_TRANSIENT_RETRIES
      ) {
        break;
      }

      await cancelResponseBody(response);
      await waitForRetry(readRetryDelay(response, attempt), retrySignal);
    }

    if (!response) {
      throw new Error("Sui GraphQL request failed before receiving a response.");
    }

    if (!response.ok) {
      await cancelResponseBody(response);
      throw new Error(`Sui GraphQL request failed with HTTP ${response.status}.`);
    }

    return response;
  };
}

function createSuiGraphQLClient(endpoint: string) {
  return new SuiGraphQLClient({
    url: endpoint,
    network: "mainnet",
    fetch: createRetryingFetch(),
  });
}

async function querySuiGraphQL<Result, Variables extends Record<string, unknown>>(
  client: SuiGraphQLClient,
  query: GraphQLDocument<Result, Variables>,
  variables: Variables,
  operationName: string,
  signal: AbortSignal,
): Promise<NonNullable<GraphQLQueryResult<Result>["data"]>> {
  const options = {
    query,
    variables,
    operationName,
    signal,
  } as unknown as GraphQLQueryOptions<Result, Variables>;
  const payload = await client.query<Result, Variables>(options);

  if (payload.errors?.length) {
    const message =
      payload.errors.find((error) => error.message)?.message ??
      "Sui GraphQL returned an unknown error.";
    throw new Error(message);
  }

  if (!payload.data) {
    throw new Error("Missing data in GraphQL response.");
  }

  return payload.data;
}

async function fetchCoinDecimals(
  client: SuiGraphQLClient,
  coinAddress: string,
  signal: AbortSignal,
) {
  const metadata = await querySuiGraphQL<
    CoinMetadataResponse,
    VariablesOf<typeof COIN_METADATA_QUERY>
  >(
    client,
    COIN_METADATA_QUERY,
    {
      coinType: coinAddress,
    },
    "CoinMetadata",
    signal,
  );

  const decimals = metadata.coinMetadata?.decimals;
  return typeof decimals === "number" && Number.isInteger(decimals) && decimals >= 0
    ? decimals
    : null;
}

function getSnapshotObjectType(assetKind: SnapshotAssetKind, coinAddress: string) {
  return assetKind === "coin" ? `0x2::coin::Coin<${coinAddress}>` : coinAddress;
}

function getSnapshotPageSize(assetKind: SnapshotAssetKind) {
  return assetKind === "coin" ? COIN_PAGE_SIZE : OBJECT_PAGE_SIZE;
}

function fetchObjectsPage(
  client: SuiGraphQLClient,
  objectType: string,
  first: number,
  cursor: string | null,
  signal: AbortSignal,
) {
  return querySuiGraphQL<ObjectsResponse, VariablesOf<typeof OBJECTS_QUERY>>(
    client,
    OBJECTS_QUERY,
    {
      type: objectType,
      first,
      after: cursor,
    },
    "Snapshot",
    signal,
  );
}

function fetchOwnerObjectsPage(client: SuiGraphQLClient, addresses: string[], signal: AbortSignal) {
  return querySuiGraphQL<OwnerObjectsResponse, VariablesOf<typeof OWNER_OBJECTS_QUERY>>(
    client,
    OWNER_OBJECTS_QUERY,
    {
      keys: addresses.map((address) => ({ address })),
      personalKioskOwnerMarkerType: PERSONAL_KIOSK_OWNER_MARKER_TYPE,
      personalKioskOwnerMarkerBcs: PERSONAL_KIOSK_OWNER_MARKER_BCS,
    },
    "SnapshotObjectOwners",
    signal,
  );
}

interface KioskCreationTransactionNode {
  objectAt?: {
    previousTransaction?: {
      digest?: string | null;
    } | null;
  } | null;
}

type KioskCreationTransactionsResponse = Record<string, KioskCreationTransactionNode | null>;

function chunkArray<T>(items: T[], size: number) {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}

async function fetchKioskCreationTransactions(
  client: SuiGraphQLClient,
  kiosks: Array<{ address: string; initialSharedVersion: number }>,
  signal: AbortSignal,
) {
  const creationTransactions = new Map<string, string>();

  for (const kioskChunk of chunkArray(kiosks, KIOSK_CREATION_TRANSACTION_BATCH_SIZE)) {
    const variableDefinitions: string[] = [];
    const fields: string[] = [];
    const variables: Record<string, string | number> = {};

    kioskChunk.forEach((kiosk, index) => {
      const addressVariable = `address${index}`;
      const versionVariable = `version${index}`;
      variableDefinitions.push(`$${addressVariable}: SuiAddress!`, `$${versionVariable}: UInt53!`);
      variables[addressVariable] = kiosk.address;
      variables[versionVariable] = kiosk.initialSharedVersion;
      fields.push(`
        kiosk${index}: object(address: $${addressVariable}) {
          objectAt(version: $${versionVariable}) {
            previousTransaction {
              digest
            }
          }
        }
      `);
    });

    const query = `
      query SnapshotKioskCreationTransactions(${variableDefinitions.join(", ")}) {
        ${fields.join("\n")}
      }
    ` as unknown as GraphQLDocument<KioskCreationTransactionsResponse, Record<string, unknown>>;

    const data = await querySuiGraphQL<KioskCreationTransactionsResponse, Record<string, unknown>>(
      client,
      query,
      variables,
      "SnapshotKioskCreationTransactions",
      signal,
    );

    kioskChunk.forEach((kiosk, index) => {
      const digest = data[`kiosk${index}`]?.objectAt?.previousTransaction?.digest;
      if (digest) {
        creationTransactions.set(kiosk.address, digest);
      }
    });
  }

  return creationTransactions;
}

function fetchKioskOwnerCapsPage(
  client: SuiGraphQLClient,
  digest: string,
  cursor: string | null,
  signal: AbortSignal,
) {
  return querySuiGraphQL<KioskOwnerCapsResponse, VariablesOf<typeof KIOSK_OWNER_CAPS_QUERY>>(
    client,
    KIOSK_OWNER_CAPS_QUERY,
    {
      digest,
      after: cursor,
    },
    "SnapshotKioskOwnerCaps",
    signal,
  );
}

async function resolveSnapshotAsset(
  client: SuiGraphQLClient,
  input: SnapshotPageBatchInput,
  signal: AbortSignal,
): Promise<{ assetKind: SnapshotAssetKind; decimals: number }> {
  if (input.assetKind === "object") {
    return { assetKind: "object", decimals: 0 };
  }

  if (input.decimals != null) {
    return { assetKind: "coin", decimals: input.decimals };
  }

  const decimals = await fetchCoinDecimals(client, input.coinAddress, signal);

  if (decimals === null) {
    return { assetKind: "object", decimals: 0 };
  }

  return { assetKind: "coin", decimals };
}

type ObjectNode = NonNullable<NonNullable<ObjectsResponse["objects"]>["nodes"]>[number];
type OwnerObjectNode = NonNullable<NonNullable<OwnerObjectsResponse["multiGetObjects"]>[number]>;
type KioskOwnerCapChangeNode = NonNullable<
  NonNullable<NonNullable<KioskOwnerCapsResponse["transactionEffects"]>["objectChanges"]>["nodes"]
>[number];
type SnapshotOwner = NonNullable<ObjectNode["owner"]> | NonNullable<OwnerObjectNode["owner"]>;
type MoveObjectContainer = {
  asMoveObject?: {
    contents?: {
      type?: {
        repr?: string | null;
      } | null;
      json?: unknown;
    } | null;
  } | null;
};

function readAddressOwner(owner: SnapshotOwner | null | undefined) {
  if (!owner || !("address" in owner)) {
    return null;
  }

  if (owner.__typename !== "AddressOwner" && owner.__typename !== "ConsensusAddressOwner") {
    return null;
  }

  return owner.address?.address ? normalizeSuiAddress(owner.address.address) : null;
}

function readObjectOwnerAddress(owner: SnapshotOwner | null | undefined) {
  if (!owner || owner.__typename !== "ObjectOwner" || !("address" in owner)) {
    return null;
  }

  return owner.address?.address ? normalizeSuiAddress(owner.address.address) : null;
}

function readMoveObjectType(node: MoveObjectContainer) {
  return node.asMoveObject?.contents?.type?.repr ?? null;
}

function readMoveObjectAddress(node: { address?: string | null }) {
  return node.address ? normalizeSuiAddress(node.address) : null;
}

function isKioskObject(node: MoveObjectContainer) {
  return readMoveObjectType(node)?.endsWith(KIOSK_TYPE_SUFFIX) ?? false;
}

function isKioskOwnerCapObject(node: MoveObjectContainer) {
  return readMoveObjectType(node)?.endsWith(KIOSK_OWNER_CAP_TYPE_SUFFIX) ?? false;
}

function readPersonalKioskOwner(node: OwnerObjectNode) {
  const marker = node.personalKioskOwnerMarker?.value;

  if (marker?.__typename !== "MoveValue") {
    return null;
  }

  if (marker.type?.repr !== "address" || typeof marker.json !== "string") {
    return null;
  }

  return normalizeSuiAddress(marker.json);
}

function readSharedKiosk(node: OwnerObjectNode) {
  if (node.owner?.__typename !== "Shared") {
    return null;
  }

  if (!isKioskObject(node)) {
    return null;
  }

  const address = readMoveObjectAddress(node);
  const { initialSharedVersion } = node.owner;

  if (
    !address ||
    typeof initialSharedVersion !== "number" ||
    !Number.isInteger(initialSharedVersion)
  ) {
    return null;
  }

  return { address, initialSharedVersion };
}

function readKioskOwnerCapKioskAddress(node: MoveObjectContainer) {
  if (!isKioskOwnerCapObject(node)) {
    return null;
  }

  const kioskAddress = (node.asMoveObject?.contents?.json as MoveJsonKioskOwnerCap | undefined)
    ?.for;

  return typeof kioskAddress === "string" ? normalizeSuiAddress(kioskAddress) : null;
}

function readKioskOwnerCapChangeState(change: KioskOwnerCapChangeNode) {
  return change.outputState ?? change.inputState ?? null;
}

async function fetchKioskOwnerCapAddressesFromTransactions(
  client: SuiGraphQLClient,
  transactionDigests: string[],
  targetKioskAddresses: Set<string>,
  signal: AbortSignal,
) {
  const capAddressesByKiosk = new Map<string, string>();

  for (const digest of new Set(transactionDigests)) {
    let cursor: string | null = null;

    while (true) {
      const data = await fetchKioskOwnerCapsPage(client, digest, cursor, signal);
      const connection = data.transactionEffects?.objectChanges;
      if (!connection) {
        throw new Error("Missing transactionEffects.objectChanges in GraphQL response.");
      }

      for (const change of connection.nodes ?? []) {
        const state = readKioskOwnerCapChangeState(change);
        if (!state) {
          continue;
        }

        const kioskAddress = readKioskOwnerCapKioskAddress(state);
        if (!kioskAddress || !targetKioskAddresses.has(kioskAddress)) {
          continue;
        }

        const capAddress = readMoveObjectAddress(state) ?? readMoveObjectAddress(change);
        if (!capAddress) {
          continue;
        }

        capAddressesByKiosk.set(kioskAddress, capAddress);
      }

      if (!connection.pageInfo?.hasNextPage) {
        break;
      }

      cursor = connection.pageInfo.endCursor ?? null;
      if (!cursor) {
        throw new Error("Missing objectChanges.pageInfo.endCursor while more results remain.");
      }
    }
  }

  return capAddressesByKiosk;
}

async function resolveStandardKioskOwners(
  client: SuiGraphQLClient,
  kiosks: Array<{ address: string; initialSharedVersion: number }>,
  signal: AbortSignal,
) {
  const kioskOwners = new Map<string, string>();
  const uniqueKiosks = Array.from(new Map(kiosks.map((kiosk) => [kiosk.address, kiosk])).values());
  const creationTransactions = await fetchKioskCreationTransactions(client, uniqueKiosks, signal);
  const targetKioskAddresses = new Set(uniqueKiosks.map((kiosk) => kiosk.address));
  const capAddressesByKiosk = await fetchKioskOwnerCapAddressesFromTransactions(
    client,
    Array.from(creationTransactions.values()),
    targetKioskAddresses,
    signal,
  );
  const capAddresses = Array.from(new Set(capAddressesByKiosk.values()));

  if (capAddresses.length === 0) {
    return kioskOwners;
  }

  const capObjects = await fetchOwnerObjectsPage(client, capAddresses, signal);
  for (const capObject of capObjects.multiGetObjects ?? []) {
    if (!capObject) {
      continue;
    }

    const capAddress = readMoveObjectAddress(capObject);
    const kioskAddress = readKioskOwnerCapKioskAddress(capObject);
    const ownerAddress = readAddressOwner(capObject.owner);

    if (!capAddress || !kioskAddress || !ownerAddress) {
      continue;
    }

    if (capAddressesByKiosk.get(kioskAddress) !== capAddress) {
      continue;
    }

    kioskOwners.set(kioskAddress, ownerAddress);
  }

  return kioskOwners;
}

function addPendingOwner(
  pending: Map<string, Set<string>>,
  currentObjectAddress: string,
  originalObjectAddresses: Iterable<string>,
) {
  const normalizedCurrentObjectAddress = normalizeSuiAddress(currentObjectAddress);
  const existing = pending.get(normalizedCurrentObjectAddress) ?? new Set<string>();

  for (const originalObjectAddress of originalObjectAddresses) {
    existing.add(normalizeSuiAddress(originalObjectAddress));
  }

  pending.set(normalizedCurrentObjectAddress, existing);
}

async function resolveObjectOwnerAddresses(
  client: SuiGraphQLClient,
  objectOwnerAddresses: string[],
  signal: AbortSignal,
) {
  const resolved = new Map<string, string>();
  let pending = new Map<string, Set<string>>();

  for (const objectOwnerAddress of objectOwnerAddresses) {
    addPendingOwner(pending, objectOwnerAddress, [objectOwnerAddress]);
  }

  for (let depth = 0; pending.size > 0 && depth < OWNER_RESOLUTION_DEPTH; depth += 1) {
    const currentAddresses = Array.from(pending.keys());
    const currentOrigins = pending;
    const nextPending = new Map<string, Set<string>>();
    const standardKiosks = new Map<string, { address: string; initialSharedVersion: number }>();
    const standardKioskOrigins = new Map<string, Set<string>>();
    const ownerObjects = await fetchOwnerObjectsPage(client, currentAddresses, signal);

    for (const ownerObject of ownerObjects.multiGetObjects ?? []) {
      if (!ownerObject?.address) {
        continue;
      }

      const currentAddress = normalizeSuiAddress(ownerObject.address);
      const origins = currentOrigins.get(currentAddress);
      if (!origins) {
        continue;
      }

      const directOwner = readAddressOwner(ownerObject.owner);

      if (directOwner) {
        for (const origin of origins) {
          resolved.set(origin, directOwner);
        }
        continue;
      }

      const sharedKiosk = readSharedKiosk(ownerObject);
      if (sharedKiosk) {
        const personalKioskOwner = readPersonalKioskOwner(ownerObject);
        if (personalKioskOwner) {
          for (const origin of origins) {
            resolved.set(origin, personalKioskOwner);
          }
          continue;
        }

        standardKiosks.set(sharedKiosk.address, sharedKiosk);
        const existingOrigins = standardKioskOrigins.get(sharedKiosk.address) ?? new Set<string>();
        for (const origin of origins) {
          existingOrigins.add(origin);
        }
        standardKioskOrigins.set(sharedKiosk.address, existingOrigins);
        continue;
      }

      const nextObjectOwner = readObjectOwnerAddress(ownerObject.owner);
      if (nextObjectOwner) {
        addPendingOwner(nextPending, nextObjectOwner, origins);
      }
    }

    if (standardKiosks.size > 0) {
      const kioskOwners = await resolveStandardKioskOwners(
        client,
        Array.from(standardKiosks.values()),
        signal,
      );

      for (const [kioskAddress, ownerAddress] of kioskOwners) {
        const origins = standardKioskOrigins.get(kioskAddress);
        if (!origins) {
          continue;
        }

        for (const origin of origins) {
          resolved.set(origin, ownerAddress);
        }
      }
    }

    pending = nextPending;
  }

  if (resolved.size < objectOwnerAddresses.length) {
    throw new Error("Unable to resolve all object-owned NFT holders.");
  }

  return resolved;
}

function readCoinObjectBalance(node: ObjectNode) {
  const ownerAddress = readAddressOwner(node.owner);
  if (!ownerAddress) {
    throw new Error("Encountered a coin object without an address owner.");
  }

  const rawBalanceValue = (node.asMoveObject?.contents?.json as MoveJsonBalance | undefined)
    ?.balance;
  if (rawBalanceValue === undefined || rawBalanceValue === null) {
    throw new Error("Encountered a coin object without a balance.");
  }

  return {
    address: ownerAddress,
    rawBalance: BigInt(String(rawBalanceValue)).toString(),
  };
}

async function readObjectCollectionBalances(
  client: SuiGraphQLClient,
  nodes: ObjectNode[],
  signal: AbortSignal,
) {
  const directBalances: Array<{ address: string; rawBalance: string }> = [];
  const objectOwnedNodes: Array<{ objectOwnerAddress: string }> = [];

  for (const node of nodes) {
    const directOwner = readAddressOwner(node.owner);
    if (directOwner) {
      directBalances.push({ address: directOwner, rawBalance: "1" });
      continue;
    }

    const objectOwnerAddress = readObjectOwnerAddress(node.owner);
    if (objectOwnerAddress) {
      objectOwnedNodes.push({ objectOwnerAddress });
      continue;
    }

    throw new Error("Encountered an NFT object without a resolvable owner.");
  }

  if (objectOwnedNodes.length === 0) {
    return directBalances;
  }

  const resolvedOwners = await resolveObjectOwnerAddresses(
    client,
    objectOwnedNodes.map((node) => node.objectOwnerAddress),
    signal,
  );

  return [
    ...directBalances,
    ...objectOwnedNodes.map((node) => ({
      address: resolvedOwners.get(node.objectOwnerAddress) as string,
      rawBalance: "1",
    })),
  ];
}

export async function fetchSuiHolderSnapshotBatch(
  input: SnapshotPageBatchInput,
): Promise<SnapshotPageBatchResult> {
  const runtime = await resolveGraphQLRuntimeConfig();
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const client = createSuiGraphQLClient(runtime.endpoint);
    const asset = await resolveSnapshotAsset(client, input, controller.signal);
    const objectType = getSnapshotObjectType(asset.assetKind, input.coinAddress);
    const hasCarriedDecimals = input.decimals != null || input.assetKind === "object";
    const pagesPerBatch = getSnapshotBatchPageBudget({
      hasCarriedDecimals,
      assetKind: asset.assetKind,
      maxSubrequests: runtime.maxSubrequests,
      retryHeadroom: runtime.retryHeadroom,
    });
    const pageSize = getSnapshotPageSize(asset.assetKind);
    const firstPage = await fetchObjectsPage(
      client,
      objectType,
      pageSize,
      input.cursor,
      controller.signal,
    );
    const balances = new Map<string, bigint>();
    let cursor = input.cursor;
    let nextCursor: string | null = input.cursor;
    let pagesFetched = 0;
    let objectsFetched = 0;
    let reachedLastPage = false;
    let snapshotPage = firstPage;

    while (true) {
      const connection = snapshotPage.objects;
      if (!connection) {
        throw new Error("Missing data.objects in GraphQL response.");
      }

      const nodes = connection.nodes ?? [];
      const pageBalances =
        asset.assetKind === "coin"
          ? nodes.map((node) => readCoinObjectBalance(node))
          : await readObjectCollectionBalances(client, nodes, controller.signal);

      for (const { address, rawBalance } of pageBalances) {
        balances.set(address, (balances.get(address) ?? 0n) + BigInt(rawBalance));
      }

      pagesFetched += 1;
      objectsFetched += nodes.length;

      if (!connection.pageInfo?.hasNextPage) {
        reachedLastPage = true;
        break;
      }

      cursor = connection.pageInfo.endCursor ?? null;
      if (!cursor) {
        throw new Error("Missing pageInfo.endCursor while more results remain.");
      }

      nextCursor = cursor;

      if (pagesFetched >= pagesPerBatch) {
        break;
      }

      snapshotPage = await fetchObjectsPage(
        client,
        objectType,
        pageSize,
        cursor,
        controller.signal,
      );
    }

    return {
      meta: {
        endpoint: runtime.endpoint,
        coinAddress: input.coinAddress,
      },
      balances: Array.from(balances.entries()).map(([address, rawBalance]) => ({
        address,
        rawBalance: rawBalance.toString(),
      })),
      cursor: input.cursor,
      nextCursor: reachedLastPage ? null : nextCursor,
      decimals: asset.decimals,
      assetKind: asset.assetKind,
      pagesFetched,
      objectsFetched,
    };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`Snapshot request timed out after ${REQUEST_TIMEOUT_MS / 1000} seconds.`);
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

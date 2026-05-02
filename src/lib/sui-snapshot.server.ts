import {
  SuiGraphQLClient,
  type GraphQLDocument,
  type GraphQLQueryOptions,
  type GraphQLQueryResult,
} from "@mysten/sui/graphql";
import { graphql, type ResultOf, type VariablesOf } from "@mysten/sui/graphql/schema";

import {
  normalizeSuiAddress,
  type SnapshotPageBatchInput,
  type SnapshotPageBatchResult,
} from "@/lib/sui-snapshot";

const DEFAULT_ENDPOINT = "https://graphql.mainnet.sui.io/graphql";
const REQUEST_TIMEOUT_MS = 45_000;
const PAGE_SIZE = 50;
const WORKERS_FREE_SUBREQUEST_LIMIT = 50;
const RETRY_SUBREQUEST_HEADROOM = 10;
const COIN_METADATA_SUBREQUESTS = 1;
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
type MoveJsonBalance = { balance?: number | string | null };

export function getSnapshotBatchPageBudget({
  hasCarriedDecimals,
  maxSubrequests = WORKERS_FREE_SUBREQUEST_LIMIT,
  retryHeadroom = RETRY_SUBREQUEST_HEADROOM,
}: {
  hasCarriedDecimals: boolean;
  maxSubrequests?: number;
  retryHeadroom?: number;
}) {
  const metadataSubrequests = hasCarriedDecimals ? 0 : COIN_METADATA_SUBREQUESTS;
  return Math.max(1, maxSubrequests - retryHeadroom - metadataSubrequests);
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
  return typeof decimals === "number" && Number.isInteger(decimals) && decimals >= 0 ? decimals : 0;
}

function fetchObjectsPage(
  client: SuiGraphQLClient,
  coinAddress: string,
  cursor: string | null,
  signal: AbortSignal,
) {
  return querySuiGraphQL<ObjectsResponse, VariablesOf<typeof OBJECTS_QUERY>>(
    client,
    OBJECTS_QUERY,
    {
      type: `0x2::coin::Coin<${coinAddress}>`,
      first: PAGE_SIZE,
      after: cursor,
    },
    "Snapshot",
    signal,
  );
}

function readCoinObjectBalance(
  node: NonNullable<NonNullable<ObjectsResponse["objects"]>["nodes"]>[number],
) {
  const ownerAddress = node.owner && "address" in node.owner ? node.owner.address?.address : null;
  if (!ownerAddress) {
    throw new Error("Encountered a coin object without an address owner.");
  }

  const rawBalanceValue = (node.asMoveObject?.contents?.json as MoveJsonBalance | undefined)
    ?.balance;
  if (rawBalanceValue === undefined || rawBalanceValue === null) {
    throw new Error("Encountered a coin object without a balance.");
  }

  return {
    address: normalizeSuiAddress(ownerAddress),
    rawBalance: BigInt(String(rawBalanceValue)).toString(),
  };
}

export async function fetchSuiHolderSnapshotBatch(
  input: SnapshotPageBatchInput,
): Promise<SnapshotPageBatchResult> {
  const runtime = await resolveGraphQLRuntimeConfig();
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const client = createSuiGraphQLClient(runtime.endpoint);
    const hasCarriedDecimals = input.decimals != null;
    const pagesPerBatch = getSnapshotBatchPageBudget({
      hasCarriedDecimals,
      maxSubrequests: runtime.maxSubrequests,
      retryHeadroom: runtime.retryHeadroom,
    });
    const decimalsPromise = hasCarriedDecimals
      ? Promise.resolve(input.decimals as number)
      : fetchCoinDecimals(client, input.coinAddress, controller.signal);
    const [decimals, firstPage] = await Promise.all([
      decimalsPromise,
      fetchObjectsPage(client, input.coinAddress, input.cursor, controller.signal),
    ]);
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
      for (const node of nodes) {
        const { address, rawBalance } = readCoinObjectBalance(node);
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

      snapshotPage = await fetchObjectsPage(client, input.coinAddress, cursor, controller.signal);
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
      decimals,
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

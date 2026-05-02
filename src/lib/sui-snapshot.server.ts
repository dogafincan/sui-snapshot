import {
  buildSnapshotResult,
  normalizeSuiAddress,
  type SnapshotBalanceRow,
  type SnapshotInput,
  type SnapshotPageBatchInput,
  type SnapshotPageBatchResult,
  type SnapshotResult,
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

const COIN_METADATA_QUERY = `
query CoinMetadata($coinType: String!) {
  coinMetadata(coinType: $coinType) {
    decimals
  }
}
`;

const OBJECTS_QUERY = `
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
`;

interface CloudflareEnv {
  SUI_GRAPHQL_ENDPOINT?: string;
}

interface GraphQLError {
  message?: string;
}

interface GraphQLPayload<TData> {
  data?: TData | null;
  errors?: GraphQLError[];
}

interface CoinMetadataResponse {
  coinMetadata?: {
    decimals?: number | null;
  } | null;
}

interface ObjectsResponse {
  objects?: {
    pageInfo?: {
      hasNextPage?: boolean | null;
      endCursor?: string | null;
    } | null;
    nodes?: Array<{
      owner?: {
        address?: {
          address?: string | null;
        } | null;
      } | null;
      asMoveObject?: {
        contents?: {
          json?: {
            balance?: string | number | null;
          } | null;
        } | null;
      } | null;
    }>;
  } | null;
}

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

async function resolveEndpoint() {
  try {
    const cloudflare = (await import("cloudflare:workers")) as {
      env?: CloudflareEnv;
    };

    const configured = cloudflare.env?.SUI_GRAPHQL_ENDPOINT?.trim();
    if (configured) {
      return configured;
    }
  } catch {
    // Tests and non-Worker tooling resolve optional endpoint overrides below.
  }

  return process.env.SUI_GRAPHQL_ENDPOINT?.trim() || DEFAULT_ENDPOINT;
}

async function postGraphQL<TData>(
  endpoint: string,
  query: string,
  variables: Record<string, unknown>,
  signal: AbortSignal,
) {
  let response: Response | null = null;

  for (let attempt = 0; ; attempt += 1) {
    try {
      response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ query, variables }),
        signal,
      });
    } catch (error) {
      if (signal.aborted || isAbortError(error)) {
        throw error;
      }

      if (attempt >= MAX_TRANSIENT_RETRIES) {
        throw buildNetworkRequestError(error);
      }

      await waitForRetry(readNetworkRetryDelay(attempt), signal);
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
    await waitForRetry(readRetryDelay(response, attempt), signal);
  }

  if (!response) {
    throw new Error("Sui GraphQL request failed before receiving a response.");
  }

  if (!response.ok) {
    throw new Error(`Sui GraphQL request failed with HTTP ${response.status}.`);
  }

  const payload = (await response.json()) as GraphQLPayload<TData>;
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

async function fetchCoinDecimals(endpoint: string, coinAddress: string, signal: AbortSignal) {
  const metadata = await postGraphQL<CoinMetadataResponse>(
    endpoint,
    COIN_METADATA_QUERY,
    {
      coinType: coinAddress,
    },
    signal,
  );

  const decimals = metadata.coinMetadata?.decimals;
  return typeof decimals === "number" && Number.isInteger(decimals) && decimals >= 0 ? decimals : 0;
}

function readCoinObjectBalance(
  node: NonNullable<NonNullable<ObjectsResponse["objects"]>["nodes"]>[number],
) {
  const ownerAddress = node.owner?.address?.address;
  if (!ownerAddress) {
    throw new Error("Encountered a coin object without an address owner.");
  }

  const rawBalanceValue = node.asMoveObject?.contents?.json?.balance;
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
  const endpoint = await resolveEndpoint();
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const hasCarriedDecimals = input.decimals != null;
    const pagesPerBatch = getSnapshotBatchPageBudget({ hasCarriedDecimals });
    const decimals =
      input.decimals ?? (await fetchCoinDecimals(endpoint, input.coinAddress, controller.signal));
    const balances = new Map<string, bigint>();
    let cursor = input.cursor;
    let nextCursor: string | null = input.cursor;
    let pagesFetched = 0;
    let objectsFetched = 0;
    let reachedLastPage = false;

    while (pagesFetched < pagesPerBatch) {
      const snapshotPage = await postGraphQL<ObjectsResponse>(
        endpoint,
        OBJECTS_QUERY,
        {
          type: `0x2::coin::Coin<${input.coinAddress}>`,
          first: PAGE_SIZE,
          after: cursor,
        },
        controller.signal,
      );

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
    }

    return {
      meta: {
        endpoint,
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

export async function fetchSuiHolderSnapshot(
  input: SnapshotInput & { decimals?: number | null },
): Promise<SnapshotResult> {
  const balances: SnapshotBalanceRow[] = [];
  let cursor: string | null = null;
  let decimals = input.decimals ?? null;

  while (true) {
    const batch = await fetchSuiHolderSnapshotBatch({
      ...input,
      cursor,
      decimals,
    });

    decimals = batch.decimals;
    balances.push(...batch.balances);

    if (batch.nextCursor === null) {
      return buildSnapshotResult({
        endpoint: batch.meta.endpoint,
        coinAddress: input.coinAddress,
        decimals: batch.decimals,
        balances,
      });
    }

    cursor = batch.nextCursor;
  }
}

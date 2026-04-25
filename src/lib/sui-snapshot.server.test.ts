import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { fetchSuiHolderSnapshotBatch } from "@/lib/sui-snapshot.server";
import { normalizeCoinType } from "@/lib/sui-snapshot";

const ADDRESS_A = `0x${"a".repeat(64)}`;
const ADDRESS_B = `0x${"b".repeat(64)}`;
const ADDRESS_C = `0x${"c".repeat(64)}`;
const DEFAULT_ENDPOINT = "https://graphql.mainnet.sui.io/graphql";

function jsonResponse(payload: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(payload), {
    headers: {
      "content-type": "application/json",
    },
    status: 200,
    ...init,
  });
}

function metadataResponse(decimals = 2) {
  return jsonResponse({
    data: {
      coinMetadata: {
        decimals,
      },
    },
  });
}

function objectsResponse({
  nodes,
  hasNextPage,
  endCursor,
}: {
  nodes: Array<{ owner: string; balance: string }>;
  hasNextPage: boolean;
  endCursor: string | null;
}) {
  return jsonResponse({
    data: {
      objects: {
        pageInfo: {
          hasNextPage,
          endCursor,
        },
        nodes: nodes.map((node) => ({
          owner: { address: { address: node.owner } },
          asMoveObject: { contents: { json: { balance: node.balance } } },
        })),
      },
    },
  });
}

function readPostBody(callIndex: number) {
  const [, init] = fetchMock.mock.calls[callIndex] ?? [];
  if (typeof init?.body !== "string") {
    throw new Error("Expected GraphQL request body to be a string.");
  }

  return JSON.parse(init.body);
}

const fetchMock = vi.fn<typeof fetch>();

describe("fetchSuiHolderSnapshotBatch", () => {
  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
  });

  it("fetches Sui GraphQL coin object pages into balance rows", async () => {
    fetchMock
      .mockResolvedValueOnce(metadataResponse())
      .mockResolvedValueOnce(
        objectsResponse({
          nodes: [
            { owner: ADDRESS_A, balance: "250" },
            { owner: ADDRESS_B, balance: "125" },
          ],
          hasNextPage: true,
          endCursor: "cursor-2",
        }),
      )
      .mockResolvedValueOnce(
        objectsResponse({
          nodes: [
            { owner: ADDRESS_A, balance: "75" },
            { owner: ADDRESS_C, balance: "50" },
          ],
          hasNextPage: false,
          endCursor: null,
        }),
      );

    vi.stubGlobal("fetch", fetchMock);

    const batch = await fetchSuiHolderSnapshotBatch({
      coinAddress: normalizeCoinType("0x2::sui::SUI"),
      cursor: null,
    });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(batch).toEqual({
      meta: {
        endpoint: DEFAULT_ENDPOINT,
        coinAddress: normalizeCoinType("0x2::sui::SUI"),
      },
      balances: [
        {
          address: ADDRESS_A,
          balance: "3.25",
        },
        {
          address: ADDRESS_B,
          balance: "1.25",
        },
        {
          address: ADDRESS_C,
          balance: "0.5",
        },
      ],
      cursor: null,
      nextCursor: null,
      pagesFetched: 2,
      objectsFetched: 4,
    });
  });

  it("stops each batch below the Worker free subrequest limit", async () => {
    fetchMock.mockResolvedValueOnce(metadataResponse(0));

    for (let page = 0; page < 35; page += 1) {
      fetchMock.mockResolvedValueOnce(
        objectsResponse({
          nodes: [{ owner: ADDRESS_A, balance: String(page + 1) }],
          hasNextPage: true,
          endCursor: `cursor-${page + 1}`,
        }),
      );
    }

    vi.stubGlobal("fetch", fetchMock);

    const batch = await fetchSuiHolderSnapshotBatch({
      coinAddress: normalizeCoinType("0x2::sui::SUI"),
      cursor: "starting-cursor",
    });

    expect(fetchMock).toHaveBeenCalledTimes(36);
    expect(batch).toMatchObject({
      meta: {
        endpoint: DEFAULT_ENDPOINT,
        coinAddress: normalizeCoinType("0x2::sui::SUI"),
      },
      cursor: "starting-cursor",
      nextCursor: "cursor-35",
      pagesFetched: 35,
      objectsFetched: 35,
    });
  });

  it("sends GraphQL variables for the canonical Coin type without an api key", async () => {
    fetchMock.mockResolvedValueOnce(metadataResponse()).mockResolvedValueOnce(
      objectsResponse({
        nodes: [],
        hasNextPage: false,
        endCursor: null,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await fetchSuiHolderSnapshotBatch({
      coinAddress: normalizeCoinType("0x2::sui::SUI"),
      cursor: "after-cursor",
    });

    const metadataBody = readPostBody(0);
    const objectsBody = readPostBody(1);
    const [, objectRequestInit] = fetchMock.mock.calls[1] ?? [];

    expect(metadataBody.variables).toEqual({
      coinType: normalizeCoinType("0x2::sui::SUI"),
    });
    expect(objectsBody.variables).toEqual({
      type: `0x2::coin::Coin<${normalizeCoinType("0x2::sui::SUI")}>`,
      first: 50,
      after: "after-cursor",
    });
    expect(objectRequestInit?.headers).not.toHaveProperty("x-api-key");
  });

  it("surfaces malformed GraphQL object payloads", async () => {
    fetchMock
      .mockResolvedValueOnce(metadataResponse())
      .mockResolvedValueOnce(jsonResponse({ data: {} }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      fetchSuiHolderSnapshotBatch({
        coinAddress: normalizeCoinType("0x2::sui::SUI"),
        cursor: null,
      }),
    ).rejects.toThrow("Missing data.objects in GraphQL response.");
  });

  it("surfaces GraphQL errors", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        data: null,
        errors: [{ message: "Page size is too large: 100 > 50" }],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      fetchSuiHolderSnapshotBatch({
        coinAddress: normalizeCoinType("0x2::sui::SUI"),
        cursor: null,
      }),
    ).rejects.toThrow("Page size is too large: 100 > 50");
  });

  it("throws on upstream non-200 responses", async () => {
    fetchMock.mockResolvedValueOnce(new Response("{}", { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      fetchSuiHolderSnapshotBatch({
        coinAddress: normalizeCoinType("0x2::sui::SUI"),
        cursor: null,
      }),
    ).rejects.toThrow("Sui GraphQL request failed with HTTP 503.");
  });
});

import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import * as serverModule from "@/lib/sui-snapshot.server";
import { fetchSuiHolderSnapshotBatch, getSnapshotBatchPageBudget } from "@/lib/sui-snapshot.server";
import { normalizeCoinType } from "@/lib/sui-snapshot";

const ADDRESS_A = `0x${"a".repeat(64)}`;
const ADDRESS_B = `0x${"b".repeat(64)}`;
const ADDRESS_C = `0x${"c".repeat(64)}`;
const ADDRESS_D = `0x${"f".repeat(64)}`;
const OWNER_OBJECT_A = `0x${"d".repeat(64)}`;
const KIOSK_A = `0x${"1".repeat(64)}`;
const KIOSK_OWNER_CAP_A = `0x${"2".repeat(64)}`;
const DEFAULT_ENDPOINT = "https://graphql.mainnet.sui.io/graphql";
const PANDA_NFT_TYPE =
  "0x6eabd37ba3e9915b8e0490c4454532909a1282f6dfa6898eb6f3bee7ae58b453::random_panda_club::Nft";

function jsonResponse(payload: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(payload), {
    headers: {
      "content-type": "application/json",
    },
    status: 200,
    ...init,
  });
}

function metadataResponse(decimals: number | null = 2) {
  return jsonResponse({
    data: {
      coinMetadata: decimals === null ? null : { decimals },
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
          owner: { __typename: "AddressOwner", address: { address: node.owner } },
          asMoveObject: { contents: { json: { balance: node.balance } } },
        })),
      },
    },
  });
}

function nftObjectsResponse({
  nodes,
  hasNextPage,
  endCursor,
}: {
  nodes: Array<{ owner: string; ownerKind?: "address" | "object" }>;
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
          owner:
            node.ownerKind === "object"
              ? {
                  __typename: "ObjectOwner",
                  address: { address: node.owner },
                }
              : {
                  __typename: "AddressOwner",
                  address: { address: node.owner },
                },
          asMoveObject: { contents: { json: { name: "Random Panda" } } },
        })),
      },
    },
  });
}

function ownerObjectsResponse({
  nodes,
}: {
  nodes: Array<{
    address: string;
    owner?: string;
    ownerKind?: "address" | "object" | "shared";
    objectType?: "dynamic-field" | "kiosk" | "kiosk-owner-cap";
    kioskId?: string;
    kioskOwner?: string;
    personalKioskOwner?: string;
    initialSharedVersion?: number;
  }>;
}) {
  return jsonResponse({
    data: {
      multiGetObjects: nodes.map((node) => ({
        address: node.address,
        owner:
          node.ownerKind === "shared"
            ? { __typename: "Shared", initialSharedVersion: node.initialSharedVersion ?? 1 }
            : node.ownerKind === "address"
              ? { __typename: "AddressOwner", address: { address: node.owner } }
              : { __typename: "ObjectOwner", address: { address: node.owner } },
        asMoveObject: {
          contents: {
            type: {
              repr:
                node.objectType === "kiosk-owner-cap"
                  ? "0x0000000000000000000000000000000000000000000000000000000000000002::kiosk::KioskOwnerCap"
                  : node.ownerKind === "shared" || node.objectType === "kiosk"
                    ? "0x0000000000000000000000000000000000000000000000000000000000000002::kiosk::Kiosk"
                    : "0x0000000000000000000000000000000000000000000000000000000000000002::dynamic_field::Field<0x2::kiosk::Item,0x2::object::ID>",
            },
            json:
              node.objectType === "kiosk-owner-cap"
                ? { for: node.kioskId }
                : node.ownerKind === "shared" || node.objectType === "kiosk"
                  ? { owner: node.kioskOwner }
                  : {},
          },
        },
        personalKioskOwnerMarker: node.personalKioskOwner
          ? {
              value: {
                __typename: "MoveValue",
                json: node.personalKioskOwner,
                type: { repr: "address" },
              },
            }
          : null,
      })),
    },
  });
}

function kioskCreationTransactionsResponse({
  nodes,
}: {
  nodes: Array<{ address: string; previousTransactionDigest: string }>;
}) {
  return jsonResponse({
    data: Object.fromEntries(
      nodes.map((node, index) => [
        `kiosk${index}`,
        {
          objectAt: {
            address: node.address,
            previousTransaction: { digest: node.previousTransactionDigest },
          },
        },
      ]),
    ),
  });
}

function kioskOwnerCapsResponse({
  capAddress,
  capOwner,
  kioskAddress,
}: {
  capAddress: string;
  capOwner: string;
  kioskAddress: string;
}) {
  return jsonResponse({
    data: {
      transactionEffects: {
        objectChanges: {
          pageInfo: {
            hasNextPage: false,
            endCursor: null,
          },
          nodes: [
            {
              address: capAddress,
              outputState: {
                address: capAddress,
                owner: {
                  __typename: "AddressOwner",
                  address: { address: capOwner },
                },
                asMoveObject: {
                  contents: {
                    type: {
                      repr: "0x0000000000000000000000000000000000000000000000000000000000000002::kiosk::KioskOwnerCap",
                    },
                    json: {
                      for: kioskAddress,
                    },
                  },
                },
              },
            },
          ],
        },
      },
    },
  });
}

function httpErrorResponse(status: number, init?: ResponseInit) {
  const cancel = vi.fn().mockResolvedValue(undefined);
  const response = {
    body: { cancel },
    headers: new Headers(init?.headers),
    ok: false,
    status,
  } as unknown as Response;

  return { cancel, response };
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
    delete process.env.SUI_GRAPHQL_MAX_SUBREQUESTS;
    delete process.env.SUI_GRAPHQL_RETRY_HEADROOM;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("does not export a duplicate full-snapshot server runner", () => {
    expect("fetchSuiHolderSnapshot" in serverModule).toBe(false);
  });

  it("computes the page budget from the subrequest ceiling and retry headroom", () => {
    expect(getSnapshotBatchPageBudget({ hasCarriedDecimals: false })).toBe(39);
    expect(getSnapshotBatchPageBudget({ hasCarriedDecimals: true })).toBe(40);
    expect(
      getSnapshotBatchPageBudget({
        hasCarriedDecimals: true,
        maxSubrequests: 100,
        retryHeadroom: 12,
      }),
    ).toBe(88);
    expect(
      getSnapshotBatchPageBudget({
        hasCarriedDecimals: false,
        maxSubrequests: 3,
        retryHeadroom: 10,
      }),
    ).toBe(1);
    expect(getSnapshotBatchPageBudget({ hasCarriedDecimals: false, assetKind: "object" })).toBe(1);
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
      decimals: null,
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
          rawBalance: "325",
        },
        {
          address: ADDRESS_B,
          rawBalance: "125",
        },
        {
          address: ADDRESS_C,
          rawBalance: "50",
        },
      ],
      cursor: null,
      nextCursor: null,
      decimals: 2,
      assetKind: "coin",
      pagesFetched: 2,
      objectsFetched: 4,
    });
  });

  it("fetches NFT collection objects as unit balances", async () => {
    fetchMock.mockResolvedValueOnce(metadataResponse(null)).mockResolvedValueOnce(
      nftObjectsResponse({
        nodes: [{ owner: ADDRESS_A }, { owner: ADDRESS_A }, { owner: ADDRESS_B }],
        hasNextPage: false,
        endCursor: null,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const batch = await fetchSuiHolderSnapshotBatch({
      coinAddress: normalizeCoinType(PANDA_NFT_TYPE),
      cursor: null,
      decimals: null,
      assetKind: null,
    });

    expect(readPostBody(1).variables).toEqual({
      type: normalizeCoinType(PANDA_NFT_TYPE),
      first: 10,
      after: null,
    });
    expect(batch).toMatchObject({
      balances: [
        { address: ADDRESS_A, rawBalance: "2" },
        { address: ADDRESS_B, rawBalance: "1" },
      ],
      decimals: 0,
      assetKind: "object",
      pagesFetched: 1,
      objectsFetched: 3,
    });
  });

  it("resolves personal kiosk-owned NFT objects from the owner marker", async () => {
    fetchMock
      .mockResolvedValueOnce(metadataResponse(null))
      .mockResolvedValueOnce(
        nftObjectsResponse({
          nodes: [{ owner: OWNER_OBJECT_A, ownerKind: "object" }],
          hasNextPage: false,
          endCursor: null,
        }),
      )
      .mockResolvedValueOnce(
        ownerObjectsResponse({
          nodes: [{ address: OWNER_OBJECT_A, owner: KIOSK_A, ownerKind: "object" }],
        }),
      )
      .mockResolvedValueOnce(
        ownerObjectsResponse({
          nodes: [
            {
              address: KIOSK_A,
              ownerKind: "shared",
              objectType: "kiosk",
              kioskOwner: ADDRESS_D,
              personalKioskOwner: ADDRESS_C,
            },
          ],
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const batch = await fetchSuiHolderSnapshotBatch({
      coinAddress: normalizeCoinType(PANDA_NFT_TYPE),
      cursor: null,
      decimals: null,
      assetKind: null,
    });

    expect(readPostBody(2).variables.keys).toEqual([{ address: OWNER_OBJECT_A }]);
    expect(readPostBody(3).variables.keys).toEqual([{ address: KIOSK_A }]);
    expect(batch).toMatchObject({
      balances: [{ address: ADDRESS_C, rawBalance: "1" }],
      decimals: 0,
      assetKind: "object",
      pagesFetched: 1,
      objectsFetched: 1,
    });
  });

  it("resolves standard kiosk-owned NFT objects from the current owner cap", async () => {
    fetchMock
      .mockResolvedValueOnce(metadataResponse(null))
      .mockResolvedValueOnce(
        nftObjectsResponse({
          nodes: [{ owner: OWNER_OBJECT_A, ownerKind: "object" }],
          hasNextPage: false,
          endCursor: null,
        }),
      )
      .mockResolvedValueOnce(
        ownerObjectsResponse({
          nodes: [{ address: OWNER_OBJECT_A, owner: KIOSK_A, ownerKind: "object" }],
        }),
      )
      .mockResolvedValueOnce(
        ownerObjectsResponse({
          nodes: [
            {
              address: KIOSK_A,
              ownerKind: "shared",
              objectType: "kiosk",
              kioskOwner: ADDRESS_B,
              initialSharedVersion: 42,
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        kioskCreationTransactionsResponse({
          nodes: [{ address: KIOSK_A, previousTransactionDigest: "create-kiosk-tx" }],
        }),
      )
      .mockResolvedValueOnce(
        kioskOwnerCapsResponse({
          capAddress: KIOSK_OWNER_CAP_A,
          capOwner: ADDRESS_B,
          kioskAddress: KIOSK_A,
        }),
      )
      .mockResolvedValueOnce(
        ownerObjectsResponse({
          nodes: [
            {
              address: KIOSK_OWNER_CAP_A,
              owner: ADDRESS_C,
              ownerKind: "address",
              objectType: "kiosk-owner-cap",
              kioskId: KIOSK_A,
            },
          ],
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const batch = await fetchSuiHolderSnapshotBatch({
      coinAddress: normalizeCoinType(PANDA_NFT_TYPE),
      cursor: null,
      decimals: null,
      assetKind: null,
    });

    expect(readPostBody(3).variables.keys).toEqual([{ address: KIOSK_A }]);
    expect(readPostBody(4).variables.address0).toBe(KIOSK_A);
    expect(readPostBody(4).variables.version0).toBe(42);
    expect(readPostBody(5).variables.digest).toBe("create-kiosk-tx");
    expect(readPostBody(6).variables.keys).toEqual([{ address: KIOSK_OWNER_CAP_A }]);
    expect(batch).toMatchObject({
      balances: [{ address: ADDRESS_C, rawBalance: "1" }],
      decimals: 0,
      assetKind: "object",
      pagesFetched: 1,
      objectsFetched: 1,
    });
  });

  it("stops each batch below the Worker free subrequest limit with retry headroom", async () => {
    fetchMock.mockResolvedValueOnce(metadataResponse(0));

    for (let page = 0; page < 39; page += 1) {
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
      decimals: null,
    });

    expect(fetchMock).toHaveBeenCalledTimes(40);
    expect(batch).toMatchObject({
      meta: {
        endpoint: DEFAULT_ENDPOINT,
        coinAddress: normalizeCoinType("0x2::sui::SUI"),
      },
      cursor: "starting-cursor",
      nextCursor: "cursor-39",
      decimals: 0,
      pagesFetched: 39,
      objectsFetched: 39,
    });
  });

  it("honors configured subrequest budget overrides", async () => {
    process.env.SUI_GRAPHQL_MAX_SUBREQUESTS = "5";
    process.env.SUI_GRAPHQL_RETRY_HEADROOM = "2";

    for (let page = 0; page < 3; page += 1) {
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
      cursor: null,
      decimals: 0,
    });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(batch).toMatchObject({
      cursor: null,
      nextCursor: "cursor-3",
      decimals: 0,
      pagesFetched: 3,
      objectsFetched: 3,
    });
  });

  it("uses carried decimals without refetching metadata on later batches", async () => {
    fetchMock.mockResolvedValueOnce(
      objectsResponse({
        nodes: [{ owner: ADDRESS_A, balance: "125" }],
        hasNextPage: false,
        endCursor: null,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const batch = await fetchSuiHolderSnapshotBatch({
      coinAddress: normalizeCoinType("0x2::sui::SUI"),
      cursor: "after-cursor",
      decimals: 2,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(readPostBody(0).variables).toEqual({
      type: `0x2::coin::Coin<${normalizeCoinType("0x2::sui::SUI")}>`,
      first: 50,
      after: "after-cursor",
    });
    expect(batch).toMatchObject({
      decimals: 2,
      balances: [{ address: ADDRESS_A, rawBalance: "125" }],
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
      decimals: null,
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

  it("sends named GraphQL operations for SDK typed query documents", async () => {
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
      cursor: null,
      decimals: null,
    });

    expect(readPostBody(0).operationName).toBe("CoinMetadata");
    expect(readPostBody(1).operationName).toBe("Snapshot");
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
        decimals: null,
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
        decimals: 2,
      }),
    ).rejects.toThrow("Page size is too large: 100 > 50");
  });

  it("retries transient GraphQL HTTP failures before returning the batch", async () => {
    const transientError = httpErrorResponse(503, { headers: { "retry-after": "0" } });

    fetchMock
      .mockResolvedValueOnce(metadataResponse())
      .mockResolvedValueOnce(transientError.response)
      .mockResolvedValueOnce(
        objectsResponse({
          nodes: [{ owner: ADDRESS_A, balance: "250" }],
          hasNextPage: false,
          endCursor: null,
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      fetchSuiHolderSnapshotBatch({
        coinAddress: normalizeCoinType("0x2::sui::SUI"),
        cursor: null,
        decimals: null,
      }),
    ).resolves.toMatchObject({
      balances: [{ address: ADDRESS_A, rawBalance: "250" }],
      decimals: 2,
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(transientError.cancel).toHaveBeenCalledTimes(1);
  });

  it("retries network-level GraphQL request failures before returning the batch", async () => {
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);

    fetchMock
      .mockResolvedValueOnce(metadataResponse())
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValueOnce(
        objectsResponse({
          nodes: [{ owner: ADDRESS_A, balance: "250" }],
          hasNextPage: false,
          endCursor: null,
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      fetchSuiHolderSnapshotBatch({
        coinAddress: normalizeCoinType("0x2::sui::SUI"),
        cursor: null,
        decimals: null,
      }),
    ).resolves.toMatchObject({
      balances: [{ address: ADDRESS_A, rawBalance: "250" }],
      decimals: 2,
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(randomSpy).toHaveBeenCalled();
  });

  it("throws on upstream non-200 responses", async () => {
    fetchMock
      .mockResolvedValueOnce(new Response("{}", { headers: { "retry-after": "0" }, status: 503 }))
      .mockResolvedValueOnce(new Response("{}", { headers: { "retry-after": "0" }, status: 503 }))
      .mockResolvedValueOnce(new Response("{}", { headers: { "retry-after": "0" }, status: 503 }))
      .mockResolvedValueOnce(new Response("{}", { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      fetchSuiHolderSnapshotBatch({
        coinAddress: normalizeCoinType("0x2::sui::SUI"),
        cursor: null,
        decimals: 2,
      }),
    ).rejects.toThrow("Sui GraphQL request failed with HTTP 503.");
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("cancels non-OK GraphQL response bodies before throwing HTTP errors", async () => {
    const { cancel, response } = httpErrorResponse(400);
    fetchMock.mockResolvedValueOnce(response);
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      fetchSuiHolderSnapshotBatch({
        coinAddress: normalizeCoinType("0x2::sui::SUI"),
        cursor: null,
        decimals: 2,
      }),
    ).rejects.toThrow("Sui GraphQL request failed with HTTP 400.");
    expect(cancel).toHaveBeenCalledTimes(1);
  });
});

import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { fetchSuiHolderSnapshot } from "@/lib/sui-snapshot.server";
import { normalizeCoinType } from "@/lib/sui-snapshot";

const ADDRESS_A = `0x${"a".repeat(64)}`;
const ADDRESS_B = `0x${"b".repeat(64)}`;
const ADDRESS_C = `0x${"c".repeat(64)}`;

function jsonResponse(payload: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(payload), {
    headers: {
      "content-type": "application/json",
    },
    status: 200,
    ...init,
  });
}

describe("fetchSuiHolderSnapshot", () => {
  const fetchMock = vi.fn<typeof fetch>();

  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
  });

  it("aggregates paginated balances and computes proportional airdrops", async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          data: {
            coinMetadata: {
              decimals: 2,
            },
          },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          data: {
            objects: {
              pageInfo: {
                hasNextPage: true,
                endCursor: "page-2",
              },
              nodes: [
                {
                  owner: { address: { address: ADDRESS_A } },
                  asMoveObject: { contents: { json: { balance: "250" } } },
                },
                {
                  owner: { address: { address: ADDRESS_B } },
                  asMoveObject: { contents: { json: { balance: "125" } } },
                },
              ],
            },
          },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          data: {
            objects: {
              pageInfo: {
                hasNextPage: false,
                endCursor: null,
              },
              nodes: [
                {
                  owner: { address: { address: ADDRESS_A } },
                  asMoveObject: { contents: { json: { balance: "75" } } },
                },
                {
                  owner: { address: { address: ADDRESS_C } },
                  asMoveObject: { contents: { json: { balance: "50" } } },
                },
              ],
            },
          },
        }),
      );

    vi.stubGlobal("fetch", fetchMock);

    const snapshot = await fetchSuiHolderSnapshot({
      coinAddress: normalizeCoinType("0x2::sui::SUI"),
      airdropAmount: "1",
      excludedAddresses: [],
    });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(snapshot.meta.holderCount).toBe(3);
    expect(snapshot.meta.totalBalance).toBe("5");
    expect(snapshot.rows).toEqual([
      expect.objectContaining({
        rank: 1,
        address: ADDRESS_A,
        balance: "3.25",
        airdropAmount: "0.65",
      }),
      expect.objectContaining({
        rank: 2,
        address: ADDRESS_B,
        balance: "1.25",
        airdropAmount: "0.25",
      }),
      expect.objectContaining({
        rank: 3,
        address: ADDRESS_C,
        balance: "0.5",
        airdropAmount: "0.1",
      }),
    ]);
  });

  it("surfaces malformed GraphQL payloads", async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          data: {
            coinMetadata: {
              decimals: 0,
            },
          },
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ data: {} }));

    vi.stubGlobal("fetch", fetchMock);

    await expect(
      fetchSuiHolderSnapshot({
        coinAddress: normalizeCoinType("0x2::sui::SUI"),
        airdropAmount: undefined,
        excludedAddresses: [],
      }),
    ).rejects.toThrow("Missing data.objects in GraphQL response.");
  });

  it("throws on upstream non-200 responses", async () => {
    fetchMock.mockResolvedValueOnce(new Response("{}", { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      fetchSuiHolderSnapshot({
        coinAddress: normalizeCoinType("0x2::sui::SUI"),
        airdropAmount: undefined,
        excludedAddresses: [],
      }),
    ).rejects.toThrow("Sui GraphQL request failed with HTTP 503.");
  });
});

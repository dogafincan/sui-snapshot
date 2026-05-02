import { z } from "zod";

const SUI_ADDRESS_PATTERN = /^(?:0x)?([0-9a-fA-F]{1,64})$/;
const COIN_TYPE_PATTERN =
  /^(0x[0-9a-fA-F]{1,64})::([A-Za-z_][A-Za-z0-9_]*)::([A-Za-z_][A-Za-z0-9_]*)$/;

export const COIN_TYPE_REQUIRED_MESSAGE = "Enter a Sui coin type.";
export const COIN_TYPE_FORMAT_MESSAGE = "Enter a coin type in 0xPACKAGE::MODULE::TOKEN format.";

export interface SnapshotMeta {
  endpoint: string;
  coinAddress: string;
  holderCount: number;
  totalBalance: string;
}

export interface SnapshotRow {
  rank: number;
  address: string;
  balance: string;
}

export interface SnapshotResult {
  meta: SnapshotMeta;
  rows: SnapshotRow[];
}

export interface SnapshotBalanceRow {
  address: string;
  rawBalance: string;
}

export interface SnapshotPageBatchResult {
  meta: Pick<SnapshotMeta, "endpoint" | "coinAddress">;
  balances: SnapshotBalanceRow[];
  cursor: string | null;
  nextCursor: string | null;
  decimals: number;
  pagesFetched: number;
  objectsFetched: number;
}

export function toErrorMessage(error: unknown) {
  if (error instanceof z.ZodError) {
    const issue = error.issues[0];
    return issue?.message ?? "The provided input is invalid.";
  }

  return error instanceof Error ? error.message : "An unexpected error occurred.";
}

export function normalizeSuiAddress(value: string) {
  const trimmed = value.trim();
  const match = trimmed.match(SUI_ADDRESS_PATTERN);

  if (!match) {
    throw new Error(`Invalid Sui address: ${value}`);
  }

  return `0x${match[1].toLowerCase().padStart(64, "0")}`;
}

export function normalizeCoinType(value: string) {
  const trimmed = value.trim();
  const match = trimmed.match(COIN_TYPE_PATTERN);

  if (!match) {
    throw new Error(COIN_TYPE_FORMAT_MESSAGE);
  }

  const [, packageAddress, moduleName, tokenName] = match;
  return `${normalizeSuiAddress(packageAddress)}::${moduleName}::${tokenName}`;
}

const coinTypeSchema = z
  .string()
  .trim()
  .min(1, COIN_TYPE_REQUIRED_MESSAGE)
  .superRefine((value, context) => {
    try {
      normalizeCoinType(value);
    } catch (error) {
      context.addIssue({
        code: "custom",
        message: toErrorMessage(error),
      });
    }
  })
  .transform((value) => normalizeCoinType(value));

export const snapshotInputSchema = z.object({
  coinAddress: coinTypeSchema,
});

export type SnapshotInput = z.infer<typeof snapshotInputSchema>;

export const snapshotPageBatchInputSchema = snapshotInputSchema.extend({
  cursor: z.string().nullable(),
  decimals: z.number().int().min(0).nullable().default(null),
});

export type SnapshotPageBatchInput = z.infer<typeof snapshotPageBatchInputSchema>;

export function formatUnits(raw: bigint, decimals: number) {
  if (decimals <= 0) {
    return raw.toString();
  }

  const text = raw.toString().padStart(decimals + 1, "0");
  const integerPart = text.slice(0, -decimals);
  const fractionalPart = text.slice(-decimals).replace(/0+$/, "");

  return fractionalPart ? `${integerPart}.${fractionalPart}` : integerPart;
}

const RAW_BALANCE_PATTERN = /^\d+$/;

function normalizeRawBalance(value: string) {
  const trimmed = value.trim();

  if (!RAW_BALANCE_PATTERN.test(trimmed)) {
    throw new Error(`Invalid raw balance: ${value}`);
  }

  return BigInt(trimmed).toString();
}

export function buildSnapshotResult({
  endpoint,
  coinAddress,
  decimals,
  balances,
}: {
  endpoint: string;
  coinAddress: string;
  decimals: number;
  balances: SnapshotBalanceRow[];
}): SnapshotResult {
  const aggregatedBalances = new Map<string, bigint>();

  for (const row of balances) {
    const address = normalizeSuiAddress(row.address);
    const rawBalance = BigInt(normalizeRawBalance(row.rawBalance));
    aggregatedBalances.set(address, (aggregatedBalances.get(address) ?? 0n) + rawBalance);
  }

  const rows: Array<{ address: string; rawBalance: bigint }> = [];
  let totalRawBalance = 0n;

  for (const [address, rawBalance] of aggregatedBalances) {
    if (rawBalance <= 0n) {
      continue;
    }

    totalRawBalance += rawBalance;
    rows.push({ address, rawBalance });
  }

  rows.sort((left, right) => {
    if (left.rawBalance !== right.rawBalance) {
      return left.rawBalance > right.rawBalance ? -1 : 1;
    }

    return left.address.localeCompare(right.address);
  });

  return {
    meta: {
      endpoint,
      coinAddress,
      holderCount: rows.length,
      totalBalance: formatUnits(totalRawBalance, decimals),
    },
    rows: rows.map((row, index) => ({
      rank: index + 1,
      address: row.address,
      balance: formatUnits(row.rawBalance, decimals),
    })),
  };
}

export function buildSnapshotCsv(snapshot: SnapshotResult) {
  const lines = ["rank,address,balance"];

  for (const row of snapshot.rows) {
    lines.push(`${row.rank},${row.address},${row.balance}`);
  }

  return `${lines.join("\n")}\n`;
}

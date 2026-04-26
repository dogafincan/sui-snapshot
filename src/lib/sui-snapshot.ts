import { z } from "zod";

const SUI_ADDRESS_PATTERN = /^(?:0x)?([0-9a-fA-F]{1,64})$/;
const COIN_TYPE_PATTERN =
  /^(0x[0-9a-fA-F]{1,64})::([A-Za-z_][A-Za-z0-9_]*)::([A-Za-z_][A-Za-z0-9_]*)$/;

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
  rawBalance: string;
}

export interface SnapshotResult {
  meta: SnapshotMeta;
  rows: SnapshotRow[];
}

export interface SnapshotBalanceRow {
  address: string;
  balance: string;
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
    throw new Error("Use the coin type format 0xPACKAGE::MODULE::TOKEN.");
  }

  const [, packageAddress, moduleName, tokenName] = match;
  return `${normalizeSuiAddress(packageAddress)}::${moduleName}::${tokenName}`;
}

const coinTypeSchema = z
  .string()
  .trim()
  .min(1, "Enter a coin type in 0xPACKAGE::MODULE::TOKEN format.")
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

const DECIMAL_AMOUNT_PATTERN = /^(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i;

export function normalizeDecimalAmount(value: string) {
  const trimmed = value.trim();

  if (!DECIMAL_AMOUNT_PATTERN.test(trimmed)) {
    throw new Error(`Invalid decimal amount: ${value}`);
  }

  const [coefficient, exponentText] = trimmed.toLowerCase().split("e");
  const exponent = exponentText ? Number.parseInt(exponentText, 10) : 0;
  const [integerText, fractionalText = ""] = coefficient.split(".");
  const digits = `${integerText}${fractionalText}`.replace(/^0+/, "");

  if (!digits) {
    return "0";
  }

  const decimalPlaces = fractionalText.length - exponent;

  if (decimalPlaces <= 0) {
    return `${digits}${"0".repeat(Math.abs(decimalPlaces))}`;
  }

  if (digits.length <= decimalPlaces) {
    const fraction = `${"0".repeat(decimalPlaces - digits.length)}${digits}`.replace(/0+$/, "");
    return fraction ? `0.${fraction}` : "0";
  }

  const integer = digits.slice(0, digits.length - decimalPlaces);
  const fraction = digits.slice(digits.length - decimalPlaces).replace(/0+$/, "");

  return fraction ? `${integer}.${fraction}` : integer;
}

function decimalParts(value: string) {
  const normalized = normalizeDecimalAmount(value);
  const [integer, fraction = ""] = normalized.split(".");
  return { integer, fraction };
}

export function compareDecimalAmounts(left: string, right: string) {
  const leftParts = decimalParts(left);
  const rightParts = decimalParts(right);

  if (leftParts.integer.length !== rightParts.integer.length) {
    return leftParts.integer.length > rightParts.integer.length ? 1 : -1;
  }

  const integerComparison = leftParts.integer.localeCompare(rightParts.integer);
  if (integerComparison !== 0) {
    return integerComparison > 0 ? 1 : -1;
  }

  const fractionLength = Math.max(leftParts.fraction.length, rightParts.fraction.length);
  const leftFraction = leftParts.fraction.padEnd(fractionLength, "0");
  const rightFraction = rightParts.fraction.padEnd(fractionLength, "0");

  if (leftFraction === rightFraction) {
    return 0;
  }

  return leftFraction > rightFraction ? 1 : -1;
}

export function addDecimalAmounts(left: string, right: string) {
  const leftParts = decimalParts(left);
  const rightParts = decimalParts(right);
  const scale = Math.max(leftParts.fraction.length, rightParts.fraction.length);
  const leftScaled = BigInt(`${leftParts.integer}${leftParts.fraction.padEnd(scale, "0")}`);
  const rightScaled = BigInt(`${rightParts.integer}${rightParts.fraction.padEnd(scale, "0")}`);
  const total = leftScaled + rightScaled;

  if (scale === 0) {
    return total.toString();
  }

  const text = total.toString().padStart(scale + 1, "0");
  const integer = text.slice(0, -scale);
  const fraction = text.slice(-scale).replace(/0+$/, "");

  return fraction ? `${integer}.${fraction}` : integer;
}

function compareSnapshotBalanceRows(left: SnapshotBalanceRow, right: SnapshotBalanceRow) {
  const balanceComparison = compareDecimalAmounts(left.balance, right.balance);
  if (balanceComparison !== 0) {
    return balanceComparison * -1;
  }

  return left.address.localeCompare(right.address);
}

export function buildSnapshotResult({
  endpoint,
  coinAddress,
  balances,
}: {
  endpoint: string;
  coinAddress: string;
  balances: SnapshotBalanceRow[];
}): SnapshotResult {
  const aggregatedBalances = new Map<string, string>();

  for (const row of balances) {
    const address = normalizeSuiAddress(row.address);
    const balance = normalizeDecimalAmount(row.balance);
    aggregatedBalances.set(
      address,
      addDecimalAmounts(aggregatedBalances.get(address) ?? "0", balance),
    );
  }

  const rows = Array.from(aggregatedBalances.entries())
    .map(([address, balance]) => ({ address, balance }))
    .filter((row) => compareDecimalAmounts(row.balance, "0") > 0)
    .sort(compareSnapshotBalanceRows);

  const totalBalance = rows.reduce((total, row) => addDecimalAmounts(total, row.balance), "0");

  return {
    meta: {
      endpoint,
      coinAddress,
      holderCount: rows.length,
      totalBalance,
    },
    rows: rows.map((row, index) => ({
      rank: index + 1,
      address: row.address,
      balance: row.balance,
      rawBalance: row.balance,
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

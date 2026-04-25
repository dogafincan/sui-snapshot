import { startTransition, type FormEvent, type ReactNode, useState } from "react";
import { Download, LoaderCircle, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { HoldersTable } from "@/components/holders-table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  buildSnapshotResult,
  toErrorMessage,
  type SnapshotBalanceRow,
  type SnapshotInput,
  type SnapshotPageBatchInput,
  type SnapshotPageBatchResult,
  type SnapshotResult,
} from "@/lib/sui-snapshot";
import {
  buildSnapshotDownload,
  buildSnapshotInputFromForm,
} from "@/components/snapshot-workbench.helpers";

type RunSnapshotBatch = (payload: {
  data: SnapshotPageBatchInput;
}) => Promise<SnapshotPageBatchResult>;

interface SnapshotProgress {
  objectsFetched: number;
  pagesFetched: number;
}

const BATCH_PAUSE_MS = 1_500;

function formatInteger(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function downloadSnapshot(snapshot: SnapshotResult) {
  const download = buildSnapshotDownload(snapshot);
  const blob = new Blob([download.csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = download.filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function SummaryCard({
  label,
  value,
  description,
}: {
  label: string;
  value: ReactNode;
  description: string;
}) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-2xl font-semibold tracking-tight tabular-nums">
          {value}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  );
}

function ResultsSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3">
            <Skeleton className="h-5 w-36" />
            <Skeleton className="h-4 w-full max-w-md" />
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-72 w-full" />
        </CardContent>
      </Card>
    </div>
  );
}

function EmptyState() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Ready to run</CardTitle>
        <CardDescription>Enter a Sui coin type to generate a ranked holder table.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 md:grid-cols-3">
        <Card size="sm">
          <CardHeader>
            <CardTitle>Live snapshot</CardTitle>
            <CardDescription>
              Scan live coin objects and aggregate balances by owner address.
            </CardDescription>
          </CardHeader>
        </Card>
        <Card size="sm">
          <CardHeader>
            <CardTitle>CSV export</CardTitle>
            <CardDescription>
              Review the table in the browser, then export the same rows as CSV.
            </CardDescription>
          </CardHeader>
        </Card>
      </CardContent>
    </Card>
  );
}

export function SnapshotWorkbench({ runSnapshotBatch }: { runSnapshotBatch: RunSnapshotBatch }) {
  const [coinAddress, setCoinAddress] = useState("0x2::sui::SUI");
  const [snapshot, setSnapshot] = useState<SnapshotResult | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [snapshotProgress, setSnapshotProgress] = useState<SnapshotProgress | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    setRequestError(null);

    let payload: SnapshotInput;
    try {
      payload = buildSnapshotInputFromForm({
        coinAddress,
      });
    } catch (error) {
      setFormError(toErrorMessage(error));
      return;
    }

    setIsSubmitting(true);
    setSnapshotProgress({ objectsFetched: 0, pagesFetched: 0 });

    try {
      const balances: SnapshotBalanceRow[] = [];
      let nextCursor: string | null = null;
      let pagesFetched = 0;
      let objectsFetched = 0;
      let endpoint: string | null = null;

      while (true) {
        const batch = await runSnapshotBatch({
          data: {
            ...payload,
            cursor: nextCursor,
          },
        });

        if (!batch) {
          throw new Error("Snapshot batch failed before returning data.");
        }

        endpoint = batch.meta.endpoint;
        balances.push(...batch.balances);
        pagesFetched += batch.pagesFetched;
        objectsFetched += batch.objectsFetched;
        nextCursor = batch.nextCursor;

        startTransition(() => {
          setSnapshotProgress({ objectsFetched, pagesFetched });
        });

        if (nextCursor === null) {
          break;
        }

        await wait(BATCH_PAUSE_MS);
      }

      const nextSnapshot = buildSnapshotResult({
        endpoint: endpoint ?? "https://graphql.mainnet.sui.io/graphql",
        coinAddress: payload.coinAddress,
        balances,
      });

      startTransition(() => {
        setSnapshot(nextSnapshot);
      });
      toast.success(`Loaded ${formatInteger(nextSnapshot.meta.holderCount)} holders.`);
    } catch (error) {
      const message = toErrorMessage(error);
      startTransition(() => {
        setRequestError(message);
      });
      toast.error(message);
    } finally {
      setIsSubmitting(false);
      setSnapshotProgress(null);
    }
  }

  function handleDownload() {
    if (!snapshot) {
      return;
    }

    downloadSnapshot(snapshot);
    toast.success("CSV download started.");
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-6 px-4 py-10 sm:px-6 lg:px-8">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">Sui holders snapshot</h1>
        <p className="max-w-3xl text-muted-foreground">
          Run a live holder snapshot and export the ranked holder list to CSV.
        </p>
      </header>

      <section className="grid gap-6 lg:grid-cols-[22rem_minmax(0,1fr)]">
        <Card className="h-fit lg:sticky lg:top-6">
          <CardHeader>
            <CardTitle>Snapshot parameters</CardTitle>
            <CardDescription>Inputs are normalized before the request is sent.</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="flex flex-col gap-6" onSubmit={handleSubmit}>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="coin-address">Coin address</FieldLabel>
                  <FieldDescription>
                    Use the format <code>0xPACKAGE::MODULE::TOKEN</code>.
                  </FieldDescription>
                  <Input
                    id="coin-address"
                    value={coinAddress}
                    onChange={(event) => setCoinAddress(event.target.value)}
                    placeholder="0x2::sui::SUI"
                    autoComplete="off"
                  />
                </Field>
              </FieldGroup>

              {formError ? (
                <Alert variant="destructive">
                  <Sparkles />
                  <AlertTitle>Validation error</AlertTitle>
                  <AlertDescription>{formError}</AlertDescription>
                </Alert>
              ) : null}

              {requestError ? (
                <Alert variant="destructive">
                  <Sparkles />
                  <AlertTitle>Snapshot failed</AlertTitle>
                  <AlertDescription>{requestError}</AlertDescription>
                </Alert>
              ) : null}

              <Button type="submit" size="lg" disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <LoaderCircle className="animate-spin" data-icon="inline-start" />
                    {snapshotProgress && snapshotProgress.pagesFetched > 0
                      ? `${formatInteger(snapshotProgress.objectsFetched)} coin objects scanned`
                      : "Running snapshot"}
                  </>
                ) : (
                  <>
                    <Sparkles data-icon="inline-start" />
                    Generate snapshot
                  </>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        <div className="flex flex-col gap-6">
          {snapshot ? (
            <>
              <div className="grid gap-4 md:grid-cols-3">
                <SummaryCard
                  label="Holders"
                  value={formatInteger(snapshot.meta.holderCount)}
                  description="Coin object balances aggregated by owner."
                />
                <SummaryCard
                  label="Total balance"
                  value={snapshot.meta.totalBalance}
                  description="Sum of the returned holder balances."
                />
                <SummaryCard
                  label="CSV format"
                  value="3 columns"
                  description="Exported as rank, address, and balance."
                />
              </div>

              <Card>
                <CardHeader>
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="flex flex-col gap-2">
                      <div className="flex flex-wrap gap-2">
                        <Badge variant="secondary">Holder snapshot</Badge>
                      </div>
                      <CardTitle>Snapshot results</CardTitle>
                      <CardDescription>
                        <span className="font-medium text-foreground">Coin type:</span>{" "}
                        <code className="font-mono">{snapshot.meta.coinAddress}</code>
                      </CardDescription>
                    </div>

                    <Button type="button" variant="outline" onClick={handleDownload}>
                      <Download data-icon="inline-start" />
                      Download CSV
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <HoldersTable rows={snapshot.rows} />
                </CardContent>
              </Card>
            </>
          ) : isSubmitting ? (
            <ResultsSkeleton />
          ) : (
            <EmptyState />
          )}
        </div>
      </section>
    </main>
  );
}

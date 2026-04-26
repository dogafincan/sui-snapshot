import { startTransition, type FormEvent, useRef, useState } from "react";
import {
  Camera,
  CircleAlert,
  CircleStop,
  Download,
  LoaderCircle,
  RotateCw,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";

import { HoldersTable } from "@/components/holders-table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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

interface SnapshotRunState extends SnapshotProgress {
  payload: SnapshotInput;
  balances: SnapshotBalanceRow[];
  nextCursor: string | null;
  decimals: number | null;
  endpoint: string | null;
}

const BATCH_PAUSE_MS = 1_500;
const COIN_ADDRESS_PLACEHOLDER = "Enter a Sui coin type";

function formatInteger(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

function formatCoinObjectProgress(value: number) {
  return `${formatInteger(value)} coin object${value === 1 ? "" : "s"} scanned`;
}

function getNormalizedCoinAddress(value: string) {
  try {
    return buildSnapshotInputFromForm({ coinAddress: value }).coinAddress;
  } catch {
    return null;
  }
}

function wait(ms: number, cancelWaitRef: { current: (() => void) | null }) {
  return new Promise<void>((resolve) => {
    const timeout = setTimeout(() => {
      cancelWaitRef.current = null;
      resolve();
    }, ms);

    cancelWaitRef.current = () => {
      clearTimeout(timeout);
      cancelWaitRef.current = null;
      resolve();
    };
  });
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

function ResultsSkeleton() {
  return (
    <div className="flex flex-1 flex-col gap-6">
      <Card className="flex-1">
        <CardHeader>
          <div className="flex flex-col gap-3">
            <Skeleton className="h-5 w-36" />
            <Skeleton className="h-4 w-full max-w-md" />
          </div>
        </CardHeader>
        <CardContent className="flex flex-1 flex-col gap-4">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-72 w-full" />
        </CardContent>
      </Card>
    </div>
  );
}

function EmptyHolderTable() {
  return (
    <Card className="flex-1">
      <CardContent className="flex flex-1 flex-col">
        <HoldersTable rows={[]} />
      </CardContent>
    </Card>
  );
}

export function SnapshotWorkbench({ runSnapshotBatch }: { runSnapshotBatch: RunSnapshotBatch }) {
  const [coinAddress, setCoinAddress] = useState("");
  const [snapshot, setSnapshot] = useState<SnapshotResult | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [snapshotProgress, setSnapshotProgress] = useState<SnapshotProgress | null>(null);
  const [pausedRun, setPausedRun] = useState<SnapshotRunState | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const cancelRequestedRef = useRef(false);
  const cancelWaitRef = useRef<(() => void) | null>(null);

  const normalizedInputCoinAddress = getNormalizedCoinAddress(coinAddress);
  const hasStaleSnapshot =
    snapshot !== null && normalizedInputCoinAddress !== snapshot.meta.coinAddress;

  async function runSnapshotFromState(initialState: SnapshotRunState) {
    setRequestError(null);
    setPausedRun(null);
    setIsSubmitting(true);
    setSnapshotProgress({
      objectsFetched: initialState.objectsFetched,
      pagesFetched: initialState.pagesFetched,
    });
    cancelRequestedRef.current = false;

    const payload = initialState.payload;

    try {
      const balances: SnapshotBalanceRow[] = [...initialState.balances];
      let nextCursor = initialState.nextCursor;
      let decimals = initialState.decimals;
      let pagesFetched = initialState.pagesFetched;
      let objectsFetched = initialState.objectsFetched;
      let endpoint = initialState.endpoint;

      while (true) {
        const batch = await runSnapshotBatch({
          data: {
            ...payload,
            cursor: nextCursor,
            decimals,
          },
        });

        if (!batch) {
          throw new Error("Snapshot batch failed before returning data.");
        }

        endpoint = batch.meta.endpoint;
        decimals = batch.decimals;
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

        if (cancelRequestedRef.current) {
          setPausedRun({
            payload,
            balances,
            nextCursor,
            decimals,
            pagesFetched,
            objectsFetched,
            endpoint,
          });
          return;
        }

        await wait(BATCH_PAUSE_MS, cancelWaitRef);

        if (cancelRequestedRef.current) {
          setPausedRun({
            payload,
            balances,
            nextCursor,
            decimals,
            pagesFetched,
            objectsFetched,
            endpoint,
          });
          return;
        }
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
      cancelRequestedRef.current = false;
      cancelWaitRef.current = null;
      setIsSubmitting(false);
      setSnapshotProgress(null);
    }
  }

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

    setSnapshot(null);
    await runSnapshotFromState({
      payload,
      balances: [],
      nextCursor: null,
      decimals: null,
      pagesFetched: 0,
      objectsFetched: 0,
      endpoint: null,
    });
  }

  function handleCoinAddressChange(value: string) {
    setCoinAddress(value);
    setFormError(null);
    setRequestError(null);
    setPausedRun(null);
  }

  function handleCancelSnapshot() {
    cancelRequestedRef.current = true;
    cancelWaitRef.current?.();
  }

  async function handleResumeSnapshot() {
    if (!pausedRun) {
      return;
    }

    setSnapshot(null);
    await runSnapshotFromState(pausedRun);
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

      <section className="grid flex-1 gap-6 lg:grid-cols-[22rem_minmax(0,1fr)]">
        <Card className="h-fit lg:sticky lg:top-6">
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
                    onChange={(event) => handleCoinAddressChange(event.target.value)}
                    placeholder={COIN_ADDRESS_PLACEHOLDER}
                    autoComplete="off"
                  />
                </Field>
              </FieldGroup>

              {formError ? (
                <Alert variant="destructive">
                  <CircleAlert />
                  <AlertTitle>Check coin type</AlertTitle>
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

              {pausedRun && !isSubmitting ? (
                <Alert>
                  <Sparkles />
                  <AlertTitle>Snapshot paused</AlertTitle>
                  <AlertDescription>
                    Resume from {formatCoinObjectProgress(pausedRun.objectsFetched)}.
                  </AlertDescription>
                </Alert>
              ) : null}

              <div className="flex flex-col gap-2">
                <Button type="submit" size="lg" disabled={isSubmitting}>
                  {isSubmitting ? (
                    <>
                      <LoaderCircle className="animate-spin" data-icon="inline-start" />
                      {snapshotProgress && snapshotProgress.pagesFetched > 0
                        ? formatCoinObjectProgress(snapshotProgress.objectsFetched)
                        : "Running snapshot"}
                    </>
                  ) : (
                    <>
                      <Camera data-icon="inline-start" />
                      Generate snapshot
                    </>
                  )}
                </Button>

                {isSubmitting ? (
                  <Button type="button" variant="outline" onClick={handleCancelSnapshot}>
                    <CircleStop data-icon="inline-start" />
                    Cancel snapshot
                  </Button>
                ) : pausedRun ? (
                  <Button type="button" variant="outline" onClick={handleResumeSnapshot}>
                    <RotateCw data-icon="inline-start" />
                    Resume snapshot
                  </Button>
                ) : null}
              </div>
            </form>
          </CardContent>
        </Card>

        <div className="flex min-h-0 flex-col gap-6 self-stretch">
          {snapshot ? (
            <>
              {hasStaleSnapshot ? (
                <Alert>
                  <Sparkles />
                  <AlertTitle>Input changed</AlertTitle>
                  <AlertDescription>
                    Generate a new snapshot to refresh these results.
                  </AlertDescription>
                </Alert>
              ) : null}

              <Card className="flex-1">
                <CardHeader>
                  <div className="flex min-w-0 flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="flex min-w-0 flex-1 flex-col gap-2">
                      <CardTitle>Snapshot results</CardTitle>
                      <CardDescription className="flex min-w-0 flex-col gap-1 sm:flex-row sm:items-baseline">
                        <span className="shrink-0 font-medium text-foreground">Coin type:</span>
                        <code
                          className="block min-w-0 max-w-full truncate font-mono"
                          title={snapshot.meta.coinAddress}
                        >
                          {snapshot.meta.coinAddress}
                        </code>
                      </CardDescription>
                    </div>

                    <Button
                      type="button"
                      variant="outline"
                      className="w-full sm:w-auto lg:shrink-0"
                      onClick={handleDownload}
                    >
                      <Download data-icon="inline-start" />
                      Download CSV
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="flex flex-1 flex-col">
                  <HoldersTable rows={snapshot.rows} />
                </CardContent>
              </Card>
            </>
          ) : isSubmitting ? (
            <ResultsSkeleton />
          ) : (
            <EmptyHolderTable />
          )}
        </div>
      </section>
    </main>
  );
}

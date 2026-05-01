import { startTransition, type FormEvent, useRef, useState } from "react";
import {
  Camera,
  CircleAlert,
  CirclePause,
  CircleX,
  Download,
  LoaderCircle,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";

import { HoldersTable } from "@/components/holders-table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Item, ItemContent } from "@/components/ui/item";
import { Skeleton } from "@/components/ui/skeleton";
import {
  buildSnapshotResult,
  COIN_TYPE_REQUIRED_MESSAGE,
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
const HEADER_LOGO_FOR_LIGHT_MODE = "/logo-dark.png";
const HEADER_LOGO_FOR_DARK_MODE = "/logo-light.png";

interface FormError {
  title: string;
  description: string;
}

interface RequestError {
  title: string;
  description: string;
}

const INTERNAL_SERVER_ERROR_PATTERN = /^internal error;\s*reference\s*=/i;

function formatInteger(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

function formatCoinObjectProgress(value: number) {
  return `${formatInteger(value)} coin object${value === 1 ? "" : "s"} scanned`;
}

function getFormError(error: unknown): FormError {
  const description = toErrorMessage(error);

  return {
    title:
      description === COIN_TYPE_REQUIRED_MESSAGE
        ? "Coin type required"
        : "Invalid coin type format",
    description,
  };
}

function getRequestError(error: unknown): RequestError {
  const description = toErrorMessage(error);

  if (INTERNAL_SERVER_ERROR_PATTERN.test(description.trim())) {
    return {
      title: "Snapshot could not be generated",
      description: "The snapshot service returned an internal error. Please try again.",
    };
  }

  return {
    title: "Snapshot could not be generated",
    description,
  };
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
    <Card
      className="min-w-0 max-w-full flex-1 overflow-hidden"
      role="status"
      aria-label="Loading ranked holders"
    >
      <CardContent className="flex min-w-0 flex-1 flex-col px-4 sm:px-6">
        <div className="flex h-full min-h-[28rem] flex-col gap-4">
          <Item variant="muted" aria-hidden="true">
            <ItemContent>
              <Skeleton className="h-6 w-36 bg-muted-foreground/15" />
              <Skeleton className="h-6 w-52 max-w-full bg-muted-foreground/15" />
            </ItemContent>
          </Item>

          <Skeleton className="h-10 w-full" aria-hidden="true" />

          <div className="min-h-0 min-w-0 max-w-full flex-1" aria-hidden="true">
            <div className="grid grid-cols-[20%_1fr_25%] items-center gap-4 border-b py-3">
              <Skeleton className="h-6 w-12" />
              <Skeleton className="h-6 w-20" />
              <Skeleton className="ml-auto h-6 w-20" />
            </div>

            <div className="space-y-5 py-6">
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="grid grid-cols-[20%_1fr_25%] items-center gap-4">
                  <Skeleton className="h-5 w-8" />
                  <Skeleton className="h-5 w-full" />
                  <Skeleton className="ml-auto h-5 w-24" />
                </div>
              ))}
            </div>
          </div>

          <div
            className="mt-auto flex flex-row items-center justify-between gap-3"
            aria-hidden="true"
          >
            <Skeleton className="h-5 w-20" />
            <div className="flex shrink-0 items-center gap-2">
              <Skeleton className="h-9 w-28" />
              <Skeleton className="h-9 w-20" />
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function EmptyHolderTable() {
  return (
    <Card className="min-w-0 max-w-full flex-1 overflow-hidden">
      <CardContent className="flex min-w-0 flex-1 flex-col px-4 sm:px-6">
        <HoldersTable rows={[]} />
      </CardContent>
    </Card>
  );
}

export function SnapshotWorkbench({ runSnapshotBatch }: { runSnapshotBatch: RunSnapshotBatch }) {
  const [coinAddress, setCoinAddress] = useState("");
  const [snapshot, setSnapshot] = useState<SnapshotResult | null>(null);
  const [formError, setFormError] = useState<FormError | null>(null);
  const [requestError, setRequestError] = useState<RequestError | null>(null);
  const [snapshotProgress, setSnapshotProgress] = useState<SnapshotProgress | null>(null);
  const [pausedRun, setPausedRun] = useState<SnapshotRunState | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const cancelRequestedRef = useRef(false);
  const cancelWaitRef = useRef<(() => void) | null>(null);

  async function runSnapshotFromState(initialState: SnapshotRunState) {
    setRequestError(null);
    setPausedRun(null);
    setIsSubmitting(true);
    setIsCancelling(false);
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
      const nextRequestError = getRequestError(error);
      startTransition(() => {
        setRequestError(nextRequestError);
      });
      toast.error(nextRequestError.description);
    } finally {
      cancelRequestedRef.current = false;
      cancelWaitRef.current = null;
      setIsSubmitting(false);
      setIsCancelling(false);
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
      setFormError(getFormError(error));
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
    setIsCancelling(true);
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

  const isGenerateButtonLoading = isSubmitting && !isCancelling;

  return (
    <main className="mx-auto flex min-h-screen w-full min-w-0 max-w-full flex-col gap-8 px-3 py-10 sm:max-w-6xl sm:px-6 lg:px-8">
      <header className="flex flex-col items-center gap-4 text-center md:flex-row md:gap-6 md:pl-4 md:text-left">
        <div
          data-slot="app-logo"
          className="relative size-15 shrink-0 overflow-hidden md:size-16"
          aria-hidden="true"
        >
          <img
            src={HEADER_LOGO_FOR_LIGHT_MODE}
            alt=""
            data-slot="app-logo-for-light-mode"
            className="size-full"
          />
          <img
            src={HEADER_LOGO_FOR_DARK_MODE}
            alt=""
            data-slot="app-logo-for-dark-mode"
            className="size-full"
          />
        </div>
        <div className="flex min-w-0 flex-col gap-2 md:gap-1.5">
          <h1 className="text-balance text-4xl leading-tight font-bold tracking-tight">
            Sui Snapshot
          </h1>
          <p className="max-w-full text-balance text-lg font-medium text-muted-foreground sm:max-w-3xl">
            Generate a ranked holder list for a Sui coin type and export it as CSV.
          </p>
        </div>
      </header>

      <section
        data-slot="snapshot-workbench"
        className="grid w-full min-w-0 max-w-full flex-1 grid-cols-[minmax(0,1fr)] items-start gap-6 rounded-[2.75rem] border border-transparent bg-muted p-3 sm:rounded-[3rem] sm:p-6 lg:grid-cols-[22rem_minmax(0,1fr)] dark:border-border dark:bg-background"
      >
        <div
          data-slot="snapshot-controls"
          className="min-w-0 max-w-full self-start lg:sticky lg:top-6"
        >
          <Card className="h-fit min-w-0 max-w-full">
            <CardContent className="px-4 sm:px-6">
              <form className="flex w-full max-w-full flex-col gap-3" onSubmit={handleSubmit}>
                <FieldGroup>
                  <Field className="gap-5">
                    <FieldContent className="gap-1">
                      <FieldLabel htmlFor="coin-type" className="text-base font-semibold">
                        Coin type
                      </FieldLabel>
                      <FieldDescription className="text-base leading-normal">
                        Use the format <code>0xPACKAGE::MODULE::TOKEN</code>.
                      </FieldDescription>
                    </FieldContent>
                    <Input
                      id="coin-type"
                      value={coinAddress}
                      onChange={(event) => handleCoinAddressChange(event.target.value)}
                      placeholder={COIN_ADDRESS_PLACEHOLDER}
                      autoComplete="off"
                    />
                  </Field>
                </FieldGroup>

                {formError ? (
                  <Alert variant="destructive">
                    <CircleAlert data-lucide="validation-alert" />
                    <AlertTitle>{formError.title}</AlertTitle>
                    <AlertDescription>{formError.description}</AlertDescription>
                  </Alert>
                ) : null}

                {requestError ? (
                  <Alert variant="destructive">
                    <CircleAlert data-lucide="snapshot-failed" />
                    <AlertTitle>{requestError.title}</AlertTitle>
                    <AlertDescription>{requestError.description}</AlertDescription>
                  </Alert>
                ) : null}

                <div className="flex flex-col gap-2">
                  <Button
                    type="submit"
                    size="lg"
                    className="w-full max-w-full"
                    disabled={isSubmitting}
                  >
                    {isGenerateButtonLoading ? (
                      <>
                        <LoaderCircle
                          className="animate-spin"
                          data-icon="inline-start"
                          data-lucide="snapshot-loading"
                        />
                        {snapshotProgress && snapshotProgress.pagesFetched > 0
                          ? formatCoinObjectProgress(snapshotProgress.objectsFetched)
                          : "Running snapshot"}
                      </>
                    ) : (
                      <>
                        <Camera data-icon="inline-start" data-lucide="generate-snapshot" />
                        Generate snapshot
                      </>
                    )}
                  </Button>

                  {isSubmitting ? (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleCancelSnapshot}
                      disabled={isCancelling}
                    >
                      {isCancelling ? (
                        <LoaderCircle
                          className="animate-spin"
                          data-icon="inline-start"
                          data-lucide="snapshot-cancelling"
                        />
                      ) : (
                        <CircleX data-icon="inline-start" data-lucide="cancel-snapshot" />
                      )}
                      {isCancelling ? "Cancelling snapshot" : "Cancel snapshot"}
                    </Button>
                  ) : pausedRun ? (
                    <Button type="button" variant="outline" onClick={handleResumeSnapshot}>
                      <RefreshCw data-icon="inline-start" data-lucide="resume-snapshot" />
                      Resume snapshot
                    </Button>
                  ) : null}
                </div>

                {pausedRun && !isSubmitting ? (
                  <Alert>
                    <CirclePause data-lucide="snapshot-paused" />
                    <AlertTitle>Snapshot paused</AlertTitle>
                    <AlertDescription>
                      Resume from {formatCoinObjectProgress(pausedRun.objectsFetched)}.
                    </AlertDescription>
                  </Alert>
                ) : null}
              </form>
            </CardContent>
          </Card>
        </div>

        <div className="flex min-h-0 min-w-0 flex-col gap-6 self-stretch">
          {snapshot ? (
            <Card className="min-w-0 max-w-full flex-1 overflow-hidden">
              <CardContent className="flex min-w-0 flex-1 flex-col px-4 sm:px-6">
                <HoldersTable
                  rows={snapshot.rows}
                  action={
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full"
                      onClick={handleDownload}
                    >
                      <Download data-icon="inline-start" data-lucide="download-csv" />
                      Download CSV
                    </Button>
                  }
                />
              </CardContent>
            </Card>
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

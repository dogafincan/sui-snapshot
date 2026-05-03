import { type FormEvent } from "react";
import {
  Camera,
  CircleAlert,
  CirclePause,
  CircleX,
  Download,
  LoaderCircle,
  RefreshCw,
} from "lucide-react";

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
  formatCoinObjectProgress,
  type RunSnapshotBatch,
  useSnapshotRunner,
} from "@/components/use-snapshot-runner";

const COIN_ADDRESS_PLACEHOLDER = "Enter a Sui type";
const HEADER_LOGO = "/apple-touch-icon.png";

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
  const runner = useSnapshotRunner({ runSnapshotBatch });

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await runner.submitSnapshot();
  }

  const {
    coinAddress,
    snapshot,
    formError,
    requestError,
    snapshotProgress,
    pausedRun,
    isSubmitting,
    isCancelling,
    isGenerateButtonLoading,
    changeCoinAddress,
    cancelSnapshot,
    resumeSnapshot,
    downloadSnapshot,
  } = runner;

  return (
    <main className="mx-auto flex min-h-screen w-full min-w-0 max-w-full flex-col gap-8 px-3 py-10 sm:max-w-6xl sm:px-6 lg:px-8">
      <header className="flex flex-col items-center gap-4 text-center text-[oklch(0.145_0_0)]">
        <div
          data-slot="app-logo"
          className="relative size-15 shrink-0 overflow-hidden"
          aria-hidden="true"
        >
          <img src={HEADER_LOGO} alt="" data-slot="app-logo-image" className="size-full" />
        </div>
        <div className="flex min-w-0 flex-col gap-2">
          <h1 className="text-balance text-4xl leading-tight font-bold tracking-tight">
            Sui Snapshot
          </h1>
          <p className="max-w-[40rem] text-balance text-lg font-medium md:max-w-full">
            Generate a ranked holder list for a Sui coin{" "}
            <span className="md:block">or NFT collection and export it as CSV.</span>
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
                        Sui type
                      </FieldLabel>
                      <FieldDescription className="text-base leading-normal">
                        Use the format <code>0xPACKAGE::MODULE::TYPE</code>.
                      </FieldDescription>
                    </FieldContent>
                    <Input
                      id="coin-type"
                      value={coinAddress}
                      onChange={(event) => changeCoinAddress(event.target.value)}
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
                      onClick={cancelSnapshot}
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
                    <Button type="button" variant="outline" onClick={resumeSnapshot}>
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
                      onClick={downloadSnapshot}
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

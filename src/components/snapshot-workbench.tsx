import {
  startTransition,
  type FormEvent,
  type ReactNode,
  useState,
} from "react"
import { Download, LoaderCircle, Sparkles } from "lucide-react"
import { toast } from "sonner"

import { HoldersTable, HoldersTablePreview } from "@/components/holders-table"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import {
  toErrorMessage,
  type SnapshotInput,
  type SnapshotResult,
} from "@/lib/sui-snapshot"
import {
  buildSnapshotDownload,
  buildSnapshotInputFromForm,
} from "@/components/snapshot-workbench.helpers"

type RunSnapshot = (payload: { data: SnapshotInput }) => Promise<SnapshotResult>

function formatInteger(value: number) {
  return new Intl.NumberFormat("en-US").format(value)
}

function endpointHost(endpoint: string) {
  try {
    return new URL(endpoint).hostname
  } catch {
    return endpoint
  }
}

function downloadSnapshot(snapshot: SnapshotResult) {
  const download = buildSnapshotDownload(snapshot)
  const blob = new Blob([download.csv], { type: "text/csv" })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")

  anchor.href = url
  anchor.download = download.filename
  anchor.click()
  URL.revokeObjectURL(url)
}

function SummaryCard({
  label,
  value,
  description,
}: {
  label: string
  value: ReactNode
  description: string
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
  )
}

function SummaryCardsPreview({
  mode,
}: {
  mode: "preview" | "loading"
}) {
  const isLoading = mode === "loading"

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <SummaryCard
        label="Holders"
        value={<Skeleton className="h-8 w-24" />}
        description={
          isLoading
            ? "Aggregating unique owner addresses from live Coin<T> objects."
            : "Unique owner count appears here after the snapshot runs."
        }
      />
      <SummaryCard
        label="Total balance"
        value={<Skeleton className="h-8 w-28" />}
        description="Formatted token balance using the coin's on-chain decimals."
      />
      <SummaryCard
        label="Eligible holders"
        value={<Skeleton className="h-8 w-20" />}
        description="Exclusion rules are applied before airdrop shares are computed."
      />
      <SummaryCard
        label="Output mode"
        value={isLoading ? "Loading" : "Preview"}
        description="The same summary, table, and export area stay in place across every state."
      />
    </div>
  )
}

function WorkspaceMeta({
  children,
}: {
  children: ReactNode
}) {
  return (
    <div className="grid gap-3 md:grid-cols-3">
      {children}
    </div>
  )
}

function WorkspaceMetaItem({
  label,
  value,
}: {
  label: string
  value: ReactNode
}) {
  return (
    <div className="rounded-[calc(var(--radius)*2)] border bg-background px-4 py-3">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <div className="mt-2 text-sm font-medium text-foreground">{value}</div>
    </div>
  )
}

function ResultsPreviewCard({
  mode,
}: {
  mode: "preview" | "loading"
}) {
  const isLoading = mode === "loading"

  return (
    <Card className="min-h-[30rem]">
      <CardHeader>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary">
                {isLoading ? "Loading workspace" : "Preview workspace"}
              </Badge>
              <Badge variant="outline">
                {isLoading ? "Fetching live data" : "Ready for the next run"}
              </Badge>
            </div>
            <div className="flex flex-col gap-1">
              <CardTitle>Snapshot results</CardTitle>
              <CardDescription>
                {isLoading
                  ? "Preparing the ranked table, client-side filters, and export action."
                  : "This workspace becomes the live ranked output as soon as the snapshot completes."}
              </CardDescription>
            </div>
          </div>

          <Button type="button" variant="outline" disabled>
            <Download data-icon="inline-start" />
            Download CSV
          </Button>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <WorkspaceMeta>
          <WorkspaceMetaItem
            label="Coin type"
            value={<Skeleton className="h-4 w-full max-w-40" />}
          />
          <WorkspaceMetaItem
            label="Endpoint"
            value={<Skeleton className="h-4 w-full max-w-32" />}
          />
          <WorkspaceMetaItem
            label="Export"
            value={isLoading ? "Preparing CSV payload" : "CSV generated from the current rows"}
          />
        </WorkspaceMeta>

        <HoldersTablePreview mode={mode} />
      </CardContent>
    </Card>
  )
}

export function SnapshotWorkbench({
  runSnapshot,
}: {
  runSnapshot: RunSnapshot
}) {
  const [coinAddress, setCoinAddress] = useState("0x2::sui::SUI")
  const [airdropAmount, setAirdropAmount] = useState("")
  const [excludedAddressText, setExcludedAddressText] = useState("")
  const [snapshot, setSnapshot] = useState<SnapshotResult | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [requestError, setRequestError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFormError(null)
    setRequestError(null)

    let payload: SnapshotInput
    try {
      payload = buildSnapshotInputFromForm({
        coinAddress,
        airdropAmount,
        excludedAddressText,
      })
    } catch (error) {
      setFormError(toErrorMessage(error))
      return
    }

    setIsSubmitting(true)

    try {
      const nextSnapshot = await runSnapshot({ data: payload })
      startTransition(() => {
        setSnapshot(nextSnapshot)
      })
      toast.success(`Loaded ${formatInteger(nextSnapshot.meta.holderCount)} holders.`)
    } catch (error) {
      const message = toErrorMessage(error)
      startTransition(() => {
        setRequestError(message)
      })
      toast.error(message)
    } finally {
      setIsSubmitting(false)
    }
  }

  function handleDownload() {
    if (!snapshot) {
      return
    }

    downloadSnapshot(snapshot)
    toast.success("CSV download started.")
  }

  return (
    <main className="flex flex-col gap-6">
      <section className="flex flex-col gap-3 rounded-[calc(var(--radius)*3)] border bg-background px-5 py-5 sm:px-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary">Snapshot workspace</Badge>
              <Badge variant="outline">Stateless execution</Badge>
            </div>
            <div className="flex flex-col gap-1">
              <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                Run a live holder snapshot
              </h1>
              <p className="max-w-3xl text-sm text-muted-foreground sm:text-base">
                Configure the token, optional airdrop, and exclusions, then work
                from a stable results surface built for filtering, review, and CSV export.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">Client-side table</Badge>
            <Badge variant="outline">Optional airdrop split</Badge>
            <Badge variant="outline">CSV export</Badge>
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[22rem_minmax(0,1fr)]">
        <Card className="h-fit xl:sticky xl:top-4">
          <CardHeader>
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary">Operations rail</Badge>
                <Badge variant="outline">Direct request flow</Badge>
              </div>
              <div className="flex flex-col gap-1">
                <CardTitle>Run snapshot</CardTitle>
                <CardDescription>
                  Provide a Sui coin type, optional airdrop amount, and any addresses
                  that should be excluded from the allocation.
                </CardDescription>
              </div>
            </div>
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

                <Field>
                  <FieldLabel htmlFor="airdrop-amount">Airdrop amount</FieldLabel>
                  <FieldDescription>
                    Leave this empty to run a balance-only snapshot.
                  </FieldDescription>
                  <Input
                    id="airdrop-amount"
                    value={airdropAmount}
                    onChange={(event) => setAirdropAmount(event.target.value)}
                    placeholder="1000000"
                    autoComplete="off"
                  />
                </Field>

                <Field>
                  <FieldLabel htmlFor="excluded-addresses">
                    Excluded addresses
                  </FieldLabel>
                  <FieldDescription>
                    Only used when airdrop mode is enabled.
                  </FieldDescription>
                  <Textarea
                    id="excluded-addresses"
                    value={excludedAddressText}
                    onChange={(event) => setExcludedAddressText(event.target.value)}
                    placeholder={"0x0000...\n0x1234..."}
                    className="min-h-36"
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

              <div className="flex flex-wrap gap-2">
                <Badge variant="outline">No storage</Badge>
                <Badge variant="outline">JSON-safe payload</Badge>
                <Badge variant="outline">Mainnet by default</Badge>
              </div>

              <Button type="submit" size="lg" disabled={isSubmitting} className="w-full">
                {isSubmitting ? (
                  <>
                    <LoaderCircle className="animate-spin" data-icon="inline-start" />
                    Running snapshot
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
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <SummaryCard
                  label="Holders"
                  value={formatInteger(snapshot.meta.holderCount)}
                  description="All live Coin<T> objects aggregated by owner address."
                />
                <SummaryCard
                  label="Total balance"
                  value={snapshot.meta.totalBalance}
                  description={`Coin decimals: ${snapshot.meta.decimals}`}
                />
                <SummaryCard
                  label="Eligible holders"
                  value={formatInteger(snapshot.meta.eligibleHolderCount)}
                  description={`${formatInteger(snapshot.meta.exclusionCount)} excluded address${snapshot.meta.exclusionCount === 1 ? "" : "es"}`}
                />
                <SummaryCard
                  label="Output mode"
                  value={
                    snapshot.meta.airdropEnabled
                      ? snapshot.meta.totalAirdropAmount ?? "Airdrop"
                      : "Snapshot"
                  }
                  description={
                    snapshot.meta.airdropEnabled
                      ? "Proportional allocation with remainder assigned to the top eligible holder."
                      : "Balance-only snapshot with CSV export."
                  }
                />
              </div>

              <Card className="min-h-[30rem]">
                <CardHeader>
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="flex flex-col gap-3">
                      <div className="flex flex-wrap gap-2">
                        <Badge
                          variant={
                            snapshot.meta.airdropEnabled ? "default" : "secondary"
                          }
                        >
                          {snapshot.meta.airdropEnabled
                            ? "Airdrop allocation"
                            : "Holder snapshot"}
                        </Badge>
                        <Badge variant="outline">
                          {endpointHost(snapshot.meta.endpoint)}
                        </Badge>
                      </div>
                      <div className="flex flex-col gap-1">
                        <CardTitle>Snapshot results</CardTitle>
                        <CardDescription>
                          Filter, sort, paginate, and export the current response
                          without rerunning the Worker.
                        </CardDescription>
                      </div>
                    </div>

                    <Button type="button" variant="outline" onClick={handleDownload}>
                      <Download data-icon="inline-start" />
                      Download CSV
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="flex flex-col gap-6">
                  <WorkspaceMeta>
                    <WorkspaceMetaItem
                      label="Coin type"
                      value={<code className="font-mono">{snapshot.meta.coinAddress}</code>}
                    />
                    <WorkspaceMetaItem
                      label="Endpoint"
                      value={<code className="font-mono">{snapshot.meta.endpoint}</code>}
                    />
                    <WorkspaceMetaItem
                      label="Dataset"
                      value={`${formatInteger(snapshot.rows.length)} ranked row${snapshot.rows.length === 1 ? "" : "s"}`}
                    />
                  </WorkspaceMeta>

                  <HoldersTable
                    rows={snapshot.rows}
                    showAirdrop={snapshot.meta.airdropEnabled}
                  />
                </CardContent>
              </Card>
            </>
          ) : isSubmitting ? (
            <>
              <SummaryCardsPreview mode="loading" />
              <ResultsPreviewCard mode="loading" />
            </>
          ) : (
            <>
              <SummaryCardsPreview mode="preview" />
              <ResultsPreviewCard mode="preview" />
            </>
          )}
        </div>
      </section>
    </main>
  )
}

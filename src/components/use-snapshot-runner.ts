import { startTransition, useRef, useState } from "react";
import { toast } from "sonner";

import {
  buildSnapshotDownload,
  buildSnapshotInputFromForm,
} from "@/components/snapshot-workbench.helpers";
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

export type RunSnapshotBatch = (payload: {
  data: SnapshotPageBatchInput;
}) => Promise<SnapshotPageBatchResult>;

export interface SnapshotProgress {
  objectsFetched: number;
  pagesFetched: number;
}

export interface SnapshotRunState extends SnapshotProgress {
  payload: SnapshotInput;
  balances: SnapshotBalanceRow[];
  nextCursor: string | null;
  decimals: number | null;
  endpoint: string | null;
}

export interface FormError {
  title: string;
  description: string;
}

export interface RequestError {
  title: string;
  description: string;
}

interface UseSnapshotRunnerOptions {
  runSnapshotBatch: RunSnapshotBatch;
  batchPauseMs?: number;
  notifySuccess?: (message: string) => void;
  notifyError?: (message: string) => void;
}

const DEFAULT_ENDPOINT = "https://graphql.mainnet.sui.io/graphql";
export const DEFAULT_BATCH_PAUSE_MS = 100;

const INTERNAL_SERVER_ERROR_PATTERN = /^internal error;\s*reference\s*=/i;

export function formatInteger(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

export function formatCoinObjectProgress(value: number) {
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

function downloadSnapshotFile(snapshot: SnapshotResult) {
  const download = buildSnapshotDownload(snapshot);
  const blob = new Blob([download.csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = download.filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function useSnapshotRunner({
  runSnapshotBatch,
  batchPauseMs = DEFAULT_BATCH_PAUSE_MS,
  notifySuccess = toast.success,
  notifyError = toast.error,
}: UseSnapshotRunnerOptions) {
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

        await wait(batchPauseMs, cancelWaitRef);

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
        endpoint: endpoint ?? DEFAULT_ENDPOINT,
        coinAddress: payload.coinAddress,
        decimals: decimals ?? 0,
        balances,
      });

      startTransition(() => {
        setSnapshot(nextSnapshot);
      });
      notifySuccess(`Loaded ${formatInteger(nextSnapshot.meta.holderCount)} holders.`);
    } catch (error) {
      const nextRequestError = getRequestError(error);
      startTransition(() => {
        setRequestError(nextRequestError);
      });
      notifyError(nextRequestError.description);
    } finally {
      cancelRequestedRef.current = false;
      cancelWaitRef.current = null;
      setIsSubmitting(false);
      setIsCancelling(false);
      setSnapshotProgress(null);
    }
  }

  async function submitSnapshot() {
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

  function changeCoinAddress(value: string) {
    setCoinAddress(value);
    setFormError(null);
    setRequestError(null);
    setPausedRun(null);
  }

  function cancelSnapshot() {
    setIsCancelling(true);
    cancelRequestedRef.current = true;
    cancelWaitRef.current?.();
  }

  async function resumeSnapshot() {
    if (!pausedRun) {
      return;
    }

    setSnapshot(null);
    await runSnapshotFromState(pausedRun);
  }

  function downloadSnapshot() {
    if (!snapshot) {
      return;
    }

    downloadSnapshotFile(snapshot);
    notifySuccess("CSV download started.");
  }

  return {
    coinAddress,
    snapshot,
    formError,
    requestError,
    snapshotProgress,
    pausedRun,
    isSubmitting,
    isCancelling,
    isGenerateButtonLoading: isSubmitting && !isCancelling,
    changeCoinAddress,
    submitSnapshot,
    cancelSnapshot,
    resumeSnapshot,
    downloadSnapshot,
  };
}

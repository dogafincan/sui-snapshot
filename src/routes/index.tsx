import { createFileRoute } from "@tanstack/react-router";

import { SnapshotWorkbench } from "@/components/snapshot-workbench";
import { runSnapshotBatch } from "@/lib/sui-snapshot.functions";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      {
        title: "Sui Snapshot",
      },
      {
        name: "description",
        content: "Run Sui token holder snapshots and export ranked holder CSV results on demand.",
      },
    ],
  }),
  component: IndexRoute,
});

function IndexRoute() {
  return <SnapshotWorkbench runSnapshotBatch={runSnapshotBatch} />;
}

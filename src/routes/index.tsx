import { createFileRoute } from "@tanstack/react-router";

import { SnapshotWorkbench } from "@/components/snapshot-workbench";
import { runSnapshotBatch } from "@/lib/sui-snapshot.functions";

const PAGE_TITLE = "Sui Snapshot";
const PAGE_DESCRIPTION =
  "Generate a ranked holder list for a Sui coin or NFT collection and export it as CSV.";
const SITE_URL = "https://sui-snapshot.dogafincan.workers.dev";
const SOCIAL_IMAGE = `${SITE_URL}/og-image.png?v=20260504`;

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      {
        title: PAGE_TITLE,
      },
      {
        name: "description",
        content: PAGE_DESCRIPTION,
      },
      {
        property: "og:type",
        content: "website",
      },
      {
        property: "og:url",
        content: SITE_URL,
      },
      {
        property: "og:title",
        content: PAGE_TITLE,
      },
      {
        property: "og:description",
        content: PAGE_DESCRIPTION,
      },
      {
        property: "og:image",
        content: SOCIAL_IMAGE,
      },
      {
        property: "og:image:secure_url",
        content: SOCIAL_IMAGE,
      },
      {
        property: "og:image:width",
        content: "1200",
      },
      {
        property: "og:image:height",
        content: "630",
      },
      {
        property: "og:image:alt",
        content: "Sui Snapshot app header with the camera logo and product description.",
      },
      {
        name: "twitter:card",
        content: "summary_large_image",
      },
      {
        name: "twitter:site",
        content: "@dogafincan",
      },
      {
        name: "twitter:creator",
        content: "@dogafincan",
      },
      {
        name: "twitter:title",
        content: PAGE_TITLE,
      },
      {
        name: "twitter:description",
        content: PAGE_DESCRIPTION,
      },
      {
        name: "twitter:image",
        content: SOCIAL_IMAGE,
      },
      {
        name: "twitter:image:alt",
        content: "Sui Snapshot app header with the camera logo and product description.",
      },
    ],
    links: [
      {
        rel: "canonical",
        href: SITE_URL,
      },
    ],
  }),
  component: IndexRoute,
});

function IndexRoute() {
  return <SnapshotWorkbench runSnapshotBatch={runSnapshotBatch} />;
}

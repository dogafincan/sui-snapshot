import type { ReactNode } from "react"
import { HeadContent, Scripts, createRootRoute } from "@tanstack/react-router"
import { TanStackDevtools } from "@tanstack/react-devtools"
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools"
import { Sparkles } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Toaster } from "@/components/ui/sonner"

import appCss from "../styles.css?url"

export const Route = createRootRoute({
  head: () => ({
    meta: [
      {
        charSet: "utf-8",
      },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1",
      },
      {
        title: "Sui Holders Snapshot",
      },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
    ],
  }),
  shellComponent: RootDocument,
})

function RootDocument({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body className="bg-muted/30">
        <div className="min-h-screen">
          <header className="border-b bg-background/95">
            <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl border bg-background">
                  <Sparkles className="size-4" />
                </div>
                <div className="flex min-w-0 flex-col">
                  <span className="truncate text-sm font-semibold">
                    Sui holders snapshot
                  </span>
                  <span className="truncate text-xs text-muted-foreground">
                    Live holder snapshots, proportional airdrops, and CSV export.
                  </span>
                </div>
              </div>

              <div className="hidden items-center gap-2 lg:flex">
                <Badge variant="outline">Cloudflare Worker</Badge>
                <Badge variant="outline">Live Sui GraphQL</Badge>
                <Badge variant="outline">CSV export</Badge>
              </div>
            </div>
          </header>

          <div className="mx-auto w-full max-w-7xl px-4 py-4 sm:px-6 sm:py-6 lg:px-8 lg:py-8">
            <div className="rounded-[2rem] border bg-muted/20 p-3 sm:p-4 lg:p-5">
              {children}
            </div>
          </div>
        </div>
        <Toaster position="top-right" richColors closeButton />
        <TanStackDevtools
          config={{
            position: "bottom-right",
          }}
          plugins={[
            {
              name: "Tanstack Router",
              render: <TanStackRouterDevtoolsPanel />,
            },
          ]}
        />
        <Scripts />
      </body>
    </html>
  )
}

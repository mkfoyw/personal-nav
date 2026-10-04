"use client";

import { Ellipsis } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import type { NavigationLink } from "@/lib/links";

export function LinkCard({ link, onEdit, editable }: { link: NavigationLink; onEdit: () => void; editable: boolean }) {
  const safeUrl = /^https?:\/\//i.test(link.url) ? link.url : undefined;
  let hostname = "";
  try {
    hostname = safeUrl ? new URL(safeUrl).hostname.replace(/^www\./, "") : "";
  } catch {
    // Keep malformed imported links readable without displaying a broken domain.
  }
  return (
    <Card size="sm" className="navigation-card group relative h-full gap-0 rounded-xl py-0">
      <CardHeader className="flex min-h-18 flex-row items-center gap-3 px-4 py-3">
        <span className="link-monogram" aria-hidden="true">{Array.from(link.title.trim())[0]?.toUpperCase() || "↗"}</span>
        <div className="min-w-0 flex-1">
          <CardTitle className="truncate"><a href={safeUrl} target="_blank" rel="noopener noreferrer" className="card-destination" aria-label={`打开 ${link.title}`} title={link.title}>{link.title}</a></CardTitle>
          {hostname && <p className="mt-1 truncate text-xs text-muted-foreground" title={hostname}>{hostname}</p>}
        </div>
        <Button variant="ghost" size="icon-sm" className="link-edit relative z-10 -mr-1 shrink-0 text-muted-foreground" aria-label={`编辑 ${link.title}`} title={`编辑 ${link.title}`} onClick={onEdit} disabled={!editable}><Ellipsis /></Button>
      </CardHeader>
    </Card>
  );
}

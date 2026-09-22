"use client";

import { ArrowUpRight, Ellipsis, Pin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { NavigationLink } from "@/lib/links";

export function LinkCard({ link, onEdit, editable }: { link: NavigationLink; onEdit: () => void; editable: boolean }) {
  let hostname = link.url;
  try { hostname = new URL(link.url).hostname.replace(/^www\./, ""); } catch { /* Preserve the title for legacy records. */ }
  const safeUrl = /^https?:\/\//i.test(link.url) ? link.url : undefined;
  return (
    <Card size="sm" className="navigation-card group relative h-full gap-3 py-3" data-color={link.color}>
      <CardHeader className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-x-3 px-4">
        <span className="link-monogram" aria-hidden="true">{Array.from(link.title.trim())[0]?.toUpperCase()}</span>
        <div className="min-w-0 self-center">
          <CardTitle className="line-clamp-2"><a href={safeUrl} target="_blank" rel="noopener noreferrer" className="card-destination" aria-label={`打开 ${link.title}`}>{link.title}</a></CardTitle>
          <CardDescription className="mt-0.5 truncate text-xs" title={link.note}>{link.note || link.categories.join(" · ")}</CardDescription>
        </div>
        <Button variant="ghost" size="icon-sm" className="relative z-10 -mr-1 -mt-1" aria-label={`编辑 ${link.title}`} title={`编辑 ${link.title}`} onClick={onEdit} disabled={!editable}><Ellipsis /></Button>
      </CardHeader>
      <CardContent className="mt-auto flex min-w-0 items-center gap-1.5 px-4">
        {link.categories.slice(0, 1).map((category) => <Badge key={category} variant="secondary" className="max-w-24 truncate">{category}</Badge>)}
        {link.categories.length > 1 && <Badge variant="outline">+{link.categories.length - 1}</Badge>}
        {link.isDefault && <Pin className="size-3 shrink-0 text-muted-foreground" aria-label="默认分组" />}
        <span className="ml-auto min-w-0 truncate text-xs text-muted-foreground">{hostname}</span>
        <ArrowUpRight className="size-3.5 shrink-0 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" aria-hidden="true" />
      </CardContent>
    </Card>
  );
}

"use client";

import { ArrowUpRight, Ellipsis, Pin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import type { NavigationLink } from "@/lib/links";

export function LinkCard({ link, onEdit, editable }: { link: NavigationLink; onEdit: () => void; editable: boolean }) {
  let hostname = link.url;
  try { hostname = new URL(link.url).hostname.replace(/^www\./, ""); } catch { /* Preserve the title for legacy records. */ }
  const safeUrl = /^https?:\/\//i.test(link.url) ? link.url : undefined;
  return (
    <Card className="navigation-card group relative h-full" data-color={link.color}>
      <CardHeader>
        <div className="mb-5 flex items-center justify-between gap-2">
          <span className="link-monogram" aria-hidden="true">{Array.from(link.title.trim())[0]?.toUpperCase()}</span>
          <Button variant="ghost" size="icon" className="relative z-10" aria-label={`编辑 ${link.title}`} title={`编辑 ${link.title}`} onClick={onEdit} disabled={!editable}><Ellipsis /></Button>
        </div>
        <CardTitle><a href={safeUrl} target="_blank" rel="noopener noreferrer" className="card-destination" aria-label={`打开 ${link.title}`}>{link.title}</a></CardTitle>
        <CardDescription className="truncate" title={link.note}>{link.note || link.categories.join(" · ")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center gap-1.5">
        {link.categories.slice(0, 2).map((category) => <Badge key={category} variant="secondary" className="max-w-full truncate">{category}</Badge>)}
        {link.categories.length > 2 && <Badge variant="outline">+{link.categories.length - 2}</Badge>}
        {link.isDefault && <Pin className="ml-auto size-3 text-muted-foreground" aria-label="默认分组" />}
      </CardContent>
      <CardFooter className="mt-auto justify-between gap-2">
        <span className="truncate text-xs text-muted-foreground">{hostname}</span>
        <ArrowUpRight className="size-3.5 shrink-0 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" aria-hidden="true" />
      </CardFooter>
    </Card>
  );
}

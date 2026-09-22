"use client";

import { Ellipsis } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import type { NavigationLink } from "@/lib/links";

export function LinkCard({ link, onEdit, editable }: { link: NavigationLink; onEdit: () => void; editable: boolean }) {
  const safeUrl = /^https?:\/\//i.test(link.url) ? link.url : undefined;
  return (
    <Card size="sm" className="navigation-card group relative h-full gap-0 py-0">
      <CardHeader className="flex min-h-14 flex-row items-center justify-between gap-2 px-4 py-3">
        <CardTitle className="min-w-0 truncate"><a href={safeUrl} target="_blank" rel="noopener noreferrer" className="card-destination" aria-label={`打开 ${link.title}`}>{link.title}</a></CardTitle>
        <Button variant="ghost" size="icon-sm" className="relative z-10 -mr-1 -mt-1" aria-label={`编辑 ${link.title}`} title={`编辑 ${link.title}`} onClick={onEdit} disabled={!editable}><Ellipsis /></Button>
      </CardHeader>
    </Card>
  );
}

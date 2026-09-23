"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ArrowDown, ArrowUp, Ellipsis } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { NavigationNote } from "@/lib/notes";

interface Props {
  note: NavigationNote;
  editable: boolean;
  first: boolean;
  last: boolean;
  onEdit: () => void;
  onMove: (direction: -1 | 1) => void;
}

export function NoteCard({ note, editable, first, last, onEdit, onMove }: Props) {
  const [open, setOpen] = useState(false);
  function edit() {
    setOpen(false);
    onEdit();
  }
  return <>
    <Card role="article" tabIndex={0} aria-label={`查看笔记 ${note.title}`} className="gap-0 cursor-pointer py-0 transition-colors hover:border-primary/40 focus-visible:ring-2 focus-visible:ring-ring" onClick={() => setOpen(true)} onKeyDown={(event) => { if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); setOpen(true); } }}>
    <CardHeader className="flex flex-row items-start justify-between gap-3 px-4 pt-4 pb-2">
      <CardTitle className="min-w-0 break-words text-base">{note.title}</CardTitle>
      <div className="flex shrink-0 items-center gap-0.5">
        <Button variant="ghost" size="icon-sm" aria-label={`上移 ${note.title}`} title="上移" onClick={(event) => { event.stopPropagation(); onMove(-1); }} disabled={!editable || first}><ArrowUp /></Button>
        <Button variant="ghost" size="icon-sm" aria-label={`下移 ${note.title}`} title="下移" onClick={(event) => { event.stopPropagation(); onMove(1); }} disabled={!editable || last}><ArrowDown /></Button>
        <Button variant="ghost" size="icon-sm" aria-label={`编辑 ${note.title}`} title="编辑笔记" onClick={(event) => { event.stopPropagation(); onEdit(); }} disabled={!editable}><Ellipsis /></Button>
      </div>
    </CardHeader>
    <CardContent className="px-4 pt-1 pb-4">
      {note.content ? <div className="note-preview markdown-content text-sm"><ReactMarkdown remarkPlugins={[remarkGfm]}>{note.content}</ReactMarkdown></div> : <p className="text-sm text-muted-foreground">还没有正文</p>}
      {note.tags.length > 0 && <div className="mt-4 flex flex-wrap gap-1.5">{note.tags.map((tag) => <span key={tag} className="rounded-full bg-secondary px-2.5 py-1 text-xs text-secondary-foreground">{tag}</span>)}</div>}
    </CardContent>
    </Card>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="flex h-[min(82dvh,720px)] flex-col overflow-hidden sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="pr-8 text-xl">{note.title}</DialogTitle>
        </DialogHeader>
        {note.tags.length > 0 && <div className="flex flex-wrap gap-1.5">{note.tags.map((tag) => <span key={tag} className="rounded-full bg-secondary px-2.5 py-1 text-xs text-secondary-foreground">{tag}</span>)}</div>}
        <div className="min-h-0 flex-1 overflow-y-auto pr-2">
          {note.content ? <div className="markdown-content"><ReactMarkdown remarkPlugins={[remarkGfm]}>{note.content}</ReactMarkdown></div> : <p className="text-sm text-muted-foreground">还没有正文</p>}
        </div>
        {editable && <div className="flex justify-end"><Button variant="outline" onClick={edit}>编辑笔记</Button></div>}
      </DialogContent>
    </Dialog>
  </>;
}

import { useEffect, useRef, useState } from "react";
import type { Message } from "@/lib/types";
import { supabase } from "@/integrations/supabase/client";
import { format, isToday, isYesterday } from "date-fns";
import { Pencil, Trash2, EyeOff, Check, X, Download } from "lucide-react";
import {
  ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

type Props = {
  messages: Message[];
  myId: string;
  onHideForMe: (id: string) => void;
};

function dateLabel(d: Date) {
  if (isToday(d)) return "Today";
  if (isYesterday(d)) return "Yesterday";
  return format(d, "MMMM d, yyyy");
}

export function MessageList({ messages, myId, onHideForMe }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");

  useEffect(() => {
    const el = ref.current; if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  const startEdit = (m: Message) => { setEditingId(m.id); setEditText(m.content ?? ""); };
  const cancelEdit = () => { setEditingId(null); setEditText(""); };
  const saveEdit = async () => {
    const id = editingId; if (!id) return;
    const text = editText.trim();
    if (!text) { toast.error("Message cannot be empty"); return; }
    const { error } = await supabase
      .from("messages").update({ content: text, edited_at: new Date().toISOString() }).eq("id", id);
    if (error) toast.error(error.message);
    cancelEdit();
  };

  const deleteForEveryone = async (m: Message) => {
    const { error } = await supabase
      .from("messages")
      .update({ content: null, media_url: null, media_type: null, media_name: null, deleted_for_everyone: true })
      .eq("id", m.id);
    if (error) toast.error(error.message);
  };

  let lastDate = "";

  return (
    <div ref={ref} className="h-full overflow-y-auto scrollbar-thin px-3 md:px-6 py-4 space-y-1">
      {messages.map((m) => {
        const d = new Date(m.created_at);
        const dl = dateLabel(d);
        const showDate = dl !== lastDate;
        lastDate = dl;
        const mine = m.sender_id === myId;
        const editing = editingId === m.id;
        const isDeleted = m.deleted_for_everyone;
        const bubbleClasses = mine
          ? "bg-bubble-out text-bubble-out-foreground rounded-2xl rounded-tr-sm"
          : "bg-bubble-in text-bubble-in-foreground rounded-2xl rounded-tl-sm";

        return (
          <div key={m.id}>
            {showDate && (
              <div className="my-3 flex justify-center">
                <span className="rounded-full bg-card px-3 py-1 text-[11px] font-medium text-muted-foreground shadow-[var(--shadow-bubble)]">
                  {dl}
                </span>
              </div>
            )}
            <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
              <ContextMenu>
                <ContextMenuTrigger asChild>
                  <div className={`group max-w-[85%] md:max-w-[70%] px-3 py-2 shadow-[var(--shadow-bubble)] ${bubbleClasses}`}>
                    {isDeleted ? (
                      <p className="italic opacity-70 text-sm">🚫 This message was deleted</p>
                    ) : editing ? (
                      <div className="flex items-center gap-2">
                        <Input
                          autoFocus
                          value={editText}
                          onChange={(e) => setEditText(e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Enter") saveEdit(); if (e.key === "Escape") cancelEdit(); }}
                          className="h-8 bg-background/50"
                        />
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={saveEdit}>
                          <Check className="h-4 w-4" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={cancelEdit}>
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ) : (
                      <>
                        {m.media_url && m.media_type?.startsWith("image/") && (
                          <a href={m.media_url} target="_blank" rel="noopener noreferrer" className="block mb-1">
                            <img
                              src={m.media_url}
                              alt={m.media_name ?? "image"}
                              loading="lazy"
                              className="max-h-72 rounded-lg object-cover"
                            />
                          </a>
                        )}
                        {m.media_url && !m.media_type?.startsWith("image/") && (
                          <a href={m.media_url} target="_blank" rel="noopener noreferrer"
                            className="mb-1 flex items-center gap-2 rounded-md bg-background/30 px-2 py-2 text-sm hover:bg-background/50">
                            <Download className="h-4 w-4 shrink-0" />
                            <span className="truncate">{m.media_name ?? "attachment"}</span>
                          </a>
                        )}
                        {m.content && (
                          <p className="whitespace-pre-wrap break-words text-[15px] leading-snug">{m.content}</p>
                        )}
                        <div className="mt-1 flex items-center justify-end gap-1 text-[10px] opacity-70">
                          {m.edited_at && <span>edited</span>}
                          <span>{format(d, "HH:mm")}</span>
                        </div>
                      </>
                    )}
                  </div>
                </ContextMenuTrigger>
                <ContextMenuContent>
                  {mine && !isDeleted && m.content !== null && (
                    <ContextMenuItem onClick={() => startEdit(m)}>
                      <Pencil className="mr-2 h-4 w-4" /> Edit
                    </ContextMenuItem>
                  )}
                  {mine && !isDeleted && (
                    <ContextMenuItem onClick={() => deleteForEveryone(m)} className="text-destructive">
                      <Trash2 className="mr-2 h-4 w-4" /> Delete for everyone
                    </ContextMenuItem>
                  )}
                  <ContextMenuSeparator />
                  <ContextMenuItem onClick={() => onHideForMe(m.id)}>
                    <EyeOff className="mr-2 h-4 w-4" /> Delete for me
                  </ContextMenuItem>
                </ContextMenuContent>
              </ContextMenu>
            </div>
          </div>
        );
      })}
    </div>
  );
}

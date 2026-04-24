import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Search } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import type { Profile } from "@/lib/types";
import { toast } from "sonner";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: (conversationId: string) => void;
};

export function NewChatDialog({ open, onOpenChange, onCreated }: Props) {
  const { user } = useAuth();
  const [q, setQ] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<Profile[]>([]);
  const [creatingId, setCreatingId] = useState<string | null>(null);

  const search = async () => {
    const term = q.trim();
    if (term.length < 2) { toast.error("Type at least 2 characters"); return; }
    setSearching(true);
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .or(`display_name.ilike.%${term}%,username.ilike.%${term}%`)
      .neq("id", user?.id ?? "")
      .limit(20);
    setSearching(false);
    if (error) { toast.error(error.message); return; }
    setResults((data ?? []) as Profile[]);
  };

  const startChat = async (peer: Profile) => {
    if (!user) return;
    setCreatingId(peer.id);
    try {
      // Try to find an existing 1:1 conv between us
      const { data: myParts } = await supabase
        .from("conversation_participants").select("conversation_id").eq("user_id", user.id);
      const myConvIds = (myParts ?? []).map((p) => p.conversation_id);
      if (myConvIds.length) {
        const { data: shared } = await supabase
          .from("conversation_participants")
          .select("conversation_id")
          .eq("user_id", peer.id)
          .in("conversation_id", myConvIds);
        const sharedIds = (shared ?? []).map((s) => s.conversation_id);
        if (sharedIds.length) {
          // Confirm it's a 1:1 (not group)
          const { data: conv } = await supabase
            .from("conversations").select("*").in("id", sharedIds).eq("is_group", false).limit(1).maybeSingle();
          if (conv) {
            onCreated(conv.id);
            onOpenChange(false);
            return;
          }
        }
      }

      // Create new conversation
      const { data: conv, error: convErr } = await supabase
        .from("conversations")
        .insert({ is_group: false, created_by: user.id })
        .select("*").single();
      if (convErr || !conv) throw new Error(convErr?.message ?? "Could not create chat");
      const { error: pErr } = await supabase.from("conversation_participants").insert([
        { conversation_id: conv.id, user_id: user.id },
        { conversation_id: conv.id, user_id: peer.id },
      ]);
      if (pErr) throw new Error(pErr.message);
      onCreated(conv.id);
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message ?? "Failed");
    } finally {
      setCreatingId(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Start a new chat</DialogTitle>
          <DialogDescription>Find people by display name or username.</DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="q" className="sr-only">Search</Label>
          <div className="flex gap-2">
            <Input
              id="q"
              autoFocus
              placeholder="e.g. alice"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") search(); }}
            />
            <Button onClick={search} disabled={searching}>
              {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        <div className="max-h-72 space-y-1 overflow-y-auto scrollbar-thin">
          {results.length === 0 && !searching && (
            <p className="py-6 text-center text-sm text-muted-foreground">No results yet.</p>
          )}
          {results.map((p) => (
            <button
              key={p.id}
              onClick={() => startChat(p)}
              disabled={creatingId === p.id}
              className="flex w-full items-center gap-3 rounded-lg p-2 text-left hover:bg-muted/50 disabled:opacity-50"
            >
              <Avatar className="h-10 w-10">
                <AvatarImage src={p.avatar_url ?? undefined} />
                <AvatarFallback className="bg-primary/15 text-primary font-semibold">
                  {p.display_name[0]?.toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-foreground">{p.display_name}</p>
                <p className="truncate text-xs text-muted-foreground">@{p.username}</p>
              </div>
              {creatingId === p.id && <Loader2 className="h-4 w-4 animate-spin" />}
            </button>
          ))}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

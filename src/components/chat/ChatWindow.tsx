import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { ConversationWithPeer, Message, Profile } from "@/lib/types";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Loader2 } from "lucide-react";
import { MessageList } from "@/components/chat/MessageList";
import { Composer } from "@/components/chat/Composer";
import { formatDistanceToNowStrict } from "date-fns";

type Props = {
  me: Profile;
  conversation: ConversationWithPeer;
  isPeerOnline: boolean;
  onBack: () => void;
};

export function ChatWindow({ me, conversation, isPeerOnline, onBack }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [hiddenForMe, setHiddenForMe] = useState<Set<string>>(new Set());
  const [peerTyping, setPeerTyping] = useState(false);
  const typingChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // Initial load
  useEffect(() => {
    setLoading(true);
    Promise.all([
      supabase.from("messages").select("*")
        .eq("conversation_id", conversation.id)
        .order("created_at", { ascending: true }),
      supabase.from("message_deletions").select("message_id").eq("user_id", me.id),
    ]).then(([msgs, del]) => {
      setMessages((msgs.data ?? []) as Message[]);
      setHiddenForMe(new Set((del.data ?? []).map((d) => d.message_id)));
      setLoading(false);
    });
  }, [conversation.id, me.id]);

  // Realtime: messages for this conversation
  useEffect(() => {
    const ch = supabase
      .channel(`messages:${conversation.id}`)
      .on("postgres_changes", {
        event: "INSERT", schema: "public", table: "messages",
        filter: `conversation_id=eq.${conversation.id}`,
      }, (payload) => {
        setMessages((prev) => prev.some((m) => m.id === (payload.new as any).id)
          ? prev : [...prev, payload.new as Message]);
      })
      .on("postgres_changes", {
        event: "UPDATE", schema: "public", table: "messages",
        filter: `conversation_id=eq.${conversation.id}`,
      }, (payload) => {
        setMessages((prev) => prev.map((m) => m.id === (payload.new as any).id ? (payload.new as Message) : m));
      })
      .on("postgres_changes", {
        event: "DELETE", schema: "public", table: "messages",
        filter: `conversation_id=eq.${conversation.id}`,
      }, (payload) => {
        setMessages((prev) => prev.filter((m) => m.id !== (payload.old as any).id));
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [conversation.id]);

  // Typing broadcast channel
  useEffect(() => {
    const ch = supabase.channel(`typing:${conversation.id}`, {
      config: { broadcast: { self: false } },
    });
    let timeout: ReturnType<typeof setTimeout> | null = null;
    ch.on("broadcast", { event: "typing" }, (payload) => {
      if ((payload.payload as any)?.user_id !== me.id) {
        setPeerTyping(true);
        if (timeout) clearTimeout(timeout);
        timeout = setTimeout(() => setPeerTyping(false), 2500);
      }
    });
    ch.subscribe();
    typingChannelRef.current = ch;
    return () => {
      if (timeout) clearTimeout(timeout);
      supabase.removeChannel(ch);
      typingChannelRef.current = null;
    };
  }, [conversation.id, me.id]);

  const broadcastTyping = () => {
    typingChannelRef.current?.send({
      type: "broadcast", event: "typing", payload: { user_id: me.id },
    });
  };

  const peer = conversation.peer;
  const subtitle = peerTyping
    ? "typing…"
    : isPeerOnline
      ? "online"
      : peer?.last_seen
        ? `last seen ${formatDistanceToNowStrict(new Date(peer.last_seen), { addSuffix: true })}`
        : "offline";

  const visible = messages.filter((m) => !hiddenForMe.has(m.id));

  return (
    <div className="flex h-full w-full flex-col">
      {/* Header */}
      <header className="flex items-center gap-3 border-b border-border bg-card px-3 py-2 md:px-4">
        <Button variant="ghost" size="icon" className="md:hidden" onClick={onBack} aria-label="Back">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <Avatar className="h-10 w-10">
          <AvatarImage src={peer?.avatar_url ?? undefined} />
          <AvatarFallback className="bg-primary/15 text-primary font-semibold">
            {peer?.display_name?.[0]?.toUpperCase() ?? "?"}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-foreground">{peer?.display_name ?? "Unknown"}</p>
          <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
        </div>
      </header>

      {/* Messages */}
      <div className="chat-pattern flex-1 overflow-hidden">
        {loading ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : (
          <MessageList
            messages={visible}
            myId={me.id}
            onHideForMe={(id) => {
              setHiddenForMe((s) => new Set(s).add(id));
              void supabase.from("message_deletions").insert({ message_id: id, user_id: me.id });
            }}
          />
        )}
      </div>

      {peerTyping && (
        <div className="border-t border-border bg-card/60 px-4 py-1.5 text-xs text-muted-foreground flex items-center gap-2">
          <span className="typing-dot" />
          <span className="typing-dot" />
          <span className="typing-dot" />
          <span className="ml-1">{peer?.display_name?.split(" ")[0] ?? "Someone"} is typing…</span>
        </div>
      )}

      {/* Composer */}
      <Composer conversationId={conversation.id} myId={me.id} onTyping={broadcastTyping} />
    </div>
  );
}

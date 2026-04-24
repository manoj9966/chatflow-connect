import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import type { ConversationWithPeer, Profile } from "@/lib/types";
import { Sidebar } from "@/components/chat/Sidebar";
import { ChatWindow } from "@/components/chat/ChatWindow";
import { EmptyChatPanel } from "@/components/chat/EmptyChatPanel";

export function ChatApp() {
  const { user } = useAuth();
  const [me, setMe] = useState<Profile | null>(null);
  const [conversations, setConversations] = useState<ConversationWithPeer[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [onlineUserIds, setOnlineUserIds] = useState<Set<string>>(new Set());

  // Load my profile
  useEffect(() => {
    if (!user) return;
    void supabase.from("profiles").select("*").eq("id", user.id).single().then(({ data }) => {
      if (data) setMe(data as Profile);
    });
  }, [user]);

  // Load conversations + subscribe to changes
  const loadConversations = async () => {
    if (!user) return;
    const { data: parts } = await supabase
      .from("conversation_participants")
      .select("conversation_id")
      .eq("user_id", user.id);
    const ids = (parts ?? []).map((p) => p.conversation_id);
    if (ids.length === 0) { setConversations([]); return; }

    const { data: convs } = await supabase
      .from("conversations").select("*").in("id", ids).order("last_message_at", { ascending: false });
    if (!convs) return;

    const { data: allParts } = await supabase
      .from("conversation_participants").select("conversation_id, user_id").in("conversation_id", ids);
    const peerIds = Array.from(new Set((allParts ?? [])
      .filter((p) => p.user_id !== user.id).map((p) => p.user_id)));
    const { data: peers } = peerIds.length
      ? await supabase.from("profiles").select("*").in("id", peerIds)
      : { data: [] as Profile[] };

    const peerMap = new Map((peers ?? []).map((p) => [p.id, p as Profile]));
    const peerByConv = new Map<string, Profile | null>();
    for (const id of ids) {
      const peerPart = (allParts ?? []).find((p) => p.conversation_id === id && p.user_id !== user.id);
      peerByConv.set(id, peerPart ? peerMap.get(peerPart.user_id) ?? null : null);
    }

    const { data: lastMsgs } = await supabase
      .from("messages").select("*").in("conversation_id", ids).order("created_at", { ascending: false });
    const lastByConv = new Map<string, any>();
    for (const m of lastMsgs ?? []) if (!lastByConv.has(m.conversation_id)) lastByConv.set(m.conversation_id, m);

    setConversations(convs.map((c) => ({
      ...(c as any),
      peer: peerByConv.get(c.id) ?? null,
      last_message: lastByConv.get(c.id) ?? null,
    })));
  };

  useEffect(() => { void loadConversations(); /* eslint-disable-next-line */ }, [user?.id]);

  // Subscribe to realtime changes that affect conversation list
  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel("conv-list-" + user.id)
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, () => loadConversations())
      .on("postgres_changes", { event: "*", schema: "public", table: "conversation_participants", filter: `user_id=eq.${user.id}` }, () => loadConversations())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line
  }, [user?.id]);

  // Global presence channel
  useEffect(() => {
    if (!user) return;
    const ch = supabase.channel("presence:global", { config: { presence: { key: user.id } } });
    ch.on("presence", { event: "sync" }, () => {
      const state = ch.presenceState();
      setOnlineUserIds(new Set(Object.keys(state)));
    });
    ch.subscribe(async (status) => {
      if (status === "SUBSCRIBED") await ch.track({ online_at: new Date().toISOString() });
    });
    return () => { supabase.removeChannel(ch); };
  }, [user?.id]);

  const active = conversations.find((c) => c.id === activeId) ?? null;

  // Mobile: when a conversation is selected, show chat full-screen
  return (
    <div className="flex h-dvh w-full overflow-hidden bg-background">
      <aside className={`${active ? "hidden md:flex" : "flex"} w-full md:w-[360px] lg:w-[400px] flex-col border-r border-border bg-sidebar`}>
        <Sidebar
          me={me}
          setMe={setMe}
          conversations={conversations}
          activeId={activeId}
          onSelect={setActiveId}
          onlineUserIds={onlineUserIds}
          refresh={loadConversations}
        />
      </aside>
      <section className={`${active ? "flex" : "hidden md:flex"} flex-1 min-w-0`}>
        {active && me ? (
          <ChatWindow
            key={active.id}
            me={me}
            conversation={active}
            onBack={() => setActiveId(null)}
            isPeerOnline={active.peer ? onlineUserIds.has(active.peer.id) : false}
          />
        ) : (
          <EmptyChatPanel />
        )}
      </section>
    </div>
  );
}

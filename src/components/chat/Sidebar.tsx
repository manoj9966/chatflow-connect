import { useMemo, useState } from "react";
import type { ConversationWithPeer, Profile } from "@/lib/types";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Plus, MoreVertical, MessageCircle, Download, LogOut, User as UserIcon } from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/lib/auth";
import { ProfileDialog } from "./ProfileDialog";
import { NewChatDialog } from "./NewChatDialog";
import { useInstallPrompt } from "@/lib/use-install-prompt";
import { formatDistanceToNowStrict } from "date-fns";

type Props = {
  me: Profile | null;
  setMe: (p: Profile) => void;
  conversations: ConversationWithPeer[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onlineUserIds: Set<string>;
  refresh: () => void;
};

export function Sidebar({ me, setMe, conversations, activeId, onSelect, onlineUserIds, refresh }: Props) {
  const { signOut } = useAuth();
  const [query, setQuery] = useState("");
  const [profileOpen, setProfileOpen] = useState(false);
  const [newChatOpen, setNewChatOpen] = useState(false);
  const { canInstall, promptInstall } = useInstallPrompt();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter((c) => {
      const name = c.peer?.display_name?.toLowerCase() ?? "";
      const handle = c.peer?.username?.toLowerCase() ?? "";
      const last = c.last_message?.content?.toLowerCase() ?? "";
      return name.includes(q) || handle.includes(q) || last.includes(q);
    });
  }, [conversations, query]);

  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
        <button
          className="flex items-center gap-3 rounded-lg p-1 -m-1 hover:bg-muted/50 transition"
          onClick={() => setProfileOpen(true)}
        >
          <Avatar className="h-10 w-10">
            <AvatarImage src={me?.avatar_url ?? undefined} />
            <AvatarFallback className="bg-primary/15 text-primary font-semibold">
              {me?.display_name?.[0]?.toUpperCase() ?? "?"}
            </AvatarFallback>
          </Avatar>
          <div className="text-left">
            <p className="text-sm font-semibold text-foreground leading-tight">{me?.display_name ?? "…"}</p>
            <p className="text-xs text-muted-foreground">@{me?.username ?? "…"}</p>
          </div>
        </button>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" onClick={() => setNewChatOpen(true)} aria-label="New chat">
            <Plus className="h-5 w-5" />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="More">
                <MoreVertical className="h-5 w-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setProfileOpen(true)}>
                <UserIcon className="mr-2 h-4 w-4" /> Profile
              </DropdownMenuItem>
              {canInstall && (
                <DropdownMenuItem onClick={promptInstall}>
                  <Download className="mr-2 h-4 w-4" /> Install app
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => signOut()} className="text-destructive">
                <LogOut className="mr-2 h-4 w-4" /> Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Search */}
      <div className="px-3 py-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search chats or messages"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9 bg-muted/40 border-0 focus-visible:ring-1"
          />
        </div>
      </div>

      {/* Conversation list */}
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {filtered.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center px-6 text-center text-sm text-muted-foreground">
            <MessageCircle className="mb-2 h-8 w-8 opacity-40" />
            {query ? "No matches." : "No chats yet. Start a new one with the + button."}
          </div>
        )}
        <ul>
          {filtered.map((c) => {
            const isActive = c.id === activeId;
            const peerOnline = c.peer ? onlineUserIds.has(c.peer.id) : false;
            const last = c.last_message;
            const lastText = last?.deleted_for_everyone
              ? "🚫 Message deleted"
              : last?.content
                ? last.content
                : last?.media_url
                  ? `📎 ${last.media_type?.startsWith("image") ? "Photo" : "Attachment"}`
                  : "Say hi 👋";
            return (
              <li key={c.id}>
                <button
                  onClick={() => onSelect(c.id)}
                  className={`flex w-full items-center gap-3 px-3 py-3 text-left transition ${
                    isActive ? "bg-accent/60" : "hover:bg-muted/40"
                  }`}
                >
                  <div className="relative">
                    <Avatar className="h-12 w-12">
                      <AvatarImage src={c.peer?.avatar_url ?? undefined} />
                      <AvatarFallback className="bg-primary/15 text-primary font-semibold">
                        {c.peer?.display_name?.[0]?.toUpperCase() ?? "?"}
                      </AvatarFallback>
                    </Avatar>
                    {peerOnline && (
                      <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full bg-online ring-2 ring-sidebar" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate font-medium text-foreground">
                        {c.peer?.display_name ?? "Unknown"}
                      </p>
                      {c.last_message_at && (
                        <span className="shrink-0 text-[10px] text-muted-foreground">
                          {formatDistanceToNowStrict(new Date(c.last_message_at), { addSuffix: false })}
                        </span>
                      )}
                    </div>
                    <p className="truncate text-xs text-muted-foreground">{lastText}</p>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      {me && (
        <ProfileDialog open={profileOpen} onOpenChange={setProfileOpen} me={me} onUpdated={setMe} />
      )}
      <NewChatDialog
        open={newChatOpen}
        onOpenChange={setNewChatOpen}
        onCreated={(id) => { refresh(); onSelect(id); }}
      />
    </>
  );
}

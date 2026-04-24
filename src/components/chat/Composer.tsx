import { useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Paperclip, Send, Smile, Loader2 } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EMOJI_GROUPS } from "@/lib/emojis";
import { toast } from "sonner";

type Props = {
  conversationId: string;
  myId: string;
  onTyping: () => void;
};

const MAX_MEDIA_BYTES = 20 * 1024 * 1024;

export function Composer({ conversationId, myId, onTyping }: Props) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [emojiOpen, setEmojiOpen] = useState(false);

  const canSend = text.trim().length > 0 && !sending;

  const send = async (overrides?: Partial<{ content: string; media_url: string; media_type: string; media_name: string }>) => {
    const content = (overrides?.content ?? text).trim();
    if (!content && !overrides?.media_url) return;
    setSending(true);
    const { error } = await supabase.from("messages").insert({
      conversation_id: conversationId,
      sender_id: myId,
      content: content || null,
      media_url: overrides?.media_url ?? null,
      media_type: overrides?.media_type ?? null,
      media_name: overrides?.media_name ?? null,
    });
    setSending(false);
    if (error) { toast.error(error.message); return; }
    setText("");
  };

  const onPickFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > MAX_MEDIA_BYTES) { toast.error("Max file size is 20MB"); return; }
    setSending(true);
    const safeName = file.name.replace(/[^\w.\-]+/g, "_");
    const path = `${conversationId}/${myId}/${Date.now()}-${safeName}`;
    const { error: upErr } = await supabase.storage.from("chat-media").upload(path, file, {
      contentType: file.type, upsert: false,
    });
    if (upErr) { setSending(false); toast.error(upErr.message); return; }
    const { data: signed } = await supabase.storage.from("chat-media").createSignedUrl(path, 60 * 60 * 24 * 365);
    setSending(false);
    if (!signed?.signedUrl) { toast.error("Could not get media URL"); return; }
    await send({
      content: text,
      media_url: signed.signedUrl,
      media_type: file.type || "application/octet-stream",
      media_name: file.name,
    });
  };

  const insertEmoji = (e: string) => {
    setText((t) => t + e);
    setEmojiOpen(false);
  };

  return (
    <div className="border-t border-border bg-card px-2 py-2 md:px-4">
      <div className="flex items-end gap-1">
        <Popover open={emojiOpen} onOpenChange={setEmojiOpen}>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Emoji">
              <Smile className="h-5 w-5" />
            </Button>
          </PopoverTrigger>
          <PopoverContent side="top" align="start" className="w-80 p-2">
            <Tabs defaultValue={EMOJI_GROUPS[0].name}>
              <TabsList className="grid w-full grid-cols-4">
                {EMOJI_GROUPS.map((g) => (
                  <TabsTrigger key={g.name} value={g.name} className="text-xs">{g.name}</TabsTrigger>
                ))}
              </TabsList>
              {EMOJI_GROUPS.map((g) => (
                <TabsContent key={g.name} value={g.name} className="mt-2">
                  <div className="grid max-h-56 grid-cols-8 gap-1 overflow-y-auto scrollbar-thin">
                    {g.emojis.map((e) => (
                      <button
                        key={e}
                        type="button"
                        onClick={() => insertEmoji(e)}
                        className="rounded p-1 text-xl hover:bg-muted transition"
                      >{e}</button>
                    ))}
                  </div>
                </TabsContent>
              ))}
            </Tabs>
          </PopoverContent>
        </Popover>

        <Button variant="ghost" size="icon" onClick={() => fileRef.current?.click()} aria-label="Attach">
          <Paperclip className="h-5 w-5" />
        </Button>
        <input ref={fileRef} type="file" hidden onChange={onPickFile} />

        <Textarea
          value={text}
          onChange={(e) => { setText(e.target.value); onTyping(); }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              if (canSend) void send();
            }
          }}
          placeholder="Type a message"
          rows={1}
          className="min-h-10 max-h-32 resize-none border-0 bg-muted/40 focus-visible:ring-1"
        />

        <Button
          size="icon"
          onClick={() => send()}
          disabled={!canSend}
          aria-label="Send"
          className="bg-primary text-primary-foreground hover:bg-primary/90"
        >
          {sending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
        </Button>
      </div>
    </div>
  );
}

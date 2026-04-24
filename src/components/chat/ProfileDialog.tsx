import { useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Profile } from "@/lib/types";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Camera, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";

const schema = z.object({
  display_name: z.string().trim().min(1, "Required").max(40),
  status: z.string().trim().max(140).optional(),
});

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  me: Profile;
  onUpdated: (p: Profile) => void;
};

export function ProfileDialog({ open, onOpenChange, me, onUpdated }: Props) {
  const [displayName, setDisplayName] = useState(me.display_name);
  const [status, setStatus] = useState(me.status ?? "");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState(me.avatar_url ?? "");
  const fileRef = useRef<HTMLInputElement>(null);

  const onSave = async () => {
    const parsed = schema.safeParse({ display_name: displayName, status });
    if (!parsed.success) { toast.error(parsed.error.issues[0]?.message ?? "Invalid"); return; }
    setSaving(true);
    const { data, error } = await supabase
      .from("profiles")
      .update({ display_name: parsed.data.display_name, status: parsed.data.status ?? null, avatar_url: avatarUrl || null })
      .eq("id", me.id)
      .select("*")
      .single();
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    onUpdated(data as Profile);
    toast.success("Profile updated");
    onOpenChange(false);
  };

  const onPickAvatar = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast.error("Max 5MB"); return; }
    setUploading(true);
    const ext = file.name.split(".").pop() || "jpg";
    const path = `${me.id}/avatar-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("avatars").upload(path, file, {
      contentType: file.type, upsert: true,
    });
    if (error) { setUploading(false); toast.error(error.message); return; }
    const { data: pub } = supabase.storage.from("avatars").getPublicUrl(path);
    setUploading(false);
    setAvatarUrl(pub.publicUrl);
    toast.success("Avatar ready — hit Save");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Your profile</DialogTitle>
          <DialogDescription>Visible to people you chat with.</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center gap-3 py-2">
          <div className="relative">
            <Avatar className="h-24 w-24">
              <AvatarImage src={avatarUrl || undefined} />
              <AvatarFallback className="bg-primary/15 text-primary text-2xl font-semibold">
                {displayName?.[0]?.toUpperCase() ?? "?"}
              </AvatarFallback>
            </Avatar>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="absolute -bottom-1 -right-1 flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md hover:bg-primary/90"
              aria-label="Change avatar"
            >
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
            </button>
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={onPickAvatar} />
          </div>
          <p className="text-xs text-muted-foreground">@{me.username}</p>
        </div>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="dn">Display name</Label>
            <Input id="dn" value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={40} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="st">Status</Label>
            <Textarea id="st" value={status} onChange={(e) => setStatus(e.target.value)} maxLength={140} rows={2} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={onSave} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

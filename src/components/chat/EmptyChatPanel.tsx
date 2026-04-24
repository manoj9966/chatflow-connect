import { MessageCircle, Zap, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useInstallPrompt } from "@/lib/use-install-prompt";

export function EmptyChatPanel() {
  const { canInstall, promptInstall } = useInstallPrompt();
  return (
    <div className="chat-pattern flex flex-1 flex-col items-center justify-center text-center p-8">
      <div className="relative mx-auto mb-6 flex h-24 w-24 items-center justify-center rounded-3xl bg-primary/10">
        <MessageCircle className="h-12 w-12 text-primary" />
        <Zap className="absolute h-6 w-6 text-primary" fill="currentColor" />
      </div>
      <h2 className="text-2xl font-semibold text-foreground">Welcome to Texto</h2>
      <p className="mt-2 max-w-sm text-sm text-muted-foreground">
        Select a chat from the sidebar or start a new conversation. Messages, presence and typing happen in real-time.
      </p>
      {canInstall && (
        <Button onClick={promptInstall} className="mt-6 gap-2">
          <Download className="h-4 w-4" /> Install Texto as an app
        </Button>
      )}
    </div>
  );
}

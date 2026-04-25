import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { toast } from "sonner";
import { Loader2, MessageCircle, Zap, Mail, Phone, ArrowLeft } from "lucide-react";
import { z } from "zod";

const signUpSchema = z.object({
  email: z.string().trim().email("Enter a valid email").max(255),
  password: z.string().min(6, "At least 6 characters").max(72),
  display_name: z.string().trim().min(1, "Required").max(40),
});
const signInSchema = z.object({
  email: z.string().trim().email("Enter a valid email"),
  password: z.string().min(1, "Required"),
});
// E.164: + then 8–15 digits
const phoneSchema = z
  .string()
  .trim()
  .regex(/^\+[1-9]\d{7,14}$/, "Use international format, e.g. +14155552671");

type Mode = "email" | "phone";

export function AuthScreen() {
  const [mode, setMode] = useState<Mode>("email");

  return (
    <main
      className="flex min-h-dvh items-center justify-center px-4 py-8"
      style={{ background: "var(--gradient-auth)" }}
    >
      <div className="w-full max-w-md">
        <div className="mb-8 text-center text-primary-foreground">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-white/15 backdrop-blur-sm shadow-[var(--shadow-elevated)]">
            <div className="relative">
              <MessageCircle className="h-8 w-8" />
              <Zap className="absolute inset-0 m-auto h-4 w-4" fill="currentColor" />
            </div>
          </div>
          <h1 className="text-4xl font-bold tracking-tight">Texto</h1>
          <p className="mt-2 text-sm text-primary-foreground/80">Fast, private, real-time messaging</p>
        </div>

        <div className="rounded-2xl bg-card p-6 shadow-[var(--shadow-elevated)]">
          <div className="mb-4 grid grid-cols-2 gap-2 rounded-lg bg-muted p-1">
            <button
              type="button"
              onClick={() => setMode("email")}
              className={`flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition ${
                mode === "email" ? "bg-background shadow-sm" : "text-muted-foreground"
              }`}
            >
              <Mail className="h-4 w-4" /> Email
            </button>
            <button
              type="button"
              onClick={() => setMode("phone")}
              className={`flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition ${
                mode === "phone" ? "bg-background shadow-sm" : "text-muted-foreground"
              }`}
            >
              <Phone className="h-4 w-4" /> Phone
            </button>
          </div>

          {mode === "email" ? <EmailAuth /> : <PhoneAuth />}
        </div>

        <p className="mt-6 text-center text-xs text-primary-foreground/70">
          By continuing you agree to be excellent to each other.
        </p>
      </div>
    </main>
  );
}

function EmailAuth() {
  const [tab, setTab] = useState<"signin" | "signup">("signin");
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ email: "", password: "", display_name: "" });
  const update = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const onSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = signInSchema.safeParse(form);
    if (!parsed.success) return toast.error(parsed.error.issues[0]?.message ?? "Invalid input");
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: parsed.data.email,
      password: parsed.data.password,
    });
    setLoading(false);
    if (error) toast.error(error.message);
    else toast.success("Welcome back!");
  };

  const onSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = signUpSchema.safeParse(form);
    if (!parsed.success) return toast.error(parsed.error.issues[0]?.message ?? "Invalid input");
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email: parsed.data.email,
      password: parsed.data.password,
      options: {
        emailRedirectTo: window.location.origin,
        data: { display_name: parsed.data.display_name },
      },
    });
    setLoading(false);
    if (error) toast.error(error.message);
    else toast.success("Account created — you're in!");
  };

  return (
    <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
      <TabsList className="grid w-full grid-cols-2">
        <TabsTrigger value="signin">Sign in</TabsTrigger>
        <TabsTrigger value="signup">Create account</TabsTrigger>
      </TabsList>

      <TabsContent value="signin">
        <form onSubmit={onSignIn} className="mt-4 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="si-email">Email</Label>
            <Input id="si-email" type="email" autoComplete="email"
              value={form.email} onChange={(e) => update("email", e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="si-pw">Password</Label>
            <Input id="si-pw" type="password" autoComplete="current-password"
              value={form.password} onChange={(e) => update("password", e.target.value)} />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Sign in
          </Button>
        </form>
      </TabsContent>

      <TabsContent value="signup">
        <form onSubmit={onSignUp} className="mt-4 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="su-name">Display name</Label>
            <Input id="su-name" maxLength={40}
              value={form.display_name} onChange={(e) => update("display_name", e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="su-email">Email</Label>
            <Input id="su-email" type="email" autoComplete="email"
              value={form.email} onChange={(e) => update("email", e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="su-pw">Password</Label>
            <Input id="su-pw" type="password" autoComplete="new-password" minLength={6}
              value={form.password} onChange={(e) => update("password", e.target.value)} />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Create account
          </Button>
        </form>
      </TabsContent>
    </Tabs>
  );
}

function PhoneAuth() {
  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);

  const sendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = phoneSchema.safeParse(phone);
    if (!parsed.success) return toast.error(parsed.error.issues[0]?.message ?? "Invalid phone");
    setLoading(true);
    const { error } = await supabase.auth.signInWithOtp({ phone: parsed.data });
    setLoading(false);
    if (error) {
      if (error.message.toLowerCase().includes("phone") || error.message.toLowerCase().includes("provider")) {
        toast.error("SMS login isn't configured yet. Ask the admin to enable phone auth in backend settings.");
      } else {
        toast.error(error.message);
      }
      return;
    }
    toast.success("Code sent! Check your messages.");
    setStep("otp");
  };

  const verifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (otp.length !== 6) return toast.error("Enter the 6-digit code");
    setLoading(true);
    const { error } = await supabase.auth.verifyOtp({
      phone,
      token: otp,
      type: "sms",
    });
    setLoading(false);
    if (error) toast.error(error.message);
    else toast.success("Welcome!");
  };

  if (step === "phone") {
    return (
      <form onSubmit={sendOtp} className="mt-4 space-y-4">
        <div className="space-y-2">
          <Label htmlFor="ph-num">Mobile number</Label>
          <Input
            id="ph-num"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="+14155552671"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Use international format with country code (e.g. +91 for India).
          </p>
        </div>
        <Button type="submit" className="w-full" disabled={loading}>
          {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Send OTP
        </Button>
      </form>
    );
  }

  return (
    <form onSubmit={verifyOtp} className="mt-4 space-y-4">
      <button
        type="button"
        onClick={() => { setStep("phone"); setOtp(""); }}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Change number
      </button>
      <div className="space-y-2">
        <Label>Enter the 6-digit code sent to {phone}</Label>
        <div className="flex justify-center">
          <InputOTP maxLength={6} value={otp} onChange={setOtp}>
            <InputOTPGroup>
              <InputOTPSlot index={0} />
              <InputOTPSlot index={1} />
              <InputOTPSlot index={2} />
              <InputOTPSlot index={3} />
              <InputOTPSlot index={4} />
              <InputOTPSlot index={5} />
            </InputOTPGroup>
          </InputOTP>
        </div>
      </div>
      <Button type="submit" className="w-full" disabled={loading || otp.length !== 6}>
        {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Verify & sign in
      </Button>
      <Button
        type="button"
        variant="ghost"
        className="w-full"
        disabled={loading}
        onClick={async () => {
          setLoading(true);
          const { error } = await supabase.auth.signInWithOtp({ phone });
          setLoading(false);
          if (error) toast.error(error.message);
          else toast.success("New code sent");
        }}
      >
        Resend code
      </Button>
    </form>
  );
}

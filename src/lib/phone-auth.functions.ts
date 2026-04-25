import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const PHONE_REGEX = /^\+[1-9]\d{7,14}$/;
const OTP_TTL_SECONDS = 5 * 60; // 5 minutes
const RESEND_COOLDOWN_SECONDS = 30;
const MAX_VERIFY_ATTEMPTS = 5;
const MAX_RESENDS_PER_HOUR = 5;

const phoneSchema = z.object({
  phone: z.string().trim().regex(PHONE_REGEX, "Phone must be in E.164 format"),
});

const verifySchema = z.object({
  phone: z.string().trim().regex(PHONE_REGEX, "Phone must be in E.164 format"),
  code: z.string().trim().regex(/^\d{6}$/, "Code must be 6 digits"),
});

async function hashCode(code: string, salt: string) {
  const enc = new TextEncoder();
  const buf = await crypto.subtle.digest("SHA-256", enc.encode(`${salt}:${code}`));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function generateCode() {
  const n = (crypto.getRandomValues(new Uint32Array(1))[0] ?? 0) % 1000000;
  return n.toString().padStart(6, "0");
}

function generateRandomPassword() {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function sendTwilioSms(to: string, body: string) {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_PHONE_NUMBER;
  if (!sid || !token || !from) {
    throw new Error("SMS service is not configured.");
  }
  const auth = btoa(`${sid}:${token}`);
  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ To: to, From: from, Body: body }),
    },
  );
  if (!res.ok) {
    const text = await res.text();
    console.error("Twilio send failed", res.status, text);
    throw new Error("Failed to send SMS. Please try again.");
  }
}

export const requestPhoneOtp = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => phoneSchema.parse(input))
  .handler(async ({ data }) => {
    const phone = data.phone;
    const now = new Date();

    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
    const { count: recentCount, error: countError } = await supabaseAdmin
      .from("phone_otp_codes")
      .select("id", { count: "exact", head: true })
      .eq("phone", phone)
      .gte("created_at", oneHourAgo);
    if (countError) {
      console.error("OTP throttle check failed", countError);
      throw new Error("Could not send code. Please try again.");
    }
    if ((recentCount ?? 0) >= MAX_RESENDS_PER_HOUR) {
      throw new Error("Too many codes requested. Try again in an hour.");
    }

    const { data: latest } = await supabaseAdmin
      .from("phone_otp_codes")
      .select("last_sent_at")
      .eq("phone", phone)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (latest?.last_sent_at) {
      const elapsed = (now.getTime() - new Date(latest.last_sent_at).getTime()) / 1000;
      if (elapsed < RESEND_COOLDOWN_SECONDS) {
        const wait = Math.ceil(RESEND_COOLDOWN_SECONDS - elapsed);
        throw new Error(`Please wait ${wait}s before requesting another code.`);
      }
    }

    await supabaseAdmin
      .from("phone_otp_codes")
      .update({ consumed_at: now.toISOString() })
      .eq("phone", phone)
      .is("consumed_at", null);

    const code = generateCode();
    const codeHash = await hashCode(code, phone);
    const expiresAt = new Date(now.getTime() + OTP_TTL_SECONDS * 1000).toISOString();

    const { error: insertError } = await supabaseAdmin.from("phone_otp_codes").insert({
      phone,
      code_hash: codeHash,
      expires_at: expiresAt,
      last_sent_at: now.toISOString(),
    });
    if (insertError) {
      console.error("OTP insert failed", insertError);
      throw new Error("Could not create code. Please try again.");
    }

    await sendTwilioSms(
      phone,
      `Your Texto verification code is ${code}. It expires in 5 minutes.`,
    );

    return { ok: true, expiresInSeconds: OTP_TTL_SECONDS };
  });

export const verifyPhoneOtp = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => verifySchema.parse(input))
  .handler(async ({ data }) => {
    const phone = data.phone;
    const code = data.code;
    const now = new Date();

    const { data: row, error } = await supabaseAdmin
      .from("phone_otp_codes")
      .select("*")
      .eq("phone", phone)
      .is("consumed_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) {
      console.error("OTP fetch failed", error);
      throw new Error("Could not verify code. Please try again.");
    }
    if (!row) {
      throw new Error("No active code. Please request a new one.");
    }
    if (new Date(row.expires_at).getTime() < now.getTime()) {
      throw new Error("Code expired. Please request a new one.");
    }
    if (row.attempts >= MAX_VERIFY_ATTEMPTS) {
      await supabaseAdmin
        .from("phone_otp_codes")
        .update({ consumed_at: now.toISOString() })
        .eq("id", row.id);
      throw new Error("Too many attempts. Please request a new code.");
    }

    const expectedHash = await hashCode(code, phone);
    if (expectedHash !== row.code_hash) {
      await supabaseAdmin
        .from("phone_otp_codes")
        .update({ attempts: row.attempts + 1 })
        .eq("id", row.id);
      throw new Error("Incorrect code. Please try again.");
    }

    await supabaseAdmin
      .from("phone_otp_codes")
      .update({ consumed_at: now.toISOString() })
      .eq("id", row.id);

    // Find or create the auth user for this phone.
    type AuthUser = { id: string; phone?: string | null };
    const list = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (list.error) {
      console.error("listUsers failed", list.error);
      throw new Error("Sign-in failed. Please try again.");
    }
    const normalized = phone.replace(/^\+/, "");
    const match = (list.data.users as AuthUser[]).find(
      (u) => (u.phone ?? "").replace(/^\+/, "") === normalized,
    );

    let userId: string;
    let isNewUser = false;
    if (match) {
      userId = match.id;
    } else {
      isNewUser = true;
      const created = await supabaseAdmin.auth.admin.createUser({
        phone,
        phone_confirm: true,
        user_metadata: { signup_method: "phone" },
      });
      if (created.error || !created.data.user) {
        console.error("createUser failed", created.error);
        throw new Error("Could not create your account. Please try again.");
      }
      userId = created.data.user.id;
    }

    // Mint a one-time password the client will use to sign in immediately.
    const oneTimePassword = generateRandomPassword();
    const upd = await supabaseAdmin.auth.admin.updateUserById(userId, {
      password: oneTimePassword,
    });
    if (upd.error) {
      console.error("updateUserById password set failed", upd.error);
      throw new Error("Could not finalize sign-in. Please try again.");
    }

    return {
      ok: true,
      phone,
      password: oneTimePassword,
      isNewUser,
    };
  });

export const rotatePhonePassword = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => phoneSchema.parse(input))
  .handler(async ({ data }) => {
    type AuthUser = { id: string; phone?: string | null };
    const list = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (list.error) {
      console.error("listUsers failed", list.error);
      return { ok: false };
    }
    const normalized = data.phone.replace(/^\+/, "");
    const match = (list.data.users as AuthUser[]).find(
      (u) => (u.phone ?? "").replace(/^\+/, "") === normalized,
    );
    if (!match) return { ok: false };
    await supabaseAdmin.auth.admin.updateUserById(match.id, {
      password: generateRandomPassword(),
    });
    return { ok: true };
  });

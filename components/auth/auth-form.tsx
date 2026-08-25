"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { ArrowRight, CheckCircle2, Eye, EyeOff, LoaderCircle, Mail, TriangleAlert } from "lucide-react";
import { forgotPasswordAction, loginAction, registerAction, resetPasswordAction, type AuthActionState } from "@/app/(auth)/actions";
import { fieldClass, primaryButtonClass } from "@/components/ui";
import { useState } from "react";

type Mode = "login" | "register" | "forgot" | "reset";
const initialState: AuthActionState = {};

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return <button disabled={pending} className={`${primaryButtonClass} mt-2 w-full`} type="submit">{pending ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <ArrowRight className="size-4" aria-hidden="true" />}{pending ? "Please wait…" : label}</button>;
}

function PasswordField({ name, label, autoComplete }: { name: string; label: string; autoComplete: string }) {
  const [visible, setVisible] = useState(false);
  return <label className="block text-xs font-semibold text-[#3e4c47]">{label}<span className="relative block"><input className={`${fieldClass} pr-11`} type={visible ? "text" : "password"} name={name} required minLength={8} autoComplete={autoComplete} /><button type="button" onClick={() => setVisible((value) => !value)} className="absolute bottom-0 right-0 grid size-11 place-items-center rounded-xl text-[#75817c] hover:text-[#0d684d]" aria-label={visible ? "Hide password" : "Show password"}>{visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}</button></span></label>;
}

export function AuthForm({ mode, next = "/dashboard", externalError }: { mode: Mode; next?: string; externalError?: string }) {
  const action = mode === "login" ? loginAction : mode === "register" ? registerAction : mode === "forgot" ? forgotPasswordAction : resetPasswordAction;
  const [state, formAction] = useActionState(action, initialState);
  const copy = {
    login: { eyebrow: "Welcome back", title: "Sign in to your workspace", description: "Continue to your authorized policies, analyses, and assigned actions.", button: "Sign in" },
    register: { eyebrow: "Create a workspace", title: "Start making policy actionable", description: "The first verified member creates the organization workspace. Additional members are invited by an administrator.", button: "Create account" },
    forgot: { eyebrow: "Account recovery", title: "Reset your password", description: "Enter your account email and we’ll send a time-limited recovery link.", button: "Send reset link" },
    reset: { eyebrow: "Choose a new password", title: "Secure your account", description: "Use at least 8 characters and avoid a password used on another service.", button: "Update password" },
  }[mode];

  return (
    <div className="w-full">
      <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#0d684d]">{copy.eyebrow}</p>
      <h1 className="mt-3 text-[30px] font-semibold tracking-[-0.04em] text-[#17211e]">{copy.title}</h1>
      <p className="mt-3 text-sm leading-6 text-[#6b7772]">{copy.description}</p>
      {(state.error || externalError) && <div className="mt-6 flex gap-2.5 rounded-xl border border-rose-200 bg-rose-50 p-3.5 text-xs leading-5 text-rose-800" role="alert"><TriangleAlert className="mt-0.5 size-4 shrink-0" />{state.error ?? externalError}</div>}
      {state.success && <div className="mt-6 flex gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 p-3.5 text-xs leading-5 text-emerald-800" role="status"><CheckCircle2 className="mt-0.5 size-4 shrink-0" />{state.success}</div>}
      <form action={formAction} className="mt-7 space-y-4">
        <input type="hidden" name="next" value={next} />
        {mode === "register" && <><label className="block text-xs font-semibold text-[#3e4c47]">Full name<input className={fieldClass} name="fullName" required autoComplete="name" placeholder="Avery Morgan" /></label><label className="block text-xs font-semibold text-[#3e4c47]">Organization<input className={fieldClass} name="organizationName" required autoComplete="organization" placeholder="Northbridge College" /></label></>}
        {mode !== "reset" && <label className="block text-xs font-semibold text-[#3e4c47]">Work email<span className="relative block"><Mail className="absolute bottom-3.5 left-3.5 size-4 text-[#8a9690]" aria-hidden="true" /><input className={`${fieldClass} pl-10`} name="email" required type="email" autoComplete="email" placeholder="you@organization.edu" /></span></label>}
        {(mode === "login" || mode === "register") && <PasswordField name="password" label="Password" autoComplete={mode === "login" ? "current-password" : "new-password"} />}
        {mode === "reset" && <><PasswordField name="password" label="New password" autoComplete="new-password" /><PasswordField name="confirmPassword" label="Confirm new password" autoComplete="new-password" /></>}
        {mode === "login" && <div className="flex items-center justify-between"><label className="inline-flex items-center gap-2 text-xs text-[#5d6a64]"><input type="checkbox" name="remember" className="size-4 rounded border-[#cbd4cf] accent-[#0d684d]" />Keep me signed in</label><Link href="/forgot-password" className="text-xs font-semibold text-[#0d684d] hover:underline">Forgot password?</Link></div>}
        <SubmitButton label={copy.button} />
      </form>
      <div className="mt-7 border-t border-[#e4e8e5] pt-5 text-center text-xs text-[#6d7974]">
        {mode === "login" && <>New to PolicyPulse? <Link className="font-semibold text-[#0d684d] hover:underline" href="/register">Create a workspace</Link></>}
        {mode === "register" && <>Already have an account? <Link className="font-semibold text-[#0d684d] hover:underline" href="/login">Sign in</Link></>}
        {(mode === "forgot" || mode === "reset") && <Link className="font-semibold text-[#0d684d] hover:underline" href="/login">Return to sign in</Link>}
      </div>
    </div>
  );
}

"use client";

import { useActionState } from "react";
import { loginAction, type LoginState } from "@/app/login/actions";

const initialState: LoginState = {};

export default function LoginForm() {
  const [state, formAction, pending] = useActionState(loginAction, initialState);

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label htmlFor="phone" className="mb-1 block text-sm font-medium text-neutral-700">
          رقم الجوال
        </label>
        <input
          id="phone"
          name="phone"
          type="tel"
          inputMode="numeric"
          autoComplete="tel"
          required
          placeholder="05XXXXXXXX"
          className="w-full rounded-xl border border-neutral-300 px-4 py-3 text-lg focus:border-amber-600 focus:outline-none focus:ring-1 focus:ring-amber-600"
        />
      </div>
      <div>
        <label htmlFor="pin" className="mb-1 block text-sm font-medium text-neutral-700">
          الرقم السري
        </label>
        <input
          id="pin"
          name="pin"
          type="password"
          inputMode="numeric"
          autoComplete="current-password"
          required
          className="w-full rounded-xl border border-neutral-300 px-4 py-3 text-lg focus:border-amber-600 focus:outline-none focus:ring-1 focus:ring-amber-600"
        />
      </div>

      {state.error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-xl bg-amber-700 px-4 py-3 text-lg font-bold text-white transition hover:bg-amber-800 disabled:opacity-60"
      >
        {pending ? "جاري الدخول..." : "تسجيل الدخول"}
      </button>
    </form>
  );
}

"use client";

import { useMutation, useQuery } from "convex/react";
import { api } from "@autoresearch/convex/api";
import { useState } from "react";

type KeyField = {
  key: keyof typeof FIELDS;
  arg:
    | "aiGatewayKey"
    | "exaKey"
    | "resendKey"
    | "reacherKey"
    | "niaKey";
  label: string;
  hint: string;
};

const FIELDS = {
  aiGateway: {
    arg: "aiGatewayKey",
    label: "Vercel AI Gateway",
    hint: "vck_... — single key routes Anthropic + OpenAI + FLUX text/image",
  },
  exa: {
    arg: "exaKey",
    label: "Exa",
    hint: "Web search sense organ for niche discovery",
  },
  resend: {
    arg: "resendKey",
    label: "Resend",
    hint: "Outbound email channel",
  },
  reacher: {
    arg: "reacherKey",
    label: "Reacher",
    hint: "Email verification (used by lead-gen flows)",
  },
  nia: {
    arg: "niaKey",
    label: "Nia",
    hint: "Codebase grounding for the agent",
  },
} as const satisfies Record<string, Omit<KeyField, "key">>;

export function ByokForm() {
  const status = useQuery(api.users.apiKeyStatus, {});
  const update = useMutation(api.users.updateApiKeys);

  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);

  if (status === undefined) {
    return <p style={{ color: "#777" }}>Loading…</p>;
  }
  if (status === null) {
    return (
      <p style={{ color: "#a33" }}>
        Provisioning your account — refresh in a moment.
      </p>
    );
  }

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaved(null);
    try {
      const patch: Record<string, string> = {};
      for (const [, def] of Object.entries(FIELDS)) {
        const v = values[def.arg]?.trim();
        if (v) patch[def.arg] = v;
      }
      if (Object.keys(patch).length === 0) {
        setSaved("Nothing to save.");
      } else {
        await update(patch);
        setValues({});
        setSaved(`Saved ${Object.keys(patch).length} key(s).`);
      }
    } catch (err) {
      setSaved(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSave} style={{ display: "grid", gap: "1rem" }}>
      {(Object.entries(FIELDS) as [keyof typeof FIELDS, Omit<KeyField, "key">][]).map(
        ([key, def]) => {
          const isSet = (status as Record<string, boolean>)[key];
          return (
            <div
              key={key}
              style={{
                display: "grid",
                gap: "0.35rem",
                padding: "0.9rem 1rem",
                border: "1px solid #e8e6e1",
                borderRadius: 10,
                background: "#fff",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "baseline",
                  gap: "0.75rem",
                }}
              >
                <label
                  htmlFor={def.arg}
                  style={{ fontWeight: 600, fontSize: "0.95rem" }}
                >
                  {def.label}
                </label>
                <span
                  style={{
                    fontSize: "0.72rem",
                    letterSpacing: "0.05em",
                    textTransform: "uppercase",
                    color: isSet ? "#0a7d2e" : "#a06200",
                  }}
                >
                  {isSet ? "set" : "missing"}
                </span>
              </div>
              <input
                id={def.arg}
                name={def.arg}
                type="password"
                autoComplete="off"
                placeholder={isSet ? "•••••••• (leave blank to keep)" : "Paste key"}
                value={values[def.arg] ?? ""}
                onChange={(e) =>
                  setValues((s) => ({ ...s, [def.arg]: e.target.value }))
                }
                style={{
                  padding: "0.55rem 0.7rem",
                  fontFamily: "ui-monospace, monospace",
                  fontSize: "0.9rem",
                  border: "1px solid #d6d3cc",
                  borderRadius: 6,
                  background: "#fafaf7",
                }}
              />
              <span style={{ fontSize: "0.78rem", color: "#777" }}>{def.hint}</span>
            </div>
          );
        },
      )}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.75rem",
        }}
      >
        <button
          type="submit"
          disabled={saving}
          style={{
            padding: "0.6rem 1.1rem",
            fontWeight: 600,
            border: "none",
            borderRadius: 8,
            background: saving ? "#666" : "#0e0e0e",
            color: "#fff",
            cursor: saving ? "default" : "pointer",
          }}
        >
          {saving ? "Saving…" : "Save keys"}
        </button>
        {saved && <span style={{ fontSize: "0.85rem", color: "#555" }}>{saved}</span>}
      </div>
    </form>
  );
}

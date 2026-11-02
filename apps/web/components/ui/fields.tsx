import type { ReactNode } from "react";

/** Labelled form controls shared by the cockpit forms. Each control is tied to its label by id. */

const control =
  "w-full rounded-md border border-nx-border bg-nx-bg px-3 py-2 text-sm placeholder:text-nx-muted";

type Base = { name: string; label: string; hint?: string; id?: string };

function Field({
  id,
  label,
  hint,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
      </label>
      {children}
      {hint && (
        <p id={`${id}-hint`} className="text-xs text-nx-muted">
          {hint}
        </p>
      )}
    </div>
  );
}

export function TextField({
  name,
  label,
  hint,
  id = name,
  defaultValue,
  required,
  type = "text",
  maxLength,
  inputMode,
}: Base & {
  defaultValue?: string | number | null;
  required?: boolean;
  type?: "text" | "date" | "number" | "email" | "url";
  maxLength?: number;
  inputMode?: "decimal" | "text";
}) {
  return (
    <Field id={id} label={label} hint={hint}>
      <input
        id={id}
        name={name}
        type={type}
        defaultValue={defaultValue ?? ""}
        required={required}
        maxLength={maxLength}
        inputMode={inputMode}
        step={type === "number" ? "0.01" : undefined}
        min={type === "number" ? 0 : undefined}
        aria-describedby={hint ? `${id}-hint` : undefined}
        className={control}
      />
    </Field>
  );
}

export function TextArea({
  name,
  label,
  hint,
  id = name,
  defaultValue,
  required,
  rows = 3,
  maxLength,
}: Base & { defaultValue?: string | null; required?: boolean; rows?: number; maxLength?: number }) {
  return (
    <Field id={id} label={label} hint={hint}>
      <textarea
        id={id}
        name={name}
        rows={rows}
        defaultValue={defaultValue ?? ""}
        required={required}
        maxLength={maxLength}
        aria-describedby={hint ? `${id}-hint` : undefined}
        className={control}
      />
    </Field>
  );
}

export function SelectField({
  name,
  label,
  hint,
  id = name,
  defaultValue,
  options,
}: Base & { defaultValue?: string | null; options: { value: string; label: string }[] }) {
  return (
    <Field id={id} label={label} hint={hint}>
      <select
        id={id}
        name={name}
        defaultValue={defaultValue ?? ""}
        aria-describedby={hint ? `${id}-hint` : undefined}
        className={control}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </Field>
  );
}

export function Checkbox({
  name,
  label,
  id = name,
  defaultChecked,
}: Base & { defaultChecked?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <input
        id={id}
        name={name}
        type="checkbox"
        defaultChecked={defaultChecked}
        className="h-4 w-4"
      />
      <label htmlFor={id} className="text-sm">
        {label}
      </label>
    </div>
  );
}

export function Hidden({ name, value }: { name: string; value: string | number }) {
  return <input type="hidden" name={name} value={value} />;
}

export function Badge({
  children,
  tone = "muted",
}: {
  children: ReactNode;
  tone?: "muted" | "ok" | "warn" | "danger" | "teal";
}) {
  const tones = {
    muted: "border-nx-border text-nx-muted",
    ok: "border-nx-ok/60 text-nx-ok",
    warn: "border-nx-warn/60 text-nx-warn",
    danger: "border-nx-danger/60 text-nx-danger",
    teal: "border-nx-teal/60 text-nx-teal",
  };
  return (
    <span className={`inline-block rounded border px-1.5 py-0.5 text-xs ${tones[tone]}`}>
      {children}
    </span>
  );
}

export const buttonPrimary =
  "rounded-md bg-nx-teal px-3 py-1.5 text-sm font-semibold text-nx-bg disabled:opacity-60";
export const buttonSecondary =
  "rounded-md border border-nx-border px-3 py-1.5 text-sm disabled:opacity-60";

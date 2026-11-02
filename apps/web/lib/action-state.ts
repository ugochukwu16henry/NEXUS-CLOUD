/** State returned by server actions to `useActionState`. Safe to import from client components. */
export type ActionState = {
  status: "idle" | "success" | "error";
  message?: string;
  /** Extra values for the form, e.g. the TOTP QR code during enrolment. Never secrets of others. */
  data?: Record<string, string>;
};

export const IDLE_STATE: ActionState = { status: "idle" };

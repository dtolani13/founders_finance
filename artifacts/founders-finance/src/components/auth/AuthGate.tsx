import { FormEvent, useCallback, useEffect, useState } from "react";
import {
  Check,
  Eye,
  EyeOff,
  KeyRound,
  LoaderCircle,
  LockKeyhole,
  ShieldCheck,
} from "lucide-react";
import { StudioSignature } from "@/components/Brand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type AuthStatus = {
  configured: boolean;
  authenticated: boolean;
  expires_at: string | null;
};

type AuthErrorResponse = {
  error?: string;
  code?: string;
};

type AuthGateProps = {
  children: (controls: {
    lockWorkspace: () => Promise<void>;
  }) => React.ReactNode;
};

async function readJson<T>(response: Response): Promise<T> {
  const data = (await response.json().catch(() => ({}))) as T &
    AuthErrorResponse;
  if (!response.ok) {
    throw new Error(
      data.error || "Founders Finance could not complete that request.",
    );
  }
  return data;
}

export function AuthGate({ children }: AuthGateProps) {
  const [status, setStatus] = useState<AuthStatus | null>(null);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshStatus = useCallback(async () => {
    try {
      const response = await fetch("/api/auth/status", {
        credentials: "same-origin",
        headers: { Accept: "application/json" },
      });
      setStatus(await readJson<AuthStatus>(response));
      setError(null);
    } catch {
      setStatus({ configured: true, authenticated: false, expires_at: null });
      setError(
        "The secure finance service is unavailable. Check that the API and database are running.",
      );
    }
  }, []);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  useEffect(() => {
    const handleUnauthorized = () => {
      setStatus((current) => ({
        configured: current?.configured ?? true,
        authenticated: false,
        expires_at: null,
      }));
      setPassword("");
      setConfirmation("");
      setError("Your secure session ended. Unlock the workspace to continue.");
    };
    window.addEventListener(
      "founders-finance:unauthorized",
      handleUnauthorized,
    );
    return () =>
      window.removeEventListener(
        "founders-finance:unauthorized",
        handleUnauthorized,
      );
  }, []);

  const lockWorkspace = useCallback(async () => {
    await fetch("/api/auth/logout", {
      method: "POST",
      credentials: "same-origin",
      headers: { Accept: "application/json" },
    }).catch(() => undefined);
    setStatus({ configured: true, authenticated: false, expires_at: null });
    setPassword("");
    setConfirmation("");
    setError(null);
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!status) return;

    const isSetup = !status.configured;
    if (isSetup && password !== confirmation) {
      setError("The passphrases do not match.");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch(
        isSetup ? "/api/auth/setup" : "/api/auth/login",
        {
          method: "POST",
          credentials: "same-origin",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({ password }),
        },
      );
      const session = await readJson<{
        authenticated: boolean;
        expires_at: string;
      }>(response);
      setStatus({
        configured: true,
        authenticated: session.authenticated,
        expires_at: session.expires_at,
      });
      setPassword("");
      setConfirmation("");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The workspace could not be unlocked.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (status?.authenticated) {
    return <>{children({ lockWorkspace })}</>;
  }

  if (!status) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-foreground">
        <div className="flex items-center gap-3 text-sm font-semibold text-muted-foreground">
          <LoaderCircle className="h-5 w-5 animate-spin rcl-accent" />
          Securing workspace
        </div>
      </div>
    );
  }

  const isSetup = !status.configured;

  return (
    <main className="relative min-h-screen overflow-x-hidden rcl-login text-foreground">
      <div className="relative mx-auto grid min-h-screen w-full min-w-0 max-w-7xl grid-cols-1 lg:grid-cols-[1.15fr_0.85fr]">
        <section className="flex min-w-0 flex-col justify-between px-6 py-4 sm:px-10 sm:py-8 lg:px-16 lg:py-14">
          <StudioSignature />

          <div className="my-8 max-w-xl lg:my-14">
            <p className="mb-5 text-lg font-semibold rcl-accent">
              Founders Finance
            </p>
            <h1 className="max-w-lg text-3xl font-semibold leading-tight tracking-tight text-foreground sm:text-4xl">
              {isSetup
                ? "Protect the books before they open."
                : "Clarity across every company."}
            </h1>
            <p className="mt-5 max-w-md text-base leading-7 text-muted-foreground">Follow the money, reconcile the details, and close each month with a clear view of your books.</p>
            <div className="mt-7 hidden items-center gap-3 text-sm text-muted-foreground lg:flex"><ShieldCheck className="h-4 w-4 rcl-accent" />Private, local owner workspace</div>
          </div>

          <p className="hidden font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground lg:block">
            Where Cash Flows. Where Every Dollar Goes.
          </p>
        </section>

        <section className="flex min-w-0 items-center border-t border-border rcl-login-panel px-6 py-8 sm:px-10 sm:py-10 lg:border-l lg:border-t-0 lg:px-14 lg:py-12">
          <div className="min-w-0 w-full max-w-md lg:mx-auto">
            <div className="mb-8 flex h-12 w-12 items-center justify-center rounded-md border border-primary/40 bg-primary/10 rcl-accent">
              <KeyRound className="h-5 w-5" />
            </div>
            <p className="font-mono text-xs font-bold uppercase tracking-[0.2em] rcl-accent">
              {isSetup ? "First-run security" : "Owner access"}
            </p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-foreground">
              {isSetup ? "Create your passphrase" : "Unlock workspace"}
            </h2>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              {isSetup
                ? "Use at least 12 characters. This passphrase protects access to every company record in this installation."
                : "Enter the owner passphrase to access company records and financial operations."}
            </p>

            <form className="mt-8 space-y-5" onSubmit={submit}>
              <div className="space-y-2">
                <Label
                  htmlFor="owner-passphrase"
                  className="text-sm font-semibold text-foreground"
                >
                  Owner passphrase
                </Label>
                <div className="relative">
                  <Input
                    id="owner-passphrase"
                    type={showPassword ? "text" : "password"}
                    autoComplete={isSetup ? "new-password" : "current-password"}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    minLength={12}
                    maxLength={128}
                    autoFocus
                    required
                    className="h-12 border-input bg-background pr-12 text-base text-foreground placeholder:text-slate-600 focus-visible:border-ring focus-visible:ring-ring/60"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((visible) => !visible)}
                    className="absolute inset-y-0 right-0 flex w-12 items-center justify-center text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                    aria-label={
                      showPassword ? "Hide passphrase" : "Show passphrase"
                    }
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>

              {isSetup && (
                <div className="space-y-2">
                  <Label
                    htmlFor="confirm-passphrase"
                    className="text-sm font-semibold text-foreground"
                  >
                    Confirm passphrase
                  </Label>
                  <Input
                    id="confirm-passphrase"
                    type={showPassword ? "text" : "password"}
                    autoComplete="new-password"
                    value={confirmation}
                    onChange={(event) => setConfirmation(event.target.value)}
                    minLength={12}
                    maxLength={128}
                    required
                    className="h-12 border-input bg-background text-base text-foreground focus-visible:border-ring focus-visible:ring-ring/60"
                  />
                </div>
              )}

              {isSetup &&
                password.length >= 12 &&
                password === confirmation && (
                  <div className="flex items-center gap-2 text-xs font-semibold text-emerald-300">
                    <Check className="h-4 w-4" /> Passphrase confirmed
                  </div>
                )}

              {error && (
                <div
                  role="alert"
                  className="border-l-2 border-red-400 bg-red-950/35 px-4 py-3 text-sm leading-5 text-red-200"
                >
                  {error}
                </div>
              )}

              <Button
                type="submit"
                disabled={submitting}
                className="h-12 w-full font-semibold"
              >
                {submitting ? (
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                ) : (
                  <LockKeyhole className="h-4 w-4" />
                )}
                {submitting
                  ? "Securing workspace"
                  : isSetup
                    ? "Create access and continue"
                    : "Unlock Founders Finance"}
              </Button>
            </form>

            <p className="mt-6 text-xs leading-5 text-muted-foreground">
              Sessions expire automatically after 12 hours. Repeated failed
              attempts temporarily lock access.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}

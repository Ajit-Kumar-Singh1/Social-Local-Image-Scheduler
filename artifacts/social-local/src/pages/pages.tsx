import { useEffect, useRef, useState } from "react";
import {
  useListPages,
  useDisconnectPage,
  getListPagesQueryKey,
  getGetDashboardStatsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import {
  Facebook, Trash2, KeyRound, Globe, CheckCircle2, Loader2,
  AlertTriangle, ExternalLink, ChevronDown, ChevronUp, Stethoscope,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

type OAuthError = { message: string; debug?: { grantedPerms?: string[]; userId?: string; userName?: string } };

export function Pages() {
  const { data: pages, isLoading, refetch } = useListPages();
  const disconnectPage = useDisconnectPage();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [connecting, setConnecting] = useState(false);
  const [diagnosing, setDiagnosing] = useState(false);
  const [lastError, setLastError] = useState<OAuthError | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const popupRef = useRef<Window | null>(null);

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (!event.data || typeof event.data !== "object") return;
      const { type, connected, error, debug } = event.data as {
        type: string;
        connected?: number;
        error?: string;
        debug?: OAuthError["debug"];
      };

      if (type === "fb-oauth-success") {
        setConnecting(false);
        setLastError(null);
        toast({
          title: "Pages connected",
          description: `Successfully connected ${connected} Facebook page${connected !== 1 ? "s" : ""}.`,
        });
        queryClient.invalidateQueries({ queryKey: getListPagesQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetDashboardStatsQueryKey() });
        refetch();
      }

      if (type === "fb-oauth-error") {
        setConnecting(false);
        const isNoPagesFound = error === "NO_PAGES_FOUND";
        const isMissingPerm = error?.startsWith("MISSING_PERMISSION:");
        setLastError({
          message: isNoPagesFound
            ? "no_pages_found"
            : isMissingPerm
            ? "missing_permission"
            : (error ?? "unknown"),
          debug,
        });
        setShowHelp(!!(isNoPagesFound || isMissingPerm));
        if (!isNoPagesFound && !isMissingPerm) {
          toast({
            title: "Connection failed",
            description: error || "Something went wrong. Please try again.",
            variant: "destructive",
          });
        }
      }
    };

    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  const openPopup = (path: string, onClose?: () => void) => {
    if (popupRef.current && !popupRef.current.closed) popupRef.current.close();
    const w = 640, h = 740;
    const left = window.screen.width / 2 - w / 2;
    const top = window.screen.height / 2 - h / 2;
    const popup = window.open(
      path, "fb-oauth-popup",
      `width=${w},height=${h},left=${left},top=${top},toolbar=no,menubar=no,scrollbars=yes`
    );
    if (!popup) {
      toast({ title: "Popup blocked", description: "Allow popups for this site and try again.", variant: "destructive" });
      return;
    }
    popupRef.current = popup;
    const checkClosed = setInterval(() => {
      if (popup.closed) {
        clearInterval(checkClosed);
        onClose?.();
      }
    }, 500);
  };

  const handleConnect = () => {
    setConnecting(true);
    openPopup("/api/auth/facebook", () => setConnecting(false));
  };

  const handleDiagnose = () => {
    setDiagnosing(true);
    openPopup("/api/auth/facebook/diagnose", () => setDiagnosing(false));
  };

  const handleDisconnect = (id: number) => {
    if (!confirm("Are you sure you want to disconnect this page?")) return;
    disconnectPage.mutate(
      { id },
      {
        onSuccess: () => {
          toast({ title: "Page disconnected" });
          queryClient.invalidateQueries({ queryKey: getListPagesQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetDashboardStatsQueryKey() });
        },
        onError: (err) => {
          toast({ title: "Disconnection failed", description: err.message, variant: "destructive" });
        },
      }
    );
  };

  const appId = import.meta.env.VITE_FACEBOOK_APP_ID as string | undefined;

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Facebook Pages</h1>
          <p className="text-muted-foreground mt-1">Manage your connected Facebook pages.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={handleDiagnose} disabled={diagnosing} className="gap-2">
            {diagnosing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Stethoscope className="h-4 w-4" />}
            Diagnose
          </Button>
          <Button onClick={handleConnect} disabled={connecting} className="gap-2">
            {connecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Facebook className="h-4 w-4" />}
            {connecting ? "Waiting for Facebook…" : "Connect with Facebook"}
          </Button>
        </div>
      </div>

      {/* "No pages found" error + actionable fix guide */}
      {lastError && (lastError.message === "no_pages_found" || lastError.message === "missing_permission") && (
        <Alert variant="destructive" className="border-orange-500/40 bg-orange-500/5 text-orange-200">
          <AlertTriangle className="h-4 w-4 text-orange-400" />
          <AlertTitle className="text-orange-300">
            {lastError.message === "no_pages_found"
              ? "No Pages found on your account"
              : "Permission not granted"}
          </AlertTitle>
          <AlertDescription className="mt-1 text-orange-200/80 text-sm space-y-1">
            {lastError.message === "missing_permission" ? (
              <p>Facebook didn't grant the <strong>pages_show_list</strong> permission. Please try connecting again and approve all requested permissions.</p>
            ) : (
              <p>
                Facebook returned 0 pages. This almost always means your app is in{" "}
                <strong>Development Mode</strong> — in that mode only pages belonging to the app's
                Admin/Developer/Tester accounts are visible.
              </p>
            )}
            {lastError.debug?.userName && (
              <p className="text-xs text-orange-300/60">
                Authenticated as: <strong>{lastError.debug.userName}</strong> (ID {lastError.debug.userId})
              </p>
            )}
          </AlertDescription>
          <button
            onClick={() => setShowHelp((v) => !v)}
            className="mt-3 flex items-center gap-1 text-xs font-semibold text-orange-300 hover:text-orange-100 transition-colors"
          >
            {showHelp ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            {showHelp ? "Hide fix guide" : "How to fix this →"}
          </button>

          {showHelp && (
            <div className="mt-4 space-y-4">
              {/* Option A */}
              <div className="bg-background/20 rounded-lg p-4 border border-orange-500/20">
                <p className="font-semibold text-sm text-orange-100 mb-2">Option A — Switch app to Live Mode (recommended)</p>
                <ol className="list-decimal list-inside space-y-1.5 text-xs text-orange-200/80 leading-relaxed">
                  <li>
                    Open the{" "}
                    <a
                      href={`https://developers.facebook.com/apps/${appId ?? ""}`}
                      target="_blank"
                      rel="noreferrer"
                      className="underline text-orange-300 inline-flex items-center gap-0.5"
                    >
                      Facebook Developer Portal <ExternalLink className="h-2.5 w-2.5" />
                    </a>
                    {" "}and select your app
                  </li>
                  <li>In the top navigation bar find the <strong>Development ↔ Live</strong> toggle</li>
                  <li>Flip it to <strong>Live</strong> and accept Facebook's policies</li>
                  <li>Return here and click <strong>Connect with Facebook</strong> again</li>
                </ol>
              </div>

              {/* Option B */}
              <div className="bg-background/20 rounded-lg p-4 border border-orange-500/20">
                <p className="font-semibold text-sm text-orange-100 mb-2">Option B — Stay in Dev Mode, add yourself as Tester</p>
                <ol className="list-decimal list-inside space-y-1.5 text-xs text-orange-200/80 leading-relaxed">
                  <li>
                    Go to{" "}
                    <a
                      href={`https://developers.facebook.com/apps/${appId ?? ""}/roles/roles/`}
                      target="_blank"
                      rel="noreferrer"
                      className="underline text-orange-300 inline-flex items-center gap-0.5"
                    >
                      App Roles <ExternalLink className="h-2.5 w-2.5" />
                    </a>
                    {" "}in the Developer Portal
                  </li>
                  <li>Add the Facebook account you log in with as <strong>Admin</strong> or <strong>Tester</strong></li>
                  <li>That account must accept the role invitation in their Facebook notifications</li>
                  <li>Return here and click <strong>Connect with Facebook</strong> again</li>
                </ol>
              </div>

              <p className="text-xs text-orange-300/60 flex items-center gap-1">
                <Stethoscope className="h-3 w-3" />
                Use the <strong>Diagnose</strong> button above to see exactly what permissions and pages Facebook returns for your account.
              </p>
            </div>
          )}
        </Alert>
      )}

      {/* Permanent token info */}
      <Alert className="border-primary/20 bg-primary/5">
        <CheckCircle2 className="h-4 w-4 text-primary" />
        <AlertDescription className="text-sm text-foreground/80">
          Connecting via Facebook OAuth grants permanent page-level access tokens — no daily reconfiguration needed.
          Only Pages where you have an <strong>Admin</strong> or <strong>Editor</strong> role are returned by Facebook's API.
        </AlertDescription>
      </Alert>

      {/* Page cards */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i} className="border-border">
              <CardHeader className="flex flex-row items-center gap-4">
                <Skeleton className="h-12 w-12 rounded-full" />
                <div className="space-y-2">
                  <Skeleton className="h-5 w-32" />
                  <Skeleton className="h-4 w-24" />
                </div>
              </CardHeader>
              <CardFooter className="pt-4 border-t border-border">
                <Skeleton className="h-9 w-full" />
              </CardFooter>
            </Card>
          ))}
        </div>
      ) : pages?.length === 0 && !lastError ? (
        <div className="flex flex-col items-center justify-center p-12 bg-card border border-dashed border-border rounded-xl text-center">
          <div className="h-20 w-20 bg-primary/10 text-primary rounded-full flex items-center justify-center mb-6">
            <Facebook className="h-10 w-10" />
          </div>
          <h2 className="text-2xl font-semibold tracking-tight">No pages connected</h2>
          <p className="text-muted-foreground mt-2 max-w-md">
            Click the button below to log in with Facebook and connect all your pages in one go. A small popup will open — no need to copy any tokens.
          </p>
          <div className="flex gap-3 mt-8">
            <Button variant="outline" onClick={handleDiagnose} disabled={diagnosing} className="gap-2">
              {diagnosing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Stethoscope className="h-4 w-4" />}
              Diagnose
            </Button>
            <Button onClick={handleConnect} disabled={connecting} className="gap-2">
              {connecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Facebook className="h-4 w-4" />}
              {connecting ? "Waiting for Facebook…" : "Connect with Facebook"}
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {pages?.map((page) => (
            <Card
              key={page.id}
              className="border-border/50 bg-card overflow-hidden hover:border-primary/30 transition-colors"
              data-testid={`card-page-${page.id}`}
            >
              <CardHeader className="pb-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-4">
                    {page.avatarUrl ? (
                      <img src={page.avatarUrl} alt={page.name} className="h-12 w-12 rounded-full border border-border" />
                    ) : (
                      <div className="h-12 w-12 rounded-full bg-primary/10 text-primary flex items-center justify-center border border-primary/20">
                        <Facebook className="h-6 w-6" />
                      </div>
                    )}
                    <div>
                      <CardTitle className="text-lg line-clamp-1" title={page.name}>{page.name}</CardTitle>
                      <CardDescription className="flex items-center gap-1 mt-1 text-xs">
                        <Globe className="h-3 w-3" />
                        {page.category || "Page"}
                      </CardDescription>
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pb-4 pt-0 space-y-2">
                <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 p-2 rounded-md">
                  <KeyRound className="h-3 w-3 shrink-0" />
                  <span className="truncate font-mono">{page.pageId}</span>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="h-3 w-3" />
                  Permanent token — no re-auth needed
                </div>
              </CardContent>
              <CardFooter className="p-4 pt-0 border-t border-border/50 bg-muted/20">
                <Button
                  variant="destructive"
                  className="w-full"
                  onClick={() => handleDisconnect(page.id)}
                  disabled={disconnectPage.isPending}
                  data-testid={`button-disconnect-${page.id}`}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Disconnect
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

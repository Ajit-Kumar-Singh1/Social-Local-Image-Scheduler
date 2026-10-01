import { useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  AlertCircle, ArrowDown, ArrowLeft, ArrowUp, CheckCircle2, Clock3,
  Image as ImageIcon, Loader2, Plus, Send, Trash2, Upload,
} from "lucide-react";
import {
  getGetDashboardStatsQueryKey, getListPostsQueryKey, useListPages,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

type IntervalUnit = "minutes" | "hours" | "days";
type BatchImage = { id: string; file: File; previewUrl: string };

const MAX_IMAGE_SIZE = 100 * 1024 * 1024;
const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];

function localDateTime(date: Date) {
  return { date: format(date, "yyyy-MM-dd"), time: format(date, "HH:mm") };
}

function errorFromResponse(message: string, body: unknown) {
  if (body && typeof body === "object" && "error" in body && typeof body.error === "string") {
    return body.error;
  }
  return message;
}

function formatSchedule(date: Date) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short", month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit",
  }).format(date);
}

function isValidDate(date: Date | undefined): date is Date {
  return date !== undefined && Number.isFinite(date.getTime());
}

export function ImageBatchScheduler() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: pages, isLoading: loadingPages, isError: pagesError, refetch: refetchPages } = useListPages();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const initialStart = localDateTime(new Date(Date.now() + 60 * 60 * 1000));
  const [images, setImages] = useState<BatchImage[]>([]);
  const [caption, setCaption] = useState("");
  const [pageId, setPageId] = useState("");
  const [startDate, setStartDate] = useState(initialStart.date);
  const [startTime, setStartTime] = useState(initialStart.time);
  const [interval, setInterval] = useState("1");
  const [unit, setUnit] = useState<IntervalUnit>("days");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ phase: "upload" | "schedule"; completed: number; total: number } | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [complete, setComplete] = useState(false);

  const scheduleDates = useMemo(() => {
    if (!startDate || !startTime || images.length === 0) return [];
    const start = new Date(`${startDate}T${startTime}`);
    if (!Number.isFinite(start.getTime())) return [];
    const amount = Number(interval);
    if (!Number.isFinite(amount) || amount <= 0) return [];
    const unitMilliseconds = unit === "minutes" ? 60_000 : unit === "hours" ? 3_600_000 : 86_400_000;
    return images.map((_, index) => {
      return new Date(start.getTime() + amount * unitMilliseconds * index);
    });
  }, [images, startDate, startTime, interval, unit]);

  const updateImages = (updater: (current: BatchImage[]) => BatchImage[]) => setImages(updater);

  const addFiles = (files: FileList | null) => {
    if (!files) return;
    const accepted: BatchImage[] = [];
    const rejected: string[] = [];
    Array.from(files).forEach((file) => {
      if (!ACCEPTED_TYPES.includes(file.type)) {
        rejected.push(`${file.name}: choose a JPEG, PNG, GIF, or WebP image.`);
      } else if (file.size > MAX_IMAGE_SIZE) {
        rejected.push(`${file.name}: file exceeds the 100 MB upload limit.`);
      } else {
        accepted.push({ id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, file, previewUrl: URL.createObjectURL(file) });
      }
    });
    if (accepted.length) updateImages((current) => [...current, ...accepted]);
    if (rejected.length) setErrors((current) => [...current, ...rejected]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeImage = (id: string) => {
    updateImages((current) => {
      const removed = current.find((image) => image.id === id);
      if (removed) URL.revokeObjectURL(removed.previewUrl);
      return current.filter((image) => image.id !== id);
    });
  };

  const moveImage = (index: number, direction: -1 | 1) => {
    updateImages((current) => {
      const destination = index + direction;
      if (destination < 0 || destination >= current.length) return current;
      const reordered = [...current];
      [reordered[index], reordered[destination]] = [reordered[destination]!, reordered[index]!];
      return reordered;
    });
  };

  const handleSchedule = async () => {
    setErrors([]);
    const amount = Number(interval);
    const start = new Date(`${startDate}T${startTime}`);
    const validationErrors: string[] = [];
    if (!images.length) validationErrors.push("Add at least one image to continue.");
    if (!pageId || !pages?.some((page) => page.id === Number(pageId))) validationErrors.push("Choose a connected Facebook page.");
    if (!caption.trim()) validationErrors.push("Add a shared caption for this image batch.");
    if (!startDate || !startTime || !Number.isFinite(start.getTime())) validationErrors.push("Choose a valid start date and time.");
    else if (start.getTime() <= Date.now()) validationErrors.push("Choose a start time in the future so posts are not published immediately.");
    if (!Number.isFinite(amount) || amount <= 0) validationErrors.push("The interval must be a positive number.");
    if (scheduleDates.length !== images.length || scheduleDates.some((date) => !Number.isFinite(date.getTime()))) {
      validationErrors.push("Check your schedule settings and try again.");
    }
    if (validationErrors.length) {
      setErrors(validationErrors);
      return;
    }

    setBusy(true);
    setComplete(false);
    try {
      const uploadedUrls: string[] = [];
      setProgress({ phase: "upload", completed: 0, total: images.length });

      for (let index = 0; index < images.length; index += 1) {
        const image = images[index]!;
        const body = new FormData();
        body.append("file", image.file);
        const response = await fetch("/api/uploads", { method: "POST", body });
        let result: unknown = null;
        try { result = await response.json(); } catch { /* endpoint may return an empty response */ }
        if (!response.ok) {
          throw new Error(`${image.file.name}: ${errorFromResponse(`Upload failed (${response.status})`, result)}`);
        }
        const url = result && typeof result === "object" && "url" in result ? result.url : null;
        if (typeof url !== "string" || !url) {
          throw new Error(`${image.file.name}: upload succeeded but no image URL was returned.`);
        }
        uploadedUrls.push(url);
        setProgress({ phase: "upload", completed: index + 1, total: images.length });
      }

      setProgress({ phase: "schedule", completed: 0, total: images.length });
      const payload = {
        posts: images.map((_, index) => ({
          pageId: Number(pageId),
          postType: "image" as const,
          caption: caption.trim(),
          imageUrl: uploadedUrls[index]!,
          scheduledAt: scheduleDates[index]!.toISOString(),
        })),
      };
      const response = await fetch("/api/posts/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      let result: unknown = null;
      try { result = await response.json(); } catch { /* handled by status below */ }
      if (!response.ok) {
        throw new Error(errorFromResponse(`Scheduling failed (${response.status})`, result));
      }
      setProgress({ phase: "schedule", completed: images.length, total: images.length });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: getListPostsQueryKey() }),
        queryClient.invalidateQueries({ queryKey: getGetDashboardStatsQueryKey() }),
      ]);
      setComplete(true);
      toast({ title: `${images.length} image${images.length === 1 ? "" : "s"} scheduled` });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Something went wrong while scheduling this batch.";
      setErrors([message]);
      toast({ title: "Batch could not be completed", description: message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const resetBatch = () => {
    images.forEach((image) => URL.revokeObjectURL(image.previewUrl));
    setImages([]);
    setCaption("");
    setErrors([]);
    setProgress(null);
    setComplete(false);
  };

  if (pagesError) {
    return (
      <Card className="mx-auto max-w-xl border-destructive/30">
        <CardContent className="flex flex-col items-center p-10 text-center">
          <AlertCircle className="mb-3 h-10 w-10 text-destructive" />
          <h1 className="text-xl font-semibold">Could not load connected pages</h1>
          <p className="mt-2 text-sm text-muted-foreground">Your batch is still here. Retry loading pages to continue.</p>
          <Button data-testid="button-retry-pages" className="mt-5" onClick={() => void refetchPages()}>Retry</Button>
        </CardContent>
      </Card>
    );
  }

  if (complete) {
    return (
      <div className="mx-auto flex max-w-2xl flex-col items-center rounded-xl border border-border bg-card px-6 py-14 text-center animate-in fade-in duration-300">
        <div className="mb-5 rounded-full bg-primary/10 p-4 text-primary"><CheckCircle2 className="h-9 w-9" /></div>
        <Badge variant="secondary" className="mb-3">Batch scheduled</Badge>
        <h1 className="text-3xl font-bold tracking-tight">Your images are in the queue.</h1>
        <p className="mt-2 max-w-md text-muted-foreground">{images.length} image posts are scheduled in the order you selected.</p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Button data-testid="button-schedule-another-batch" variant="outline" onClick={resetBatch}><Plus className="mr-2 h-4 w-4" />Schedule another batch</Button>
          <Button data-testid="button-view-scheduled-posts" onClick={() => setLocation("/posts")}>View scheduled posts</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <Button data-testid="button-back-to-posts" variant="outline" size="icon" onClick={() => setLocation("/posts")} aria-label="Back to posts" className="mt-1 shrink-0">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="mb-1 flex items-center gap-2">
              <Badge variant="outline" className="font-medium text-primary">Image-only batch</Badge>
            </div>
            <h1 className="text-3xl font-bold tracking-tight">Image Batch Scheduler</h1>
            <p className="mt-1 text-muted-foreground">Upload a sequence, set one rhythm, and schedule the whole set.</p>
          </div>
        </div>
        <Button data-testid="button-schedule-image-batch" onClick={() => void handleSchedule()} disabled={busy || loadingPages || pages?.length === 0 || images.length === 0} className="gap-2">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          {busy ? "Working…" : `Schedule ${images.length || ""} ${images.length === 1 ? "Image" : "Images"}`}
        </Button>
      </div>

      {loadingPages ? (
        <Card aria-label="Loading connected pages">
          <CardContent className="space-y-3 p-6">
            <div className="h-4 w-40 animate-pulse rounded bg-muted" />
            <div className="h-10 w-full animate-pulse rounded bg-muted" />
          </CardContent>
        </Card>
      ) : !pages?.length ? (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="flex flex-col items-start gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <AlertCircle className="mt-0.5 h-5 w-5 text-amber-600" />
              <div><p className="font-medium">No Facebook pages connected</p><p className="text-sm text-muted-foreground">Connect a page before scheduling image posts.</p></div>
            </div>
            <Button data-testid="button-connect-facebook-page" variant="outline" onClick={() => setLocation("/pages")}>Go to Pages</Button>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(300px,0.8fr)]">
        <div className="space-y-6">
          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center gap-2 text-base"><ImageIcon className="h-4 w-4 text-primary" />1. Add your images</CardTitle>
              <CardDescription>JPEG, PNG, GIF, or WebP. Up to 100 MB per image.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <input
                ref={fileInputRef}
                data-testid="input-image-files"
                type="file"
                accept="image/jpeg,image/png,image/gif,image/webp"
                multiple
                className="sr-only"
                onChange={(event) => addFiles(event.target.files)}
              />
              <button
                type="button"
                data-testid="button-choose-images"
                onClick={() => fileInputRef.current?.click()}
                disabled={busy}
                className="group flex min-h-32 w-full flex-col items-center justify-center rounded-lg border border-dashed border-primary/35 bg-primary/[0.035] px-5 py-6 text-center transition-colors hover:border-primary/60 hover:bg-primary/[0.07] disabled:opacity-50"
              >
                <span className="mb-2 rounded-lg border border-border bg-card p-2.5 text-primary"><Upload className="h-5 w-5" /></span>
                <span className="font-medium">Choose image files</span>
                <span className="mt-1 text-xs text-muted-foreground">Select multiple files at once</span>
              </button>
              {!images.length ? (
                <div data-testid="empty-image-selection" className="rounded-lg border border-border/70 bg-muted/30 px-4 py-5 text-center text-sm text-muted-foreground">
                  Your selected images will appear here for review.
                </div>
              ) : (
                <div className="space-y-2" data-testid="list-image-previews">
                  {images.map((image, index) => (
                    <div key={image.id} data-testid={`preview-image-${index}`} className="flex items-center gap-3 rounded-lg border border-border bg-card p-2.5">
                      <img src={image.previewUrl} alt={`Preview of ${image.file.name}`} data-testid={`img-image-preview-${index}`} className="h-16 w-16 shrink-0 rounded-md border border-border object-cover" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary" className="h-5 min-w-6 justify-center px-1.5 font-mono text-[10px]">{String(index + 1).padStart(2, "0")}</Badge>
                          <p className="truncate text-sm font-medium" data-testid={`text-image-filename-${index}`}>{image.file.name}</p>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">{(image.file.size / (1024 * 1024)).toFixed(1)} MB · {image.file.type.replace("image/", "").toUpperCase()}</p>
                        {isValidDate(scheduleDates[index]) && <p className="mt-1 flex items-center gap-1 text-xs text-primary"><Clock3 className="h-3 w-3" />{formatSchedule(scheduleDates[index])}</p>}
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <Button data-testid={`button-move-image-up-${index}`} variant="ghost" size="icon" className="h-8 w-8" aria-label={`Move ${image.file.name} up`} disabled={busy || index === 0} onClick={() => moveImage(index, -1)}><ArrowUp className="h-4 w-4" /></Button>
                        <Button data-testid={`button-move-image-down-${index}`} variant="ghost" size="icon" className="h-8 w-8" aria-label={`Move ${image.file.name} down`} disabled={busy || index === images.length - 1} onClick={() => moveImage(index, 1)}><ArrowDown className="h-4 w-4" /></Button>
                        <Button data-testid={`button-remove-image-${index}`} variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" aria-label={`Remove ${image.file.name}`} disabled={busy} onClick={() => removeImage(image.id)}><Trash2 className="h-4 w-4" /></Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-base">2. Set the shared post details</CardTitle>
              <CardDescription>Each image becomes its own scheduled Facebook image post.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <label htmlFor="batch-page" className="text-sm font-medium">Facebook page</label>
                <Select value={pageId} onValueChange={setPageId} disabled={busy || loadingPages || !pages?.length}>
                  <SelectTrigger id="batch-page" data-testid="select-facebook-page"><SelectValue placeholder="Choose a connected page" /></SelectTrigger>
                  <SelectContent>{pages?.map((page) => <SelectItem key={page.id} value={String(page.id)}>{page.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label htmlFor="batch-caption" className="text-sm font-medium">Shared caption</label>
                <Textarea id="batch-caption" data-testid="input-shared-caption" value={caption} onChange={(event) => setCaption(event.target.value)} disabled={busy} placeholder="Write the caption that will accompany every image…" className="min-h-28 resize-y" />
                <p className="text-right text-xs text-muted-foreground">{caption.length} characters</p>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center gap-2 text-base"><Clock3 className="h-4 w-4 text-primary" />3. Choose your posting rhythm</CardTitle>
              <CardDescription>Times are interpreted in your device’s local time zone.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label htmlFor="batch-start-date" className="text-xs font-medium text-muted-foreground">Start date</label>
                   <Input id="batch-start-date" data-testid="input-start-date" type="date" min={format(new Date(), "yyyy-MM-dd")} value={startDate} onChange={(event) => setStartDate(event.target.value)} disabled={busy} />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="batch-start-time" className="text-xs font-medium text-muted-foreground">Start time</label>
                  <Input id="batch-start-time" data-testid="input-start-time" type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} disabled={busy} />
                </div>
              </div>
              <div className="space-y-1.5">
                <label htmlFor="batch-interval" className="text-sm font-medium">Time between posts</label>
                <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-2">
                  <Input id="batch-interval" data-testid="input-interval-value" type="number" min="0.01" step="any" value={interval} onChange={(event) => setInterval(event.target.value)} disabled={busy} />
                  <Select value={unit} onValueChange={(value) => setUnit(value as IntervalUnit)} disabled={busy}>
                    <SelectTrigger data-testid="select-interval-unit"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="minutes">Minutes</SelectItem>
                      <SelectItem value="hours">Hours</SelectItem>
                      <SelectItem value="days">Days</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <p className="text-xs text-muted-foreground">Use a positive interval. Images are scheduled in the order shown.</p>
              </div>
            </CardContent>
          </Card>

          <Card className="overflow-hidden">
            <CardHeader className="border-b border-border/70 bg-muted/20 pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Schedule preview</CardTitle>
                <Badge variant="outline" data-testid="text-schedule-count">{images.length} {images.length === 1 ? "post" : "posts"}</Badge>
              </div>
              <CardDescription>Based on the current image order and interval.</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {!images.length ? (
                <div data-testid="empty-schedule-preview" className="px-5 py-8 text-center text-sm text-muted-foreground">Add images to see each post’s scheduled time.</div>
              ) : (
                <ol className="divide-y divide-border/70" data-testid="list-schedule-preview">
                  {images.map((image, index) => (
                    <li key={image.id} data-testid={`schedule-preview-${index}`} className="flex items-center gap-3 px-4 py-3">
                      <img src={image.previewUrl} alt="" className="h-10 w-10 shrink-0 rounded object-cover" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{index + 1}. {image.file.name}</p>
                         <p className="mt-0.5 text-xs text-muted-foreground">{isValidDate(scheduleDates[index]) ? formatSchedule(scheduleDates[index]) : "Set valid schedule details"}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {progress && (
        <div data-testid="status-batch-progress" role="status" className="flex items-center gap-3 rounded-lg border border-primary/20 bg-primary/[0.04] px-4 py-3">
          {busy ? <Loader2 className="h-4 w-4 animate-spin text-primary" /> : <CheckCircle2 className="h-4 w-4 text-primary" />}
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">{progress.phase === "upload" ? "Uploading images" : "Creating scheduled posts"}</p>
            <p className="text-xs text-muted-foreground">{progress.completed} of {progress.total} {progress.phase === "upload" ? "uploads complete" : "posts scheduled"}</p>
          </div>
          <div className="h-1.5 w-24 overflow-hidden rounded-full bg-primary/15">
            <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${progress.total ? (progress.completed / progress.total) * 100 : 0}%` }} />
          </div>
        </div>
      )}

      {errors.length > 0 && (
        <div data-testid="status-batch-errors" role="alert" className="rounded-lg border border-destructive/25 bg-destructive/[0.045] p-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-destructive"><AlertCircle className="h-4 w-4" />Review before continuing</div>
          <ul className="mt-2 space-y-1 pl-6 text-sm text-destructive/90">{errors.map((error, index) => <li key={`${index}-${error}`}>{error}</li>)}</ul>
          <Button data-testid="button-dismiss-batch-errors" variant="ghost" size="sm" className="mt-2 text-destructive hover:text-destructive" onClick={() => setErrors([])}>Dismiss messages</Button>
        </div>
      )}
    </div>
  );
}
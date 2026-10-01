import { useState } from "react";
import { Link, useLocation } from "wouter";
import { format } from "date-fns";
import {
  useListPosts,
  useDeletePost,
  getListPostsQueryKey,
  getGetDashboardStatsQueryKey,
  ListPostsStatus,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import {
  Plus,
  Search,
  Filter,
  FileText,
  Image as ImageIcon,
  Clock,
  CheckCircle2,
  XCircle,
  Trash2,
  Loader2,
  SquareCheck,
  Square,
} from "lucide-react";
import { cn } from "@/lib/utils";

export function Posts() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [deleting, setDeleting] = useState(false);

  const { data: posts, isLoading } = useListPosts(
    statusFilter !== "all" ? { status: statusFilter as ListPostsStatus } : undefined
  );
  const deletePost = useDeletePost();

  const allIds = posts?.map((p) => p.id) ?? [];
  const allSelected = allIds.length > 0 && allIds.every((id) => selectedIds.has(id));
  const someSelected = selectedIds.size > 0;

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(allIds));
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    setDeleting(true);
    try {
      const ids = Array.from(selectedIds);
      const res = await fetch("/api/posts/bulk", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      if (!res.ok) {
        const data = await res.json() as { error?: string };
        throw new Error(data.error ?? "Delete failed");
      }
      const data = await res.json() as { deleted: number };
      setSelectedIds(new Set());
      queryClient.invalidateQueries({ queryKey: getListPostsQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetDashboardStatsQueryKey() });
      toast({ title: `${data.deleted} post${data.deleted !== 1 ? "s" : ""} deleted` });
    } catch (err) {
      toast({ title: "Delete failed", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    } finally {
      setDeleting(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "published": return <CheckCircle2 className="h-4 w-4" />;
      case "scheduled": return <Clock className="h-4 w-4" />;
      case "failed": return <XCircle className="h-4 w-4" />;
      default: return <FileText className="h-4 w-4" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "published": return "bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20";
      case "scheduled": return "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20";
      case "failed": return "bg-destructive/10 text-destructive border-destructive/20";
      default: return "bg-secondary text-secondary-foreground border-border/50";
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Posts</h1>
          <p className="text-muted-foreground mt-1">Manage your drafts, scheduled, and published posts.</p>
        </div>
        <Button asChild className="gap-2">
          <Link href="/posts/new">
            <Plus className="h-4 w-4" />
            Create Post
          </Link>
        </Button>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 items-center bg-card p-4 rounded-xl border border-border shadow-sm">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search posts..." className="pl-9 bg-background" />
        </div>
        <div className="w-full sm:w-48 flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setSelectedIds(new Set()); }}>
            <SelectTrigger className="bg-background">
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Posts</SelectItem>
              <SelectItem value="draft">Drafts</SelectItem>
              <SelectItem value="scheduled">Scheduled</SelectItem>
              <SelectItem value="published">Published</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Bulk action bar */}
      {someSelected && (
        <div className="flex items-center justify-between gap-4 px-4 py-3 bg-primary/5 border border-primary/20 rounded-xl animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={toggleSelectAll}
              className="flex items-center gap-2 text-sm font-medium text-foreground hover:text-primary transition-colors"
            >
              {allSelected
                ? <SquareCheck className="h-4 w-4 text-primary" />
                : <Square className="h-4 w-4" />}
              {allSelected ? "Deselect all" : "Select all"}
            </button>
            <span className="text-sm text-muted-foreground">
              {selectedIds.size} post{selectedIds.size !== 1 ? "s" : ""} selected
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => setSelectedIds(new Set())}>
              Cancel
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm" className="gap-2" disabled={deleting}>
                  {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  Delete {selectedIds.size} Post{selectedIds.size !== 1 ? "s" : ""}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete {selectedIds.size} post{selectedIds.size !== 1 ? "s" : ""}?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will permanently delete the selected posts. This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleBulkDelete}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      )}

      {/* Select all header when posts are loaded */}
      {!isLoading && posts && posts.length > 0 && !someSelected && (
        <div className="flex items-center gap-2 px-1">
          <button
            type="button"
            onClick={toggleSelectAll}
            className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <Square className="h-3.5 w-3.5" />
            Select all
          </button>
        </div>
      )}

      <div className="space-y-4">
        {isLoading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <Card key={i} className="border-border">
              <CardContent className="p-4 flex items-center gap-4">
                <Skeleton className="h-16 w-16 rounded-md" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-5 w-3/4" />
                  <Skeleton className="h-4 w-1/4" />
                </div>
                <Skeleton className="h-8 w-24 rounded-full" />
              </CardContent>
            </Card>
          ))
        ) : posts?.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 bg-card border border-dashed border-border rounded-xl text-center">
            <div className="h-20 w-20 bg-primary/10 text-primary rounded-full flex items-center justify-center mb-6">
              <FileText className="h-10 w-10" />
            </div>
            <h2 className="text-2xl font-semibold tracking-tight">No posts found</h2>
            <p className="text-muted-foreground mt-2 max-w-md">
              {statusFilter !== "all"
                ? `You don't have any ${statusFilter} posts yet.`
                : "You haven't created any posts yet. Click the button below to get started."}
            </p>
            {statusFilter === "all" && (
              <Button asChild className="mt-8 gap-2">
                <Link href="/posts/new">
                  <Plus className="h-4 w-4" />
                  Create Your First Post
                </Link>
              </Button>
            )}
          </div>
        ) : (
          posts?.map((post) => (
            <div key={post.id} className="relative group">
              {/* Checkbox overlay */}
              <div
                className="absolute left-3 top-1/2 -translate-y-1/2 z-10"
                onClick={(e) => e.stopPropagation()}
              >
                <Checkbox
                  checked={selectedIds.has(post.id)}
                  onCheckedChange={() => toggleSelect(post.id)}
                  className={cn(
                    "transition-opacity",
                    selectedIds.has(post.id) ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                  )}
                />
              </div>

              <Card
                className={cn(
                  "border-border/50 bg-card hover:bg-muted/50 transition-all cursor-pointer shadow-sm",
                  selectedIds.has(post.id) && "border-primary/40 bg-primary/3",
                )}
                onClick={() => setLocation(`/posts/${post.id}`)}
              >
                <CardContent className={cn("p-4 flex items-center gap-4", "pl-10")}>
                  {post.imageUrl ? (
                    <div className="h-16 w-16 rounded-md overflow-hidden bg-muted flex-shrink-0 border border-border">
                      <img src={post.imageUrl} alt="" className="h-full w-full object-cover" />
                    </div>
                  ) : (
                    <div className="h-16 w-16 rounded-md bg-muted flex-shrink-0 flex items-center justify-center border border-border">
                      <ImageIcon className="h-6 w-6 text-muted-foreground/50" />
                    </div>
                  )}

                  <div className="flex-1 min-w-0 flex flex-col justify-center">
                    <p className="text-base font-medium text-foreground truncate group-hover:text-primary transition-colors">
                      {post.caption || "Untitled draft"}
                    </p>
                    <div className="flex items-center gap-3 mt-1.5 text-sm text-muted-foreground">
                      <span className="font-medium text-foreground/80">{post.pageName || "Unknown Page"}</span>
                      <span>•</span>
                      <span className="flex items-center gap-1">
                        {post.status === "scheduled" && <Clock className="h-3 w-3" />}
                        {post.status === "scheduled"
                          ? `Scheduled for ${format(new Date(post.scheduledAt!), "MMM d, yyyy 'at' h:mm a")}`
                          : post.status === "published"
                            ? `Published on ${format(new Date(post.publishedAt!), "MMM d, yyyy")}`
                            : `Created on ${format(new Date(post.createdAt), "MMM d, yyyy")}`
                        }
                      </span>
                    </div>
                    {post.status === "failed" && post.errorMessage && (
                      <p className="text-xs text-destructive mt-1 truncate">{post.errorMessage}</p>
                    )}
                  </div>

                  <div className="flex flex-col items-end gap-2 shrink-0">
                    <Badge variant="outline" className={`${getStatusColor(post.status)} gap-1.5 px-2.5 py-1`}>
                      {getStatusIcon(post.status)}
                      <span className="capitalize">{post.status}</span>
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

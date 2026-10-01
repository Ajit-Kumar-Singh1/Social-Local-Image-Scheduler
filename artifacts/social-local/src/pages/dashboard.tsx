import { Link } from "wouter";
import { format } from "date-fns";
import { 
  useGetDashboardStats, 
  useGetRecentPosts, 
  useGetUpcomingPosts 
} from "@workspace/api-client-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle, CalendarClock, Facebook, FileText, PlusCircle, CheckCircle2, XCircle } from "lucide-react";

export function Dashboard() {
  const { data: stats, isLoading: statsLoading } = useGetDashboardStats();
  const { data: recent, isLoading: recentLoading } = useGetRecentPosts();
  const { data: upcoming, isLoading: upcomingLoading } = useGetUpcomingPosts();

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Dashboard</h1>
          <p className="text-muted-foreground mt-1">Overview of your Facebook publishing activity.</p>
        </div>
        <Button asChild className="gap-2">
          <Link href="/posts/new">
            <PlusCircle className="h-4 w-4" />
            Create Post
          </Link>
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <StatCard title="Total Pages" value={stats?.totalPages} icon={Facebook} loading={statsLoading} />
        <StatCard title="Total Posts" value={stats?.totalPosts} icon={FileText} loading={statsLoading} />
        <StatCard title="Scheduled" value={stats?.scheduledPosts} icon={CalendarClock} loading={statsLoading} className="bg-primary/5 border-primary/20" />
        <StatCard title="Published" value={stats?.publishedPosts} icon={CheckCircle2} loading={statsLoading} />
        <StatCard title="Drafts" value={stats?.draftPosts} icon={FileText} loading={statsLoading} />
        <StatCard title="Failed" value={stats?.failedPosts} icon={XCircle} loading={statsLoading} className="bg-destructive/5 border-destructive/20 text-destructive" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="col-span-1 border-border bg-card shadow-sm">
          <CardHeader className="pb-3 border-b border-border/50">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg">Upcoming Posts</CardTitle>
                <CardDescription>Scheduled to be published soon.</CardDescription>
              </div>
              <Button variant="outline" size="sm" asChild>
                <Link href="/posts?status=scheduled">View all</Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-border/50">
              {upcomingLoading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="p-4 flex items-center space-x-4">
                    <Skeleton className="h-10 w-10 rounded-md" />
                    <div className="space-y-2 flex-1">
                      <Skeleton className="h-4 w-full" />
                      <Skeleton className="h-3 w-1/2" />
                    </div>
                  </div>
                ))
              ) : upcoming?.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground flex flex-col items-center">
                  <CalendarClock className="h-8 w-8 mb-3 opacity-20" />
                  <p>No upcoming posts scheduled.</p>
                </div>
              ) : (
                upcoming?.map((post) => (
                  <PostItem key={post.id} post={post} />
                ))
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="col-span-1 border-border bg-card shadow-sm">
          <CardHeader className="pb-3 border-b border-border/50">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg">Recent Activity</CardTitle>
                <CardDescription>Recently published or failed posts.</CardDescription>
              </div>
              <Button variant="outline" size="sm" asChild>
                <Link href="/posts">View all</Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-border/50">
              {recentLoading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="p-4 flex items-center space-x-4">
                    <Skeleton className="h-10 w-10 rounded-md" />
                    <div className="space-y-2 flex-1">
                      <Skeleton className="h-4 w-full" />
                      <Skeleton className="h-3 w-1/2" />
                    </div>
                  </div>
                ))
              ) : recent?.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground flex flex-col items-center">
                  <FileText className="h-8 w-8 mb-3 opacity-20" />
                  <p>No recent post activity.</p>
                </div>
              ) : (
                recent?.map((post) => (
                  <PostItem key={post.id} post={post} />
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StatCard({ 
  title, 
  value, 
  icon: Icon, 
  loading,
  className = ""
}: { 
  title: string; 
  value?: number; 
  icon: React.ElementType; 
  loading: boolean;
  className?: string;
}) {
  return (
    <Card className={`overflow-hidden border-border/50 transition-colors ${className}`}>
      <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between">
        <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground/50" />
      </CardHeader>
      <CardContent className="p-4 pt-0">
        {loading ? (
          <Skeleton className="h-8 w-12 mt-1" />
        ) : (
          <div className="text-2xl font-bold font-mono tracking-tight">{value || 0}</div>
        )}
      </CardContent>
    </Card>
  );
}

function PostItem({ post }: { post: any }) {
  const getStatusColor = (status: string) => {
    switch (status) {
      case "published": return "bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20";
      case "scheduled": return "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20";
      case "failed": return "bg-destructive/10 text-destructive border-destructive/20";
      default: return "bg-secondary text-secondary-foreground border-border/50";
    }
  };

  return (
    <Link href={`/posts/${post.id}`}>
      <div className="p-4 hover:bg-muted/50 transition-colors cursor-pointer group flex gap-4">
        {post.imageUrl ? (
          <div className="h-12 w-12 rounded-md overflow-hidden bg-muted flex-shrink-0 border border-border">
            <img src={post.imageUrl} alt="" className="h-full w-full object-cover" />
          </div>
        ) : (
          <div className="h-12 w-12 rounded-md bg-muted flex-shrink-0 flex items-center justify-center border border-border">
            <FileText className="h-5 w-5 text-muted-foreground" />
          </div>
        )}
        <div className="flex-1 min-w-0 flex flex-col justify-center">
          <p className="text-sm font-medium text-foreground truncate group-hover:text-primary transition-colors">
            {post.caption || "No caption"}
          </p>
          <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
            <span className="truncate">{post.pageName || "Unknown Page"}</span>
            <span>•</span>
            <span>
              {post.scheduledAt 
                ? format(new Date(post.scheduledAt), "MMM d, h:mm a") 
                : format(new Date(post.createdAt), "MMM d")}
            </span>
          </div>
        </div>
        <div className="flex items-center">
          <Badge variant="outline" className={getStatusColor(post.status)}>
            {post.status}
          </Badge>
        </div>
      </div>
    </Link>
  );
}

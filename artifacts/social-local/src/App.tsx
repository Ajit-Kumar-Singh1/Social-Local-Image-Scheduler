import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";

import { Layout } from "@/components/layout";
import { Dashboard } from "@/pages/dashboard";
import { Pages } from "@/pages/pages";
import { Posts } from "@/pages/posts";
import { PostNew } from "@/pages/post-new";
import { PostEdit } from "@/pages/post-edit";
import { BulkScheduler } from "@/pages/bulk-scheduler";
import { ImageBatchScheduler } from "@/pages/image-batch";

const queryClient = new QueryClient();

function Router() {
  return (
    <Layout>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/pages" component={Pages} />
        <Route path="/posts" component={Posts} />
        <Route path="/posts/new" component={PostNew} />
        <Route path="/posts/bulk" component={BulkScheduler} />
        <Route path="/posts/image-batch" component={ImageBatchScheduler} />
        <Route path="/posts/:id" component={PostEdit} />
        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;

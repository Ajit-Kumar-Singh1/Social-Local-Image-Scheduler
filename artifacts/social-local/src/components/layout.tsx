import { Link, useLocation } from "wouter";
import { LayoutDashboard, Users, FileText, PlusCircle, Facebook, Activity, TableProperties, Images } from "lucide-react";
import { useHealthCheck } from "@workspace/api-client-react";
import { Sidebar, SidebarContent, SidebarHeader, SidebarGroup, SidebarGroupContent, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarTrigger, SidebarFooter } from "./ui/sidebar";

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { data: health } = useHealthCheck();

  const navigation = [
    { name: "Dashboard", href: "/", icon: LayoutDashboard },
    { name: "Pages", href: "/pages", icon: Users },
    { name: "Posts", href: "/posts", icon: FileText },
  ];

  return (
    <SidebarProvider>
      <div className="flex min-h-[100dvh] w-full bg-background">
        <Sidebar className="border-r border-border">
          <SidebarHeader className="h-16 flex items-center px-4">
            <div className="flex items-center gap-2 font-bold text-lg text-primary">
              <Facebook className="h-6 w-6" />
              <span>AutoPoster</span>
            </div>
          </SidebarHeader>
          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupContent>
                <SidebarMenu>
                  {navigation.map((item) => (
                    <SidebarMenuItem key={item.name}>
                      <SidebarMenuButton
                        asChild
                        isActive={location === item.href || (location.startsWith(item.href) && item.href !== "/")}
                      >
                        <Link href={item.href} className="flex items-center gap-3 py-2">
                          <item.icon className="h-4 w-4" />
                          <span>{item.name}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                  <SidebarMenuItem className="mt-4">
                    <SidebarMenuButton asChild isActive={location === "/posts/new"}>
                      <Link href="/posts/new" className="flex items-center gap-3 py-2 text-primary font-medium">
                        <PlusCircle className="h-4 w-4" />
                        <span>Create Post</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild isActive={location === "/posts/bulk"}>
                      <Link href="/posts/bulk" className="flex items-center gap-3 py-2 text-primary font-medium">
                        <TableProperties className="h-4 w-4" />
                        <span>Bulk Scheduler</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild isActive={location === "/posts/image-batch"}>
                      <Link href="/posts/image-batch" className="flex items-center gap-3 py-2 text-primary font-medium">
                        <Images className="h-4 w-4" />
                        <span>Image Batch</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>
          <SidebarFooter className="border-t border-border/50 p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Activity className={`h-3 w-3 ${health?.status === 'ok' ? 'text-green-500' : 'text-muted-foreground'}`} />
              <span>API Status: {health?.status === 'ok' ? 'Online' : 'Checking...'}</span>
            </div>
          </SidebarFooter>
        </Sidebar>

        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-16 flex items-center px-6 border-b border-border bg-card/50 backdrop-blur shrink-0 md:hidden">
            <SidebarTrigger />
            <div className="flex-1" />
            <div className="font-bold text-primary flex items-center gap-2">
              <Facebook className="h-5 w-5" />
              <span>AutoPoster</span>
            </div>
          </header>
          <main className="flex-1 overflow-auto p-6 md:p-8">
            <div className="max-w-6xl mx-auto">
              {children}
            </div>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}

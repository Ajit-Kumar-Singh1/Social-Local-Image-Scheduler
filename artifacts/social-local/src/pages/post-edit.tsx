import { useState, useRef, useEffect } from "react";
import { useLocation, useParams } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { format } from "date-fns";
import { CalendarIcon, Loader2, Sparkles, Image as ImageIcon, Send, Clock, AlertCircle, Trash2, ArrowLeft, RefreshCw, CheckCircle2, XCircle, FileText } from "lucide-react";
import { 
  useListPages, 
  useGetPost,
  useUpdatePost,
  useDeletePost,
  usePublishPost,
  useGenerateImage,
  getGetPostQueryKey,
  getListPostsQueryKey,
  getGetDashboardStatsQueryKey
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";

const formSchema = z.object({
  caption: z.string().min(1, "Caption is required").max(2200, "Caption is too long"),
  imageUrl: z.string().url("Must be a valid URL").optional().or(z.literal("")).nullable(),
  audioUrl: z.string().url("Must be a valid URL").optional().or(z.literal("")).nullable(),
  scheduledAt: z.date().optional().nullable(),
});

export function PostEdit() {
  const params = useParams();
  const id = parseInt(params.id || "0", 10);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [imagePrompt, setImagePrompt] = useState("");
  const [imageStyle, setImageStyle] = useState("photorealistic");

  const { data: post, isLoading: loadingPost } = useGetPost(id, {
    query: { enabled: !!id, queryKey: getGetPostQueryKey(id) }
  });
  
  const { data: pages } = useListPages();
  const updatePost = useUpdatePost();
  const deletePost = useDeletePost();
  const publishPost = usePublishPost();
  const generateImage = useGenerateImage();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      caption: "",
      imageUrl: "",
      audioUrl: "",
      scheduledAt: null,
    },
  });

  const initializedForId = useRef<number | null>(null);

  useEffect(() => {
    if (post && initializedForId.current !== id) {
      initializedForId.current = id;
      form.reset({
        caption: post.caption,
        imageUrl: post.imageUrl,
        audioUrl: post.audioUrl,
        scheduledAt: post.scheduledAt ? new Date(post.scheduledAt) : null,
      });
    }
  }, [post, id, form]);

  const onSubmit = (values: z.infer<typeof formSchema>) => {
    updatePost.mutate(
      { 
        id,
        data: {
          caption: values.caption,
          imageUrl: values.imageUrl || null,
          audioUrl: values.audioUrl || null,
          scheduledAt: values.scheduledAt ? values.scheduledAt.toISOString() : null,
          status: values.scheduledAt ? "scheduled" : "draft",
        }
      },
      {
        onSuccess: (updatedPost) => {
          toast({
            title: "Post updated",
            description: "Your post changes have been saved.",
          });
          queryClient.setQueryData(getGetPostQueryKey(id), updatedPost);
          queryClient.invalidateQueries({ queryKey: getListPostsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetDashboardStatsQueryKey() });
        },
        onError: (error) => {
          toast({
            title: "Error updating post",
            description: error.message || "Something went wrong.",
            variant: "destructive",
          });
        },
      }
    );
  };

  const handleDelete = () => {
    deletePost.mutate(
      { id },
      {
        onSuccess: () => {
          toast({
            title: "Post deleted",
            description: "The post was successfully removed.",
          });
          queryClient.invalidateQueries({ queryKey: getListPostsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetDashboardStatsQueryKey() });
          setLocation("/posts");
        },
        onError: (error) => {
          toast({
            title: "Error deleting post",
            description: error.message || "Could not delete post.",
            variant: "destructive",
          });
        },
      }
    );
  };

  const handlePublishNow = () => {
    publishPost.mutate(
      { id },
      {
        onSuccess: (publishedPost) => {
          toast({
            title: "Post published!",
            description: "Your post is now live on Facebook.",
          });
          queryClient.setQueryData(getGetPostQueryKey(id), publishedPost);
          queryClient.invalidateQueries({ queryKey: getListPostsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetDashboardStatsQueryKey() });
        },
        onError: (error) => {
          toast({
            title: "Publishing failed",
            description: error.message || "Could not publish post.",
            variant: "destructive",
          });
        },
      }
    );
  };

  const handleGenerateImage = () => {
    if (!imagePrompt) {
      toast({
        title: "Prompt required",
        description: "Please enter an image prompt first.",
        variant: "destructive",
      });
      return;
    }

    generateImage.mutate(
      { data: { prompt: imagePrompt, style: imageStyle } },
      {
        onSuccess: (res) => {
          form.setValue("imageUrl", res.imageUrl, { shouldDirty: true });
          toast({
            title: "Image generated",
            description: "Successfully generated and attached AI image.",
          });
        },
        onError: (error) => {
          toast({
            title: "Image generation failed",
            description: error.message || "Failed to generate image.",
            variant: "destructive",
          });
        }
      }
    );
  };

  if (loadingPost) {
    return (
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-24" />
          <Skeleton className="h-10 w-64" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="col-span-1 lg:col-span-2 space-y-6">
            <Skeleton className="h-[400px] w-full" />
            <Skeleton className="h-[300px] w-full" />
          </div>
          <div className="col-span-1">
            <Skeleton className="h-[300px] w-full" />
          </div>
        </div>
      </div>
    );
  }

  if (!post) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center">
        <AlertCircle className="h-12 w-12 text-destructive mb-4" />
        <h2 className="text-2xl font-bold">Post not found</h2>
        <p className="text-muted-foreground mt-2">The post you are looking for does not exist or was deleted.</p>
        <Button variant="outline" className="mt-6" onClick={() => setLocation("/posts")}>
          Back to Posts
        </Button>
      </div>
    );
  }

  const isReadOnly = post.status === "published";
  const page = pages?.find(p => p.id === post.pageId);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "published": return <Badge className="bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20"><CheckCircle2 className="h-3 w-3 mr-1" /> Published</Badge>;
      case "scheduled": return <Badge className="bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20"><Clock className="h-3 w-3 mr-1" /> Scheduled</Badge>;
      case "failed": return <Badge className="bg-destructive/10 text-destructive border-destructive/20"><XCircle className="h-3 w-3 mr-1" /> Failed</Badge>;
      default: return <Badge variant="outline" className="bg-secondary text-secondary-foreground"><FileText className="h-3 w-3 mr-1" /> Draft</Badge>;
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Button variant="outline" size="icon" onClick={() => setLocation("/posts")} className="shrink-0">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-3">
              Edit Post
              {getStatusBadge(post.status)}
            </h1>
            <p className="text-muted-foreground mt-1 flex items-center gap-2">
              For page: <span className="font-medium text-foreground">{page?.name || post.pageName}</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {!isReadOnly && (
            <Button 
              variant="outline" 
              onClick={handlePublishNow}
              disabled={publishPost.isPending || updatePost.isPending}
              className="gap-2 border-primary/20 text-primary hover:bg-primary/5"
            >
              {publishPost.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Publish Now
            </Button>
          )}
          
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" size="icon">
                <Trash2 className="h-4 w-4" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete Post</AlertDialogTitle>
                <AlertDialogDescription>
                  Are you sure you want to delete this post? This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction 
                  onClick={handleDelete} 
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      {post.status === "failed" && post.errorMessage && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Publishing Failed</AlertTitle>
          <AlertDescription>
            {post.errorMessage}
          </AlertDescription>
        </Alert>
      )}
      
      {post.status === "published" && post.facebookPostId && (
        <Alert className="bg-green-500/5 border-green-500/20 text-green-700 dark:text-green-400">
          <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
          <AlertTitle>Published Successfully</AlertTitle>
          <AlertDescription className="flex items-center justify-between">
            <span>This post is live on Facebook.</span>
            <a 
              href={`https://facebook.com/${post.facebookPostId}`} 
              target="_blank" 
              rel="noreferrer"
              className="font-medium underline underline-offset-4"
            >
              View on Facebook
            </a>
          </AlertDescription>
        </Alert>
      )}

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="col-span-1 lg:col-span-2 space-y-6">
              <Card className="border-border shadow-sm">
                <CardHeader>
                  <CardTitle className="text-lg">Content</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <FormField
                    control={form.control}
                    name="caption"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Caption</FormLabel>
                        <FormControl>
                          <Textarea 
                            placeholder="What do you want to share?" 
                            className="min-h-[150px] resize-y" 
                            disabled={isReadOnly}
                            {...field} 
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </CardContent>
              </Card>

              {!isReadOnly && (
                <Card className="border-border shadow-sm">
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Sparkles className="h-5 w-5 text-primary" />
                      AI Image Generation
                    </CardTitle>
                    <CardDescription>Generate custom visuals for your post instantly.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex flex-col sm:flex-row gap-4">
                      <div className="flex-1 space-y-2">
                        <Label>Image Prompt</Label>
                        <Input 
                          placeholder="A serene coffee shop in Tokyo at dawn..." 
                          value={imagePrompt}
                          onChange={(e) => setImagePrompt(e.target.value)}
                        />
                      </div>
                      <div className="w-full sm:w-48 space-y-2">
                        <Label>Style</Label>
                        <Select value={imageStyle} onValueChange={setImageStyle}>
                          <SelectTrigger>
                            <SelectValue placeholder="Style" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="photorealistic">Photorealistic</SelectItem>
                            <SelectItem value="cartoon">Cartoon</SelectItem>
                            <SelectItem value="watercolor">Watercolor</SelectItem>
                            <SelectItem value="3d-render">3D Render</SelectItem>
                            <SelectItem value="minimalist">Minimalist</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-4 pt-2">
                      <Button 
                        type="button" 
                        variant="secondary" 
                        onClick={handleGenerateImage}
                        disabled={generateImage.isPending || !imagePrompt}
                        className="gap-2"
                      >
                        {generateImage.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Sparkles className="h-4 w-4" />
                        )}
                        Generate Image
                      </Button>
                    </div>

                    <div className="pt-4 border-t border-border mt-6">
                      <FormField
                        control={form.control}
                        name="imageUrl"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Image URL</FormLabel>
                            <FormControl>
                              <Input placeholder="https://..." {...field} value={field.value || ""} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </CardContent>
                </Card>
              )}
              
              {form.watch("imageUrl") && (
                <Card className="border-border shadow-sm overflow-hidden">
                  <div className="relative aspect-video bg-muted flex items-center justify-center p-4">
                    <img 
                      src={form.watch("imageUrl")!} 
                      alt="Attached media" 
                      className="object-contain h-full w-full rounded-md" 
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = "";
                        (e.target as HTMLImageElement).classList.add("hidden");
                      }}
                    />
                  </div>
                </Card>
              )}
            </div>

            <div className="col-span-1 space-y-6">
              <Card className="border-border shadow-sm sticky top-6">
                <CardHeader>
                  <CardTitle className="text-lg">Status & Schedule</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  <FormField
                    control={form.control}
                    name="scheduledAt"
                    render={({ field }) => (
                      <FormItem className="flex flex-col">
                        <FormLabel>Schedule Date</FormLabel>
                        <Popover>
                          <PopoverTrigger asChild>
                            <FormControl>
                              <Button
                                variant={"outline"}
                                disabled={isReadOnly}
                                className={cn(
                                  "w-full pl-3 text-left font-normal bg-background",
                                  !field.value && "text-muted-foreground"
                                )}
                              >
                                {field.value ? (
                                  format(field.value, "PPP p")
                                ) : (
                                  <span>Draft (Not scheduled)</span>
                                )}
                                <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                              </Button>
                            </FormControl>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <Calendar
                              mode="single"
                              selected={field.value || undefined}
                              onSelect={field.onChange}
                              disabled={(date) => date < new Date()}
                              initialFocus
                            />
                            <div className="p-3 border-t border-border space-y-3">
                              <div>
                                <p className="text-xs text-muted-foreground text-center mb-2">Set Time (HH:MM)</p>
                                <div className="flex items-center justify-center gap-2">
                                  <Input 
                                    type="time" 
                                    className="w-full text-sm" 
                                    onChange={(e) => {
                                      const time = e.target.value;
                                      if (time && field.value) {
                                        const [hours, minutes] = time.split(":");
                                        const newDate = new Date(field.value);
                                        newDate.setHours(parseInt(hours, 10));
                                        newDate.setMinutes(parseInt(minutes, 10));
                                        field.onChange(newDate);
                                      } else if (time && !field.value) {
                                        const [hours, minutes] = time.split(":");
                                        const newDate = new Date();
                                        newDate.setHours(parseInt(hours, 10));
                                        newDate.setMinutes(parseInt(minutes, 10));
                                        field.onChange(newDate);
                                      }
                                    }}
                                    value={field.value ? format(field.value, "HH:mm") : ""}
                                  />
                                </div>
                              </div>
                              <Button 
                                type="button" 
                                variant="ghost" 
                                className="w-full text-sm h-8"
                                onClick={() => field.onChange(null)}
                              >
                                Clear Schedule
                              </Button>
                            </div>
                          </PopoverContent>
                        </Popover>
                        <FormDescription>
                          Clear to save as a draft.
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="bg-muted p-4 rounded-lg space-y-3 border border-border/50">
                    <div className="text-xs text-muted-foreground">
                      <span className="block mb-1">Created</span>
                      <span className="font-medium text-foreground">{format(new Date(post.createdAt), "PPP p")}</span>
                    </div>
                    {post.publishedAt && (
                      <div className="text-xs text-muted-foreground">
                        <span className="block mb-1">Published</span>
                        <span className="font-medium text-foreground">{format(new Date(post.publishedAt), "PPP p")}</span>
                      </div>
                    )}
                  </div>

                  {!isReadOnly && (
                    <Button 
                      type="submit" 
                      className="w-full gap-2" 
                      size="lg"
                      disabled={updatePost.isPending || !form.formState.isDirty}
                    >
                      {updatePost.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <RefreshCw className="h-4 w-4" />
                      )}
                      Save Changes
                    </Button>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </form>
      </Form>
    </div>
  );
}

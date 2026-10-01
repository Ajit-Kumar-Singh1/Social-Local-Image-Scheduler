import { useState } from "react";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { format, startOfDay } from "date-fns";
import { CalendarIcon, Loader2, Sparkles, Send, Clock, AlertCircle, Image as ImageIcon, Video, Type } from "lucide-react";
import {
  useListPages,
  useCreatePost,
  useGenerateImage,
  getListPostsQueryKey,
  getGetDashboardStatsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useToast } from "@/hooks/use-toast";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type PostType = "text" | "image" | "video";

const formSchema = z.object({
  pageId: z.coerce.number().min(1, "Please select a Facebook page"),
  postType: z.enum(["text", "image", "video"]).default("image"),
  title: z.string().optional().or(z.literal("")),
  caption: z.string().min(1, "Caption is required").max(2200, "Caption is too long"),
  imageUrl: z.string().url("Must be a valid URL").optional().or(z.literal("")),
  videoUrl: z.string().url("Must be a valid URL").optional().or(z.literal("")),
  scheduledAt: z.date().optional(),
});

export function PostNew() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [mediaPrompt, setMediaPrompt] = useState("");
  const [imageStyle, setImageStyle] = useState("photorealistic");

  const { data: pages, isLoading: loadingPages } = useListPages();
  const createPost = useCreatePost();
  const generateImage = useGenerateImage();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      pageId: 0,
      postType: "image",
      title: "",
      caption: "",
      imageUrl: "",
      videoUrl: "",
    },
  });

  const postType = form.watch("postType") as PostType;

  const onSubmit = (values: z.infer<typeof formSchema>) => {
    const mediaUrl = values.postType === "video" ? values.videoUrl : values.imageUrl;

    // Require media OR a prompt for image/video posts
    // (if a prompt is provided with no image, the scheduler generates the image at publish time)
    if (values.postType !== "text" && !mediaUrl && !mediaPrompt.trim()) {
      toast({
        title: "Media or AI prompt required",
        description: "Upload/link an image or video, or add an AI prompt — the image will be generated when the post publishes.",
        variant: "destructive",
      });
      return;
    }

    createPost.mutate(
      {
        data: {
          pageId: values.pageId,
          title: values.title || null,
          postType: values.postType,
          caption: values.caption,
          imageUrl: mediaUrl || null,
          mediaPrompt: values.postType !== "text" ? (mediaPrompt.trim() || null) : null,
          audioUrl: null,
          scheduledAt: values.scheduledAt ? values.scheduledAt.toISOString() : null,
        },
      },
      {
        onSuccess: (post) => {
          toast({ title: "Post created", description: "Your post has been successfully created." });
          queryClient.invalidateQueries({ queryKey: getListPostsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetDashboardStatsQueryKey() });
          setLocation(`/posts/${post.id}`);
        },
        onError: (error) => {
          toast({ title: "Error creating post", description: error.message || "Something went wrong.", variant: "destructive" });
        },
      }
    );
  };

  const handleGenerateImage = () => {
    if (!mediaPrompt) {
      toast({ title: "Prompt required", description: "Please enter an image prompt first.", variant: "destructive" });
      return;
    }
    generateImage.mutate(
      { data: { prompt: mediaPrompt, style: imageStyle } },
      {
        onSuccess: (res) => {
          form.setValue("imageUrl", res.imageUrl);
          toast({ title: "Image generated", description: "Successfully generated and attached AI image." });
        },
        onError: (error) => {
          toast({ title: "Image generation failed", description: error.message || "Failed to generate image.", variant: "destructive" });
        },
      }
    );
  };

  if (!loadingPages && (!pages || pages.length === 0)) {
    return (
      <div className="flex flex-col items-center justify-center p-12 bg-card border border-border rounded-xl text-center animate-in fade-in slide-in-from-bottom-4 duration-500">
        <AlertCircle className="h-12 w-12 text-destructive mb-4" />
        <h2 className="text-2xl font-bold tracking-tight">No Pages Connected</h2>
        <p className="text-muted-foreground mt-2 max-w-md">
          You need to connect at least one Facebook page before you can create posts.
        </p>
        <Button onClick={() => setLocation("/pages")} className="mt-6">Go to Pages</Button>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Create Post</h1>
        <p className="text-muted-foreground mt-1">Compose a new post, generate AI assets, and schedule for later.</p>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="col-span-1 lg:col-span-2 space-y-6">

              {/* Post Details */}
              <Card className="border-border shadow-sm">
                <CardHeader>
                  <CardTitle className="text-lg">Post Details</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <FormField
                    control={form.control}
                    name="pageId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Facebook Page</FormLabel>
                        <Select
                          disabled={loadingPages}
                          onValueChange={(val) => field.onChange(parseInt(val, 10))}
                          value={field.value ? field.value.toString() : ""}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select a page to post to" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {pages?.map((page) => (
                              <SelectItem key={page.id} value={page.id.toString()}>{page.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Post Type Selector */}
                  <FormField
                    control={form.control}
                    name="postType"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Post Type</FormLabel>
                        <FormControl>
                          <div className="grid grid-cols-3 gap-2">
                            {([
                              { value: "text", label: "Text", icon: Type },
                              { value: "image", label: "Image", icon: ImageIcon },
                              { value: "video", label: "Video", icon: Video },
                            ] as { value: PostType; label: string; icon: React.ElementType }[]).map(({ value, label, icon: Icon }) => (
                              <button
                                key={value}
                                type="button"
                                onClick={() => field.onChange(value)}
                                className={cn(
                                  "flex flex-col items-center justify-center gap-1.5 rounded-lg border-2 p-3 text-sm font-medium transition-all",
                                  field.value === value
                                    ? "border-primary bg-primary/5 text-primary"
                                    : "border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground"
                                )}
                              >
                                <Icon className="h-5 w-5" />
                                {label}
                              </button>
                            ))}
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="title"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Title <span className="text-muted-foreground font-normal">(optional)</span></FormLabel>
                        <FormControl>
                          <Input placeholder="Give your post a title for your own reference..." {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="caption"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{postType === "text" ? "Message" : "Caption"}</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder={postType === "text" ? "What do you want to share with your audience?" : "Write a caption for your media..."}
                            className="min-h-[140px] resize-y"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </CardContent>
              </Card>

              {/* Media Section — only for image/video */}
              {postType !== "text" && (
                <Card className="border-border shadow-sm">
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      {postType === "image" ? (
                        <>
                          <Sparkles className="h-5 w-5 text-primary" />
                          AI Image Generation
                        </>
                      ) : (
                        <>
                          <Video className="h-5 w-5 text-primary" />
                          Video
                        </>
                      )}
                    </CardTitle>
                    {postType === "image" && (
                      <CardDescription>Generate a custom image for your post instantly using AI.</CardDescription>
                    )}
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {postType === "image" && (
                      <>
                        <div className="flex flex-col sm:flex-row gap-4">
                          <div className="flex-1 space-y-2">
                            <Label>Image Prompt</Label>
                            <Input
                              placeholder="A serene coffee shop in Tokyo at dawn..."
                              value={mediaPrompt}
                              onChange={(e) => setMediaPrompt(e.target.value)}
                            />
                          </div>
                          <div className="w-full sm:w-48 space-y-2">
                            <Label>Style</Label>
                            <Select value={imageStyle} onValueChange={setImageStyle}>
                              <SelectTrigger><SelectValue placeholder="Style" /></SelectTrigger>
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
                        <div className="flex items-center gap-4">
                          <Button
                            type="button"
                            variant="secondary"
                            onClick={handleGenerateImage}
                            disabled={generateImage.isPending || !mediaPrompt}
                            className="gap-2"
                          >
                            {generateImage.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                            Generate Image
                          </Button>
                          <span className="text-xs text-muted-foreground">Takes ~10-15 seconds</span>
                        </div>
                        <div className="pt-4 border-t border-border">
                          <FormField
                            control={form.control}
                            name="imageUrl"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Image URL</FormLabel>
                                <FormControl>
                                  <Input placeholder="https://..." {...field} />
                                </FormControl>
                                <FormDescription>Auto-filled when generating, or paste your own.</FormDescription>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>
                        {form.watch("imageUrl") && (
                          <div className="mt-2 rounded-md overflow-hidden border border-border aspect-video bg-muted flex items-center justify-center">
                            <img
                              src={form.watch("imageUrl")!}
                              alt="Preview"
                              className="object-contain h-full w-full"
                              onError={(e) => { (e.target as HTMLImageElement).classList.add("hidden"); }}
                            />
                          </div>
                        )}
                      </>
                    )}

                    {postType === "video" && (
                      <FormField
                        control={form.control}
                        name="videoUrl"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Video URL</FormLabel>
                            <FormControl>
                              <Input placeholder="https://example.com/video.mp4" {...field} />
                            </FormControl>
                            <FormDescription>
                              Paste a public URL to your video file (MP4 recommended). Facebook requires a direct link to the video.
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    )}
                  </CardContent>
                </Card>
              )}
            </div>

            {/* Right sidebar — Publishing */}
            <div className="col-span-1 space-y-6">
              <Card className="border-border shadow-sm sticky top-6">
                <CardHeader>
                  <CardTitle className="text-lg">Publishing</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  <FormField
                    control={form.control}
                    name="scheduledAt"
                    render={({ field }) => (
                      <FormItem className="flex flex-col">
                        <FormLabel>Schedule Date <span className="text-muted-foreground font-normal">(optional)</span></FormLabel>
                        <Popover>
                          <PopoverTrigger asChild>
                            <FormControl>
                              <Button
                                variant="outline"
                                className={cn("w-full pl-3 text-left font-normal bg-background", !field.value && "text-muted-foreground")}
                              >
                                {field.value ? format(field.value, "PPP p") : <span>Pick a date & time</span>}
                                <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                              </Button>
                            </FormControl>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <Calendar
                              mode="single"
                              selected={field.value}
                              onSelect={(date) => {
                                if (!date) { field.onChange(undefined); return; }
                                const existing = field.value;
                                if (existing) {
                                  date.setHours(existing.getHours(), existing.getMinutes());
                                }
                                field.onChange(date);
                              }}
                              disabled={(date) => date < startOfDay(new Date())}
                              initialFocus
                            />
                            <div className="p-3 border-t border-border space-y-2">
                              <p className="text-xs text-muted-foreground text-center">Set Time (HH:MM)</p>
                              <Input
                                type="time"
                                className="w-full text-sm"
                                onChange={(e) => {
                                  const time = e.target.value;
                                  if (!time) return;
                                  const [hours, minutes] = time.split(":").map(Number);
                                  const base = field.value ?? new Date();
                                  const newDate = new Date(base);
                                  newDate.setHours(hours, minutes);
                                  field.onChange(newDate);
                                }}
                                value={field.value ? format(field.value, "HH:mm") : ""}
                              />
                              {field.value && (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  className="w-full text-sm h-8"
                                  onClick={() => field.onChange(undefined)}
                                >
                                  Clear Schedule
                                </Button>
                              )}
                            </div>
                          </PopoverContent>
                        </Popover>
                        <FormDescription>Leave empty to save as a draft.</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="bg-muted p-4 rounded-lg space-y-2 border border-border/50">
                    <h4 className="font-medium text-sm flex items-center gap-2">
                      <AlertCircle className="h-4 w-4 text-primary" />
                      Summary
                    </h4>
                    <ul className="text-sm text-muted-foreground space-y-1">
                      <li className="flex items-center justify-between">
                        <span>Page:</span>
                        <span className="font-medium text-foreground">
                          {form.watch("pageId") ? pages?.find((p) => p.id === form.watch("pageId"))?.name : "None selected"}
                        </span>
                      </li>
                      <li className="flex items-center justify-between">
                        <span>Type:</span>
                        <span className="font-medium text-foreground capitalize">{postType}</span>
                      </li>
                      <li className="flex items-center justify-between">
                        <span>Action:</span>
                        <span className="font-medium text-foreground">
                          {form.watch("scheduledAt") ? "Schedule" : "Save Draft"}
                        </span>
                      </li>
                    </ul>
                  </div>

                  <Button
                    type="submit"
                    className="w-full gap-2"
                    size="lg"
                    disabled={createPost.isPending}
                  >
                    {createPost.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : form.watch("scheduledAt") ? (
                      <Clock className="h-4 w-4" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                    {form.watch("scheduledAt") ? "Schedule Post" : "Save as Draft"}
                  </Button>
                </CardContent>
              </Card>
            </div>
          </div>
        </form>
      </Form>
    </div>
  );
}

/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Camera, Heart, ImagePlus, MessageCircle, Send, Sparkles, Trash2, X } from "lucide-react";
import { ChatNav } from "@/components/ChatNav";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { resolveAvatarUrl } from "@/lib/avatar";
import { generateMomentInteraction } from "@/lib/companion.functions";
import type { AiPersona, MomentComment, MomentLike, MomentPost } from "@/lib/types";

export const Route = createFileRoute("/_authenticated/moments")({
  head: () => ({ meta: [{ title: "朋友圈 · 此心一笺" }] }),
  component: MomentsPage,
});

type FeedPost = MomentPost & { imageUrls: string[] };

function MomentsPage() {
  const { user, profile, refreshProfile } = useAuth();
  const interact = useServerFn(generateMomentInteraction);
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [likes, setLikes] = useState<MomentLike[]>([]);
  const [comments, setComments] = useState<MomentComment[]>([]);
  const [personas, setPersonas] = useState<AiPersona[]>([]);
  const [avatarUrls, setAvatarUrls] = useState<Record<string, string>>({});
  const [myAvatar, setMyAvatar] = useState("");
  const [coverUrl, setCoverUrl] = useState("");
  const [coverUploading, setCoverUploading] = useState(false);
  const [draft, setDraft] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [posting, setPosting] = useState(false);
  const [busyPost, setBusyPost] = useState("");
  const [error, setError] = useState("");
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
  const [replyTarget, setReplyTarget] = useState<Record<string, MomentComment | undefined>>({});
  const fileInput = useRef<HTMLInputElement>(null);
  const coverInput = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    if (!user) return;
    const [{ data: postRows }, { data: likeRows }, { data: commentRows }, { data: charRows }] =
      await Promise.all([
        (supabase as any)
          .from("moment_posts")
          .select("*")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false }),
        (supabase as any).from("moment_likes").select("*").eq("user_id", user.id),
        (supabase as any)
          .from("moment_comments")
          .select("*")
          .eq("user_id", user.id)
          .order("created_at", { ascending: true }),
        supabase.from("ai_personas").select("*").eq("user_id", user.id).order("name"),
      ]);
    const rows = (postRows || []) as MomentPost[];
    const resolved = await Promise.all(
      rows.map(async (post) => ({
        ...post,
        imageUrls: await Promise.all(
          (post.image_paths || []).map(async (path) => {
            const { data } = await supabase.storage.from("moments").createSignedUrl(path, 3600);
            return data?.signedUrl || "";
          }),
        ),
      })),
    );
    setPosts(resolved);
    setLikes((likeRows || []) as MomentLike[]);
    setComments((commentRows || []) as MomentComment[]);
    const chars = (charRows || []) as AiPersona[];
    setPersonas(chars);
    const entries = await Promise.all(
      chars.map(async (char) => [char.id, await resolveAvatarUrl(char.avatar_url)] as const),
    );
    setAvatarUrls(Object.fromEntries(entries));
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void resolveAvatarUrl(profile?.avatar_url).then(setMyAvatar);
  }, [profile?.avatar_url]);

  useEffect(() => {
    let active = true;
    const path = profile?.moment_cover_url;
    if (!path) {
      setCoverUrl("");
      return () => {
        active = false;
      };
    }
    void supabase.storage
      .from("moments")
      .createSignedUrl(path, 3600)
      .then(({ data }) => {
        if (active) setCoverUrl(data?.signedUrl || "");
      });
    return () => {
      active = false;
    };
  }, [profile?.moment_cover_url]);

  const filePreviews = useMemo(() => files.map((file) => URL.createObjectURL(file)), [files]);
  useEffect(() => () => filePreviews.forEach(URL.revokeObjectURL), [filePreviews]);

  async function publish() {
    if (!user || (!draft.trim() && files.length === 0)) return;
    setPosting(true);
    setError("");
    const paths: string[] = [];
    try {
      for (const file of files) {
        if (!["image/jpeg", "image/png", "image/webp"].includes(file.type))
          throw new Error("动态图片需为 JPG、PNG 或 WebP。");
        if (file.size > 8 * 1024 * 1024) throw new Error("每张图片不能超过 8MB。");
        const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
        const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from("moments")
          .upload(path, file, { contentType: file.type });
        if (uploadError) throw new Error("图片上传失败，请稍后重试。");
        paths.push(path);
      }
      const { error: insertError } = await (supabase as any).from("moment_posts").insert({
        user_id: user.id,
        content: draft.trim(),
        image_paths: paths,
      });
      if (insertError) throw insertError;
      setDraft("");
      setFiles([]);
      await load();
    } catch (caught) {
      if (paths.length) await supabase.storage.from("moments").remove(paths);
      setError(caught instanceof Error ? caught.message : "发布失败，请重试。");
    } finally {
      setPosting(false);
    }
  }

  async function uploadCover(file?: File) {
    if (!file || !user) return;
    setError("");
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setError("朋友圈封面需为 JPG、PNG 或 WebP 图片。");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setError("朋友圈封面不能超过 8MB。");
      return;
    }
    setCoverUploading(true);
    const extension =
      file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
    const path = `${user.id}/cover-${crypto.randomUUID()}.${extension}`;
    const previousPath = profile?.moment_cover_url;
    try {
      const { error: uploadError } = await supabase.storage
        .from("moments")
        .upload(path, file, { contentType: file.type, upsert: false });
      if (uploadError) throw new Error("朋友圈封面上传失败，请稍后重试。");
      const { error: updateError } = await (supabase as any)
        .from("profiles")
        .update({ moment_cover_url: path })
        .eq("id", user.id);
      if (updateError) {
        await supabase.storage.from("moments").remove([path]);
        throw new Error("朋友圈封面保存失败，请稍后重试。");
      }
      if (previousPath && previousPath !== path) {
        await supabase.storage.from("moments").remove([previousPath]);
      }
      await refreshProfile();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "朋友圈封面更换失败。");
    } finally {
      setCoverUploading(false);
      if (coverInput.current) coverInput.current.value = "";
    }
  }

  async function toggleLike(postId: string) {
    if (!user) return;
    const existing = likes.find(
      (item) => item.post_id === postId && item.actor_kind === "user" && !item.char_id,
    );
    if (existing) await (supabase as any).from("moment_likes").delete().eq("id", existing.id);
    else
      await (supabase as any).from("moment_likes").insert({
        post_id: postId,
        user_id: user.id,
        actor_kind: "user",
        char_id: null,
      });
    await load();
  }

  async function sendComment(postId: string) {
    if (!user) return;
    const content = commentDrafts[postId]?.trim();
    if (!content) return;
    const target = replyTarget[postId];
    const { data, error: insertError } = await (supabase as any)
      .from("moment_comments")
      .insert({
        post_id: postId,
        user_id: user.id,
        actor_kind: "user",
        char_id: null,
        parent_id: target?.id || null,
        content,
      })
      .select("*")
      .single();
    if (insertError) {
      setError("评论发送失败。");
      return;
    }
    setCommentDrafts((value) => ({ ...value, [postId]: "" }));
    setReplyTarget((value) => ({ ...value, [postId]: undefined }));
    await load();
    if (target?.actor_kind === "char" && target.char_id) {
      setBusyPost(postId);
      try {
        await interact({
          data: { post_id: postId, char_id: target.char_id, parent_comment_id: data.id },
        });
        await load();
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "角色回复失败。");
      } finally {
        setBusyPost("");
      }
    }
  }

  async function inviteChar(postId: string, charId: string) {
    if (!charId) return;
    setBusyPost(postId);
    setError("");
    try {
      await interact({ data: { post_id: postId, char_id: charId, parent_comment_id: null } });
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "角色互动失败。");
    } finally {
      setBusyPost("");
    }
  }

  async function removePost(post: FeedPost) {
    if (!window.confirm("删除这条动态吗？")) return;
    await (supabase as any).from("moment_posts").delete().eq("id", post.id);
    if (post.image_paths.length) await supabase.storage.from("moments").remove(post.image_paths);
    await load();
  }

  return (
    <main className="moments-page fade-in">
      <section
        className={`moments-cover${coverUrl ? " has-custom-cover" : ""}`}
        style={coverUrl ? { backgroundImage: `url(${coverUrl})` } : undefined}
      >
        <div className="moments-cover__title">朋友圈</div>
        <input
          ref={coverInput}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          hidden
          onChange={(event) => void uploadCover(event.target.files?.[0])}
        />
        <button
          type="button"
          className="moments-cover__change"
          disabled={coverUploading}
          onClick={() => coverInput.current?.click()}
        >
          <Camera size={15} /> {coverUploading ? "上传中" : "更换封面"}
        </button>
        <div className="moments-cover__identity">
          <span>{profile?.display_name || "我"}</span>
          <Avatar src={myAvatar} label={profile?.display_name || "我"} large />
        </div>
      </section>

      <section className="moments-composer">
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="分享这一刻……"
          maxLength={3000}
        />
        {filePreviews.length > 0 && (
          <div className="moments-image-grid">
            {filePreviews.map((src, index) => (
              <div key={src} className="moments-image-cell">
                <img src={src} alt={`待发布图片 ${index + 1}`} />
                <button
                  type="button"
                  aria-label="移除图片"
                  onClick={() => setFiles((value) => value.filter((_, i) => i !== index))}
                >
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="moments-composer__actions">
          <input
            ref={fileInput}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            hidden
            onChange={(event) => {
              const next = Array.from(event.target.files || []);
              setFiles((value) => [...value, ...next].slice(0, 9));
              event.target.value = "";
            }}
          />
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            disabled={files.length >= 9}
          >
            <ImagePlus size={18} /> 图片
          </button>
          <button
            type="button"
            className="primary"
            onClick={publish}
            disabled={posting || (!draft.trim() && !files.length)}
          >
            <Send size={16} /> {posting ? "发布中" : "发布"}
          </button>
        </div>
        {error && <p className="moments-error">{error}</p>}
      </section>

      <section className="moments-feed">
        {posts.length === 0 && (
          <div className="moments-empty">
            <Camera size={26} />
            <p>还没有动态，记录第一刻吧。</p>
          </div>
        )}
        {posts.map((post) => {
          const postLikes = likes.filter((item) => item.post_id === post.id);
          const postComments = comments.filter((item) => item.post_id === post.id);
          return (
            <article key={post.id} className="moment-card">
              <Avatar src={myAvatar} label={profile?.display_name || "我"} />
              <div className="moment-card__body">
                <div className="moment-card__heading">
                  <strong>{profile?.display_name || "我"}</strong>
                  <button type="button" aria-label="删除动态" onClick={() => void removePost(post)}>
                    <Trash2 size={16} />
                  </button>
                </div>
                {post.content && <p className="moment-card__content">{post.content}</p>}
                {post.imageUrls.length > 0 && (
                  <div className={`moments-image-grid count-${Math.min(post.imageUrls.length, 4)}`}>
                    {post.imageUrls.map(
                      (src, index) =>
                        src && <img key={src} src={src} alt={`动态图片 ${index + 1}`} />,
                    )}
                  </div>
                )}
                <time>{formatMomentTime(post.created_at)}</time>
                <div className="moment-card__tools">
                  <button
                    type="button"
                    className={
                      postLikes.some((item) => item.actor_kind === "user") ? "is-liked" : ""
                    }
                    onClick={() => void toggleLike(post.id)}
                  >
                    <Heart size={16} /> {postLikes.length || "赞"}
                  </button>
                  <button
                    type="button"
                    onClick={() => document.getElementById(`comment-${post.id}`)?.focus()}
                  >
                    <MessageCircle size={16} /> 评论
                  </button>
                  {personas.length > 0 && (
                    <select
                      aria-label="邀请角色互动"
                      disabled={busyPost === post.id}
                      defaultValue=""
                      onChange={(event) => {
                        void inviteChar(post.id, event.target.value);
                        event.currentTarget.value = "";
                      }}
                    >
                      <option value="" disabled>
                        {busyPost === post.id ? "角色正在想……" : "邀请角色"}
                      </option>
                      {personas.map((char) => (
                        <option key={char.id} value={char.id}>
                          {char.name}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
                {(postLikes.length > 0 || postComments.length > 0) && (
                  <div className="moment-discussion">
                    {postLikes.length > 0 && (
                      <p className="moment-likes">
                        <Heart size={13} />{" "}
                        {postLikes
                          .map((like) =>
                            like.actor_kind === "user"
                              ? profile?.display_name || "我"
                              : personas.find((char) => char.id === like.char_id)?.name,
                          )
                          .filter(Boolean)
                          .join("、")}
                      </p>
                    )}
                    {postComments.map((comment) => {
                      const char = comment.char_id
                        ? personas.find((item) => item.id === comment.char_id)
                        : undefined;
                      return (
                        <button
                          key={comment.id}
                          type="button"
                          className="moment-comment"
                          onClick={() =>
                            comment.actor_kind === "char" &&
                            setReplyTarget((value) => ({ ...value, [post.id]: comment }))
                          }
                        >
                          <Avatar
                            src={char ? avatarUrls[char.id] : myAvatar}
                            label={char?.name || profile?.display_name || "我"}
                            tiny
                          />
                          <span>
                            <strong>{char?.name || profile?.display_name || "我"}</strong>
                            {comment.parent_id ? " 回复：" : "："}
                            {comment.content}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
                {replyTarget[post.id] && (
                  <p className="moment-replying">
                    回复 {personas.find((item) => item.id === replyTarget[post.id]?.char_id)?.name}{" "}
                    <button
                      type="button"
                      onClick={() =>
                        setReplyTarget((value) => ({ ...value, [post.id]: undefined }))
                      }
                    >
                      取消
                    </button>
                  </p>
                )}
                <div className="moment-comment-box">
                  <input
                    id={`comment-${post.id}`}
                    value={commentDrafts[post.id] || ""}
                    onChange={(event) =>
                      setCommentDrafts((value) => ({ ...value, [post.id]: event.target.value }))
                    }
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !event.shiftKey) void sendComment(post.id);
                    }}
                    placeholder="写评论……"
                    maxLength={2000}
                  />
                  <button
                    type="button"
                    aria-label="发送评论"
                    onClick={() => void sendComment(post.id)}
                  >
                    <Send size={16} />
                  </button>
                </div>
                {busyPost === post.id && (
                  <p className="moment-thinking">
                    <Sparkles size={13} /> 角色正在组织语言……
                  </p>
                )}
              </div>
            </article>
          );
        })}
      </section>
      <ChatNav />
    </main>
  );
}

function Avatar({
  src,
  label,
  large,
  tiny,
}: {
  src?: string | undefined;
  label: string;
  large?: boolean;
  tiny?: boolean;
}) {
  return (
    <span className={`moment-avatar${large ? " is-large" : ""}${tiny ? " is-tiny" : ""}`}>
      {src ? <img src={src} alt={label} /> : label.charAt(0).toUpperCase()}
    </span>
  );
}

function formatMomentTime(value: string) {
  const date = new Date(value);
  const delta = Date.now() - date.getTime();
  if (delta < 60_000) return "刚刚";
  if (delta < 3_600_000) return `${Math.floor(delta / 60_000)} 分钟前`;
  if (delta < 86_400_000) return `${Math.floor(delta / 3_600_000)} 小时前`;
  return date.toLocaleDateString("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

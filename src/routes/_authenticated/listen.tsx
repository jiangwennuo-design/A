/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useEffect, useRef, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowLeft,
  Disc3,
  MessageCircle,
  Music2,
  Pause,
  Play,
  Plus,
  Send,
  Sparkles,
  Trash2,
  Upload,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { closeSystemApp } from "@/lib/app-transition";
import { SystemSheet } from "@/components/system-ui";
import { supabase } from "@/integrations/supabase/client";
import { resolveAvatarUrl } from "@/lib/avatar";
import { resolveSignedMediaUrl } from "@/lib/signed-media";
import { generateMusicCompanionMessage } from "@/lib/companion.functions";
import type { AiPersona, MusicMessage, MusicTrack } from "@/lib/types";

export const Route = createFileRoute("/_authenticated/listen")({
  head: () => ({ meta: [{ title: "一起听 · K得机" }] }),
  component: ListenPage,
});

type PlayableTrack = MusicTrack & { url: string };

function ListenPage() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const askCompanion = useServerFn(generateMusicCompanionMessage);
  const audioRef = useRef<HTMLAudioElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const libraryGeneration = useRef(0);
  const messageGeneration = useRef(0);
  const [tracks, setTracks] = useState<PlayableTrack[]>([]);
  const [currentId, setCurrentId] = useState("");
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [personas, setPersonas] = useState<AiPersona[]>([]);
  const [charId, setCharId] = useState("");
  const [myAvatar, setMyAvatar] = useState("");
  const [charAvatar, setCharAvatar] = useState("");
  const [messages, setMessages] = useState<MusicMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [addingMusic, setAddingMusic] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [error, setError] = useState("");
  const current = tracks.find((track) => track.id === currentId);
  const selectedChar = personas.find((char) => char.id === charId);

  const loadLibrary = useCallback(async () => {
    if (!user) return;
    const generation = ++libraryGeneration.current;
    const [{ data: trackRows }, { data: charRows }] = await Promise.all([
      (supabase as any)
        .from("music_tracks")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false }),
      supabase.from("ai_personas").select("*").eq("user_id", user.id).order("name"),
    ]);
    const resolved = await Promise.all(
      ((trackRows || []) as MusicTrack[]).map(async (track) => {
        return { ...track, url: await resolveSignedMediaUrl("music", track.file_path) };
      }),
    );
    if (generation !== libraryGeneration.current) return;
    setTracks(resolved);
    setPersonas((charRows || []) as AiPersona[]);
    setCurrentId((value) => value || resolved[0]?.id || "");
    setCharId((value) => value || charRows?.[0]?.id || "");
  }, [user]);

  const loadMessages = useCallback(async () => {
    const generation = ++messageGeneration.current;
    if (!user || !currentId || !charId) {
      setMessages([]);
      return;
    }
    const { data } = await (supabase as any)
      .from("music_messages")
      .select("*")
      .eq("user_id", user.id)
      .eq("track_id", currentId)
      .eq("char_id", charId)
      .order("created_at", { ascending: true });
    if (generation !== messageGeneration.current) return;
    setMessages((data || []) as MusicMessage[]);
  }, [user, currentId, charId]);

  useEffect(() => {
    void loadLibrary();
    return () => {
      libraryGeneration.current += 1;
    };
  }, [loadLibrary]);
  useEffect(() => {
    void loadMessages();
    return () => {
      messageGeneration.current += 1;
    };
  }, [loadMessages]);
  useEffect(() => {
    let active = true;
    void resolveAvatarUrl(profile?.avatar_url).then((url) => {
      if (active) setMyAvatar(url);
    });
    return () => {
      active = false;
    };
  }, [profile?.avatar_url]);
  useEffect(() => {
    let active = true;
    void resolveAvatarUrl(selectedChar?.avatar_url).then((url) => {
      if (active) setCharAvatar(url);
    });
    return () => {
      active = false;
    };
  }, [selectedChar?.avatar_url]);

  async function uploadTrack() {
    if (!user || !audioFile) return;
    if (
      !["audio/mpeg", "audio/mp4", "audio/ogg", "audio/wav", "audio/x-wav"].includes(audioFile.type)
    ) {
      setError("支持 MP3、M4A、OGG 或 WAV 音频。");
      return;
    }
    if (audioFile.size > 25 * 1024 * 1024) {
      setError("音频文件不能超过 25MB。");
      return;
    }
    setUploading(true);
    setError("");
    const ext =
      audioFile.name
        .split(".")
        .pop()
        ?.replace(/[^a-z0-9]/gi, "") || "mp3";
    const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from("music")
      .upload(path, audioFile, { contentType: audioFile.type });
    if (uploadError) {
      setError("音乐上传失败，请稍后重试。");
      setUploading(false);
      return;
    }
    const { error: insertError } = await (supabase as any).from("music_tracks").insert({
      user_id: user.id,
      title: title.trim() || audioFile.name.replace(/\.[^.]+$/, ""),
      artist: artist.trim(),
      file_path: path,
      mime_type: audioFile.type,
    });
    if (insertError) {
      await supabase.storage.from("music").remove([path]);
      setError("保存音乐信息失败。");
    } else {
      setTitle("");
      setArtist("");
      setAudioFile(null);
      if (fileRef.current) fileRef.current.value = "";
      await loadLibrary();
      setAddingMusic(false);
    }
    setUploading(false);
  }

  async function removeTrack(track: PlayableTrack) {
    if (!window.confirm(`从私人音乐库删除《${track.title}》吗？`)) return;
    audioRef.current?.pause();
    await (supabase as any).from("music_tracks").delete().eq("id", track.id);
    await supabase.storage.from("music").remove([track.file_path]);
    setCurrentId("");
    setPlaying(false);
    await loadLibrary();
  }

  async function togglePlay() {
    const audio = audioRef.current;
    if (!audio || !current?.url) return;
    if (audio.paused) {
      try {
        await audio.play();
        setPlaying(true);
      } catch {
        setError("浏览器无法播放这个音频格式。");
      }
    } else {
      audio.pause();
      setPlaying(false);
    }
  }

  async function talk(message?: string) {
    if (!current || !charId || thinking) return;
    const content = message?.trim();
    if (message !== undefined && !content) return;
    setThinking(true);
    setError("");
    try {
      await askCompanion({
        data: { track_id: current.id, char_id: charId, message: content || undefined },
      });
      setDraft("");
      await loadMessages();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "角色暂时没有回应。");
    } finally {
      setThinking(false);
    }
  }

  function switchTrack(id: string) {
    audioRef.current?.pause();
    setPlaying(false);
    setProgress(0);
    setDuration(0);
    setCurrentId(id);
  }

  return (
    <main className="listen-page fade-in">
      <header className="listen-header">
        <button
          type="button"
          onClick={() => void closeSystemApp("listen", () => navigate({ to: "/" }))}
        >
          <ArrowLeft size={21} />
        </button>
        <div>
          <h1>一起听</h1>
          <span>私人音乐空间</span>
        </div>
        <button
          type="button"
          className="listen-settings-button"
          aria-label="音乐设置"
          onClick={() => setSettingsOpen(true)}
        >
          <Music2 size={20} />
        </button>
      </header>

      <section className="listen-room">
        <div className="listen-people">
          <Person src={myAvatar} name={profile?.display_name || "我"} />
          <span className="listen-wave">
            <i />
            <i />
            <i />
            <i />
          </span>
          <Person src={charAvatar} name={selectedChar?.name || "选择角色"} />
        </div>
        <div className={`listen-record ${playing ? "is-playing" : ""}`}>
          <Disc3 size={64} />
          <span>
            <Music2 size={24} />
          </span>
        </div>
        <div className="listen-track-title">
          <strong>{current?.title || "还没有歌曲"}</strong>
          <span>{current?.artist || (current ? "未知歌手" : "上传一首自己的音乐开始")}</span>
        </div>
        <audio
          ref={audioRef}
          key={current?.id}
          src={current?.url}
          onTimeUpdate={(event) => setProgress(event.currentTarget.currentTime)}
          onLoadedMetadata={(event) => setDuration(event.currentTarget.duration || 0)}
          onEnded={() => setPlaying(false)}
        />
        <div className="listen-progress">
          <span>{formatAudioTime(progress)}</span>
          <input
            type="range"
            min={0}
            max={duration || 0}
            step={0.1}
            value={Math.min(progress, duration || 0)}
            disabled={!current}
            onChange={(event) => {
              const next = Number(event.target.value);
              if (audioRef.current) audioRef.current.currentTime = next;
              setProgress(next);
            }}
          />
          <span>{formatAudioTime(duration)}</span>
        </div>
        <button
          type="button"
          className="listen-play"
          disabled={!current}
          onClick={() => void togglePlay()}
        >
          {playing ? (
            <Pause size={23} fill="currentColor" />
          ) : (
            <Play size={23} fill="currentColor" />
          )}
        </button>
        <div className="listen-char-picker">
          <label>
            陪听角色
            <select value={charId} onChange={(event) => setCharId(event.target.value)}>
              <option value="">请选择</option>
              {personas.map((char) => (
                <option key={char.id} value={char.id}>
                  {char.name}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            disabled={!current || !charId || thinking}
            onClick={() => void talk()}
          >
            <Sparkles size={15} />
            听听 TA 怎么说
          </button>
        </div>
      </section>

      <section className="listen-chat">
        <h2>
          <MessageCircle size={17} />
          边听边聊
        </h2>
        <div className="listen-chat__messages">
          {messages.length === 0 ? (
            <p className="listen-placeholder">选好歌曲和角色，就可以一起聊聊。</p>
          ) : (
            messages.map((item) => (
              <p key={item.id} className={item.role === "user" ? "is-user" : "is-char"}>
                <b>{item.role === "user" ? "我" : selectedChar?.name}</b>
                {item.content}
              </p>
            ))
          )}
          {thinking && (
            <p className="is-char">
              <b>{selectedChar?.name}</b>正在想……
            </p>
          )}
        </div>
        <div className="listen-chat__input">
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void talk(draft);
            }}
            placeholder="和角色聊这首歌……"
            disabled={!current || !charId}
          />
          <button
            type="button"
            aria-label="发送"
            onClick={() => void talk(draft)}
            disabled={!draft.trim() || thinking}
          >
            <Send size={17} />
          </button>
        </div>
      </section>

      {error && <p className="listen-error">{error}</p>}

      <SystemSheet
        open={settingsOpen}
        title="音乐设置"
        description="管理你的私人音乐"
        onClose={() => setSettingsOpen(false)}
        scrollable
      >
        <div className="listen-settings-note">
          QQ 音乐的官方授权仅开放给特定 IoT/H5
          场景；网易云正式接入需开发者凭据。当前仅使用你有权播放的本地音频。
        </div>
        {error && <p className="listen-error">{error}</p>}

        <section className="listen-library listen-library--settings">
          <div className="listen-library__heading">
            <div>
              <h3>私人音乐库</h3>
              <span>{tracks.length ? `${tracks.length} 首音乐` : "暂无私人音乐"}</span>
            </div>
            <button
              type="button"
              className="listen-add-button"
              onClick={() => setAddingMusic((value) => !value)}
            >
              <Plus size={16} />
              {addingMusic ? "收起" : "添加音乐"}
            </button>
          </div>

          {addingMusic && (
            <div className="listen-upload listen-upload--expanded">
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="歌曲名称（可选）"
              />
              <input
                value={artist}
                onChange={(event) => setArtist(event.target.value)}
                placeholder="歌手（可选）"
              />
              <input
                ref={fileRef}
                type="file"
                accept="audio/mpeg,audio/mp4,audio/ogg,audio/wav"
                onChange={(event) => setAudioFile(event.target.files?.[0] || null)}
              />
              <button
                type="button"
                onClick={() => void uploadTrack()}
                disabled={!audioFile || uploading}
              >
                <Upload size={16} />
                {uploading ? "上传中" : "上传音乐"}
              </button>
            </div>
          )}

          <div className="listen-track-list">
            {tracks.length === 0 ? (
              <div className="listen-library-empty">
                <Music2 size={22} />
                <p>暂无私人音乐</p>
                <span>添加你有权使用的音频文件</span>
              </div>
            ) : (
              tracks.map((track) => (
                <div key={track.id} className={track.id === currentId ? "is-current" : ""}>
                  <button
                    type="button"
                    onClick={() => {
                      switchTrack(track.id);
                      setSettingsOpen(false);
                    }}
                  >
                    <Music2 size={16} />
                    <span>
                      <strong>{track.title}</strong>
                      <small>{track.artist || "未知歌手"}</small>
                    </span>
                  </button>
                  <button
                    type="button"
                    aria-label={`删除 ${track.title}`}
                    onClick={() => void removeTrack(track)}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              ))
            )}
          </div>
        </section>
      </SystemSheet>
    </main>
  );
}

function Person({ src, name }: { src: string; name: string }) {
  return (
    <div className="listen-person">
      <span>{src ? <img src={src} alt={name} /> : name.charAt(0)}</span>
      <b>{name}</b>
    </div>
  );
}
function formatAudioTime(seconds: number) {
  if (!Number.isFinite(seconds)) return "00:00";
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
}

export interface Profile {
  id: string;
  email: string;
  display_name: string;
  avatar_url: string | null;
  gender: "male" | "female" | "non_binary" | null;
  persona_text: string;
  signature: string;
  wallpaper_url: string | null;
  wallpaper_blur: number;
  wallpaper_opacity: number;
  wallpaper_preset: string;
  moment_cover_url: string | null;
  time_awareness_enabled: boolean;
  inner_life_enabled: boolean;
  timezone: string;
  created_at: string;
  updated_at: string;
}

export interface Diary {
  id: string;
  user_id: string;
  title: string;
  content: string;
  diary_date: string;
  created_at: string;
  updated_at: string;
}

export interface AiPersona {
  id: string;
  user_id: string;
  name: string;
  description: string;
  personality: string;
  speaking_style: string;
  interests: string;
  dislikes: string;
  relationship: string;
  background: string;
  additional_prompt: string;
  avatar_url: string | null;
  gender: "male" | "female" | "non_binary" | null;
  minimum_messages: number;
  maximum_messages: number;
  created_at: string;
  updated_at: string;
}

export interface ChatSession {
  id: string;
  user_id: string;
  diary_context_mode: "none" | "current" | "recent" | "all";
  context_diary_id: string | null;
  char_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface ChatMessage {
  id: string;
  session_id: string;
  user_id: string;
  role: "user" | "assistant";
  content: string;
  message_type: MessageType;
  payload: ChatMessagePayload;
  delivery_status: "sending" | "sent" | "failed";
  turn_id: string | null;
  message_order: number;
  edited: boolean;
  created_at: string;
  updated_at: string;
}

export type MessageType = "text" | "image" | "sticker" | "transfer" | "call";

export type ChatMessagePayload =
  | Record<string, never>
  | {
      image_path: string;
      local_preview_url?: string;
      width?: number;
      height?: number;
      caption?: string;
    }
  | {
      sticker_path: string;
      sticker_id?: string;
      sticker_name?: string;
      sticker_tags?: string[];
      width?: number;
      height?: number;
    }
  | {
      amount: number;
      note?: string;
      status: "pending" | "accepted" | "returned";
    }
  | {
      call_type: "voice";
      duration?: number;
      status: "missed" | "cancelled" | "completed";
    };

export interface ChatSticker {
  id: string;
  user_id: string;
  file_path: string;
  pack_id: string | null;
  name: string;
  tags: string[];
  source_url: string | null;
  mime_type: string | null;
  content_hash: string | null;
  width: number | null;
  height: number | null;
  created_at: string;
}

export interface StickerPack {
  id: string;
  user_id: string;
  name: string;
  created_at: string;
  updated_at: string;
  stickerCount?: number;
}

export interface DiaryReply {
  id: string;
  user_id: string;
  diary_id: string;
  char_id: string;
  content: string;
  created_at: string;
  updated_at: string;
}

export type DiaryContextMode = "none" | "current" | "recent" | "all";

export interface MomentPost {
  id: string;
  user_id: string;
  content: string;
  image_paths: string[];
  created_at: string;
  updated_at: string;
}

export interface MomentLike {
  id: string;
  post_id: string;
  user_id: string;
  actor_kind: "user" | "char";
  char_id: string | null;
  created_at: string;
}

export interface MomentComment {
  id: string;
  post_id: string;
  user_id: string;
  actor_kind: "user" | "char";
  char_id: string | null;
  parent_id: string | null;
  content: string;
  created_at: string;
}

export interface FocusSession {
  id: string;
  user_id: string;
  char_id: string | null;
  mode: "focus" | "short_break" | "long_break";
  planned_seconds: number;
  elapsed_seconds: number;
  status: "running" | "completed" | "reset";
  title: string;
  quote: string;
  target_end_at: string | null;
  start_message: string;
  end_message: string;
  started_at: string;
  completed_at: string | null;
  created_at: string;
}

export interface MusicTrack {
  id: string;
  user_id: string;
  title: string;
  artist: string;
  file_path: string;
  mime_type: string;
  created_at: string;
}

export interface MusicMessage {
  id: string;
  user_id: string;
  track_id: string;
  char_id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
}

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
  turn_id: string | null;
  message_order: number;
  edited: boolean;
  created_at: string;
  updated_at: string;
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

export interface Profile {
  id: string;
  email: string;
  display_name: string;
  avatar_url: string | null;
  created_at: string;
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
  created_at: string;
  updated_at: string;
}

export interface ChatSession {
  id: string;
  user_id: string;
  diary_context_mode: "none" | "current" | "recent" | "all";
  context_diary_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface ChatMessage {
  id: string;
  session_id: string;
  user_id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
}

export type DiaryContextMode = "none" | "current" | "recent" | "all";

/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/exhaustive-deps */
import { useEffect, useRef, useState, type FormEvent } from "react";
import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { Plus, Trash2, Upload } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ErrorBanner, Header, LoadingSpinner } from "@/components/ui-kit";
import { AvatarPicker } from "@/components/AvatarPicker";
import { importPersonaFile } from "@/lib/persona-file";
import type { AiPersona } from "@/lib/types";
import { useAuth } from "@/context/AuthContext";

export const Route = createFileRoute("/_authenticated/persona")({ component: PersonaPage });
const blank = {
  name: "新角色",
  description: "",
  personality: "",
  speaking_style: "",
  interests: "",
  dislikes: "",
  relationship: "",
  background: "",
  additional_prompt: "",
  avatar_url: "",
  gender: "",
  minimum_messages: 1,
  maximum_messages: 1,
};

function PersonaPage() {
  const db = supabase as any;
  const { user } = useAuth();
  const navigate = useNavigate();
  const router = useRouter();
  const [items, setItems] = useState<AiPersona[]>([]);
  const [active, setActive] = useState<AiPersona | null>(null);
  const [form, setForm] = useState<any>(blank);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  async function load() {
    const { data, error } = await db
      .from("ai_personas")
      .select("*")
      .order("updated_at", { ascending: false });
    if (error) setError("加载角色名录失败。");
    const list = (data ?? []) as AiPersona[];
    setItems(list);
    if (!active && list[0]) select(list[0]);
    setLoading(false);
  }
  function select(persona: AiPersona) {
    setActive(persona);
    setForm({
      ...blank,
      ...persona,
      avatar_url: persona.avatar_url ?? "",
      gender: persona.gender ?? "",
    });
    localStorage.setItem("current-char-id", persona.id);
  }
  useEffect(() => {
    void load();
  }, []);
  async function save(e: FormEvent) {
    e.preventDefault();
    setError("");
    const min = Number(form.minimum_messages);
    const max = Number(form.maximum_messages);
    if (!form.name.trim() || min < 1 || max < min)
      return setError("请填写名字，并确保最少气泡数不小于 1、最多气泡数不小于最少值。");
    setSaving(true);
    const values = {
      ...form,
      name: form.name.trim(),
      avatar_url: form.avatar_url || null,
      gender: form.gender || null,
      minimum_messages: min,
      maximum_messages: max,
    };
    delete values.id;
    delete values.user_id;
    delete values.created_at;
    delete values.updated_at;
    const result = active
      ? await db.from("ai_personas").update(values).eq("id", active.id).select("*").single()
      : await db.from("ai_personas").insert(values).select("*").single();
    setSaving(false);
    if (result.error || !result.data) return setError("保存失败，请稍后重试。");
    const saved = result.data as AiPersona;
    setItems((previous) =>
      active ? previous.map((item) => (item.id === saved.id ? saved : item)) : [saved, ...previous],
    );
    select(saved);
  }
  async function remove() {
    if (!active || !confirm(`确定删除角色“${active.name}”吗？相关会话将不再可用。`)) return;
    const { error } = await db.from("ai_personas").delete().eq("id", active.id);
    if (error) return setError("删除失败。请先确认该角色没有受保护的数据关联。");
    const next = items.filter((item) => item.id !== active.id);
    setItems(next);
    setActive(null);
    setForm(blank);
    if (next[0]) select(next[0]);
  }
  async function importFile(file?: File) {
    if (!file) return;
    try {
      setForm((prev: any) => ({ ...prev, description: "正在读取文件…" }));
      const text = await importPersonaFile(file);
      setForm((prev: any) => ({ ...prev, description: text }));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "文件读取失败。");
    }
  }
  if (loading)
    return (
      <div className="page-container">
        <LoadingSpinner />
      </div>
    );
  return (
    <div className="page-container">
      <Header
        title="角色名录"
        onBack={() => router.history.back()}
        rightAction={
          <button
            onClick={() => {
              setActive(null);
              setForm(blank);
            }}
            className="w-9 h-9 rounded-full bg-white border border-[var(--color-border)] flex items-center justify-center"
          >
            <Plus size={18} />
          </button>
        }
      />
      {error && <ErrorBanner message={error} />}
      <div className="flex gap-2 overflow-x-auto pb-4">
        {items.map((item) => (
          <button
            key={item.id}
            onClick={() => select(item)}
            className={`shrink-0 px-3 py-2 rounded-xl border text-sm ${active?.id === item.id ? "border-[var(--color-primary)] text-[var(--color-primary)] bg-white" : "border-[var(--color-border)] bg-white"}`}
          >
            {item.name}
          </button>
        ))}
        {items.length === 0 && (
          <p className="text-sm text-[var(--color-text-secondary)]">还没有角色，先创建一个吧。</p>
        )}
      </div>
      <form onSubmit={save} className="space-y-4 pb-8">
        <p className="text-sm text-[var(--color-text-secondary)]">
          每位角色的人设、头像、回复设置、聊天和日记回信彼此独立。
        </p>
        <Field
          label="名字"
          value={form.name}
          onChange={(value) => setForm({ ...form, name: value })}
        />
        {user && (
          <AvatarPicker
            label="角色头像"
            owner="penpal"
            userId={user.id}
            value={form.avatar_url}
            onChange={(value) => setForm({ ...form, avatar_url: value })}
            onError={setError}
          />
        )}
        <label className="block text-sm font-medium">
          性别
          <select
            className="input-field mt-2"
            value={form.gender}
            onChange={(e) => setForm({ ...form, gender: e.target.value })}
          >
            <option value="">不设置</option>
            <option value="male">男</option>
            <option value="female">女</option>
            <option value="non_binary">非二元</option>
          </select>
        </label>
        <div>
          <label className="text-sm font-medium block mb-2">人设描述</label>
          <textarea
            className="input-field resize-none"
            rows={5}
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
          <input
            ref={inputRef}
            type="file"
            accept=".txt,.docx,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            className="hidden"
            onChange={(e) => void importFile(e.target.files?.[0])}
          />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="mt-2 text-sm text-[var(--color-primary)] flex items-center gap-1"
          >
            <Upload size={15} />
            导入 TXT 或 DOCX 人设
          </button>
        </div>
        {(
          [
            ["personality", "性格"],
            ["speaking_style", "说话方式"],
            ["interests", "兴趣"],
            ["dislikes", "不喜欢"],
            ["relationship", "与你的关系"],
            ["background", "背景"],
            ["additional_prompt", "补充设定"],
          ] as const
        ).map(([key, label]) => (
          <Field
            key={key}
            label={label}
            multiline
            value={form[key]}
            onChange={(value) => setForm({ ...form, [key]: value })}
          />
        ))}
        <div className="grid grid-cols-2 gap-3">
          <Field
            label="最少回复气泡"
            type="number"
            value={String(form.minimum_messages)}
            onChange={(value) => setForm({ ...form, minimum_messages: value })}
          />
          <Field
            label="最多回复气泡"
            type="number"
            value={String(form.maximum_messages)}
            onChange={(value) => setForm({ ...form, maximum_messages: value })}
          />
        </div>
        <button type="submit" disabled={saving} className="btn-primary w-full">
          {saving ? "保存中…" : active ? "保存角色" : "创建角色"}
        </button>
        {active && (
          <button
            type="button"
            onClick={() => void remove()}
            className="w-full py-3 text-sm text-[var(--color-error)] flex items-center justify-center gap-1"
          >
            <Trash2 size={15} />
            删除当前角色
          </button>
        )}
        <button
          type="button"
          onClick={() => navigate({ to: "/chat" })}
          className="w-full py-3 text-sm text-[var(--color-primary)]"
        >
          去和当前角色聊天
        </button>
      </form>
    </div>
  );
}
function Field({
  label,
  value,
  onChange,
  multiline,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  multiline?: boolean;
  type?: string;
}) {
  return (
    <label className="block text-sm font-medium">
      {label}
      {multiline ? (
        <textarea
          rows={3}
          className="input-field mt-2 resize-none"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <input
          type={type}
          min={type === "number" ? 1 : undefined}
          className="input-field mt-2"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </label>
  );
}

import { useState, useEffect, type FormEvent } from "react";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Header, LoadingSpinner, ErrorBanner } from "@/components/ui-kit";
import type { AiPersona } from "@/lib/types";

export const Route = createFileRoute("/_authenticated/persona")({
  head: () => ({
    meta: [
      { title: "人设板 · 此心一笺" },
      { name: "description", content: "设定 AI 笔友的名字、性格、说话方式和背景故事，改完立即生效。" },
      { property: "og:title", content: "人设板 · 此心一笺" },
      {
        property: "og:description",
        content: "设定 AI 笔友的名字、性格、说话方式和背景故事，改完立即生效。",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PersonaPage,
});

const defaultPersona: Omit<AiPersona, "id" | "user_id" | "created_at" | "updated_at"> = {
  name: "笔友",
  description: "",
  personality: "",
  speaking_style: "",
  interests: "",
  dislikes: "",
  relationship: "",
  background: "",
  additional_prompt: "",
};

function PersonaPage() {
  const router = useRouter();
  const [persona, setPersona] = useState<AiPersona | null>(null);
  const [formData, setFormData] = useState(defaultPersona);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    void supabase
      .from("ai_personas")
      .select("*")
      .limit(1)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) {
          setError("加载人设失败");
        } else if (data) {
          const p = data as AiPersona;
          setPersona(p);
          setFormData({
            name: p.name,
            description: p.description,
            personality: p.personality,
            speaking_style: p.speaking_style,
            interests: p.interests,
            dislikes: p.dislikes,
            relationship: p.relationship,
            background: p.background,
            additional_prompt: p.additional_prompt,
          });
        }
        setLoading(false);
      });
  }, []);

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    setSaved(false);

    try {
      if (persona) {
        const { error } = await supabase
          .from("ai_personas")
          .update(formData)
          .eq("id", persona.id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from("ai_personas")
          .insert(formData)
          .select("*")
          .maybeSingle();
        if (error) throw error;
        if (data) setPersona(data as AiPersona);
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  function updateField(field: keyof typeof formData, value: string) {
    setFormData((prev) => ({ ...prev, [field]: value }));
  }

  if (loading) {
    return (
      <div className="page-container">
        <LoadingSpinner />
      </div>
    );
  }

  const fields: Array<{
    key: keyof typeof formData;
    label: string;
    placeholder: string;
    multiline?: boolean;
  }> = [
    { key: "name", label: "名字", placeholder: "给你的笔友起个名字" },
    {
      key: "description",
      label: "描述",
      placeholder: "描述你希望这个笔友是什么样的人",
      multiline: true,
    },
    { key: "personality", label: "性格", placeholder: "温和、敏锐、喜欢文学..." },
    { key: "speaking_style", label: "说话方式", placeholder: "温柔、偶尔幽默、喜欢反问..." },
    { key: "interests", label: "喜欢什么", placeholder: "阅读、音乐、散步..." },
    { key: "dislikes", label: "不喜欢什么", placeholder: "嘈杂、虚伪..." },
    { key: "relationship", label: "与你的关系", placeholder: "老朋友、知心人..." },
    { key: "background", label: "背景故事", placeholder: "笔友的过去、经历...", multiline: true },
  ];

  return (
    <div className="page-container">
      <form onSubmit={handleSave} className="fade-in">
        <Header title="人设板" onBack={() => router.history.back()} />

        {error && <ErrorBanner message={error} />}
        {saved && (
          <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 mb-4">
            <p className="text-sm text-[var(--color-success)]">人设已保存</p>
          </div>
        )}

        <p className="text-sm text-[var(--color-text-secondary)] mb-6">
          在这里设定你的 AI 笔友的人格。笔友会根据这些设定与你交流，修改后立即生效。
        </p>

        <div className="space-y-5">
          {fields.map((field) => (
            <div key={field.key}>
              <label className="text-sm font-medium text-[var(--color-text)] mb-2 block">
                {field.label}
              </label>
              {field.multiline ? (
                <textarea
                  placeholder={field.placeholder}
                  value={formData[field.key]}
                  onChange={(e) => updateField(field.key, e.target.value)}
                  className="input-field resize-none"
                  rows={3}
                />
              ) : (
                <input
                  type="text"
                  placeholder={field.placeholder}
                  value={formData[field.key]}
                  onChange={(e) => updateField(field.key, e.target.value)}
                  className="input-field"
                />
              )}
            </div>
          ))}

          <div>
            <label className="text-sm font-medium text-[var(--color-text)] mb-2 block">
              补充设定
            </label>
            <textarea
              placeholder="其他你想补充的设定，可以自由描述..."
              value={formData.additional_prompt}
              onChange={(e) => updateField("additional_prompt", e.target.value)}
              className="input-field resize-none"
              rows={5}
            />
          </div>
        </div>

        <div className="pt-6 pb-2">
          <button type="submit" disabled={saving} className="btn-primary w-full">
            {saving ? <LoadingSpinner /> : "保存人设"}
          </button>
        </div>
      </form>
    </div>
  );
}

import { useRef, type FormEvent } from "react";
import { Trash2, Upload } from "lucide-react";
import { AvatarPicker } from "@/components/AvatarPicker";
import { importPersonaFile } from "@/lib/persona-file";

export interface PersonaDraft {
  name: string;
  description: string;
  personality: string;
  speaking_style: string;
  interests: string;
  dislikes: string;
  relationship: string;
  background: string;
  additional_prompt: string;
  avatar_url: string;
  gender: string;
  minimum_messages: number | string;
  maximum_messages: number | string;
}

export function PersonaEditor({
  form,
  userId,
  existing,
  saving,
  onChange,
  onSubmit,
  onDelete,
  onError,
}: {
  form: PersonaDraft;
  userId: string;
  existing: boolean;
  saving: boolean;
  onChange: (next: PersonaDraft) => void;
  onSubmit: (event: FormEvent) => void;
  onDelete: () => void;
  onError: (message: string) => void;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const set = (key: keyof PersonaDraft, value: string | number) =>
    onChange({ ...form, [key]: value });
  async function importFile(file?: File) {
    if (!file) return;
    try {
      set("description", await importPersonaFile(file));
    } catch (reason) {
      onError(reason instanceof Error ? reason.message : "文件读取失败。");
    }
  }
  return (
    <form onSubmit={onSubmit} className="contact-editor fade-in">
      <AvatarPicker
        label="角色头像"
        owner="penpal"
        userId={userId}
        value={form.avatar_url}
        onChange={(value) => set("avatar_url", value)}
        onError={onError}
      />
      <EditorField label="名字" value={form.name} onChange={(value) => set("name", value)} />
      <EditorField
        label="一句简介"
        value={form.description}
        multiline
        onChange={(value) => set("description", value)}
      />
      <input
        ref={fileInput}
        type="file"
        accept=".txt,.docx,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        hidden
        onChange={(event) => void importFile(event.target.files?.[0])}
      />
      <button type="button" className="contact-import" onClick={() => fileInput.current?.click()}>
        <Upload size={15} /> 导入 TXT 或 DOCX 人设
      </button>
      <label className="contact-editor__field">
        <span>性别</span>
        <select value={form.gender} onChange={(event) => set("gender", event.target.value)}>
          <option value="">不设置</option>
          <option value="male">男</option>
          <option value="female">女</option>
          <option value="non_binary">非二元</option>
        </select>
      </label>
      {(
        [
          ["personality", "性格"],
          ["speaking_style", "说话方式"],
          ["interests", "喜欢"],
          ["dislikes", "不喜欢"],
          ["relationship", "与你的关系"],
          ["background", "背景"],
          ["additional_prompt", "补充设定"],
        ] as Array<[keyof PersonaDraft, string]>
      ).map(([key, label]) => (
        <EditorField
          key={key}
          label={label}
          value={String(form[key])}
          multiline
          onChange={(value) => set(key, value)}
        />
      ))}
      <section className="contact-editor__group">
        <h2>回复设置</h2>
        <p>限制角色每次回复的句子数量。</p>
        <div className="contact-editor__pair">
          <EditorField
            label="最少回复句子数"
            type="number"
            value={String(form.minimum_messages)}
            onChange={(value) => set("minimum_messages", value)}
          />
          <EditorField
            label="最多回复句子数"
            type="number"
            value={String(form.maximum_messages)}
            onChange={(value) => set("maximum_messages", value)}
          />
        </div>
      </section>
      <button className="btn-primary w-full" disabled={saving}>
        {saving ? "保存中…" : existing ? "保存修改" : "创建角色"}
      </button>
      {existing && (
        <button type="button" onClick={onDelete} className="contact-delete">
          <Trash2 size={15} /> 删除角色
        </button>
      )}
    </form>
  );
}

function EditorField({
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
    <label className="contact-editor__field">
      <span>{label}</span>
      {multiline ? (
        <textarea rows={3} value={value} onChange={(event) => onChange(event.target.value)} />
      ) : (
        <input
          type={type}
          min={type === "number" ? 1 : undefined}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
    </label>
  );
}

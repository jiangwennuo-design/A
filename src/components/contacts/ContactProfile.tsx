import { BookOpen, ChevronRight, MessageCircle, Pencil, Settings, UserRound } from "lucide-react";
import type { AiPersona } from "@/lib/types";
import { readCharacterChatPreferences } from "@/lib/character-chat";
import { ContactAvatar } from "./ContactList";

const details: Array<[keyof AiPersona, string]> = [
  ["gender", "性别"],
  ["personality", "性格"],
  ["speaking_style", "说话方式"],
  ["interests", "喜欢"],
  ["dislikes", "不喜欢"],
  ["relationship", "与你的关系"],
  ["background", "背景"],
  ["additional_prompt", "补充设定"],
];

const genderLabels: Record<string, string> = {
  male: "男",
  female: "女",
  non_binary: "非二元",
};
export type ContactSection = "basic" | "persona" | "world" | "settings";
export const contactSections = {
  basic: "基本信息",
  persona: "人设",
  world: "世界书与背景",
  settings: "聊天设置",
};

export function ContactProfile({
  contact,
  avatar,
  onEdit,
  onMessage,
  onSection,
  onIdentity,
  section,
}: {
  contact: AiPersona;
  avatar: string;
  onEdit: () => void;
  onMessage: () => void;
  onSection: (section: ContactSection) => void;
  onIdentity: () => void;
  section?: ContactSection | undefined;
}) {
  const preferences = readCharacterChatPreferences(contact.chat_preferences);
  if (section)
    return (
      <section className="contact-details roster-full-text">
        <button type="button" className="roster-link" onClick={onEdit}>
          <Pencil size={15} />
          编辑资料
        </button>
        {section === "basic" && (
          <>
            <div>
              <small>名字</small>
              <p>{contact.name}</p>
            </div>
            <div>
              <small>性别</small>
              <p>{genderLabels[contact.gender ?? ""] || "未填写"}</p>
            </div>
            <div>
              <small>与你的关系</small>
              <p>{contact.relationship || "未填写"}</p>
            </div>
          </>
        )}
        {section === "persona" && (
          <div>
            <small>人设描述</small>
            <p>{contact.description || "未填写"}</p>
          </div>
        )}
        {section === "persona" &&
          details
            .filter(([key]) => key !== "gender" && key !== "background")
            .map(([key, label]) => (
              <div key={key}>
                <small>{label}</small>
                <p>{String(contact[key] ?? "") || "未填写"}</p>
              </div>
            ))}
        {section === "world" && (
          <>
            <div>
              <small>背景</small>
              <p>{contact.background || "未填写"}</p>
            </div>
            <div>
              <small>世界书</small>
              <p>
                {preferences.worldBookIds.length
                  ? `已绑定 ${preferences.worldBookIds.length} 本，可在编辑资料中查看和修改`
                  : "未绑定，可在编辑资料中绑定"}
              </p>
            </div>
          </>
        )}
        {section === "settings" && (
          <>
            <div>
              <small>限制回复句子数</small>
              <p>
                {contact.minimum_messages}–{contact.maximum_messages} 条
              </p>
            </div>
            <div>
              <small>聊天备注</small>
              <p>{preferences.remark || "使用角色本名"}</p>
            </div>
            <div>
              <small>短期记忆</small>
              <p>最近 {preferences.contextDepth} 条消息</p>
            </div>
            <div>
              <small>长期记忆</small>
              <p>{preferences.longTermMemory ? "已启用" : "关闭"}</p>
            </div>
            <button type="button" className="roster-menu-row" onClick={onIdentity}>
              <span>
                与 {contact.name} 对话时的我的信息<small>仅对此角色生效</small>
              </span>
              <ChevronRight size={18} />
            </button>
          </>
        )}
      </section>
    );
  const menus = [
    ["basic", UserRound, "名字、性别与关系"],
    ["persona", Pencil, "查看角色完整人设"],
    ["world", BookOpen, `背景与 ${preferences.worldBookIds.length} 本世界书`],
    ["settings", Settings, "回复与我的专属资料"],
  ] as const;
  return (
    <div className="contact-profile fade-in">
      <button type="button" onClick={onEdit} className="contact-profile__edit">
        <Pencil size={15} /> 编辑
      </button>
      <div className="contact-profile__hero">
        <ContactAvatar url={avatar} name={contact.name} large />
        <h1>{contact.name}</h1>
      </div>
      <button type="button" onClick={onMessage} className="contact-message-button">
        <MessageCircle size={19} /> 发消息
      </button>
      <div className="roster-menu">
        {menus.map(([key, Icon, hint]) => (
          <button
            key={key}
            type="button"
            className="roster-menu-row"
            onClick={() => onSection(key)}
          >
            <Icon size={20} />
            <span>
              {contactSections[key]}
              <small>{hint}</small>
            </span>
            <ChevronRight size={18} />
          </button>
        ))}
      </div>
      <button type="button" className="roster-menu-row roster-card" onClick={onIdentity}>
        <UserRound size={20} />
        <span>
          与 {contact.name} 对话时的我的信息<small>仅对此角色生效</small>
        </span>
        <ChevronRight size={18} />
      </button>
    </div>
  );
}

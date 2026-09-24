import { MessageCircle, Pencil } from "lucide-react";
import type { AiPersona } from "@/lib/types";
import { ContactAvatar } from "./ContactList";

const details: Array<[keyof AiPersona, string]> = [
  ["personality", "性格"],
  ["speaking_style", "说话方式"],
  ["interests", "喜欢"],
  ["dislikes", "不喜欢"],
  ["relationship", "与你的关系"],
  ["background", "背景"],
];

export function ContactProfile({
  contact,
  avatar,
  onEdit,
  onMessage,
}: {
  contact: AiPersona;
  avatar: string;
  onEdit: () => void;
  onMessage: () => void;
}) {
  return (
    <div className="contact-profile fade-in">
      <button type="button" onClick={onEdit} className="contact-profile__edit">
        <Pencil size={15} /> 编辑
      </button>
      <div className="contact-profile__hero">
        <ContactAvatar url={avatar} name={contact.name} large />
        <h1>{contact.name}</h1>
        <p>{contact.description || contact.relationship || "还没有填写简介"}</p>
      </div>
      <button type="button" onClick={onMessage} className="contact-message-button">
        <MessageCircle size={19} /> 发消息
      </button>
      <section className="contact-details">
        <h2>角色资料</h2>
        {details.map(([key, label]) => {
          const value = contact[key];
          if (typeof value !== "string" || !value.trim()) return null;
          return (
            <div key={key}>
              <small>{label}</small>
              <p>{value}</p>
            </div>
          );
        })}
      </section>
    </div>
  );
}

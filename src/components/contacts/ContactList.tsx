import { Plus, Search } from "lucide-react";
import type { AiPersona } from "@/lib/types";

export function ContactList({
  contacts,
  avatars,
  query,
  onQueryChange,
  onSelect,
  onCreate,
}: {
  contacts: AiPersona[];
  avatars: Record<string, string>;
  query: string;
  onQueryChange: (value: string) => void;
  onSelect: (contact: AiPersona) => void;
  onCreate: () => void;
}) {
  const normalized = query.trim().toLocaleLowerCase();
  const shown = contacts.filter((contact) =>
    `${contact.name} ${contact.description} ${contact.relationship}`
      .toLocaleLowerCase()
      .includes(normalized),
  );
  return (
    <>
      <div className="contacts-title-row">
        <h1>名册</h1>
        <button type="button" aria-label="新建角色" onClick={onCreate} className="contacts-add">
          <Plus size={21} />
        </button>
      </div>
      <label className="contacts-search">
        <Search size={17} />
        <input
          type="search"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="搜索名字"
        />
      </label>
      <div className="contacts-list">
        {shown.map((contact) => (
          <button
            key={contact.id}
            type="button"
            onClick={() => onSelect(contact)}
            className="contact-row"
          >
            <ContactAvatar url={avatars[contact.id]} name={contact.name} />
            <span className="contact-row__copy">
              <strong>{contact.name}</strong>
              <small>{contact.relationship || contact.description || "还没有填写简介"}</small>
            </span>
            <span aria-hidden="true" className="contact-row__arrow">
              ›
            </span>
          </button>
        ))}
        {!shown.length && (
          <p className="contacts-empty">{contacts.length ? "没有找到这个名字" : "还没有角色"}</p>
        )}
      </div>
    </>
  );
}

export function ContactAvatar({
  url,
  name,
  large = false,
}: {
  url?: string | undefined;
  name: string;
  large?: boolean;
}) {
  return (
    <span className={`contact-avatar ${large ? "is-large" : ""}`}>
      {url ? (
        <img src={url} alt={name} loading="lazy" decoding="async" />
      ) : (
        <span>{name.trim().charAt(0) || "角"}</span>
      )}
    </span>
  );
}

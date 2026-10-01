import { useEffect, useRef, useState } from "react";
import { FileJson, FileText, Sparkles } from "lucide-react";
import { SystemModal } from "./system-ui";
import "@/styles/release-notice.css";

const RELEASE_ID = "2026-10-01-imports";
const STORAGE_KEY = "kdeji:last-read-update";
let acknowledgedInSession = false;
const ignoreClose = () => {};

export function ReleaseNotice() {
  const [open, setOpen] = useState(false);
  const [remaining, setRemaining] = useState(3);
  const content = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (acknowledgedInSession) return;
    try {
      if (localStorage.getItem(STORAGE_KEY) === RELEASE_ID) return;
    } catch {
      /* Private browsing/storage restrictions must not block the app. */
    }
    setOpen(true);
    const started = performance.now();
    const timer = window.setInterval(() => {
      const seconds = Math.max(0, Math.ceil((3000 - (performance.now() - started)) / 1000));
      setRemaining(seconds);
      if (!seconds) window.clearInterval(timer);
    }, 200);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    content.current?.focus();
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  function acknowledge() {
    if (remaining > 0) return;
    acknowledgedInSession = true;
    try {
      localStorage.setItem(STORAGE_KEY, RELEASE_ID);
    } catch {
      /* Keep the current visit usable if persistent storage is unavailable. */
    }
    setOpen(false);
  }

  if (!open) return null;
  return (
    <div className="release-notice">
      <SystemModal
        open
        title="K得机更新啦"
        description="10月1日 · 今天多了两种导入方式"
        onClose={ignoreClose}
      >
        <div className="release-notice__body" ref={content} tabIndex={-1}>
          <span className="release-notice__badge">
            <Sparkles size={18} /> 导入更方便了
          </span>
          <div className="release-notice__item">
            <FileJson size={22} />
            <div>
              <h3>角色卡可以直接导入</h3>
              <p>
                在名册里选择 JSON 或 PNG
                角色卡，就能带入名字、人设、开场白和示例对话。检查后点「完成」保存即可。
              </p>
            </div>
          </div>
          <div className="release-notice__item">
            <FileText size={22} />
            <div>
              <h3>世界书支持 Word 文档</h3>
              <p>
                现在除了 JSON，也能导入
                DOCX。正文和换行会保留下来，长文不会被截断；导入后照常绑定给角色使用。
              </p>
            </div>
          </div>
          <p className="release-notice__note">已有角色、聊天记录和设置都保留，不需要重新配置。</p>
        </div>
        <button
          type="button"
          className="release-notice__confirm"
          disabled={remaining > 0}
          onClick={acknowledge}
        >
          {remaining > 0 ? `我知道了（${remaining}秒）` : "我知道了"}
        </button>
      </SystemModal>
    </div>
  );
}

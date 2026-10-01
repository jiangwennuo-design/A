import { useEffect, useRef, useState } from "react";
import { Paintbrush, Sparkles, Zap } from "lucide-react";
import { SystemModal } from "./system-ui";
import "@/styles/release-notice.css";

const RELEASE_ID = "2026-10-02-chat-css-fix";
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
        description="10月2日 · 聊天美化修复"
        onClose={ignoreClose}
      >
        <div className="release-notice__body" ref={content} tabIndex={-1}>
          <span className="release-notice__badge">
            <Sparkles size={18} /> 聊天美化更稳、更轻了
          </span>
          <div className="release-notice__item">
            <Paintbrush size={22} />
            <div>
              <h3>完整聊天 CSS 更可靠</h3>
              <p>修复了部分 CSS 无法生效的问题。样式有错误时会显示原因，也能随时停用或恢复默认。</p>
            </div>
          </div>
          <div className="release-notice__item">
            <Zap size={22} />
            <div>
              <h3>打开和编辑更轻快</h3>
              <p>减少了重复处理样式；预览只在展开时加载，收起后不再占用额外渲染资源。</p>
            </div>
          </div>
          <p className="release-notice__note">
            原有气泡、顶栏底栏预设、壁纸和聊天记录都保留，不需要重新配置。
          </p>
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

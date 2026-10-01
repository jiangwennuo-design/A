# K得机 Chat CSS API

完整 CSS 是独立覆盖层，不解析为配色或主题配置。入口：聊天编辑 → 自定义美化 → 完整聊天页 CSS。
旧气泡、顶栏/底栏预设保持不变。默认不启用；每个角色只存 `fullChatCss.selectedPresetId/enabled`。

## 稳定选择器

使用 `[data-ui="名称"]`。保留所有现有 class/id/data-ui；为已有名称添加的 API 别名放在
`data-css-ui` 中，完整 CSS 编译器统一识别它们。DOM 查询时可用 `[data-css-ui~="名称"]`。

| 区域 | 名称                                                                                                                                                                                                            |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 页面 | chat-screen、chat-background、chat-messages                                                                                                                                                                     |
| 顶栏 | chat-header、chat-contact、chat-identity、chat-header-avatar、chat-title、chat-status、chat-header-actions、chat-back、chat-call、chat-settings                                                                 |
| 消息 | message、message-wrapper、message-bubble、message-content、avatar、message-avatar、timestamp                                                                                                                    |
| 引用 | quoted-message、message-quote、quoted-sender、quoted-content、chat-reply-preview、cancel-quote                                                                                                                  |
| 媒体 | chat-image、sticker、media-image、media-placeholder、image-viewer、image-viewer-close                                                                                                                           |
| 转账 | transfer-card、transfer-icon、transfer-amount、transfer-remark、transfer-status、transfer-detail、transfer-receive、transfer-refund、transfer-form、transfer-amount-input、transfer-remark-input、transfer-send |
| 通话 | voice-message、voice-call-screen、voice-call-avatar、voice-call-name、voice-call-status、voice-call-controls、voice-call-hangup                                                                                 |
| 输入 | chat-input-area、chat-footer、chat-input、chat-add、chat-reply、send-button、chat-send                                                                                                                          |
| 工具 | action-menu、action-menu-overlay、action-button、attachment-menu、attachment-image、attachment-sticker、attachment-transfer、attachment-reroll                                                                  |
| 状态 | system-message、history-button、message-selection、message-retry、thinking、thinking-toggle、thinking-content、typing-indicator                                                                                 |

消息行有 `[data-role="user"]` / `[data-role="char"]` 和
`[data-message-type="text|image|sticker|transfer|call"]`；转账有 `data-transfer-status`。
兼容普通语义 class：`.user`、`.ai`、`.message-wrapper`、`.message-bubble`、`.content`。
不兼容其他项目的私有 DOM，亦不做第三方选择器映射。

## 隔离与覆盖

浏览器 CSSOM 解析规则。选择器限定到当前 `data-full-chat-root`；
`:root/html/body` 转为当前聊天根。即使使用兄弟组合符，也不能选到根外。
伪元素保留在选择器主体外；支持 :has、CSS 变量、媒体/支持/容器查询、字体、关键帧。
字体与动画名字按聊天作用域命名，避免影响其他 App。
完整 CSS 使用独立优先级层及重要声明覆盖系统和旧主题，包括普通 inline style。
显式 `!important` 仍高于普通覆盖声明。关键帧不提升为重要声明；
当前 CSS 的关键帧所驱动的属性保留普通声明，避免覆盖层把动画锁死。
显式重要值（包括旧主题中的重要值）仍按浏览器规则优先于关键帧；避免锁定相同动画属性。

CSS 只能改变壁纸**显示效果**。停用后恢复原 inline 壁纸；编译器不调用壁纸上传或持久化。
编辑器、聊天设置、恢复入口位于作用域外。恢复按钮使用浏览器 top layer，支持停用和恢复默认，
网络失败时也能立即临时停用。预览另有不可被用户 CSS 去除的绘制边界。

拒绝 JS/script、expression、behavior、危险 URL scheme、@import/namespace/document/page/property。
允许 HTTP(S)、图片/字体 Data URL、Blob 与相对 url；外部字体仍受 CORS/CSP/网络限制。
不保证当前浏览器不支持的 CSS 生效；错误规则按浏览器处理，无有效规则时报告错误。
原始完整 CSS 上限 256,000 字符（旧气泡/界面限额不变），CSS/DOCX 文件上限 10 MB；DOCX 复用现有正文提取器。

## 持久化

完整预设复用现有 AppearancePreset（id/name/customCss/config/createdAt/updatedAt），`themeType=chatFull`。
本机按账号独立 key：`kdeji.chatAppearancePresets.v1:<userId>:chatFull`。
账号同步复用既有 `profiles.chat_appearance_libraries` 与 RPC；不新增 schema：
`chatChrome.fullChatLibrary` 仅是传输包内独立命名空间，**不是顶栏预设内容**。
顶栏和气泡列表、配置、名称均不合并。写顶栏库时保留该完整库；读取时分别恢复各自 key。
导入 .css/.docx 只载入编辑草稿；保存为新预设后才能应用。JSON 预设导入只新增记录。
重命名、覆盖、删除只处理选中的单个预设；恢复默认不清空任何预设库。

浏览器兼容测试：`scripts/check-full-chat-css.mjs`（自己生成 CSS/DOCX，使用实际消息/输入/编辑/恢复组件）。
账号接口在测试中替换为受控响应，不操作真实用户数据。刷新及冷启动用重新加载页面和新浏览器上下文验证。

// Discord 登录开关：默认关闭。
// 想开启时把 VITE_ENABLE_DISCORD_LOGIN 设为 "true"，并在后端配置 Discord 应用的
// Client ID / Client Secret（Discord 需要自带 Supabase 项目才能启用）。
export const discordLoginEnabled = import.meta.env['VITE_ENABLE_DISCORD_LOGIN'] === "true";

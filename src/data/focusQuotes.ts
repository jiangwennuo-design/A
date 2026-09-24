export const focusQuotes = [
  "先把眼前这一件事做完。",
  "不用赶，保持在场就好。",
  "把注意力留给现在。",
  "安静地向前一点。",
  "今天的进度，从这一刻开始。",
  "允许自己只做一件事。",
  "慢一点，也是在前进。",
  "先不回应世界，只回应此刻。",
  "把这段时间完整地交给自己。",
  "不求完美，只求清醒。",
] as const;

export function randomFocusQuote(previous = "") {
  const choices = focusQuotes.filter((quote) => quote !== previous);
  return choices[Math.floor(Math.random() * choices.length)] ?? focusQuotes[0];
}

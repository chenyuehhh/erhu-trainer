/* data/tunings.js — 定弦预设库（T-05，不写死二胡） */
(function () {
  "use strict";
  const ET = (window.ET = window.ET || {});

  // strings: [{l: 显示名, n: 音名}]
  const PRESETS = [
    {
      group: "二胡（标准定弦 d1-a1，换调只换弦式）",
      items: [
        { id: "erhu-d", name: "D 调（1-5 弦）", strings: [{ l: "内弦 · do", n: "D4" }, { l: "外弦 · sol", n: "A4" }] },
        { id: "erhu-g", name: "G 调（5-2 弦）", strings: [{ l: "内弦 · sol", n: "D4" }, { l: "外弦 · re", n: "A4" }] },
        { id: "erhu-f", name: "F 调（6-3 弦）", strings: [{ l: "内弦 · la", n: "D4" }, { l: "外弦 · mi", n: "A4" }] },
        { id: "erhu-c", name: "C 调（2-6 弦）", strings: [{ l: "内弦 · re", n: "D4" }, { l: "外弦 · la", n: "A4" }] },
        { id: "erhu-a", name: "A 调（4-1 弦）", strings: [{ l: "内弦 · fa", n: "D4" }, { l: "外弦 · do", n: "A4" }] },
        { id: "erhu-bb", name: "bB 调（3-7 弦）", strings: [{ l: "内弦 · mi", n: "D4" }, { l: "外弦 · si", n: "A4" }] },
        { id: "erhu-erquan", name: "二泉映月用弦（低五度）", strings: [{ l: "内弦", n: "G3" }, { l: "外弦", n: "D4" }] },
      ],
    },
    {
      group: "其他乐器",
      items: [
        { id: "violin", name: "小提琴", strings: [{ l: "G", n: "G3" }, { l: "D", n: "D4" }, { l: "A", n: "A4" }, { l: "E", n: "E5" }] },
        { id: "guitar", name: "吉他", strings: [{ l: "E6", n: "E2" }, { l: "A", n: "A2" }, { l: "D", n: "D3" }, { l: "G", n: "G3" }, { l: "B", n: "B3" }, { l: "e", n: "E4" }] },
        { id: "ukulele", name: "尤克里里", strings: [{ l: "G", n: "G4" }, { l: "C", n: "C4" }, { l: "E", n: "E4" }, { l: "A", n: "A4" }] },
        { id: "cello", name: "大提琴", strings: [{ l: "C", n: "C2" }, { l: "G", n: "G2" }, { l: "D", n: "D3" }, { l: "A", n: "A3" }] },
      ],
    },
  ];

  ET.tunings = PRESETS;
})();

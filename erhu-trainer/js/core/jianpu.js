/* core/jianpu.js — 简谱紧凑记谱解析 + 自动指法/弓法（D-13/D-14/D-05）
  词法：数字[八度点][时值][~][括号标记]
    1  5'  2,        音高（' 高八度点 , 低八度点）
    5 -  5 --        增时线（- 2拍 -- 3拍 --- 4拍）
    3.               附点（1.5 拍）
    6/2  1/4         减时线（/2 八分 /4 十六分）
    2~               延音线（并入前音时长）
    [空] [一] [二把]  指法（内/外开头则同时定弦别）
    [拉] [推] [连]   弓法（连 = 与前音同弓）
  小节线 | ；无标记处自动交替弓法、按调查表自动指法。
*/
(function () {
  "use strict";
  const ET = (window.ET = window.ET || {});
  const N = () => ET.notation;

  /** 沿调音阶从 startMidi 起上行取 count 个调内音 */
  function scaleFrom(key, startMidi, count) {
    const tonic = N().keyTonicMidi(key);
    const pool = [];
    for (let oct = -2; oct <= 3; oct++)
      for (const d of N().DEGREE) pool.push(tonic + d + 12 * oct);
    pool.sort((a, b) => a - b);
    const idx = pool.findIndex((m) => m >= startMidi);
    return pool.slice(idx, idx + count);
  }

  /**
   * 一把位指法表：midi -> {s: 弦别, f: 指法}（D-13/D-14）。
   * 内弦自空弦 D4 起沿该调音阶取 4 音（空一二三），
   * 外弦自空弦 A4 起取 5 音（空一二三四）。
   * 按调生成：G 调外弦二指 = C5、F 调内弦二指 = F4、bB 调内弦二指 = bE4，随调自动正确。
   */
  function buildTable(key) {
    const table = {};
    const fingerCN = ["空", "一", "二", "三", "四"];
    scaleFrom(key, 62, 4).forEach((midi, i) => { table[midi] = { s: "内", f: fingerCN[i] }; });
    scaleFrom(key, 69, 5).forEach((midi, i) => { table[midi] = { s: "外", f: fingerCN[i] }; });
    return table;
  }

  const TOK = /^([0-7])([',]*)(\.|-{1,3}|\/2|\/4)?(~)?(?:\[([^\]]*)\])?$/;

  function parseToken(tok) {
    const m = TOK.exec(tok.trim());
    if (!m) throw new Error("坏记谱记号: " + tok);
    const digit = m[1];
    let oct = 0;
    for (const ch of m[2]) oct += ch === "'" ? 1 : -1;
    let dur = 1;
    if (m[3] === ".") dur = 1.5;
    else if (m[3] === "-") dur = 2;
    else if (m[3] === "--") dur = 3;
    else if (m[3] === "---") dur = 4;
    else if (m[3] === "/2") dur = 0.5;
    else if (m[3] === "/4") dur = 0.25;
    const out = { d: digit, oct, dur, tie: !!m[4], mark: m[5] || "" };
    return out;
  }

  /** 解析整段谱。opts: {text, key, meter, bpm} */
  function parse(opts) {
    const key = opts.key;
    const table = buildTable(key);
    const meter = opts.meter || "4/4";
    const num = parseInt(meter.split("/")[0], 10);
    const den = parseInt(meter.split("/")[1], 10);
    if (den !== 4 && den !== 8) throw new Error("暂只支持 4 分/8 分为单位拍: " + meter);
    const beatUnit = den === 4 ? 1 : 0.5; // 一拍 = 几个四分音符时值

    const barsRaw = String(opts.text).split("|").map((s) => s.trim()).filter((s) => s.length);
    const notes = [];
    const bars = [];
    let curBow = "拉";
    let inSlur = false;

    barsRaw.forEach((barText, bi) => {
      const barNotes = [];
      let beatInBar = 0;
      barText.split(/\s+/).filter(Boolean).forEach((tok) => {
        // 独立增时线 "5 - "：给前一音加 1 拍（与贴写 "5-" 等价）
        if (/^-{1,3}$/.test(tok)) {
          const prev = notes[notes.length - 1];
          if (!prev) return;
          prev.dur += tok.length;
          if (barNotes.length) barNotes[barNotes.length - 1].dur = prev.dur;
          beatInBar += tok.length * beatUnit;
          return;
        }
        const t = parseToken(tok);
        if (t.tie && notes.length) {
          const prev = notes[notes.length - 1];
          prev.dur += t.dur;
          prev.tie = true;
          if (barNotes.length) barNotes[barNotes.length - 1].dur = prev.dur;
          return;
        }
        const note = {
          d: t.d, oct: t.oct,
          midi: t.d === "0" ? null : N().degToMidi(t.d, t.oct, key),
          dur: t.dur, tie: false,
          bar: bi + 1, beat: +(beatInBar + 1).toFixed(3),
        };
        if (note.midi != null) {
          note.p = N().midiToNote(note.midi);
          const auto = table[note.midi];
          note.s = auto ? auto.s : "";
          note.f = auto ? auto.f : "";
        } else { note.p = ""; note.s = ""; note.f = ""; note.rest = true; }

        // 弓法：显式 > 连弓延续 > 自动交替
        const mark = t.mark;
        let bow = "";
        let finger = "";
        for (const ch of mark) {
          if (ch === "拉" || ch === "推" || ch === "连") bow += ch;
          else finger += ch;
        }
        if (bow === "拉" || bow === "推") { curBow = bow; inSlur = false; }
        else if (bow === "连") { inSlur = true; }
        else if (!inSlur) { curBow = curBow === "拉" ? "推" : "拉"; }
        note.b = curBow;
        note.slur = inSlur;

        if (finger) {
          if (finger[0] === "内" || finger[0] === "外") {
            note.s = finger[0];
            note.f = finger.slice(1);
          } else note.f = finger;
        }
        notes.push(note);
        barNotes.push(note);
        beatInBar += t.dur * beatUnit;
      });
      bars.push(barNotes);
    });

    const totalBeats = notes.reduce((a, n) => a + n.dur, 0) * beatUnit;
    return { notes, bars, meter, num, den, beatUnit, totalBeats, key };
  }

  /** 渲染辅助：八度点 CSS 类 */
  function octClass(oct) { return oct > 0 ? "hi" : oct < 0 ? "lo" : ""; }

  ET.jianpu = { parse, octClass, buildTable };
})();

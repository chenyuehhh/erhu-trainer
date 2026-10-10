/* core/notation.js — 音名 / 频率 / 音分 / 简谱度数换算 */
(function () {
  "use strict";
  const ET = (window.ET = window.ET || {});

  const STEP = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const DEGREE = [0, 2, 4, 5, 7, 9, 11]; // 简谱 1-7 相对主音的半音数

  /** "A4" / "C#5" / "Bb3" -> midi 号 */
  function noteToMidi(name) {
    const m = /^([A-Ga-g])([#b]?)(-?\d)$/.exec(String(name).trim());
    if (!m) throw new Error("坏音名: " + name);
    let v = STEP[m[1].toUpperCase()];
    if (m[2] === "#") v += 1;
    if (m[2] === "b") v -= 1;
    return (parseInt(m[3], 10) + 1) * 12 + v;
  }

  function midiToNote(midi) {
    const n = Math.round(midi);
    return NAMES[((n % 12) + 12) % 12] + (Math.floor(n / 12) - 1);
  }

  function midiToFreq(midi, a4) { return (a4 || 440) * Math.pow(2, (midi - 69) / 12); }
  function noteToFreq(name, a4) { return midiToFreq(noteToMidi(name), a4); }

  /** 频率 -> 最近音级 + 音分偏差 */
  function freqToNearest(freq, a4) {
    const exact = 69 + 12 * Math.log2(freq / (a4 || 440));
    const nearest = Math.round(exact);
    return { midi: nearest, name: midiToNote(nearest), cents: Math.round((exact - nearest) * 100) };
  }

  /** 两音音分差 */
  function centsBetween(f1, f2) { return Math.round(1200 * Math.log2(f1 / f2)); }

  /** 调号 -> 主音 midi（主音统一取第 4 八度，覆盖二胡常用调） */
  const TONIC_PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9 };
  function keyTonicMidi(key) {
    const k = String(key).trim();
    let pc, flat = false;
    if (/^b?[A-G]/.test(k)) {
      flat = k[0] === "b";
      const letter = flat ? k[1] : k[0];
      pc = STEP[letter];
      if (flat) pc -= 1;
    } else {
      throw new Error("坏调号: " + key);
    }
    return 60 + ((pc % 12) + 12) % 12; // C4..B4
  }

  /** 简谱数字 + 八度点 -> midi。digitStr: "1"-"7"，oct: -1/0/+1 */
  function degToMidi(digit, oct, key) {
    const idx = parseInt(digit, 10) - 1;
    if (idx < 0 || idx > 6) throw new Error("坏简谱数字: " + digit);
    return keyTonicMidi(key) + DEGREE[idx] + 12 * (oct || 0);
  }

  ET.notation = {
    STEP, NAMES, DEGREE,
    noteToMidi, midiToNote, midiToFreq, noteToFreq,
    freqToNearest, centsBetween, keyTonicMidi, degToMidi,
  };
})();

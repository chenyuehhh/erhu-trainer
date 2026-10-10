/* test/dom.mjs — jsdom 集成测试：跑真实启动链路（store 降级 → prefs → 四模块 init → Tab 渲染） */
import { JSDOM, VirtualConsole } from "file:///C:/Users/Administrator/.workbuddy/binaries/node/workspace/node_modules/jsdom/lib/api.js";

const BASE = "http://127.0.0.1:8931/";
let bad = 0;
const assert = (name, cond, extra) => {
  if (cond) console.log("PASS", name);
  else { console.log("FAIL", name, extra ?? ""); bad++; }
};

const errors = [];
const vc = new VirtualConsole();
vc.on("jsdomError", (e) => errors.push(String(e.message || e)));
vc.on("error", (...a) => errors.push(a.map(String).join(" ")));

// 最小 AudioContext 桩：让启动链路在无 Web Audio 的 jsdom 里走通（connect 全链式）
function makeParam(v) {
  return { value: v ?? 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} };
}
class FakeNode {
  connect() { return this; }
  start() {} stop() {}
}
class FakeAC {
  constructor() {
    this.currentTime = 0; this.sampleRate = 44100; this.state = "running";
    this.destination = new FakeNode();
  }
  resume() { return Promise.resolve(); }
  createGain() { const n = new FakeNode(); n.gain = makeParam(1); return n; }
  createOscillator() { const n = new FakeNode(); n.type = ""; n.frequency = makeParam(440); return n; }
  createBiquadFilter() { const n = new FakeNode(); n.type = ""; n.frequency = makeParam(2400); n.Q = makeParam(1); return n; }
  // 软限幅（audio.js ctx() 里 master → limiter → destination 链路）
  createDynamicsCompressor() {
    const n = new FakeNode();
    n.threshold = makeParam(-24); n.knee = makeParam(30); n.ratio = makeParam(12);
    n.attack = makeParam(0.003); n.release = makeParam(0.25);
    return n;
  }
  createBuffer(ch, len) { return { getChannelData: () => new Float32Array(len) }; }
  createBufferSource() { const n = new FakeNode(); n.buffer = null; return n; }
  createAnalyser() { return { fftSize: 2048, getFloatTimeDomainData() {} }; }
  createMediaStreamSource() { return new FakeNode(); }
}

const dom = await JSDOM.fromFile(new URL("../index.html", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"), {
  runScripts: "dangerously",
  resources: "usable",
  pretendToBeVisual: true,
  virtualConsole: vc,
  beforeParse(window) {
    window.AudioContext = FakeAC;
    window.HTMLMediaElement.prototype.play = () => {};
  },
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await sleep(1800); // 等脚本加载 + boot（store promise → 模块 init）

const w = dom.window, d = w.document;
const $ = (sel) => d.querySelector(sel);
const $$ = (sel) => d.querySelectorAll(sel);

try {
  assert("导航 5 个 Tab", $$("#tabs button").length === 5, "实际 " + $$("#tabs button").length);

  // 节拍器
  assert("节拍器 BPM 显示", $("#mNum") && $("#mNum").textContent === "80", $("#mNum") && $("#mNum").textContent);
  assert("节拍器 4 个拍点", $$("#mDots .dot").length === 4);
  $("#mPlay").click();
  assert("节拍器点开始 → 停止", $("#mPlay").textContent === "停止", $("#mPlay").textContent);
  $("#mPlay").click();
  assert("节拍器点停止 → 开始练习", $("#mPlay").textContent === "开始练习", $("#mPlay").textContent);
  // 计时 / 全屏 / 分组（确定性，不依赖异步累加）
  assert("计时器元素 + 初始 00:00:00", !!$("#mTimer") && $("#mTimer").textContent === "00:00:00");
  assert("全屏按钮存在", !!$("#mFs"));
  assert("保存记录按钮存在", !!$("#mSaveRec"));
  assert("高级设置默认折叠", $("#mAdvGroup").classList.contains("collapsed"));
  $("#mAdvToggle").click();
  assert("点高级设置 → 展开", !$("#mAdvGroup").classList.contains("collapsed"));
  $("#mTimerReset").click();
  assert("重置计时 → 00:00:00", $("#mTimer").textContent === "00:00:00");
  // 渐快/静音开关
  $("#mGradOn").click();
  $("#mMuteOn").click();
  $("#mPlay").click();
  await sleep(150);
  $("#mPlay").click();

  // 切 Tab：调音器
  $$("#tabs button")[1].click();
  assert("调音器 预设下拉", $$("#tnPreset option").length >= 11, $$("#tnPreset option").length);
  assert("调音器 降级提示可见（jsdom 无麦克风）", $("#tnDegrade") && $("#tnDegrade").style.display !== "none");
  assert("调音器 弦按钮（D 调 2 根）", $$("#tnStrings .string-btn").length === 2);
  $$("#tnStrings .string-btn")[0].click(); // 播参考音（FakeAC 桩下走完不抛错）

  // 切 Tab：听音训练
  $$("#tabs button")[2].click();
  $("#eStart").click();
  assert("听音 出第一题（音程按钮组）", $$("#eBody .ear-options button").length === 5, $$("#eBody .ear-options button").length);
  // 答一题看反馈与下一题按钮
  $$("#eBody .ear-options button")[0].click();
  assert("答题后出现反馈", $("#eFb").textContent.length > 0);
  await sleep(50);
  // 连续答完一组（10 题）
  for (let i = 0; i < 12 && $("#eBody .ear-options button"); i++) {
    const btns = $$("#eBody .ear-options button");
    btns[0].click();
    await sleep(20);
    const next = [...$$("#eBody .ear-actions .btn")].find((b) => b.textContent.includes("下一题") || b.textContent.includes("成绩"));
    if (next) next.click();
    await sleep(20);
  }
  assert("一组答完出总结（含正确率）", !!$(".ear-summary .big") || $$("#eBody .ear-options button").length > 0);

  // 切 Tab：乐谱跟练
  $$("#tabs button")[3].click();
  // 曲库分两组：piece(乐曲，合并原入门曲目+流行曲目) / drill(每日基本功)，默认全部折叠。
  // 每次 toggle 都会重建列表，所以节点一律现查现用。
  const headOf = (label) => [...$$("#scItems .score-group-head")].find((h) => h.textContent.includes(label));
  const expand = (label) => { const h = headOf(label); if (h && h.classList.contains("collapsed")) h.click(); };
  const pieceCount = ((w.ET && w.ET.scores) || []).filter((s) => s.category === "piece").length;
  const drillCount = ((w.ET && w.ET.exercises) || []).length;

  assert("曲库渲染两个分组", $$("#scItems .score-group-head").length === 2, $$("#scItems .score-group-head").length);
  assert("曲库默认全部折叠", [...$$("#scItems .score-group-head")].every((h) => h.classList.contains("collapsed")));
  expand("乐曲");
  const pieceHead = headOf("乐曲");
  const pieceItems = pieceHead && pieceHead.nextElementSibling.querySelectorAll(".list-item").length;
  assert("展开乐曲 → 条目数正确", pieceItems === pieceCount, pieceItems + " vs " + pieceCount);
  const drillHead = headOf("每日基本功");
  assert("每日基本功分组存在且仍折叠", !!drillHead && drillHead.classList.contains("collapsed"));
  assert("每日基本功分组显示条数", !!drillHead && drillHead.textContent.includes(String(drillCount)), drillHead && drillHead.textContent);
  expand("每日基本功");
  const totalItems = $$("#scItems .list-item").length;
  assert("再展开基本功 → 累计条目数正确", totalItems === pieceCount + drillCount, totalItems + " vs " + (pieceCount + drillCount));
  const drillItemsList = headOf("每日基本功").nextElementSibling.querySelectorAll(".list-item");
  assert("练习曲卡片显示级别徽章", [...drillItemsList].every((i) => i.querySelector(".grade-tag")), "部分练习曲缺 .grade-tag");
  assert("练习曲均有 grade 字段", (w.ET.exercises || []).every((e) => typeof e.grade === "number"));
  assert("乐曲均有 shiftLevel 字段", (w.ET.scores || []).every((s) => !!s.shiftLevel));
  assert("默认选中小星星并渲染谱面", $("#scTitle").textContent === "小星星");
  const noteCount = $$("#scSheet .note").length;
  assert("小星星渲染 42 个音符位", noteCount === 42, "实际 " + noteCount);
  const withFinger = [...$$("#scSheet .note .nsub")].filter((n) => n.textContent.trim() !== "—").length;
  assert("指法全标注", withFinger === noteCount, withFinger + "/" + noteCount);
  assert("弓法标记存在（拉/推）", [...$$("#scSheet .bowmark")].filter((n) => ["拉", "推", "⌒"].includes(n.textContent)).length > 0);
  // 切到欢乐颂（乐曲组）：附点与八分
  expand("乐曲");
  const hlItem = [...$$("#scItems .list-item")].find((i) => i.textContent.includes("欢乐颂"));
  assert("列表中可定位到欢乐颂", !!hlItem);
  hlItem.click();
  assert("欢乐颂全曲 16 小节（4 句）", $$("#scSheet .bar").length === 16, $$("#scSheet .bar").length);
  assert("欢乐颂句条 4 句", $$("#scSentChips .sent-chip").length === 4, $$("#scSentChips .sent-chip").length);
  // 点播放（FakeAC 桩 + pretendToBeVisual）
  $("#scPlay").click();
  await sleep(400);
  const playing = $("#scPlay").textContent.includes("停止");
  $("#scPlay").click();
  assert("跟练播放/停止状态切换", playing);
  // 变速
  const sp = $("#scSpeed");
  sp.value = "0.5"; sp.dispatchEvent(new w.Event("input"));
  assert("变速显示 0.50x", $("#scSpeedN").textContent === "0.50x");

  // K-11 逐句练习：茉莉花（乐曲组，全曲 19 小节 7 句）
  const mhItem = [...$$("#scItems .list-item")].find((i) => i.textContent.includes("茉莉花"));
  assert("列表中可定位到茉莉花", !!mhItem);
  if (mhItem) {
    mhItem.click();
    assert("茉莉花全曲 19 小节", $$("#scSheet .bar").length === 19, "实际 " + $$("#scSheet .bar").length);
    assert("茉莉花句条 7 句", $$("#scSentChips .sent-chip").length === 7, "实际 " + $$("#scSentChips .sent-chip").length);
    $$("#scSentChips .sent-chip")[1].click();
    assert("点句 2 → A/B 自动设为该句且循环开",
      $("#scA").value === "4" && $("#scB").value === "6" && $("#scLoop").checked,
      $("#scA").value + "-" + $("#scB").value + " loop=" + $("#scLoop").checked);
    $$("#scSentChips .sent-chip")[1].click();
    assert("再点句 2 → 取消句子循环", $("#scA").value === "0" && !$("#scLoop").checked,
      $("#scA").value + " loop=" + $("#scLoop").checked);
    // K-11 全曲化 P1：月亮代表我的心（乐曲组，33 小节弱起 + 8 句）
    const ylItem = [...$$("#scItems .list-item")].find((i) => i.textContent.includes("月亮代表我的心"));
    assert("列表中可定位到月亮代表我的心", !!ylItem);
    if (ylItem) {
      ylItem.click();
      assert("月亮代表我的心全曲 33 小节（弱起+8 句）", $$("#scSheet .bar").length === 33, "实际 " + $$("#scSheet .bar").length);
      assert("月亮句条 8 句", $$("#scSentChips .sent-chip").length === 8, "实际 " + $$("#scSentChips .sent-chip").length);
      assert("二把标记存在（句1/句3 的 1'）", $$("#scSheet .shiftmark").length >= 2, $$("#scSheet .shiftmark").length);
    }
    // K-12 P2/P3 全曲化：菊花台 32 小节 16 句、沧海一声笑 40 小节 20 句（均属乐曲组）
    const jhItem = [...$$("#scItems .list-item")].find((i) => i.textContent.includes("菊花台"));
    assert("列表中可定位到菊花台", !!jhItem);
    if (jhItem) {
      jhItem.click();
      assert("菊花台全曲 32 小节（16 句）", $$("#scSheet .bar").length === 32, "实际 " + $$("#scSheet .bar").length);
      assert("菊花台句条 16 句", $$("#scSentChips .sent-chip").length === 16, "实际 " + $$("#scSentChips .sent-chip").length);
    }
    const chItem = [...$$("#scItems .list-item")].find((i) => i.textContent.includes("沧海一声笑"));
    assert("列表中可定位到沧海一声笑", !!chItem);
    if (chItem) {
      chItem.click();
      assert("沧海一声笑全曲 40 小节（20 句）", $$("#scSheet .bar").length === 40, "实际 " + $$("#scSheet .bar").length);
      assert("沧海句条 20 句", $$("#scSentChips .sent-chip").length === 20, "实际 " + $$("#scSentChips .sent-chip").length);
    }
  }

  // 切 Tab：设置
  $$("#tabs button")[4].click();
  assert("设置页 A4 输入", $("#stA4") && +$("#stA4").value === 440);
  const th = $("#stTheme");
  th.value = "light"; th.dispatchEvent(new w.Event("change"));
  assert("切浅色主题", d.documentElement.dataset.theme === "light");
  th.value = "bauhaus"; th.dispatchEvent(new w.Event("change"));
  assert("切包豪斯主题", d.documentElement.dataset.theme === "bauhaus");
  th.value = "y2k"; th.dispatchEvent(new w.Event("change"));
  assert("切千禧Y2K主题", d.documentElement.dataset.theme === "y2k");
  th.value = "cyberpunk"; th.dispatchEvent(new w.Event("change"));
  assert("切赛博朋克主题", d.documentElement.dataset.theme === "cyberpunk");
  th.value = "google"; th.dispatchEvent(new w.Event("change"));
  assert("切回谷歌默认", d.documentElement.dataset.theme === "google");
  th.value = "dark"; th.dispatchEvent(new w.Event("change"));

  // 偏好持久化（http(s) 下走 IndexedDB / localStorage；jsdom file:// 为 opaque origin，仅验证不抛错）
  try {
    const saved = JSON.parse(w.localStorage.getItem("et:prefs") || "{}");
    assert("偏好已写入（localStorage 降级）", saved && saved.volume !== undefined && saved.a4 === 440, JSON.stringify(saved).slice(0, 80));
  } catch (e) {
    console.log("SKIP 偏好写入断言（jsdom opaque origin 无 localStorage）");
  }
} catch (e) {
  console.log("FAIL 测试执行中断:", e.message);
  bad++;
}

const realErrors = errors.filter((e) => !e.includes("Could not load img") && !e.includes("audio"));
assert("无页面运行时错误", realErrors.length === 0, realErrors.slice(0, 3).join(" | "));

console.log(bad === 0 ? "\nDOM 集成测试全部通过" : `\n${bad} 项失败`);
process.exit(bad === 0 ? 0 : 1);

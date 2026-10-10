/* modules/score.js — 乐谱跟练（S-01 ~ S-10 + F-01~F-05）
   交互重构（跟练场景 v2）：乐谱为主视觉，演奏提示就近附着在谱面
   设计要点（参考全民 K 歌「整句高亮」）：
   - 小节级底色高亮：当前演奏小节整段低透明度底色，框住演奏区域；不做单音逐音变色（避免高速视觉过载）
   - 可选小节内节拍竖线（默认关）：跟随节拍在小节内从左向右移动，指示小节内位置
   - 切换提示（换弦/换把）就近附着在谱面小节线左侧：前一小节预亮、本小节实高亮
   - 乐谱自动居中滚动：当前高亮小节保持在视口正中
   - 顶部信号灯条降级为「全局时间轴」：仅标记切换点 + 点击/拖拽跳转，不再主预警；全屏默认隐藏
   - 四开关：小节高亮 / 节拍竖线 / 切换标记 / 顶部时间轴
   - 全屏图谱联动：隐藏曲库、默认隐藏时间轴；保留居中滚动 / 小节高亮 / 切换标记 / 核心控件
*/
(function () {
  "use strict";
  const ET = (window.ET = window.ET || {});

  ET.Modules = ET.Modules || {};
  ET.Modules.score = {
    init(el) {
      const P = ET.prefs;
      const S = {
        speed: P.get("sSpeed", 1),
        bowShow: P.get("sBow", true),
        strColor: P.get("sStr", true),
        timbre: P.get("sTimbre", "sawtooth"),
        countIn: P.get("sCount", true),
        metroOn: P.get("sMetro", false),
        metroVol: P.get("sMetroVol", 0.4),
        beatFlash: P.get("sBeatFlash", true),
        transpose: P.get("sTranspose", 0),
        highlight: P.get("sHighlight", true),
        beatLine: P.get("sBeat", false),
        marks: P.get("sMarks", true),
        shiftMarks: P.get("sShiftMarks", false),
        timeline: P.get("sTimeline", true),
        lyric: P.get("sLyric", false),
        lyricFloat: P.get("sLyricFloat", true), // 歌词行（谱面上方独立区域）：有词曲目默认显示
        loop: false, barA: 0, barB: 0,
        // 旧版「节拍(B)」模式已移除：历史存档迁移为示范(A)；仅示范(A)/静音(C)两档
        practiceMode: P.get("sPracticeMode", "A") === "C" ? "C" : "A",
      };
      const st = {
        cur: null, parsed: null, events: null, idx: 0, base: 0,
        playing: false, raf: 0, startBar: 1, sched: null, mic: null, micOn: false,
        segs: null, sheetMarks: [], barEvents: null, fsTimeline: false,
        sigSegs: [], sigCursor: null, beatLine: null,
        timer: { acc: 0, last: 0, running: false, iv: 0 },
        beatTimers: [],
        sentences: null, curSentence: null,
      };
      st.beatLine = document.createElement("div");
      st.beatLine.className = "beat-line";

      el.innerHTML = `
        <div class="grid-side">
          <div class="card" id="scList">
            <div class="score-lib-head">
              <h3>曲库</h3>
              <input type="search" id="scSearch" class="score-search" placeholder="搜索曲名">
            </div>
            <div class="score-filters" id="scFilters">
              <div class="row filter-row">
                <span class="vlab">调号</span>
                <div class="seg key-seg" id="scKeySeg">
                  <button data-v="" class="on">全部</button>
                  <button data-v="D">D 调</button>
                  <button data-v="G">G 调</button>
                  <button data-v="F">F 调</button>
                </div>
              </div>
              <div class="row filter-row">
                <span class="vlab">类型</span>
                <div class="seg type-seg" id="scTypeSeg">
                  <button data-v="" class="on">全部</button>
                  <button data-v="piece">乐曲</button>
                  <button data-v="drill">基本功</button>
                </div>
              </div>
              <div class="row filter-row">
                <span class="vlab">换把</span>
                <div class="seg shift-seg" id="scShiftSeg">
                  <button data-v="" class="on">全部</button>
                  <button data-v="none">一把位</button>
                  <button data-v="few">少量</button>
                  <button data-v="many">频繁</button>
                </div>
              </div>
            </div>
            <div class="score-recent" id="scRecent"></div>
            <div id="scItems"></div>
          </div>
          <div>
            <div class="card" style="margin-bottom:14px">
              <div class="score-fs-top" id="scFsTop">
                <b class="score-fs-title" id="scFsTitle">—</b>
                <div class="score-fs-actions">
                  <button class="btn small ghost" id="scFsReset" type="button" title="练习计时清零">↺</button>
                  <button class="btn small ghost" id="scFsFull" type="button" title="退出全屏图谱 (Esc)">✕</button>
                </div>
                <span class="score-timer score-fs-timer" id="scTimer">00:00:00</span>
              </div>
              <div class="row spread sc-head-row">
                <div class="row" style="gap:14px">
                  <b id="scTitle" style="font-size:17px">—</b>
                  <span class="shift-hint" id="scShiftHint" hidden>本曲包含换把技巧</span>
                  <span class="badge" id="scMeta"></span>
                </div>
                <button class="btn primary" id="scPlay" style="min-width:96px">▶ 播放</button>
                <button class="btn small ghost" id="scFull" title="全屏图谱模式（Esc 退出）">⛶ 全屏图谱</button>
              </div>
              <div class="sc-goal" id="scGoal" hidden></div>
              <div class="score-toolbar">
                <div class="row speed-row">
                  <span class="vlab">速度</span>
                  <input type="range" id="scSpeed" min="0.5" max="1.5" step="0.05" class="grow">
                  <b class="mono" id="scSpeedN"></b>
                  <button class="btn small ghost" id="scSlow">－</button>
                  <button class="btn small ghost" id="scFast">＋</button>
                </div>
                <div class="row mode-row">
                  <span class="vlab">模式</span>
                  <div class="seg mode-seg" id="scModeSeg">
                    <button data-v="A" class="on">示范</button>
                    <button data-v="C">静音</button>
                  </div>
                </div>
                <div class="row loop-row">
                  <label class="field">A 小节<input type="number" id="scA" min="0" style="width:64px" value="0"></label>
                  <button class="btn small" id="scSetA">设 A</button>
                  <label class="field">B 小节<input type="number" id="scB" min="0" style="width:64px" value="0"></label>
                  <button class="btn small" id="scSetB">设 B</button>
                  <label class="switch"><input type="checkbox" id="scLoop"><span class="track"></span>循环</label>
                  <span class="tiny">0 = 从头/到尾</span>
                </div>
                <div class="row toggles-row">
                  <label class="switch"><input type="checkbox" id="scCount"><span class="track"></span>预备拍</label>
                  <label class="switch"><input type="checkbox" id="scMetro"><span class="track"></span>节拍器叠加</label>
                  <label class="switch"><input type="checkbox" id="scBeatFlash"><span class="track"></span>拍点闪烁</label>
                  <label class="switch"><input type="checkbox" id="scBow"><span class="track"></span>弓法</label>
                  <label class="switch"><input type="checkbox" id="scStr"><span class="track"></span>弦别染色</label>
                  <label class="switch"><input type="checkbox" id="scHighlight"><span class="track"></span>小节高亮</label>
                  <label class="switch"><input type="checkbox" id="scBeat"><span class="track"></span>节拍竖线</label>
                  <label class="switch"><input type="checkbox" id="scMarks"><span class="track"></span>切换标记</label>
                  <label class="switch" id="scShiftWrap"><input type="checkbox" id="scShift"><span class="track"></span>换把标记</label>
                  <label class="switch"><input type="checkbox" id="scTimeline"><span class="track"></span>顶部时间轴</label>
                  <label class="switch"><input type="checkbox" id="scLyric"><span class="track"></span>显示歌词</label>
                  <label class="switch"><input type="checkbox" id="scLyricFloat"><span class="track"></span>悬浮歌词</label>
                  <label class="field">移调
                    <select id="scTr"></select>
                  </label>
                  <label class="field">音色
                    <select id="scTimbre">
                      <option value="sawtooth">弦乐（锯齿）</option>
                      <option value="triangle">三角</option>
                      <option value="sine">正弦</option>
                    </select>
                  </label>
                  <button class="btn small" id="scPitchBtn">音准反馈</button>
                </div>
              </div>
              <div class="sentbar" id="scSentBar" style="display:none">
                <span class="sentbar-chip">练习句</span>
                <span class="sentbar-chips" id="scSentChips"></span>
                <span class="sentbar-cap" id="scSentCap"></span>
              </div>
              <div class="sigbar" id="scSig">
                <div class="sigbar-head">
                  <b class="sigbar-title">全局时间轴</b>
                  <span class="sigbar-cap" id="scSigCap">—</span>
                  <span class="sigbar-legend">
                    <span><i class="lg lg-inner"></i>内弦</span>
                    <span><i class="lg lg-outer"></i>外弦</span>
                    <span><i class="lg lg-mix"></i>混弦</span>
                    <span><i class="lg lg-chg"></i>切换点</span>
                  </span>
                </div>
                <div class="sigbar-track" id="scSigTrack"></div>
              </div>
              <div class="beatbar" id="scBeatBar" style="display:none" aria-hidden="true">
                <span class="beatbar-chip">拍点</span>
                <span class="beatbar-dots" id="scBeatDots"></span>
                <span class="beatbar-info" id="scBeatInfo">—</span>
              </div>
              <div class="lyric-float" id="scLyricK" style="display:none"></div>
              <div class="score-scroll" id="scScroll">
                <div class="score-empty" id="scEmpty">从左侧选择曲目或基本功</div>
                <div class="score-sheet" id="scSheet"></div>
                <div style="text-align:center; padding:10px 0 0">
                  <span class="tiny" id="scPos"></span>
                  <div id="scCountBadge" class="badge" style="display:none; font-size:20px; padding:4px 16px"></div>
                </div>
              </div>
              <!-- 全屏轻触/上滑唤起控制面板的透明热区 -->
              <div class="score-fs-touch" id="scFsTouch"></div>

              <!-- 全屏悬浮核心控制面板（手机端默认隐藏） -->
              <div class="score-fs-float collapsed" id="scFsFloat" aria-hidden="true">
                <div class="score-fs-float-inner">
                  <div class="score-fs-core">
                    <button class="btn primary" id="scFsPlay" style="min-width:96px">▶ 播放</button>
                    <div class="row speed-row" style="gap:8px; flex:1">
                      <span class="vlab">速度</span>
                      <input type="range" id="scFsSpeed" min="0.5" max="1.5" step="0.05" class="grow">
                      <b class="mono" id="scFsSpeedN"></b>
                    </div>
                    <div class="row mode-row">
                      <div class="seg mode-seg" id="scFsModeSeg">
                        <button data-v="A" class="on">示范音乐</button>
                        <button data-v="C">无声跟练</button>
                      </div>
                    </div>
                    <button class="btn small ghost" id="scFsMore" type="button">更多设置</button>
                    <button class="score-fs-close" id="scFsClose" type="button" title="收起控制栏">▾</button>
                  </div>
                </div>
              </div>

              <!-- 全屏高级设置弹窗 -->
              <div class="score-fs-modal" id="scFsModal" aria-hidden="true">
                <div class="score-fs-modal-inner">
                  <div class="score-fs-modal-head">
                    <b>更多设置</b>
                    <button class="btn small ghost" id="scFsModalClose" type="button">关闭</button>
                  </div>
                  <div class="score-fs-modal-body">
                  <div class="row loop-row">
                    <label class="field">A 小节<input type="number" id="scFsA" min="0" style="width:64px" value="0"></label>
                    <button class="btn small" id="scFsSetA">设 A</button>
                    <label class="field">B 小节<input type="number" id="scFsB" min="0" style="width:64px" value="0"></label>
                    <button class="btn small" id="scFsSetB">设 B</button>
                    <label class="switch"><input type="checkbox" id="scFsLoop"><span class="track"></span>循环</label>
                    <span class="tiny">0 = 从头/到尾</span>
                  </div>
                  <div class="row toggles-row">
                    <label class="switch"><input type="checkbox" id="scFsCount"><span class="track"></span>预备拍</label>
                    <label class="switch"><input type="checkbox" id="scFsMetro"><span class="track"></span>节拍器叠加</label>
                    <label class="switch"><input type="checkbox" id="scFsBeatFlash"><span class="track"></span>拍点闪烁</label>
                    <label class="switch"><input type="checkbox" id="scFsBow"><span class="track"></span>弓法</label>
                    <label class="switch"><input type="checkbox" id="scFsStr"><span class="track"></span>弦别染色</label>
                    <label class="switch"><input type="checkbox" id="scFsHighlight"><span class="track"></span>小节高亮</label>
                    <label class="switch"><input type="checkbox" id="scFsBeat"><span class="track"></span>节拍竖线</label>
                    <label class="switch"><input type="checkbox" id="scFsMarks"><span class="track"></span>切换标记</label>
                    <label class="switch" id="scFsShiftWrap"><input type="checkbox" id="scFsShift"><span class="track"></span>换把标记</label>
                    <label class="switch"><input type="checkbox" id="scFsTimeline"><span class="track"></span>顶部时间轴</label>
                    <label class="switch"><input type="checkbox" id="scFsLyric"><span class="track"></span>谱面歌词</label>
                    <label class="switch"><input type="checkbox" id="scFsLyricFloat"><span class="track"></span>歌词行</label>
                    <label class="field">移调
                      <select id="scFsTr"></select>
                    </label>
                    <label class="field">音色
                      <select id="scFsTimbre">
                        <option value="sawtooth">弦乐</option>
                        <option value="triangle">三角</option>
                        <option value="sine">正弦</option>
                      </select>
                    </label>
                    <button class="btn small" id="scFsPitchBtn">音准反馈</button>
                  </div>
                </div>
              </div>
              </div>
              <div class="pitch-panel" id="scPitch">
                <div class="pitch-read">
                  <span class="cents" id="scCents">0</span>
                  <span class="nn" id="scNN">—</span>
                </div>
                <div class="needle-scale">
                  <div class="rail"></div><div class="good"></div>
                  ${[-50, -25, 0, 25, 50].map((v) => `<div class="tick" style="left:${50 + v}%"></div><div class="mark" style="left:${50 + v}%">${v > 0 ? "+" + v : v}</div>`).join("")}
                  <div class="needle" id="scNeedle"></div>
                </div>
                <div class="pitch-target" id="scTarget">检测未启动</div>
              </div>
            </div>
            <div class="tiny">乐谱居中跟随播放，无需手动滚动；当前小节整段高亮即为演奏位置。点击任意小节可设为起始位置并居中；空格播放/停止；<b>[</b> 设 A 点、<b>]</b> 设 B 点；变速不变调。</div>
          </div>
        </div>`;

      const $ = (id) => el.querySelector("#" + id);
      const sheet = $("scSheet"), scroll = $("scScroll");
      const a4 = () => P.get("a4", 440);

      // ---------- 辅助：同步写入 ----------
      function setSpeed(v) {
        v = Math.max(0.5, Math.min(1.5, v));
        S.speed = v;
        $("scSpeed").value = v; $("scFsSpeed").value = v;
        const t = v.toFixed(2) + "x";
        $("scSpeedN").textContent = t; $("scFsSpeedN").textContent = t;
        P.set("sSpeed", v);
      }
      function setHighlight(on) { S.highlight = on; P.set("sHighlight", on); applyToggles(); }
      function setBeatLine(on) { S.beatLine = on; P.set("sBeat", on); applyToggles(); }
      function setMarks(on) { S.marks = on; P.set("sMarks", on); applyToggles(); }
      function setShiftMarks(on) { S.shiftMarks = on; P.set("sShiftMarks", on); applyToggles(); }
      function setBeatFlash(on) { S.beatFlash = on; P.set("sBeatFlash", on); applyToggles(); }
      function setTimeline(on) {
        if (el.classList.contains("score-fullscreen")) st.fsTimeline = on;
        else S.timeline = on;
        P.set("sTimeline", S.timeline);
        applyToggles();
      }
      function setMode(v) {
        if (!"AC".includes(v)) return; // 「节拍」模式已移除（与节拍器叠加重复，K-09）
        S.practiceMode = v;
        P.set("sPracticeMode", v);
        applyToggles();
      }

      // ---------- 练习计时 ----------
      function fmtTimer(ms) {
        const s = Math.floor(ms / 1000);
        const hh = String(Math.floor(s / 3600)).padStart(2, "0");
        const mm = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
        const ss = String(s % 60).padStart(2, "0");
        return `${hh}:${mm}:${ss}`;
      }
      function timerNow() { return st.timer.acc + (st.timer.running ? performance.now() - st.timer.last : 0); }
      function timerTick() { const t = $("scTimer"); if (t) t.textContent = fmtTimer(timerNow()); }
      function timerStart() {
        if (st.timer.running) return;
        st.timer.running = true; st.timer.last = performance.now();
        st.timer.iv = setInterval(timerTick, 250);
      }
      function timerPause() {
        if (!st.timer.running) return;
        st.timer.acc += performance.now() - st.timer.last;
        st.timer.running = false; clearInterval(st.timer.iv); timerTick();
      }
      function timerReset() {
        st.timer.acc = 0;
        if (st.timer.running) st.timer.last = performance.now();
        const t = $("scTimer"); if (t) t.textContent = "00:00:00";
      }

      // ---------- 曲库 ----------
      const items = [...ET.scores, ...ET.exercises];
      const F = { search: "", key: "", type: "", shift: "" };
      const groupMeta = { piece: "乐曲", drill: "每日基本功" };
      // V2：分类默认全部收起（旧 key scoreGroups 里存的老状态作废，点开后仍记忆）
      const groupState = P.get("scoreGroupsV2", { piece: false, drill: false });
      let recents = P.get("scoreRecents", []);

      // ---------- 换把检测（音符级） ----------
      const CN_POS = ["零", "一", "二", "三", "四", "五", "六", "七"];
      // 逐音对比把位：把位变化即挂 n.shift = { isShift:true, fromPos, toPos }（换把在「前音结束后、本音演奏前」完成，标记在到达音上）；
      // 休止符不挂标记（rest 期间换把合法，prevPos 穿越 rest 传递）；把位未知的音不标记也不打断把位序列。
      function attachShifts(parsed) {
        let prev = null;
        parsed.notes.forEach((n) => {
          if (n.rest) { n.shift = null; return; }
          const p = notePos(n);
          if (p == null) { n.shift = null; return; }
          n.shift = prev != null && p !== prev ? { isShift: true, fromPos: prev, toPos: p } : null;
          prev = p;
        });
        return parsed;
      }
      function scoreHasShift(item) {
        try {
          const p = attachShifts(ET.jianpu.parse(item));
          return p.notes.some((n) => n.shift);
        } catch (e) { return false; }
      }
      // 曲库预计算：卡片标签 / 筛选 / 开关置灰共用（init 时一次性 parse 全部曲目）
      const hasShiftMap = {};
      items.forEach((s) => { hasShiftMap[s.id] = scoreHasShift(s); });

      function normSearch(s) { return String(s || "").toLowerCase().replace(/\s+/g, ""); }
      function matchesFilter(s) {
        if (F.search && !normSearch(s.title).includes(normSearch(F.search))) return false;
        if (F.key && s.key !== F.key) return false;
        if (F.type && s.category !== F.type) return false;
        if (F.shift && (s.shiftLevel || "none") !== F.shift) return false;
        return true;
      }
      // 难度评分（五星制 1~5，支持 0.5 步进）：实星/半星琥珀色、空星弱色，右侧附数字；未标分不显示
      function starsHtml(v) {
        if (v == null) return "";
        const n = Math.round(v * 2) / 2;
        const full = Math.floor(n);
        const half = n % 1 ? 1 : 0;
        const empty = Math.max(0, 5 - full - half);
        return (
          `<span class="diff" title="难度 ${v} / 5">` +
          `<span class="stars">${"<b>★</b>".repeat(full)}${half ? '<i class="half">★</i>' : ""}${"☆".repeat(empty)}</span>` +
          `<span class="diff-n">${v}</span></span>`
        );
      }
      function renderItem(s) {
        const d = document.createElement("div");
        d.className = "list-item" + (st.cur && st.cur.id === s.id ? " on" : "");
        d.dataset.id = s.id;
        // 含换把：存在把位变化的音符才展示标签（一把位曲不显示）
        const shiftTag = hasShiftMap[s.id] ? '<span class="shift-tag">【含换把】</span>' : "";
        const GCN = ["", "一级", "二级", "三级", "四级", "五级"];
        const gradeTag = s.grade ? `<span class="grade-tag">${GCN[s.grade] || s.grade + "级"}</span>` : "";
        d.innerHTML = `<div class="t"><span class="tt">${s.title}</span>${starsHtml(s.difficulty)}</div><div class="m">${s.key}调 ${s.stringMode || ""} · ${s.meter} · ${s.bpm} BPM${gradeTag}${shiftTag}</div>`;
        d.onclick = () => select(s.id);
        return d;
      }
      function renderRecent() {
        const box = $("scRecent");
        box.innerHTML = "";
        const list = recents
          .map((id) => items.find((s) => s.id === id))
          .filter(Boolean)
          .filter((s) => !F.search || normSearch(s.title).includes(normSearch(F.search)));
        if (!list.length) return;
        const h = document.createElement("div");
        h.className = "score-recent-head";
        h.innerHTML = `<span class="score-recent-title">最近练习</span><button class="btn small ghost" id="scClearRecent" type="button">清空</button>`;
        box.appendChild(h);
        const wrap = document.createElement("div");
        wrap.className = "score-recent-list";
        list.forEach((s) => wrap.appendChild(renderItem(s)));
        box.appendChild(wrap);
        $("scClearRecent").onclick = () => {
          recents = [];
          P.set("scoreRecents", recents);
          renderRecent();
        };
      }
      function toggleGroup(cat) {
        groupState[cat] = !groupState[cat];
        P.set("scoreGroupsV2", groupState);
        renderList();
      }
      function renderList() {
        const box = $("scItems");
        box.innerHTML = "";
        renderRecent();
        let hasAny = false;
        Object.entries(groupMeta).forEach(([cat, label]) => {
          let list = items.filter((s) => s.category === cat && matchesFilter(s));
          if (cat === "drill") list = list.slice().sort((a, b) => (a.grade || 0) - (b.grade || 0));
          else list = list.slice().sort((a, b) => (a.difficulty || 0) - (b.difficulty || 0));
          if (!list.length) return;
          hasAny = true;
          const expanded = !!groupState[cat];
          const h = document.createElement("button");
          h.className = "score-group-head" + (expanded ? "" : " collapsed");
          h.type = "button";
          h.innerHTML = `<span class="score-group-title">${label}</span><span class="score-group-count">${list.length}</span><span class="score-group-caret">▾</span>`;
          h.onclick = () => toggleGroup(cat);
          box.appendChild(h);
          if (expanded) {
            const wrap = document.createElement("div");
            wrap.className = "score-group-body";
            list.forEach((s) => wrap.appendChild(renderItem(s)));
            box.appendChild(wrap);
          }
        });
        if (!hasAny) {
          box.innerHTML = `<div class="score-empty" style="padding:20px 0; text-align:center; color:var(--text-dim)">没有匹配的曲目</div>`;
        }
      }
      function addRecent(id) {
        recents = [id, ...recents.filter((x) => x !== id)].slice(0, 5);
        P.set("scoreRecents", recents);
        renderRecent();
      }

      function select(id) {
        const item = items.find((s) => s.id === id);
        if (!item) return;
        if (st.playing) stop();
        // 最近练习只在真正开始播放时记录（见 start()），仅浏览/选曲不计入
        st.cur = item;
        st.parsed = attachShifts(ET.jianpu.parse(item));
        st.hasShift = !!hasShiftMap[item.id];
        st.lyricSegs = buildLyricSegs(item);
        st.hasLyric = st.lyricSegs.some((s) => s.lyric);
        st.startBar = 1;
        // K-11：换曲时清空循环范围与句子选择（原误写在 st 上，实际生效的是 S.barA/barB）
        S.barA = 0; S.barB = 0; S.loop = false;
        st.curSentence = null;
        st.sentences = buildSentences(item);
        $("scA").value = 0; $("scB").value = 0;
        $("scTitle").textContent = item.title;
        $("scFsTitle").textContent = item.title;
        // 换把提示：含换把曲目标题旁小字提示；无换把时开关保留但置灰（hover 提示）
        $("scShiftHint").hidden = !st.hasShift;
        [["scShift", "scShiftWrap"], ["scFsShift", "scFsShiftWrap"]].forEach(([iid, wid]) => {
          const inp = $(iid), wrap = $(wid);
          if (!inp) return;
          inp.disabled = !st.hasShift;
          inp.title = st.hasShift ? "" : "当前曲目无换把";
          if (wrap) {
            wrap.classList.toggle("disabled", !st.hasShift);
            wrap.title = st.hasShift ? "" : "当前曲目无换把";
          }
        });
        $("scMeta").textContent = `${item.key}调 ${item.stringMode || ""} · ${item.meter} · ${item.bpm} BPM · ${st.parsed.bars.length} 小节` + (item.difficulty != null ? ` · 难度 ${item.difficulty}/5` : "");
        // 训练目标 + 「练完进入」跳转（刘天华公版体系：练习曲 → 对应乐曲）
        const goal = $("scGoal");
        const nextItem = item.next ? items.find((s) => s.id === item.next) : null;
        if (!item.desc && !nextItem) { goal.hidden = true; }
        else {
          goal.hidden = false;
          goal.innerHTML = "";
          if (item.desc) {
            const d = document.createElement("span");
            d.className = "sc-goal-text";
            d.textContent = item.desc;
            goal.appendChild(d);
          }
          if (nextItem) {
            const b = document.createElement("button");
            b.type = "button";
            b.className = "btn small ghost sc-goal-next";
            b.textContent = "练完进入：《" + nextItem.title + "》→";
            b.title = "跳到《" + nextItem.title + "》";
            b.onclick = () => select(nextItem.id);
            goal.appendChild(b);
          }
        }
        $("scEmpty").style.display = "none";
        document.querySelectorAll("#scItems .list-item").forEach((n) => n.classList.toggle("on", n.dataset.id === id));
        st.segs = analyzeSegments(st.parsed);
        renderSheet();
        buildTimelineUI();
      }

      // ---------- 渲染 ----------
      // 时值可视化 v2（占拍版面）：
      //   .note 宽度 = max(1格, dur × 1拍宽)——从版面宽度直读时值；
      //   dur≥2 → digit 右侧 (整数部分-1) 个 .extseg，每段独占 1 拍宽、只画横线不带指法/音名；
      //   +0.5 拍 → digit 旁附点·；dur<1 → beam1/beam2（digit 底部减时线，八分/十六分）。
      //   小节高亮时 .bar.cur 下横线同步变主色（见 css .bar.cur .extseg::before）。
      // 只在 .note cell 内部加子元素，不改变 .note/.bar 节点数量（dom.mjs 断言依赖）。
      function durParts(n) {
        if (n.rest) return { ext: 0, dot: false, beam: "" };
        const d = n.dur;
        if (d < 1) return { ext: 0, dot: false, beam: d <= 0.375 ? "beam2" : "beam1" };
        const whole = Math.floor(d + 1e-6);
        const frac = +(d - whole).toFixed(3);
        return { ext: Math.max(0, whole - 1), dot: frac >= 0.25, beam: "" };
      }
      function renderSheet() {
        sheet.innerHTML = "";
        st.sheetMarks = [];
        st.lyricEls = [];
        st.parsed.bars.forEach((barNotes, bi) => {
          const bar = document.createElement("div");
          bar.className = "bar clickable"; bar.dataset.bar = bi + 1;
          bar.innerHTML = `<span class="bnum">${bi + 1}</span>`;
          barNotes.forEach((n) => {
            const dp = durParts(n);
            const cell = document.createElement("div");
            cell.className = "note" + (n.rest ? " rest" : "") + (n.oct > 0 ? " hi" : n.oct < 0 ? " lo" : "") + (dp.beam ? " " + dp.beam : "");
            cell.style.setProperty("--nd", n.dur);
            cell.dataset.bar = bi + 1;
            cell.dataset.str = n.s || "";
            const bowTxt = S.bowShow && !n.rest ? `<span class="bowmark">${n.slur ? "⌒" : n.b}</span>` : "";
            const fingerTxt = n.rest ? "休止" : (n.f ? n.f + "指" : "—");
            cell.innerHTML =
              `<div class="nmain">` +
                `<div class="digit">${n.d}${dp.dot ? '<span class="dot">·</span>' : ""}</div>` +
                `<div class="nsub"><span class="nsub-f">${fingerTxt}</span>${bowTxt}</div>` +
                `<div class="nname">${n.p || ""}</div>` +
              `</div>` +
              '<i class="extseg"></i>'.repeat(dp.ext);
            // 换把标记：橙色实心倒三角挂在目标音符右上角（增时线段/休止符天然无标记）；
            // 显隐由 applyToggles 的 hide-shift 类统一控制，不在渲染层增删
            if (n.shift) {
              const mk = document.createElement("span");
              mk.className = "shiftmark";
              mk.dataset.tip = `换把：${CN_POS[n.shift.fromPos]}把 → ${CN_POS[n.shift.toPos]}把`;
              mk.title = mk.dataset.tip;
              cell.appendChild(mk);
            }
            bar.appendChild(cell);
          });
          // 切换标记：挂在「目标小节」左侧（即上一小节行尾、小节线之前）
          const nextSeg = st.segs[bi + 1];
          if (nextSeg && nextSeg.change) {
            const m = document.createElement("span");
            m.className = "smark" + (nextSeg.chg.includes("换把") ? " smark-pos" : " smark-str");
            m.dataset.target = nextSeg.bar;
            const tip = `第 ${nextSeg.bar} 小节 · ${nextSeg.chg.join("·")}`;
            m.title = tip;
            m.innerHTML = `<span class="smark-lbl">${nextSeg.chg.map((c) => c === "换弦" ? "弦" : c === "换把" ? "把" : "").join("/")}</span><span class="tip">${tip}</span>`;
            bar.appendChild(m);
            st.sheetMarks.push(m);
          }
          bar.onclick = () => {
            if (!st.playing) {
              st.startBar = bi + 1; markStartBar();
              updateTimelineUI(st.startBar); updateSheetMarks(bi + 1); scrollToBar(bi + 1);
            }
          };
          sheet.appendChild(bar);
          // 歌词：挂在乐句末小节的 bar 内（绝对定位在小节下方）——多行排版下 bar 是直接子元素，
          // 歌词若作为 sheet 直接子元素会挤乱每行 4 小节的网格
          if (S.lyric && !S.lyricFloat && st.hasLyric) {
            const seg = (st.lyricSegs || []).find((s) => s.endBar === bi + 1 && s.lyric);
            if (seg) {
              const bl = document.createElement("div");
              bl.className = "bar-lyric";
              bl.textContent = seg.lyric;
              bl.dataset.bar = bi + 1;
              bl._seg = seg;
              bar.appendChild(bl);
              st.lyricEls.push({ el: bl, seg });
            }
          }
        });
        markStartBar();
        applyToggles();
        updateLyric(st.startBar);
        renderSentBar();
      }
      function markStartBar() {
        sheet.querySelectorAll(".bar").forEach((b) => b.classList.toggle("ab", +b.dataset.bar === st.startBar));
        updateLyric(st.startBar);
      }
      function applyToggles() {
        sheet.classList.toggle("show-bow", S.bowShow);
        sheet.querySelectorAll(".note").forEach((c) => {
          c.classList.remove("s-inner", "s-outer");
          if (S.strColor && c.dataset.str === "内") c.classList.add("s-inner");
          else if (S.strColor && c.dataset.str === "外") c.classList.add("s-outer");
        });
        sheet.classList.toggle("hide-marks", !S.marks);
        sheet.classList.toggle("hide-shift", !S.shiftMarks);
        sheet.classList.toggle("hide-beatline", !S.beatLine);
        sheet.classList.toggle("hide-highlight", !S.highlight);
        updateSentenceDim();
        const fs = el.classList.contains("score-fullscreen");
        const tlOn = fs ? st.fsTimeline : S.timeline;
        el.classList.toggle("hide-timeline", !tlOn);
        ["scHighlight", "scFsHighlight"].forEach((id) => { const e = $(id); if (e) e.checked = S.highlight; });
        ["scBeat", "scFsBeat"].forEach((id) => { const e = $(id); if (e) e.checked = S.beatLine; });
        ["scMarks", "scFsMarks"].forEach((id) => { const e = $(id); if (e) e.checked = S.marks; });
        ["scShift", "scFsShift"].forEach((id) => { const e = $(id); if (e) e.checked = S.shiftMarks; });
        ["scTimeline", "scFsTimeline"].forEach((id) => { const e = $(id); if (e) e.checked = tlOn; });
        ["scLyric", "scFsLyric"].forEach((id) => { const e = $(id); if (e) e.checked = S.lyric; });
        ["scLyricFloat", "scFsLyricFloat"].forEach((id) => { const e = $(id); if (e) e.checked = S.lyricFloat; });
        ["scCount", "scFsCount"].forEach((id) => { const e = $(id); if (e) e.checked = S.countIn; });
        ["scMetro", "scFsMetro"].forEach((id) => { const e = $(id); if (e) e.checked = S.metroOn; });
        ["scBeatFlash", "scFsBeatFlash"].forEach((id) => { const e = $(id); if (e) e.checked = S.beatFlash; });
        ["scBow", "scFsBow"].forEach((id) => { const e = $(id); if (e) e.checked = S.bowShow; });
        ["scStr", "scFsStr"].forEach((id) => { const e = $(id); if (e) e.checked = S.strColor; });
        ["scLoop", "scFsLoop"].forEach((id) => { const e = $(id); if (e) e.checked = S.loop; });
        ["scA", "scFsA"].forEach((id) => { const e = $(id); if (e) e.value = S.barA; });
        ["scB", "scFsB"].forEach((id) => { const e = $(id); if (e) e.value = S.barB; });
        ["scTr", "scFsTr"].forEach((id) => { const e = $(id); if (e) e.value = S.transpose; });
        ["scTimbre", "scFsTimbre"].forEach((id) => { const e = $(id); if (e) e.value = S.timbre; });
        ["scModeSeg", "scFsModeSeg"].forEach((id) => {
          const seg = $(id); if (!seg) return;
          seg.querySelectorAll("button").forEach((b) => b.classList.toggle("on", b.dataset.v === S.practiceMode));
        });
        updateBeatBarVis();
      }

      // ---------- 拍点闪烁（K-10）：纯视觉层，随时间轴 tick 事件点亮，与声音开关无关 ----------
      function buildBeatDots() {
        const box = $("scBeatDots");
        box.innerHTML = "";
        const num = st.parsed ? st.parsed.num : 4;
        for (let k = 0; k < num; k++) {
          const d = document.createElement("i");
          d.className = "bdot" + (k === 0 ? " acc" : ""); // 每小节第 1 拍 = 拍头重音
          box.appendChild(d);
        }
        $("scBeatInfo").textContent = "—";
      }
      function updateBeatBarVis() {
        const bar = $("scBeatBar");
        if (bar) bar.style.display = st.playing && S.beatFlash ? "flex" : "none";
      }
      function beatVisualAt(t, fn) {
        const delay = Math.max(0, (t - ET.audio.now()) * 1000);
        st.beatTimers.push(setTimeout(fn, delay));
      }
      function clearBeatTimers() { st.beatTimers.forEach(clearTimeout); st.beatTimers = []; }
      function flashBeat(b) {
        const dots = $("scBeatDots").children;
        for (let i = 0; i < dots.length; i++) dots[i].classList.toggle("on", i === b);
        $("scBeatInfo").textContent = "第 " + (b + 1) + "/" + dots.length + " 拍";
      }

      // ---------- 切换分析：换弦 / 换把 ----------
      function notePos(n) {
        // 显式「X把」标记优先：超一把位音（如 3'[二把三]）不在指法表内、s 为空，靠显式标记取把位
        if (n.f) {
          const mm = n.f.match(/([一二三四五六七])把/);
          if (mm) return { "一": 1, "二": 2, "三": 3, "四": 4, "五": 5, "六": 6, "七": 7 }[mm[1]];
        }
        if (!n.s) return null;
        if (n.f && ["空", "一", "二", "三", "四"].includes(n.f)) return 1; // 一把位自动指法
        // 超出一把位（无标记高音）：内弦上限 G4(67) / 外弦上限 E5(76)，再高即二把起
        const ceiling = n.s === "内" ? 67 : 76;
        if (n.midi != null && n.midi > ceiling) return 2;
        return 1;
      }
      function analyzeSegments(parsed) {
        const bars = parsed.bars;
        const info = bars.map((bn, i) => {
          const first = bn.find((n) => !n.rest && n.s);
          const last = [...bn].reverse().find((n) => !n.rest && n.s);
          const strings = new Set(bn.filter((n) => !n.rest && n.s).map((n) => n.s));
          const dom = strings.size === 0 ? "rest"
            : strings.size === 2 ? "mix"
            : (strings.has("内") ? "内" : "外");
          let posMax = 1;
          bn.forEach((n) => { if (n.rest || !n.s) return; const p = notePos(n); if (p > posMax) posMax = p; });
          return { bar: i + 1, firstStr: first ? first.s : null, lastStr: last ? last.s : null, dom, posMax };
        });
        info.forEach((s, i) => {
          s.chg = [];
          if (i > 0) {
            const prev = info[i - 1];
            // 换弦：相邻小节衔接处，起始弦与上一小节收尾弦不同
            if (prev.lastStr && s.firstStr && prev.lastStr !== s.firstStr) s.chg.push("换弦");
            // 换把：小节内出现的最高把位与上一小节不同（出现即提示，不取多数票）
            if (prev.posMax && s.posMax && prev.posMax !== s.posMax) s.chg.push("换把");
          }
          s.change = s.chg.length > 0;
        });
        return info;
      }

      // ---------- 歌词：乐句 -> 小节区间映射 ----------
      // 一条 measures 记录 = 一个乐句（含若干小节 + 一行 lyric），
      // 按 notes 里的小节线 '|' 推算该乐句覆盖的起始/结束小节，便于歌词与小节高亮绑定。
      function buildLyricSegs(item) {
        if (!item || !item.measures || !item.measures.length) return [];
        const segs = [];
        let bar = 1;
        for (const m of item.measures) {
          const cnt = String(m.notes || "").split("|").map((s) => s.trim()).filter(Boolean).length;
          const lyric = String(m.lyric || "").trim();
          segs.push({ startBar: bar, endBar: bar + cnt - 1, lyric, el: null });
          bar += cnt;
        }
        return segs;
      }

      // ---------- 逐句练习（K-11）：句子 = 曲目 measures 标注；未标注按每 4 小节自动切 ----------
      function buildSentences(item) {
        const total = st.parsed ? st.parsed.bars.length : 0;
        if (!total) return [];
        const ms = item && item.measures && item.measures.length ? item.measures : null;
        const out = [];
        if (ms) {
          let bar = 1;
          for (const m of ms) {
            const cnt = String(m.notes || "").split("|").map((s) => s.trim()).filter(Boolean).length;
            if (cnt <= 0) continue;
            out.push({ startBar: bar, endBar: Math.min(bar + cnt - 1, total), lyric: String(m.lyric || "").trim() });
            bar += cnt;
          }
          if (bar <= total) out.push({ startBar: bar, endBar: total, lyric: "" }); // 尾部兜底句
        } else {
          for (let b = 1; b <= total; b += 4) out.push({ startBar: b, endBar: Math.min(b + 3, total), lyric: "" });
        }
        return out.length > 1 ? out : [];
      }
      function renderSentBar() {
        const bar = $("scSentBar");
        if (!bar) return;
        const sents = st.sentences || [];
        if (!sents.length) { bar.style.display = "none"; return; }
        bar.style.display = "flex";
        const box = $("scSentChips");
        box.innerHTML = "";
        sents.forEach((s, i) => {
          const c = document.createElement("button");
          c.type = "button";
          c.className = "sent-chip" + (i === st.curSentence ? " on" : "");
          c.textContent = i + 1;
          c.title = `第 ${i + 1}/${sents.length} 句（第 ${s.startBar}-${s.endBar} 小节）${s.lyric ? " · " + s.lyric : ""}`;
          c.onclick = () => selectSentence(i);
          box.appendChild(c);
        });
        const cur = st.curSentence != null ? sents[st.curSentence] : null;
        $("scSentCap").textContent = cur
          ? `当前第 ${st.curSentence + 1}/${sents.length} 句（第 ${cur.startBar}-${cur.endBar} 小节）${cur.lyric ? " · " + cur.lyric : ""}`
          : "点句号循环该句 · 点当前句再点一次取消";
      }
      function selectSentence(i) {
        const s = st.sentences && st.sentences[i];
        if (!s) return;
        // 再点一次当前句 = 取消句子循环，回到整曲
        if (st.curSentence === i && S.loop && S.barA === s.startBar && S.barB === s.endBar) {
          st.curSentence = null;
          S.barA = 0; S.barB = 0; S.loop = false;
          applyToggles();
          renderSentBar(); updateSentenceDim();
          ET.toast("已取消句子循环，恢复整曲");
          return;
        }
        st.curSentence = i;
        S.barA = s.startBar; S.barB = s.endBar; S.loop = true;
        st.startBar = s.startBar;
        applyToggles();
        markStartBar(); updateTimelineUI(st.startBar); updateSheetMarks(st.startBar);
        renderSentBar(); updateSentenceDim();
        scrollToBar(s.startBar);
        if (st.playing) { stop(); start(); }
        else ET.toast(`第 ${i + 1} 句已设为循环（第 ${s.startBar}-${s.endBar} 小节）`);
      }
      function updateSentenceDim() {
        // K歌式聚焦：播放中且曲有分句时，非当前句淡化
        const sents = st.sentences || [];
        const on = sents.length > 1 && st.playing && st.curSentence != null;
        const s = on ? sents[st.curSentence] : null;
        sheet.querySelectorAll(".bar").forEach((b) => {
          const n = +b.dataset.bar;
          b.classList.toggle("dim", !!s && (n < s.startBar || n > s.endBar));
        });
      }

      // ---------- 顶部时间轴（原信号灯条降级为全局概览 + 跳转）----------
      function buildTimelineUI() {
        if (!st.parsed) return;
        if (!st.segs) st.segs = analyzeSegments(st.parsed);
        const track = $("scSigTrack");
        track.innerHTML = "";
        st.sigSegs = [];
        const inner = document.createElement("div");
        inner.className = "tl-inner";
        st.segs.forEach((s) => {
          const seg = document.createElement("div");
          seg.className = "tl-seg" + (s.change ? " chg" : "");
          seg.dataset.bar = s.bar;
          seg.title = `第 ${s.bar} 小节${s.change ? " · " + s.chg.join("·") : ""}`;
          if (s.change) seg.innerHTML = `<span class="tl-flag">${s.chg.map((c) => c === "换弦" ? "弦" : c === "换把" ? "把" : "").join("/")}</span>`;
          inner.appendChild(seg);
          st.sigSegs.push(seg);
        });
        track.appendChild(inner);
        const cursor = document.createElement("div");
        cursor.className = "tl-cursor";
        track.appendChild(cursor);
        st.sigCursor = cursor;
        updateTimelineUI(st.startBar);
      }
      function updateTimelineUI(curBar) {
        if (st.sigSegs) {
          st.sigSegs.forEach((seg, i) => {
            const bar = i + 1;
            seg.classList.toggle("on", bar === curBar);
            seg.classList.toggle("done", bar < curBar);
          });
        }
        if (st.sigCursor) {
          const N = st.segs ? st.segs.length : 1;
          st.sigCursor.style.left = ((curBar - 0.5) / N * 100) + "%";
        }
        const cap = $("scSigCap");
        if (cap) {
          let nextChg = null;
          if (st.segs) for (const s of st.segs) { if (s.change && s.bar > curBar) { nextChg = s; break; } }
          cap.textContent = nextChg ? `下一切换 → 第 ${nextChg.bar} 小节 · ${nextChg.chg.join("·")}` : "全程单一手法 / 弦区";
          cap.classList.remove("hot");
        }
      }
      function barFromX(clientX) {
        const r = $("scSigTrack").getBoundingClientRect();
        const ratio = Math.max(0, Math.min(1, (clientX - r.left) / (r.width || 1)));
        return Math.max(1, Math.min(st.segs.length, Math.round(ratio * st.segs.length)));
      }
      let tlDrag = false;
      function seek(bar, commit) {
        const [a, b] = barRange();
        bar = Math.max(a, Math.min(b, bar));
        st.startBar = bar; markStartBar();
        updateTimelineUI(bar); updateSheetMarks(bar);
        if (!commit) return; // 拖拽预览
        if (st.playing) { stop(); start(); }
        else scrollToBar(bar);
      }

      // ---------- 时间轴 ----------
      function secPerBeat() { return 60 / st.cur.bpm / S.speed; }
      function freqOf(note) {
        return ET.notation.midiToFreq(note.midi + S.transpose, a4());
      }
      function barRange() {
        const total = st.parsed.bars.length;
        let a = S.barA > 0 ? Math.min(S.barA, total) : 1;
        let b = S.barB > 0 ? Math.min(S.barB, total) : total;
        if (a > b) [a, b] = [b, a];
        return [a, b];
      }
      function buildTimeline() {
        const [a, b] = barRange();
        const evs = [];
        const barEvents = {};
        let t = 0;
        if (S.countIn) {
          const beats = st.parsed.num;
          for (let i = 0; i < beats; i++) {
            evs.push({ t, type: "tick", accent: i === 0, count: beats - i, b: i });
            t += secPerBeat();
          }
        }
        st.noteT0 = t;
        for (let bi = a - 1; bi <= b - 1; bi++) {
          const bar = st.parsed.bars[bi];
          const barT = t;
          bar.forEach((n) => {
            const durSec = n.dur * secPerBeat();
            if (!n.rest) {
              const ev = { t, type: "note", note: n, durSec, el: null };
              (barEvents[n.bar] = barEvents[n.bar] || []).push(ev);
              evs.push(ev);
            }
            t += durSec;
          });
          for (let k = 0; k < st.parsed.num; k++) {
            evs.push({ t: barT + k * secPerBeat(), type: "tick", accent: k === 0, b: k });
          }
        }
        st.barEvents = barEvents;
        st.span = t;
        evs.sort((x, y) => x.t - y.t);
        return evs;
      }
      function schedule(t) {
        const evs = st.events;
        if (st.idx >= evs.length) {
          if (S.loop && st.cur) { st.idx = 0; st.base = t; return 0.01; }
          setTimeout(() => { if (st.playing) stop(); }, 120);
          return null;
        }
        const ev = evs[st.idx++];
        const at = st.base + ev.t;
        if (ev.type === "tick") {
          // 预备拍（count != null）在示范模式下必须出声——否则点播放后是一段
          // 只有角标在数的「假死」静音（0.5x 速度下长达 5 秒以上），极易被当成无声故障。
          // 播放中的小节拍点只受「节拍器叠加」开关控制（K-09：节拍模式已移除）；
          // 模式 C（无声跟练）保持全静音。
          const isCountIn = ev.count != null;
          const shouldTick = isCountIn
            ? S.practiceMode !== "C"
            : S.practiceMode === "A" && S.metroOn;
          if (shouldTick) ET.synth.tick({ t: at, accent: ev.accent, timbre: "wood", vol: S.metroVol });
          if (S.beatFlash) beatVisualAt(at, () => flashBeat(ev.b || 0));
        } else if (S.practiceMode !== "C") {
          ET.synth.stringVoice({ freq: freqOf(ev.note), t: at, dur: ev.durSec, type: S.timbre, vol: 0.5 });
        }
        void at;
        const nextT = st.idx < evs.length ? st.base + evs[st.idx].t : st.base + st.span;
        return Math.max(0.01, nextT - t);
      }

      // ---------- 视觉跟随（小节底色高亮 + 节拍竖线 + 居中 + 谱面标记）----------
      let lastActive = null, lastCount = null, lastKBar = null, lastKBarEl = null;
      function centerBar(barEl) {
        if (!barEl) return;
        const sr = scroll.getBoundingClientRect();
        if (!sr.height) return;
        const br = barEl.getBoundingClientRect();
        const topInScroll = br.top - sr.top + scroll.scrollTop;
        const target = topInScroll - (sr.height / 2 - br.height / 2);
        const cur = scroll.scrollTop;
        const next = Math.abs(target - cur) < 1 ? target : cur + (target - cur) * 0.18;
        scroll.scrollTop = next;
      }
      function scrollToBar(bar) {
        const eln = sheet.querySelector(`.bar[data-bar="${bar}"]`);
        if (!eln) return;
        const sr = scroll.getBoundingClientRect(); if (!sr.height) return;
        const br = eln.getBoundingClientRect();
        const topInScroll = br.top - sr.top + scroll.scrollTop;
        scroll.scrollTop = topInScroll - (sr.height / 2 - br.height / 2);
      }
      function updateSheetMarks(curBar) {
        if (!st.sheetMarks) return;
        st.sheetMarks.forEach((m) => {
          const t = +m.dataset.target;
          m.classList.toggle("warn", S.marks && t === curBar + 1);   // 前一小节：预亮预告
          m.classList.toggle("solid", S.marks && t === curBar);        // 进入本小节：实高亮
        });
        updateLyric(curBar);
      }
      // 歌词高亮：当前小节命中某乐句时，该乐句歌词行（.bar-lyric.on）与 K 歌悬浮行同步点亮
      function updateLyric(bar) {
        if (!st.lyricSegs) return;
        const seg = st.lyricSegs.find((s) => s.lyric && bar >= s.startBar && bar <= s.endBar) || null;
        if (st.lyricEls) st.lyricEls.forEach((o) => o.el.classList.toggle("on", !!seg && o.seg === seg));
        const fl = $("scLyricK");
        if (fl) {
          // 歌词行独立开关（sLyricFloat）：有词曲目默认显示，不再与「谱面歌词」联动
          const show = !!(S.lyricFloat && st.hasLyric);
          fl.style.display = show ? "block" : "none";
          if (show) {
            fl.innerHTML = seg
              ? `<span class="lf-cur">${seg.lyric}</span>`
              : `<span class="lf-empty">（间奏）</span>`;
          }
        }
      }
      function frame() {
        if (!st.playing) return;
        const now = ET.audio.now();
        const evs = st.events;
        let active = null, count = null;
        for (let i = st.idx - 1; i >= 0 && i >= st.idx - 4; i--) {
          const ev = evs[i];
          const at = st.base + ev.t;
          if (ev.type === "note" && now >= at && now < at + ev.durSec + 0.05) { active = ev; break; }
          if (ev.type === "tick" && ev.count && now >= at && now < at + 0.3) { count = ev.count; break; }
        }
        const curBar = active ? active.note.bar : (lastActive ? lastActive.note.bar : st.startBar);
        if (active) {
          const bar = active.note.bar;
          if (bar !== lastKBar) {
            if (lastKBarEl) lastKBarEl.classList.remove("cur");
            lastKBarEl = sheet.querySelector(`.bar[data-bar="${bar}"]`);
            lastKBar = bar;
            if (lastKBarEl && st.beatLine.parentNode !== lastKBarEl) lastKBarEl.appendChild(st.beatLine);
            // K歌式聚焦：长曲播放时自动跟随当前句（句条高亮 + 其余句淡化）
            if (st.sentences && st.sentences.length > 1) {
              const idx = st.sentences.findIndex((s) => bar >= s.startBar && bar <= s.endBar);
              if (idx >= 0 && idx !== st.curSentence) { st.curSentence = idx; renderSentBar(); }
            }
            updateSentenceDim();
          }
          if (lastKBarEl) lastKBarEl.classList.toggle("cur", true);
          // 节拍竖线：在小节内跟随节拍从左向右移动
          if (st.beatLine) {
            const evsInBar = st.barEvents[bar] || [];
            if (evsInBar.length) {
              const t0 = evsInBar[0].t;
              const lastE = evsInBar[evsInBar.length - 1];
              const t1 = lastE.t + lastE.durSec;
              const prog = Math.max(0, Math.min(1, ((now - st.base) - t0) / (t1 - t0 || 1)));
              st.beatLine.style.left = (prog * 100) + "%";
            }
          }
          centerBar(lastKBarEl);
        }
        updateSheetMarks(curBar);
        updateTimelineUI(curBar);
        if (st.sigCursor) {
          const frac = Math.max(0, Math.min(1, (now - st.base) / (st.span || 1)));
          st.sigCursor.style.left = (frac * 100) + "%";
        }
        if (active && active !== lastActive) {
          lastActive = active;
          $("scPos").textContent = `第 ${active.note.bar} 小节 · 第 ${active.note.beat} 拍`;
        }
        if (count !== lastCount) {
          const badge = $("scCountBadge");
          if (count) { badge.style.display = "inline-block"; badge.textContent = count; }
          else badge.style.display = "none";
          lastCount = count;
        }
        if (st.micOn) pitchFrame();
        st.raf = requestAnimationFrame(frame);
      }

      // ---------- 音准反馈（F-01~F-05）----------
      async function toggleMic() {
        if (st.micOn) {
          st.mic.stop(); st.micOn = false;
          $("scPitchBtn").classList.remove("toggled");
          $("scPitch").classList.remove("show");
          $("scTarget").textContent = "检测未启动";
          return;
        }
        if (!ET.pitch.micAvailable()) { ET.toast("当前环境不支持麦克风（需 HTTPS / localhost）"); return; }
        try {
          if (!st.mic) st.mic = new ET.pitch.MicPitch("score");
          await st.mic.start();
          st.micOn = true;
          $("scPitchBtn").classList.add("toggled");
          $("scPitch").classList.add("show");
        } catch (e) { ET.toast(e.message || "麦克风启动失败"); }
      }
      function pitchFrame() {
        const r = st.mic.detect();
        const centsEl = $("scCents"), nnEl = $("scNN"), needle = $("scNeedle"), tgt = $("scTarget");
        if (!r) { tgt.textContent = "未检测到声音"; return; }
        const near = ET.notation.freqToNearest(r.freq, a4());
        let targetName = "自由模式（对照最近音）", cents = near.cents;
        const act = lastActive && lastActive.note;
        if (act && act.midi != null) {
          const f = freqOf(act);
          cents = ET.notation.centsBetween(r.freq, f);
          targetName = `对照当前音 ${ET.notation.midiToNote(act.midi + S.transpose)}（${act.d}${act.oct > 0 ? "̇" : act.oct < 0 ? "̥" : ""}）`;
        }
        centsEl.textContent = (cents > 0 ? "+" : "") + cents;
        centsEl.className = "cents " + (Math.abs(cents) <= 5 ? "good" : Math.abs(cents) > 30 ? "far" : "");
        nnEl.textContent = near.name;
        needle.style.transform = `translateX(calc(-50% + ${Math.max(-50, Math.min(50, cents))}% / 2))`;
        needle.className = "needle " + (Math.abs(cents) <= 5 ? "good" : Math.abs(cents) > 30 ? "far" : "");
        tgt.textContent = targetName + ` · ${r.freq.toFixed(1)} Hz`;
      }

      // ---------- 播放控制 ----------
      function start() {
        if (!st.cur) { ET.toast("请先选择曲目"); return; }
        ET.audio.unlock();
        const [a, b] = barRange();
        st.startBar = Math.max(a, Math.min(b, st.startBar));
        st.events = buildTimeline();
        st.base = ET.audio.now() + 0.12;
        st.idx = 0;
        st.playing = true;
        addRecent(st.cur.id); // 有过播放记录才进「最近练习」
        ET.wakelock && ET.wakelock.acquire("score"); // 播放期间保持屏幕常亮（K-07）
        buildBeatDots();
        updateBeatBarVis();
        $("scPlay").textContent = "■ 停止";
        if ($("scFsPlay")) $("scFsPlay").textContent = "■ 停止";
        st.sched = new ET.audio.Scheduler(schedule);
        st.sched.start(st.base);
        lastActive = null; lastCount = null; lastKBar = null; lastKBarEl = null;
        st.raf = requestAnimationFrame(frame);
        timerStart();
      }
      function stop() {
        st.playing = false;
        ET.wakelock && ET.wakelock.release("score");
        clearBeatTimers();
        updateBeatBarVis();
        updateSentenceDim();
        if (st.sched) st.sched.stop();
        cancelAnimationFrame(st.raf);
        if (lastKBarEl) lastKBarEl.classList.remove("cur");
        if (st.beatLine && st.beatLine.parentNode) st.beatLine.parentNode.removeChild(st.beatLine);
        if (st.sheetMarks) st.sheetMarks.forEach((m) => m.classList.remove("warn", "solid"));
        if (st.sigSegs) st.sigSegs.forEach((d) => d.classList.remove("on", "done"));
        if (st.sigCursor) st.sigCursor.style.left = "0%";
        $("scCountBadge").style.display = "none";
        $("scPlay").textContent = "▶ 播放";
        if ($("scFsPlay")) $("scFsPlay").textContent = "▶ 播放";
        updateTimelineUI(st.startBar);
        updateSheetMarks(st.startBar);
        lastActive = null; lastCount = null; lastKBar = null; lastKBarEl = null;
        timerPause();
      }
      function toggle() { st.playing ? stop() : start(); }
      function setAB(which) {
        const bar = st.playing && lastActive ? lastActive.note.bar : st.startBar;
        if (which === "A") { S.barA = bar; $("scA").value = bar; }
        else { S.barB = bar; $("scB").value = bar; }
      }

      // ---------- 事件 ----------
      $("scPlay").onclick = toggle;
      $("scSpeed").oninput = (e) => setSpeed(+e.target.value);
      $("scSlow").onclick = () => setSpeed(S.speed - 0.05);
      $("scFast").onclick = () => setSpeed(S.speed + 0.05);
      $("scFsSpeed").oninput = (e) => setSpeed(+e.target.value);
      $("scFsPlay").onclick = toggle;
      $("scSetA").onclick = () => setAB("A");
      $("scSetB").onclick = () => setAB("B");
      $("scA").onchange = (e) => { S.barA = +e.target.value; };
      $("scB").onchange = (e) => { S.barB = +e.target.value; };
      $("scLoop").onchange = (e) => { S.loop = e.target.checked; };
      $("scCount").checked = S.countIn;
      $("scCount").onchange = (e) => { S.countIn = e.target.checked; P.set("sCount", S.countIn); };
      $("scMetro").checked = S.metroOn;
      $("scMetro").onchange = (e) => { S.metroOn = e.target.checked; P.set("sMetro", S.metroOn); };
      $("scBeatFlash").checked = S.beatFlash;
      $("scBeatFlash").onchange = (e) => setBeatFlash(e.target.checked);
      $("scBow").checked = S.bowShow;
      $("scBow").onchange = (e) => { S.bowShow = e.target.checked; P.set("sBow", S.bowShow); renderSheet(); };
      $("scStr").checked = S.strColor;
      $("scStr").onchange = (e) => { S.strColor = e.target.checked; P.set("sStr", S.strColor); renderSheet(); };
      $("scHighlight").checked = S.highlight;
      $("scHighlight").onchange = (e) => setHighlight(e.target.checked);
      $("scFsHighlight").checked = S.highlight;
      $("scFsHighlight").onchange = (e) => setHighlight(e.target.checked);
      $("scShift").checked = S.shiftMarks;
      $("scShift").onchange = (e) => setShiftMarks(e.target.checked);
      $("scFsShift").checked = S.shiftMarks;
      $("scFsShift").onchange = (e) => setShiftMarks(e.target.checked);
      $("scBeat").checked = S.beatLine;
      $("scBeat").onchange = (e) => setBeatLine(e.target.checked);
      $("scFsBeat").checked = S.beatLine;
      $("scFsBeat").onchange = (e) => setBeatLine(e.target.checked);
      $("scMarks").checked = S.marks;
      $("scMarks").onchange = (e) => setMarks(e.target.checked);
      $("scFsMarks").checked = S.marks;
      $("scFsMarks").onchange = (e) => setMarks(e.target.checked);
      $("scTimeline").checked = S.timeline;
      $("scTimeline").onchange = (e) => setTimeline(e.target.checked);
      $("scFsTimeline").checked = S.timeline;
      $("scFsTimeline").onchange = (e) => setTimeline(e.target.checked);
      $("scLyric").checked = S.lyric;
      $("scLyric").onchange = (e) => { S.lyric = e.target.checked; P.set("sLyric", S.lyric); renderSheet(); };
      $("scLyricFloat").checked = S.lyricFloat;
      $("scLyricFloat").onchange = (e) => { S.lyricFloat = e.target.checked; P.set("sLyricFloat", S.lyricFloat); renderSheet(); };
      $("scFsLyric").checked = S.lyric;
      $("scFsLyric").onchange = (e) => { S.lyric = e.target.checked; P.set("sLyric", S.lyric); renderSheet(); };
      $("scFsLyricFloat").checked = S.lyricFloat;
      $("scFsLyricFloat").onchange = (e) => { S.lyricFloat = e.target.checked; P.set("sLyricFloat", S.lyricFloat); renderSheet(); };
      const trSel = $("scTr");
      trSel.innerHTML = Array.from({ length: 25 }, (_, i) => {
        const v = i - 12;
        return `<option value="${v}" ${v === 0 ? "selected" : ""}>${v > 0 ? "+" + v : v} 半音</option>`;
      }).join("");
      trSel.onchange = (e) => { S.transpose = +e.target.value; P.set("sTranspose", S.transpose); };
      $("scTimbre").value = S.timbre;
      $("scTimbre").onchange = (e) => { S.timbre = e.target.value; P.set("sTimbre", S.timbre); };
      $("scPitchBtn").onclick = toggleMic;

      // 全屏控制抽屉：同步事件
      $("scFsCount").onchange = (e) => { S.countIn = e.target.checked; P.set("sCount", S.countIn); };
      $("scFsMetro").onchange = (e) => { S.metroOn = e.target.checked; P.set("sMetro", S.metroOn); };
      $("scFsBeatFlash").checked = S.beatFlash;
      $("scFsBeatFlash").onchange = (e) => setBeatFlash(e.target.checked);
      $("scFsBow").onchange = (e) => { S.bowShow = e.target.checked; P.set("sBow", S.bowShow); renderSheet(); };
      $("scFsStr").onchange = (e) => { S.strColor = e.target.checked; P.set("sStr", S.strColor); renderSheet(); };
      $("scFsLoop").onchange = (e) => { S.loop = e.target.checked; };
      $("scFsSetA").onclick = () => setAB("A");
      $("scFsSetB").onclick = () => setAB("B");
      $("scFsA").onchange = (e) => { S.barA = +e.target.value; };
      $("scFsB").onchange = (e) => { S.barB = +e.target.value; };
      $("scFsPitchBtn").onclick = toggleMic;
      $("scFsReset").onclick = timerReset;

      const trFs = $("scFsTr");
      trFs.innerHTML = Array.from({ length: 25 }, (_, i) => {
        const v = i - 12;
        return `<option value="${v}" ${v === 0 ? "selected" : ""}>${v > 0 ? "+" + v : v} 半音</option>`;
      }).join("");
      trFs.onchange = (e) => { S.transpose = +e.target.value; P.set("sTranspose", S.transpose); };
      $("scFsTimbre").value = S.timbre;
      $("scFsTimbre").onchange = (e) => { S.timbre = e.target.value; P.set("sTimbre", S.timbre); };

      // 模式切换
      function onModeClick(e) {
        const b = e.target.closest("button");
        if (b && b.dataset.v) setMode(b.dataset.v);
      }
      $("scModeSeg").onclick = onModeClick;
      $("scFsModeSeg").onclick = onModeClick;

      // 全屏浮层：唤起 / 收起 / 自动隐藏
      const fsFloatHideDelay = 4200; // 无操作自动收起（ms）
      let fsFloatTimer = 0;
      function showFsFloat() {
        const f = $("scFsFloat");
        if (!f || !f.classList.contains("collapsed")) { resetFsFloatTimer(); return; }
        f.classList.remove("collapsed");
        f.setAttribute("aria-hidden", "false");
        resetFsFloatTimer();
      }
      function hideFsFloat() {
        const f = $("scFsFloat");
        if (!f || f.classList.contains("collapsed")) return;
        f.classList.add("collapsed");
        f.setAttribute("aria-hidden", "true");
        closeFsModal();
        clearTimeout(fsFloatTimer); fsFloatTimer = 0;
      }
      function resetFsFloatTimer() {
        clearTimeout(fsFloatTimer);
        const f = $("scFsFloat");
        if (f && !f.classList.contains("collapsed")) {
          fsFloatTimer = setTimeout(hideFsFloat, fsFloatHideDelay);
        }
      }
      function openFsModal() {
        const m = $("scFsModal"); if (!m) return;
        m.classList.add("open"); m.setAttribute("aria-hidden", "false");
        resetFsFloatTimer();
      }
      function closeFsModal() {
        const m = $("scFsModal"); if (!m) return;
        m.classList.remove("open"); m.setAttribute("aria-hidden", "true");
      }
      $("scFsClose").onclick = hideFsFloat;
      $("scFsMore").onclick = openFsModal;
      $("scFsModalClose").onclick = closeFsModal;
      $("scFsFloat").onpointerenter = resetFsFloatTimer;
      $("scFsFloat").onpointermove = resetFsFloatTimer;
      $("scFsFloat").onclick = (e) => { resetFsFloatTimer(); e.stopPropagation(); };
      $("scFsModal").onclick = (e) => { resetFsFloatTimer(); e.stopPropagation(); };
      $("scFsModal").querySelectorAll("input, select, button").forEach((c) => {
        c.onpointerdown = resetFsFloatTimer;
        c.onchange = resetFsFloatTimer;
      });

      // 全屏热区：轻触 / 上滑唤起控制栏
      const fsTouch = $("scFsTouch");
      let fsTouchStartY = 0, fsTouchStartX = 0, fsTouchT = 0;
      fsTouch.addEventListener("touchstart", (e) => {
        const t = e.touches[0];
        fsTouchStartX = t.clientX; fsTouchStartY = t.clientY; fsTouchT = performance.now();
      }, { passive: true });
      fsTouch.addEventListener("touchend", (e) => {
        const t = e.changedTouches[0];
        const dy = fsTouchStartY - t.clientY;
        const dx = t.clientX - fsTouchStartX;
        const dt = performance.now() - fsTouchT;
        const isTap = dt < 300 && Math.abs(dy) < 12 && Math.abs(dx) < 12;
        const isSwipeUp = dy > 30 && Math.abs(dx) < Math.abs(dy);
        if (isTap || isSwipeUp) showFsFloat();
      }, { passive: true });
      fsTouch.addEventListener("click", () => showFsFloat());

      // 曲库搜索与筛选
      $("scSearch").oninput = (e) => { F.search = e.target.value.trim(); renderList(); };
      function onFilterClick(e, field) {
        const b = e.target.closest("button");
        if (!b || b.dataset.v === undefined) return;
        F[field] = b.dataset.v;
        const seg = b.closest(".seg");
        seg.querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === b));
        renderList();
      }
      $("scKeySeg").onclick = (e) => onFilterClick(e, "key");
      $("scTypeSeg").onclick = (e) => onFilterClick(e, "type");
      $("scShiftSeg").onclick = (e) => onFilterClick(e, "shift");

      // 换把标记：移动端长按弹出提示（桌面用原生 title 悬浮）
      sheet.addEventListener("touchstart", (e) => {
        const mk = e.target.closest(".shiftmark");
        if (!mk) return;
        const t = setTimeout(() => { if (ET.toast) ET.toast(mk.dataset.tip); }, 450);
        const clear = () => clearTimeout(t);
        sheet.addEventListener("touchend", clear, { once: true });
        sheet.addEventListener("touchmove", clear, { once: true });
      }, { passive: true });

      function toggleFull() {
        const on = el.classList.toggle("score-fullscreen");
        const btn = $("scFull");
        btn.textContent = on ? "✕ 退出全屏" : "⛶ 全屏图谱";
        btn.classList.toggle("toggled", on);
        if (on) {
          st.fsTimeline = false; // 全屏默认隐藏顶部概览轴
          if ($("scFsPlay")) $("scFsPlay").textContent = st.playing ? "■ 停止" : "▶ 播放";
          $("scFsSpeed").value = S.speed; $("scFsSpeedN").textContent = S.speed.toFixed(2) + "x";
          // 手机端默认收起控制浮层，保留最大谱面
          const sh = $("scFsFloat");
          if (window.matchMedia("(max-width:640px)").matches) {
            sh.classList.add("collapsed");
            sh.setAttribute("aria-hidden", "true");
            closeFsModal();
          } else {
            sh.classList.remove("collapsed");
            sh.setAttribute("aria-hidden", "false");
          }
        } else {
          hideFsFloat();
        }
        applyToggles();
        if (on) scrollToBar(st.playing ? (lastKBar || st.startBar) : st.startBar);
      }
      document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && el.classList.contains("score-fullscreen")) toggleFull();
      });
      $("scFull").onclick = toggleFull;
      $("scFsFull").onclick = toggleFull;

      // 顶部时间轴：点击 / 拖拽跳转
      const tlTrack = $("scSigTrack");
      tlTrack.addEventListener("pointerdown", (e) => { tlDrag = true; seek(barFromX(e.clientX), false); tlTrack.setPointerCapture(e.pointerId); });
      tlTrack.addEventListener("pointermove", (e) => { if (tlDrag) seek(barFromX(e.clientX), false); });
      tlTrack.addEventListener("pointerup", (e) => { if (tlDrag) { seek(barFromX(e.clientX), true); tlDrag = false; } });
      tlTrack.addEventListener("pointercancel", () => { tlDrag = false; });

      $("scSpeedN").textContent = S.speed.toFixed(2) + "x";
      $("scFsSpeedN").textContent = S.speed.toFixed(2) + "x";
      renderList();
      if (items.length) select(items[0].id);

      function exitFullscreen() {
        if (!el.classList.contains("score-fullscreen")) return;
        el.classList.remove("score-fullscreen");
        const btn = $("scFull");
        btn.textContent = "⛶ 全屏图谱";
        btn.classList.remove("toggled");
        hideFsFloat();
        closeFsModal();
      }
      function cleanup() {
        stop();
        if (st.micOn) toggleMic();
        exitFullscreen();
      }

      this._api = { toggle, setAB, isPlaying: () => st.playing, stop, cleanup };
    },
    api() { return this._api; },
  };
})();

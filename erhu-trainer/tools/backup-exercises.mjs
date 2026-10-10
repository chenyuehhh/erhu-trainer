/* tools/backup-exercises.mjs — 把当前 exercises.js 的数组导出为 JSON 备份（一次性脚本） */
import fs from "node:fs";
import path from "node:path";
import url from "node:url";

const ROOT = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), "..");
const win = { ET: {} };
global.window = win;
const code = fs.readFileSync(path.join(ROOT, "js/data/exercises.js"), "utf8");
// ET 是 IIFE 内的 const，外部不可见 → 在 IIFE 收尾前注入导出
new Function("window", code.replace(/\}\)\(\);\s*$/, "window.OUT = ET.exercises;\n})();"))(win);

const out = {
  removedAt: "2026-10-09",
  reason: "会长拍板：删除10首自编原创练习曲（训练目标不成体系），改用刘天华公版练习曲体系",
  sourceFile: "js/data/exercises.js",
  count: win.OUT.length,
  items: win.OUT,
};
fs.writeFileSync(
  path.join(ROOT, "tools/backup-removed-exercises-20261009.json"),
  JSON.stringify(out, null, 2),
  "utf8"
);
console.log("backup written, count =", win.OUT.length, "| ids:", win.OUT.map((x) => x.id).join(","));

/**
 * 脚本：获取指定股票前五个交易日（不含今天）的融资余额
 * 环境：Quantumult X / Surge (支持 $task.fetch)
 */

(async () => {
  // —— 1. 配置区 ——
  // 在这里填入你要查询的三只股票代码
  const codes = ["002648", "600519", "000001"];
  // API 模板
  const apiBase =
    "https://www.szse.cn/api/report/ShowReport/data?SHOWTYPE=JSON&CATALOGID=1837_xxpl";

  // —— 2. 辅助函数 ——
  // 格式化日期为 yyyy-MM-dd
  function formatDate(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  // 获取某只股票某一日期的融资余额及名称
  async function fetchFinancing(dateStr, code) {
    const url = `${apiBase}&txtDate=${dateStr}&txtZqdm=${code}`;
    const resp = await $task.fetch({
      url
    }); // GET 请求
    const json = JSON.parse(resp.body);
    // 找到明细表（tab2）
    const detail = json.find((item) => item.metadata.tabkey === "tab2");
    if (detail && detail.data.length > 0) {
      const row = detail.data[0];
      return {
        name: row.zqjc,
        code: row.zqdm,
        balance: row.jrrzye, // 单位：亿元
      };
    }
    return null;
  }

  // 针对一只股票，获取前五个交易日的融资余额
  async function getLast5(code) {
    const results = [];
    let cursor = new Date();
    cursor.setDate(cursor.getDate() - 1); // 从昨天开始
    while (results.length < 5) {
      const wd = cursor.getDay();
      // 跳过周末
      if (wd !== 0 && wd !== 6) {
        const ds = formatDate(cursor);
        const info = await fetchFinancing(ds, code);
        if (info) {
          results.push(info);
        }
      }
      cursor.setDate(cursor.getDate() - 1);
    }
    return results;
  }

  // —— 3. 主流程 ——
  const lines = [];
  for (const code of codes) {
    const list = await getLast5(code);
    // 前五个交易日的融资余额列表
    const balances = list.map((x) => x.balance);
    // 取第一个结果里的名称和代码
    const {
      name,
      code: cd
    } = list[0];
    lines.push(`${name}（${cd}）：${balances.join(" ")}`);
  }

  const output = lines.join("\n");
  console.log(output);
  $notify("前五日融资余额", "", output);
  $done();
})();

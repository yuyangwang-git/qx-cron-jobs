/**
 * 脚本：获取指定股票近五日的融资买入额和融资余额
 * 环境：Quantumult X / Surge (支持 $task.fetch)
 */

const codes = ['002648', '000001', '600000'];  // 在此填入你需要爬取的股票代码
const results = [];

/**
 * 把 Date 对象格式化为 YYYY-MM-DD
 */
function formatDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * 获取最近 n 个交易日（跳过周六、周日），返回 YYYY-MM-DD 数组，按日期升序
 */
function getLastNDates(n) {
  const dates = [];
  const today = new Date();
  let cursor = new Date(today);
  while (dates.length < n) {
    // 如果不是周末，就收集
    if (cursor.getDay() !== 0 && cursor.getDay() !== 6) {
      dates.push(formatDate(cursor));
    }
    cursor.setDate(cursor.getDate() - 1);
  }
  return dates.reverse();
}

;(async () => {
  const dates = getLastNDates(5);

  for (const code of codes) {
    for (const date of dates) {
      const url = `https://www.szse.cn/api/report/ShowReport/data?SHOWTYPE=JSON&CATALOGID=1837_xxpl&txtDate=${date}&txtZqdm=${code}`;
      try {
        const response = await $task.fetch({ url, method: 'GET' });
        const json = JSON.parse(response.body);

        // 第一段数据就是总体汇总
        const summary = json[0]?.data?.[0] || {};
        results.push({
          code,
          date,
          jrrzmr: summary.jrrzmr || 'N/A',
          jrrzye: summary.jrrzye || 'N/A'
        });
      } catch (err) {
        console.error(`❌ 获取 ${code} ${date} 时出错：`, err);
        results.push({ code, date, jrrzmr: null, jrrzye: null, error: err.message });
      }
    }
  }

  // 输出到控制台
  console.log('—— 融资数据 ——');
  console.log(JSON.stringify(results, null, 2));

  // 发送系统通知
  $notify('融资数据抓取完成', '', JSON.stringify(results, null, 2));

  $done();
})();

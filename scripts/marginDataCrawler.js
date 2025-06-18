/**
 * 爬取指定股票前五个交易日融资余额数据
 * 环境：Quantumult X 脚本
 */

// 需爬取的股票列表
const stocks = ["000766", "002648", "002920"].reverse();
const numDays = 5; // 前几交易日，不含今天

; (async function () {
  // 格式化日期为 YYYY-MM-DD
  const formatDate = date => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  // 判断交易日：接口有数据为交易日
  async function isTradingDay(txtDate) {
    const url = `https://www.szse.cn/api/report/ShowReport/data?SHOWTYPE=JSON&CATALOGID=1837_xxpl&txtDate=${txtDate}&txtZqdm=${stocks[0]}`;
    try {
      const resp = await $task.fetch({ url, method: 'GET' });
      const body = JSON.parse(resp.body);
      return !!(body && body[0] && body[0].data && body[0].data[0]);
    } catch {
      return false;
    }
  }

  // 计算前 numDays 个交易日日期
  const dates = [];
  let d = new Date();
  d.setDate(d.getDate() - 1);
  while (dates.length < numDays) {
    const txt = formatDate(d);
    const wd = d.getDay();
    if (wd !== 0 && wd !== 6 && await isTradingDay(txt)) {
      dates.push(txt);
    }
    d.setDate(d.getDate() - 1);
  }

  // 并发请求数据
  const reqs = [];
  stocks.forEach(code => dates.forEach(date => {
    reqs.push({
      url: `https://www.szse.cn/api/report/ShowReport/data?SHOWTYPE=JSON&CATALOGID=1837_xxpl&txtDate=${date}&txtZqdm=${code}`,
      method: 'GET', code
    });
  }));

  try {
    const resps = await Promise.all(reqs.map(r => $task.fetch(r)));
    const dataMap = {};
    resps.forEach((resp, i) => {
      const code = reqs[i].code;
      let body;
      try { body = JSON.parse(resp.body); } catch { body = null; }
      
      // 使用 body[1] 而非 body[0]，后者为全市场数据
      const row = body && body[1] && body[1].data && body[1].data[0];
      const name = row ? row['zqjc'] : code;
      const bal = row ? row['jrrzye'] : '';
      if (!dataMap[code]) dataMap[code] = { name, balances: [] };
      dataMap[code].balances.push(String(bal));
    });

    // 按要求格式输出结果
    Object.keys(dataMap).forEach(code => {
      const { name, balances } = dataMap[code];
      $notify(`${name}（${code}）`, '近 5 日融资余额（亿元）', `${balances.join(', ')}`);

      // 调试用输出
      const line = `${name}（${code}）：${balances.join(', ')}`;
      console.log(line);
    });


    // // 计算显示长度，中文算2，ASCII算1
    // function displayLen(str) {
    //   return Array.from(str).reduce((l, ch) => /[\u4e00-\u9fa5]/.test(ch) ? l + 2 : l + 1, 0);
    // }

    // // 前缀对齐
    // const prefixes = stocks.map(c => `${dataMap[c].name}（${c}）`);
    // const prefixWidth = prefixes.reduce((m, p) => Math.max(m, displayLen(p)), 0);

    // // 各日数值列宽
    // const colWidths = Array(numDays).fill(0);
    // stocks.forEach(c => {
    //   dataMap[c].balances.forEach((b, idx) => {
    //     colWidths[idx] = Math.max(colWidths[idx], displayLen(b));
    //   });
    // });

    // // 输出对齐行
    // prefixes.forEach((pre, idx) => {
    //   const code = stocks[idx];
    //   const padPre = ' '.repeat(prefixWidth - displayLen(pre));
    //   const padded = dataMap[code].balances.map((b, j) => {
    //     const pad = colWidths[j] - displayLen(b);
    //     return ' '.repeat(pad) + b;
    //   });
    //   console.log(`${pre}${padPre}：${padded.join(', ')}`);
    //   $notify(`${pre}${padPre}`, '近 5 个交易日融资余额（亿元）', `${padded.join(', ')}`);
    // });
    
  } catch (e) {
    $notify('融资余额爬取', '失败', e.error || e);
  } finally {
    $done();
  }
})();

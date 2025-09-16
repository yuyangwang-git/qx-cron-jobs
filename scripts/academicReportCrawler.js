/**
 * 中科大研究生院学术报告爬虫（Quantumult X / Surge 等脚本环境）
 * 功能：
 * 1) 按 *order=-BGSJ 抓取并自动翻页
 * 2) 忽略 BGSJ 为空
 * 3) 按 YXDM_DISPLAY 过滤（默认忽略“长春应用化学研究所”）
 * 4) 仅保留 BGSJ >= 今天 的报告
 * 5) 以模板方式逐条 $notify 通知
 */

const endpoint = 'https://yjs1.ustc.edu.cn/gsapp/sys/xsbgglappustc/modules/xsbgxk/wxbgbgdz.do';

// —— 可自定义配置 ——
const pageSize = 20; // 每页条数（与前端一致即可）
const maxPages = 50; // 最大翻页保护，避免异常无限翻页
const blockedOrgs = new Set(['长春应用化学研究所']); // 默认屏蔽的院系/所
// 如果接口需要登录凭证，可在此填写 Cookie（可留空试试看）
const COOKIE = ''; // 例如: 'JSESSIONID=xxxx; route=xxxx'

// —— 工具函数 ——
const pad = n => String(n).padStart(2, '0');

// 解析接口的 BGSJ（可能是 "YYYY-MM-DD HH:mm" 或 "YYYY-MM-DD HH:mm:ss"）
function parseBgsj(str) {
  if (!str) return null;
  // 统一补齐秒位
  const s = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(str) ? `${str}:00` : str;
  // 将 "YYYY-MM-DD HH:mm:ss" 转成本地可解析格式
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/);
  if (!m) return null;
  const [ , y, M, d, h, mnt, sec ] = m.map(Number);
  return new Date(y, M - 1, d, h, mnt, sec);
}

function formatForSubtitle(dt) {
  const y = dt.getFullYear();
  const M = pad(dt.getMonth() + 1);
  const d = pad(dt.getDate());
  const h = pad(dt.getHours());
  const m = pad(dt.getMinutes());
  return `${y}-${M}-${d} ${h}:${m}`;
}

// —— 主流程 ——
;(async function () {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const headers = {
    'Accept': 'application/json, text/javascript, */*; q=0.01',
    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
    'X-Requested-With': 'XMLHttpRequest',
  };
  if (COOKIE) headers['Cookie'] = COOKIE;

  let page = 1;
  let totalPages = Infinity;
  const picked = [];

  try {
    while (page <= totalPages && page <= maxPages) {
      const body = `*order=-BGSJ&pageSize=${pageSize}&pageNumber=${page}`;
      const resp = await $task.fetch({ url: endpoint, method: 'POST', headers, body });
      let json;
      try { json = JSON.parse(resp.body); } catch { json = null; }

      const block = json && json.datas && json.datas.wxbgbgdz;
      const rows = block && Array.isArray(block.rows) ? block.rows : [];
      const total = block && Number(block.totalSize) || 0;
      const size = block && Number(block.pageSize) || pageSize;
      totalPages = Math.max(1, Math.ceil(total / size));

      // 本页处理
      let seenOlder = false;
      for (const r of rows) {
        const org = (r.YXDM_DISPLAY || '').trim();
        const bgsjStr = r.BGSJ && String(r.BGSJ).trim();
        if (!bgsjStr) continue;                     // 2) 忽略 BGSJ 为空
        if (blockedOrgs.has(org)) continue;         // 3) 过滤默认屏蔽单位

        const bgsj = parseBgsj(bgsjStr);
        if (!bgsj) continue;

        if (bgsj >= todayStart) {                   // 4) 仅保留今天及以后
          picked.push({
            title: r.BGTMZW || '(无题)',
            time: bgsj,
            org,
            place: r.DD || '',                      // 地点（可能为空）
            speaker: r.BGRZW || '',                 // 报告人（可能为空）
            chosen: r.YXRS,                         // 已选人数
            limit: r.KXRS,                          // 限额
            openSel: r.SFKXK,                       // 是否可选课
            code: r.BGBM                            // 报名编码
          });
        } else {
          // 由于按 -BGSJ 排序，大概率本页后续也都更旧了
          seenOlder = true;
        }
      }

      if (seenOlder && page > 1) break; // 早停：已遇到早于今天的记录

      page++;
    }

    // 5) 通知（模板式逐条通知）
    if (picked.length === 0) {
      $notify('中科大 · 学术报告', '今天起暂无新报告', formatForSubtitle(new Date()));
      console.log('No upcoming talks from today.');
    } else {
      // 为了阅读体验，按时间升序通知（最近的在前）
      picked.sort((a, b) => a.time - b.time);

      picked.forEach(item => {
        const subtitleParts = [
          formatForSubtitle(item.time),
          item.org,
          item.place && `地点：${item.place}`
        ].filter(Boolean);

        const bodyParts = [
          item.speaker && `报告人：${item.speaker}`,
          (item.chosen != null && item.limit != null) && `名额：${item.chosen}/${item.limit}`,
          (item.openSel === '1' ? '可选课' : '不可选课'),
          item.code && `编码：${item.code}`
        ].filter(Boolean);

        $notify(
          item.title,
          subtitleParts.join('｜'),
          bodyParts.join('｜')
        );

        // 调试输出
        console.log(`${item.title} | ${subtitleParts.join(' | ')} | ${bodyParts.join(' | ')}`);
      });
    }
  } catch (e) {
    $notify('中科大 · 学术报告', '抓取失败', String(e && e.error || e));
    console.log('Fetch error:', e);
  } finally {
    $done();
  }
})();

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
const COOKIE = 'GS_DBLOGIN_TOKEN=301efb37411143459584741b11a425b7b2m6; GS_SESSIONID=7a033192d0c859c3f59118e6037ce8a7; EMAP_LANG=zh; THEME=blue; _WEU=iRibaJ3viebQxDrKdd0vSFqNzNwvqA_LIshnWY*USZvcAeSHS1D5v6lFsqbzxJrEDTgJWIm66X7DBmvRIn5i*IzmQswPJUVTY5C3VeccPuYY7s*95A1Mst1ZMZetxqoChtqM7oNOb42LLa2O9AP10*esMHAzuhzS2gSZXC8yoNPZBiB0_5qBgsX49kEpAB5lWUzXywsXF0rT_N5F0PhQDsIQuq7vXXPoATp6ND_Mt3YeAu6RJYp2M5YXYFDU0t0oz7SirFsIyXbF7tG0Yo76l*Qr0y09ppewMum0Iw35nHjTkSAXpzg6POaORlEHYxtnTfJElscxh5na3IaVE2vOBO_cm93VjV7GB5BRqEcl*knlmIOe*yaMFIHvDJ63qzQsjO15nKx0E0JwRBfwg40mHwr1t5ZdeHujn1*FijZ2VgUzyWMs1FMrTlE0zh2LyrfZFASbhIJAKkT_g5Vxm3TfJ1xq0cpTfZ*LoelvR8F2o1Q6WMNKTUgbEaqW6f34PR7A4A*Mo2i1m7dbD9kkp3njZ4BxjyARK9BgW4s*K*EXJuNNogphOAPlQISKaD3qNTD7WQvD02E1zFXJxE9goQ6rZi6plmen5KQ5sMD3JWBUOx_WXwqh9R1uvMFKXo8dx_7kjenUU5B7jI8I5DBwZTEor3isWoyoHBU7rmxtQ6d*JkO6oZT1VFbVfj..; _ga=GA1.3.487617859.1700020561; sduuid=35b55afa68c8554600610d42658f4a48; _ga_VR0TZSDVGE=GS2.3.s1757320363^$o7^$g1^$t1757320368^$j55^$l0^$h0; _clck=g358vw%5E2%5Efz9%5E0%5E1885; route=b6841d1687a9f4e770a4a4e853259116'; // 例如: 'JSESSIONID=xxxx; route=xxxx'

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
    // 先按时间升序，随后应用过滤条件：
    //  1) 仅可选课 (SFKXK === '1')
    //  2) 容量未满（已选 < 限额；若限额或已选无效，则不按“满”处理）
    picked.sort((a, b) => a.time - b.time);

    const filtered = picked.filter(item => {
      const openSel = String(item.openSel || '');
      if (openSel !== '1') return false; // 不可选课→不通知

      const chosen = Number(item.chosen);
      const limit  = Number(item.limit);
      const chosenValid = Number.isFinite(chosen);
      const limitValid  = Number.isFinite(limit);

      // 容量已满→不通知；若缺失或非数字则视为“未知上限”，不过滤掉
      if (chosenValid && limitValid && limit > 0 && chosen >= limit) return false;

      return true;
    });

    if (filtered.length === 0) {
      $notify('中科大 · 学术报告', '今天起暂无新报告', formatForSubtitle(new Date()));
      console.log('No upcoming talks (after filtering).');
    } else {
      filtered.forEach(item => {
        const subtitleParts = [
          formatForSubtitle(item.time),
          item.org,
          item.place && `地点：${item.place}`
        ].filter(Boolean);

        // 通知内容中去掉“可选课/不可选课”
        // 容量未满的才会进来，因此可展示当前名额进度（若数据可用）
        const chosen = Number(item.chosen);
        const limit  = Number(item.limit);
        const capLine = (Number.isFinite(chosen) && Number.isFinite(limit))
          ? `名额：${chosen}/${limit}`
          : '';

        const bodyParts = [
          item.speaker && `报告人：${item.speaker}`,
          capLine
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

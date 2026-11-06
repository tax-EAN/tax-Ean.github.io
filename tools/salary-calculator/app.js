/* 화면 처리: 왼쪽 메뉴, 입력 읽기, 결과(문서 모델 → 화면/이미지), 링크·이미지 공유 */
(function () {
  'use strict';
  var C = window.PayCalc, R = C.RATES;
  var $ = function (s, el) { return (el || document).querySelector(s); };
  var $$ = function (s, el) { return Array.prototype.slice.call((el || document).querySelectorAll(s)); };

  /* ---------- 숫자 ---------- */
  function won(n) { return Math.round(n).toLocaleString('ko-KR'); }
  function wonD(n) { return (Math.round(n * 100) / 100).toLocaleString('ko-KR', { maximumFractionDigits: 2 }); }
  function kr(n) {
    n = Math.round(n); if (!n) return '';
    var eok = Math.floor(n / 1e8), man = Math.floor((n % 1e8) / 1e4), rest = n % 1e4, s = [];
    if (eok) s.push(eok.toLocaleString('ko-KR') + '억');
    if (man) s.push(man.toLocaleString('ko-KR') + '만');
    if (rest) s.push(rest.toLocaleString('ko-KR'));
    return s.join(' ') + '원';
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function num(v) { v = String(v == null ? '' : v).replace(/[^0-9.\-]/g, ''); var n = parseFloat(v); return isNaN(n) ? 0 : n; }
  function md(d) { return (d.getUTCMonth() + 1) + '/' + d.getUTCDate(); }
  var WD = ['일', '월', '화', '수', '목', '금', '토'];
  var ROUNDNOTE = '끝전 절사로 인해 실제 금액과 단수 차이가 발생할 수 있어요.';

  /* ---------- 공통 입력 묶음 ---------- */
  var COMMON = {
    nontax:
      '<div class="fs"><h3>비과세 수당(월)</h3><div class="g2">' +
      '<label class="f"><span>식대</span><div class="in"><input type="text" inputmode="numeric" class="money" data-k="meal" value="200000"><em>원</em></div><small>월 20만원까지 비과세</small></label>' +
      '<label class="f"><span>자가운전보조금</span><div class="in"><input type="text" inputmode="numeric" class="money" data-k="car"><em>원</em></div><small>본인 차로 업무 시 월 20만원까지</small></label>' +
      '<label class="f"><span>출산·보육수당</span><div class="in"><input type="text" inputmode="numeric" class="money" data-k="child"><em>원</em></div><small>6세 이하 자녀 1명당 월 20만원까지</small></label>' +
      '<label class="f"><span>6세 이하 자녀 수</span><div class="in"><input type="text" inputmode="numeric" class="int" data-k="childKids" value="1"><em>명</em></div></label></div></div>',
    person:
      '<div class="fs"><h3>가족 · 세금</h3><div class="g2">' +
      '<label class="f"><span>공제대상 가족 수(본인 포함)</span><div class="in"><input type="text" inputmode="numeric" class="int" data-k="fam" value="1"><em>명</em></div><small>본인과 배우자도 각각 1명</small></label>' +
      '<label class="f"><span>그중 8세~20세 자녀 수</span><div class="in"><input type="text" inputmode="numeric" class="int" data-k="kids" value="0"><em>명</em></div></label>' +
      '<label class="f"><span>소득세 원천징수 비율</span><select data-k="ratio"><option value="100" selected>100%(기본)</option><option value="80">80%</option><option value="120">120%</option></select><small>직원이 신청한 경우에만 80%·120%</small></label>' +
      '<div class="f" style="justify-content:center;gap:6px"><label class="chk"><input type="checkbox" data-k="noNP">국민연금 제외(만 60세 이상 등)</label><label class="chk"><input type="checkbox" data-k="noEI">고용보험 제외(65세 이후 새로 고용 등)</label></div></div></div>',
    employer: function () {
      var opts = C.INDUSTRY.map(function (g) {
        return '<optgroup label="' + esc(g[0]) + '">' + g[1].map(function (it) {
          return '<option value="' + it[1] + '"' + (it[0] === '도소매·음식·숙박업' ? ' selected' : '') + ' data-name="' + esc(it[0]) + '">' + esc(it[0]) + ' (' + it[1] + '‰)</option>';
        }).join('') + '</optgroup>';
      }).join('');
      return '<div class="fs"><h3>회사 부담 계산</h3><div class="g2">' +
        '<label class="f"><span>상시 근로자 수</span><select data-k="size"><option value="s150" selected>150인 미만</option><option value="p150">150인 이상 우선지원대상기업</option><option value="u1000">150인 이상 1,000인 미만</option><option value="o1000">1,000인 이상·국가 등</option></select><small>고용보험 회사 부담률이 달라져요</small></label>' +
        '<label class="f"><span>산재보험 업종</span><select data-k="ind">' + opts + '</select><small>업종별 요율은 <a href="#rates" data-goto="rates">요율표</a>에서 확인</small></label></div></div>';
    },
    round:
      '<div class="fs"><label class="f"><span>시급·일급 끝전 처리</span><select data-k="round"><option value="round" selected>원 미만 반올림(일반적)</option><option value="floor">원 미만 버림</option><option value="none">끝전 그대로 계산</option></select><small>시급·1일 임금 같은 단가의 원 미만 처리 방법이에요. 마지막 지급액은 원 미만을 버려요.</small></label></div>'
  };
  $$('[data-common]').forEach(function (el) { var c = COMMON[el.getAttribute('data-common')]; el.outerHTML = typeof c === 'function' ? c() : c; });

  /* ---------- 입력 읽기 ---------- */
  function read(pane) {
    var o = {};
    $$('[data-k]', pane).forEach(function (el) {
      var k = el.getAttribute('data-k');
      if (el.type === 'radio') { if (el.checked) o[k] = el.value; }
      else if (el.type === 'checkbox') o[k] = el.checked;
      else if (el.classList.contains('money') || el.classList.contains('int') || el.classList.contains('dec')) o[k] = num(el.value);
      else o[k] = el.value;
    });
    return o;
  }
  function setK(pane, k, v) { var el = $('[data-k="' + k + '"]', pane); if (el) el.value = v; }
  function selName(pane, k) { var s = $('[data-k="' + k + '"]', pane); return s && s.selectedOptions[0] ? (s.selectedOptions[0].getAttribute('data-name') || s.selectedOptions[0].textContent) : ''; }
  function setLabel(pane, key, text) { var l = $('[data-lbl="' + key + '"]', pane); if (l) l.textContent = text; }
  function showIf(pane, o) { $$('[data-show]', pane).forEach(function (el) { var p = el.getAttribute('data-show').split('='); el.hidden = String(o[p[0]]) !== p[1]; }); }
  function hints(pane) { $$('input.money', pane).forEach(function (el) { var f = el.closest('.f'), h = f && $('.kr', f); if (h) h.textContent = kr(num(el.value)); }); }

  /* ======================================================================
     결과 문서 모델
     doc = { title, cond, sum:[{k,v,u,acc}], blocks:[...], notes:[[text, cls]] }
     block: {t:'slip', left:{head, rows, foot}, right:{...}, fin:[label, value]}
            {t:'table', title, head:[], rows:[{c:[...], cls}], num:[열 번호]}
            {t:'calc', title, lines:[]}
            {t:'text', text, cls}
     ====================================================================== */
  function S(k, v, u, acc) { return { k: k, v: v, u: u == null ? '원' : u, acc: acc }; }

  function html(doc) {
    var h = '<div class="r-head"><h3>' + esc(doc.title) + '</h3><span class="stamp">' + R.asOf + ' 기준 · 참고용</span></div>';
    if (doc.cond) h += '<p class="r-cond">' + esc(doc.cond) + '</p>';
    if (doc.sum) h += '<div class="sum">' + doc.sum.map(function (s) { return '<div' + (s.acc ? ' class="acc"' : '') + '><span class="k">' + esc(s.k) + '</span><span class="v">' + esc(s.v) + (s.u ? '<small>' + esc(s.u) + '</small>' : '') + '</span></div>'; }).join('') + '</div>';
    (doc.blocks || []).forEach(function (b) {
      h += '<div class="blk">' + (b.title ? '<h4>' + esc(b.title) + '</h4>' : '');
      if (b.t === 'slip') {
        var n = Math.max(b.left.rows.length, b.right.rows.length);
        var side = function (p, cls) {
          var t = '<table class="' + cls + '"><thead><tr><th>' + esc(p.head[0]) + '</th><th>' + esc(p.head[1]) + '</th></tr></thead><tbody>';
          for (var i = 0; i < n; i++) { var r = p.rows[i]; t += r ? '<tr><td>' + esc(r[0]) + '</td><td class="n">' + esc(r[1]) + '</td></tr>' : '<tr class="pad"><td>-</td><td></td></tr>'; }
          return t + '<tr class="tot"><td>' + esc(p.foot[0]) + '</td><td class="n">' + esc(p.foot[1]) + '</td></tr></tbody></table>';
        };
        h += '<div class="slip">' + side(b.left, 'l') + side(b.right, 'r') + '<div class="fin"><b>' + esc(b.fin[0]) + '</b><span>' + esc(b.fin[1]) + '</span></div></div>';
      } else if (b.t === 'table') {
        var isN = function (i) { return (b.num || []).indexOf(i) >= 0; };
        h += '<div class="tw"><table class="t"><thead><tr>' + b.head.map(function (x, i) { return '<th' + (isN(i) ? ' class="n"' : '') + '>' + esc(x) + '</th>'; }).join('') + '</tr></thead><tbody>';
        b.rows.forEach(function (r) {
          h += '<tr' + (r.cls ? ' class="' + r.cls + '"' : '') + '>' + r.c.map(function (x, i) {
            var main = Array.isArray(x) ? x[0] : x, sub = Array.isArray(x) ? x[1] : '';
            return '<td' + (isN(i) ? ' class="n"' : '') + '>' + esc(main) + (sub ? '<small>' + esc(sub) + '</small>' : '') + '</td>';
          }).join('') + '</tr>';
        });
        h += '</tbody></table></div>';
      } else if (b.t === 'calc') h += '<div class="calc">' + esc(b.lines.join('\n')) + '</div>';
      else if (b.t === 'text') h += '<p class="' + (b.cls || 'muted') + '" style="font-size:.88rem">' + esc(b.text) + '</p>';
      h += '</div>';
    });
    if (doc.notes && doc.notes.length) h += '<ul class="notes">' + doc.notes.map(function (n) { return '<li' + (n[1] ? ' class="' + n[1] + '"' : '') + '>' + esc(n[0]) + '</li>'; }).join('') + '</ul>';
    h += '<div class="acts noprint"><button class="btn main" type="button" data-act="img">이미지로 보내기</button><button class="btn" type="button" data-act="link">링크 복사</button><button class="btn" type="button" data-act="print">인쇄</button></div>';
    return h;
  }

  /* ---------- 이미지: 캔버스에 직접 그림(외부 라이브러리 없음) ---------- */
  var IMG = { ink: '#1d2024', muted: '#5f646b', line: '#dcdcd5', soft: '#f0f1ec', acc: '#1f5a6e', accSoft: '#e4eef1', warn: '#b13b1f', ok: '#2e6b3c', bg: '#ffffff' };
  var FONT = '"Malgun Gothic","Apple SD Gothic Neo","Noto Sans KR","Noto Sans CJK KR",sans-serif';
  function paint(ctx, doc, W) {
    var P = 28, x0 = P, x1 = W - P, y = P, cw = x1 - x0;
    function font(sz, b) { ctx.font = (b ? '700 ' : '400 ') + sz + 'px ' + FONT; }
    function txt(s, x, yy, col, al) { ctx.fillStyle = col || IMG.ink; ctx.textAlign = al || 'left'; ctx.fillText(s, x, yy); }
    function hl(yy, w, col, xa, xb) { ctx.fillStyle = col || IMG.line; ctx.fillRect(xa == null ? x0 : xa, yy, (xb == null ? x1 : xb) - (xa == null ? x0 : xa), w || 1); }
    function box(xa, yy, w, h, col) { ctx.fillStyle = col; ctx.fillRect(xa, yy, w, h); }
    function wrap(s, maxW) {
      var out = [], line = '';
      String(s).split(' ').forEach(function (w) {
        var t = line ? line + ' ' + w : w;
        if (ctx.measureText(t).width <= maxW) line = t;
        else { if (line) out.push(line); line = w; while (ctx.measureText(line).width > maxW) { var k = line.length; while (k > 1 && ctx.measureText(line.slice(0, k)).width > maxW) k--; out.push(line.slice(0, k)); line = line.slice(k); } }
      });
      if (line) out.push(line); return out;
    }
    ctx.textBaseline = 'alphabetic';
    // 머리
    hl(y, 3, IMG.ink); y += 34;
    font(21, true); txt(doc.title, x0, y);
    font(12); txt(R.asOf + ' 기준 · 참고용', x1, y, IMG.muted, 'right'); y += 10;
    if (doc.cond) { font(12.5); wrap(doc.cond, cw).forEach(function (l) { y += 19; txt(l, x0, y, IMG.muted); }); }
    y += 16;
    // 요약
    if (doc.sum) {
      var n = doc.sum.length, sw = cw / n, sh = 64;
      hl(y, 1); hl(y + sh, 1);
      doc.sum.forEach(function (s, i) {
        var sx = x0 + sw * i;
        if (s.acc) box(sx, y + 1, sw, sh - 1, IMG.accSoft);
        if (i) box(sx, y, 1, sh, IMG.line);
        font(11.5, true); txt(s.k, sx + 12, y + 22, IMG.muted);
        var vs = s.v, sz = s.acc ? 22 : 19; font(sz, true);
        while (ctx.measureText(vs + ' ' + s.u).width > sw - 20 && sz > 13) { sz--; font(sz, true); }
        txt(vs, sx + 12, y + 50, s.acc ? IMG.acc : IMG.ink);
        var vw = ctx.measureText(vs).width; font(12); txt(s.u, sx + 14 + vw, y + 50, IMG.muted);
      });
      y += sh + 18;
    }
    (doc.blocks || []).forEach(function (b) {
      if (b.title) { font(13.5, true); y += 6; txt(b.title, x0, y + 12); y += 22; }
      if (b.t === 'slip') {
        var n = Math.max(b.left.rows.length, b.right.rows.length), half = cw / 2, rh = 27;
        hl(y, 2, IMG.ink); box(x0, y + 2, cw, 28, IMG.soft); font(12, true);
        txt(b.left.head[0], x0 + half * 0.32, y + 21, IMG.muted, 'center'); txt(b.left.head[1], x0 + half * 0.78, y + 21, IMG.muted, 'center');
        txt(b.right.head[0], x0 + half + half * 0.32, y + 21, IMG.muted, 'center'); txt(b.right.head[1], x0 + half + half * 0.78, y + 21, IMG.muted, 'center');
        y += 30; hl(y, 1, IMG.ink);
        var top = y;
        for (var i = 0; i < n; i++) {
          font(13);
          [[b.left, x0], [b.right, x0 + half]].forEach(function (pr) { var r = pr[0].rows[i]; if (r) { txt(r[0], pr[1] + 10, y + 19); txt(r[1], pr[1] + half - 10, y + 19, IMG.ink, 'right'); } });
          y += rh; hl(y, 1);
        }
        hl(y, 2, IMG.ink); font(13, true);
        txt(b.left.foot[0], x0 + 10, y + 21); txt(b.left.foot[1], x0 + half - 10, y + 21, IMG.ink, 'right');
        txt(b.right.foot[0], x0 + half + 10, y + 21); txt(b.right.foot[1], x1 - 10, y + 21, IMG.ink, 'right');
        box(x0 + half, top, 1, y + 30 - top, IMG.line);
        y += 30; hl(y, 2, IMG.ink);
        box(x0, y + 2, cw, 44, IMG.accSoft); font(14, true); txt(b.fin[0], x0 + 12, y + 30);
        font(22, true); txt(b.fin[1], x1 - 12, y + 32, IMG.acc, 'right');
        y += 46; hl(y, 2, IMG.ink); y += 18;
      } else if (b.t === 'table') {
        var cols = b.head.length, isN = function (i) { return (b.num || []).indexOf(i) >= 0; };
        font(12.5);
        var widths = b.head.map(function (hd, i) { var m = 0; ctx.font = '700 12px ' + FONT; m = ctx.measureText(hd).width; font(12.5); b.rows.forEach(function (r) { var c = r.c[i]; var s = Array.isArray(c) ? c[0] : c; m = Math.max(m, ctx.measureText(String(s)).width); }); return m + 18; });
        var tot = widths.reduce(function (a, c) { return a + c; }, 0), scale = cw / tot;
        if (scale < 1) { var fs = Math.max(9.5, 12.5 * scale); widths = widths.map(function (w) { return w * scale; }); font(fs); } else widths = widths.map(function (w, i) { return i === 0 ? w + (cw - tot) : w; });
        var fsz = scale < 1 ? Math.max(9.5, 12.5 * scale) : 12.5;
        var xs = [x0]; widths.forEach(function (w, i) { xs.push(xs[i] + w); });
        hl(y, 2, IMG.ink); box(x0, y + 2, cw, 26, IMG.soft);
        ctx.font = '700 ' + Math.min(12, fsz) + 'px ' + FONT;
        b.head.forEach(function (hd, i) { txt(hd, isN(i) ? xs[i + 1] - 8 : xs[i] + 8, y + 19, IMG.muted, isN(i) ? 'right' : 'left'); });
        y += 28;
        b.rows.forEach(function (r) {
          var hasSub = r.c.some(function (c) { return Array.isArray(c) && c[1]; }), rh = hasSub ? 40 : 26;
          if (r.cls === 'tot') hl(y - 1, 2, IMG.ink); else if (r.cls === 'hl') box(x0, y, cw, rh, IMG.accSoft);
          r.c.forEach(function (c, i) {
            var main = Array.isArray(c) ? c[0] : c, sub = Array.isArray(c) ? c[1] : '';
            ctx.font = (r.cls === 'tot' || r.cls === 'grp' ? '700 ' : '400 ') + fsz + 'px ' + FONT;
            txt(String(main), isN(i) ? xs[i + 1] - 8 : xs[i] + 8 + (r.cls === 'ind' && i === 0 ? 12 : 0), y + 18, IMG.ink, isN(i) ? 'right' : 'left');
            if (sub) { ctx.font = '400 ' + (fsz - 2) + 'px ' + FONT; txt(String(sub), isN(i) ? xs[i + 1] - 8 : xs[i] + 8, y + 33, IMG.muted, isN(i) ? 'right' : 'left'); }
          });
          y += rh; hl(y, 1);
        });
        y += 16;
      } else if (b.t === 'calc') {
        ctx.font = '400 12.5px ui-monospace,Menlo,Consolas,' + FONT;
        var lh = 21, bh = b.lines.length * lh + 16; box(x0, y, cw, bh, IMG.soft);
        b.lines.forEach(function (l, i) { txt(l, x0 + 12, y + 22 + i * lh); });
        y += bh + 14;
      } else if (b.t === 'text') {
        font(13, b.cls === 'w' || b.cls === 'ok');
        wrap(b.text, cw).forEach(function (l) { y += 19; txt(l, x0, y, b.cls === 'w' ? IMG.warn : b.cls === 'ok' ? IMG.ok : IMG.muted); }); y += 12;
      }
    });
    if (doc.notes && doc.notes.length) {
      font(12);
      doc.notes.forEach(function (nn) { ctx.font = (nn[1] ? '700 ' : '400 ') + '12px ' + FONT; wrap('· ' + nn[0], cw).forEach(function (l) { y += 18; txt(l, x0, y, nn[1] === 'w' ? IMG.warn : nn[1] === 'ok' ? IMG.ok : IMG.muted); }); });
      y += 10;
    }
    y += 14; hl(y, 1); y += 20; font(11);
    txt('급여·노무 계산기 · tax-ean.github.io/tools/salary-calculator', x0, y, IMG.muted);
    return y + P;
  }
  function docImage(doc) {
    var W = 720, sc = 2, m = document.createElement('canvas').getContext('2d');
    var H = Math.ceil(paint(m, doc, W));
    var cv = document.createElement('canvas'); cv.width = W * sc; cv.height = H * sc;
    var ctx = cv.getContext('2d'); ctx.scale(sc, sc); ctx.fillStyle = IMG.bg; ctx.fillRect(0, 0, W, H);
    paint(ctx, doc, W); return cv;
  }

  /* ---------- 결과 넣기 ---------- */
  var DOCS = {};
  function show(pane, doc) { DOCS[pane.id] = doc; $('[data-out]', pane).innerHTML = html(doc); }
  function err(pane, title, msg) { DOCS[pane.id] = null; $('[data-out]', pane).innerHTML = '<div class="r-head"><h3>' + esc(title) + '</h3></div><p class="err">' + esc(msg) + '</p>'; }

  /* ---------- 급여 ---------- */
  function salaryInput(o, gross) {
    return { gross: gross, nontax: { meal: o.meal, car: o.car, child: o.child, childKids: o.childKids }, fam: Math.max(1, o.fam | 0), kids: Math.max(0, o.kids | 0), ratio: +o.ratio || 100, noNP: o.noNP, noEI: o.noEI, size: o.size, indRate: +o.ind, npBase: o.npBase, hiBase: o.hiBase };
  }
  function personCond(o) { return '가족 ' + (o.fam || 1) + '명' + (o.kids ? '(8~20세 자녀 ' + o.kids + '명)' : '') + (o.ratio && o.ratio !== '100' ? ' · 원천징수 ' + o.ratio + '%' : ''); }
  function ntCond(o) { var a = []; if (o.meal) a.push('식대 ' + won(o.meal)); if (o.car) a.push('자가운전 ' + won(o.car)); if (o.child) a.push('보육수당 ' + won(o.child)); return a.length ? '비과세 ' + a.join(', ') : '비과세 없음'; }
  function salaryDoc(s, pane, o, title, cond, extraNotes) {
    var e = s.emp, r = s.er, ntPaid = (o.meal || 0) + (o.car || 0) + (o.child || 0);
    var left = [['기본급 등(과세)', won(s.gross - ntPaid)]];
    if (o.meal) left.push(['식대', won(o.meal)]);
    if (o.car) left.push(['자가운전보조금', won(o.car)]);
    if (o.child) left.push(['출산·보육수당', won(o.child)]);
    var right = [['국민연금', won(e.np)], ['건강보험', won(e.hi)], ['장기요양보험', won(e.ltc)], ['고용보험', won(e.ei)], ['소득세', won(e.tax)], ['지방소득세', won(e.local)]];
    var eiRate = o.noEI ? '제외' : '0.9% / ' + (0.9 + R.ei.extra[o.size || 's150'] * 100).toFixed(2).replace(/0$/, '') + '%';
    var ins = [
      { c: [['국민연금', '기준 ' + won(s.npBase) + '원'], o.noNP ? '제외' : '4.75% / 4.75%', won(e.np), won(r.np), won(e.np + r.np)] },
      { c: [['건강보험', '기준 ' + won(s.hiBase) + '원'], '3.595% / 3.595%', won(e.hi), won(r.hi), won(e.hi + r.hi)] },
      { c: [['장기요양보험', '건강보험료의 13.14%'], '반씩', won(e.ltc), won(r.ltc), won(e.ltc + r.ltc)] },
      { c: [['고용보험', '회사분에 고용안정·직업능력개발 포함'], eiRate, won(e.ei), won(r.ei), won(e.ei + r.ei)] },
      { c: [['산재보험', selName(pane, 'ind') + ' ' + o.ind + '‰ + 출퇴근 0.6‰'], '회사 전액', '0', won(r.ind), won(r.ind)] },
      { c: ['합계', '', won(e.ins), won(r.sum), won(e.ins + r.sum)], cls: 'tot' }
    ];
    var notes = (extraNotes || []).slice();
    if (s.nontax.excess > 0) notes.push(['비과세 한도를 넘는 ' + won(s.nontax.excess) + '원은 과세 급여로 계산했어요.', 'w']);
    if (!o.npBase && s.taxable > R.np.max) notes.push(['국민연금은 기준소득월액 상한 ' + won(R.np.max) + '원까지만 매겨요(' + R.np.period + ').']);
    notes.push(['소득세는 근로소득 간이세액표(2026.3.1 시행)로 계산했어요. 연말정산 결과와 다를 수 있어요.']);
    notes.push([ROUNDNOTE]);
    return {
      title: title, cond: cond,
      sum: [S('세전 급여', won(s.gross)), S('공제 합계', won(e.sum)), S('실수령액', won(s.net), '원', true), S('회사 월 인건비', won(s.cost))],
      blocks: [
        { t: 'slip', title: '급여명세서(참고용)', left: { head: ['지급 내역', '지급액'], rows: left, foot: ['지급액 계', won(s.gross)] }, right: { head: ['공제 내역', '공제액'], rows: right, foot: ['공제액 계', won(e.sum)] }, fin: ['차인지급액(실수령액)', won(s.net) + '원'] },
        { t: 'table', title: '4대보험 부담 내역(근로자 / 회사)', head: ['구분', '요율(근로자/회사)', '근로자', '회사', '합계'], num: [2, 3, 4], rows: ins },
        { t: 'table', title: '회사가 쓰는 돈(월)', head: ['항목', '금액'], num: [1], rows: [
          { c: ['세전 급여', won(s.gross)] }, { c: ['회사 부담 4대보험', won(r.sum)] }, { c: ['월 인건비 합계', won(s.cost)], cls: 'tot' },
          { c: [['퇴직금 적립 참고(월급의 1/12)', '1년 이상 근무하면 퇴직금이 생겨요'], won(s.severanceMonthly)] }] }
      ],
      notes: notes
    };
  }

  var CALC = {
    pay: function (pane, o) {
      showIf(pane, o);
      setLabel(pane, 'amount', o.basis === 'year' ? '연봉(세전)' : '월급(세전)');
      var ntPaid = (o.meal || 0) + (o.car || 0) + (o.child || 0), s, cond, notes = [];
      if (o.mode === 'net') {
        if (o.target <= 0) return err(pane, '급여 계산 결과', '월 실수령액을 입력해주세요.');
        s = C.salaryReverse(salaryInput(o, 0), o.target, 1);
        cond = '실수령액 ' + won(o.target) + '원으로 계산 · ' + ntCond(o) + ' · ' + personCond(o);
        var diff = s.net - o.target;
        notes.push(diff ? ['실수령액 ' + won(o.target) + '원 이상이 되는 가장 작은 세전 급여예요. 간이세액표 구간 때문에 실수령액이 ' + won(diff) + '원 많아요.'] : ['세전 급여 ' + won(s.gross) + '원이면 실수령액이 정확히 ' + won(o.target) + '원이에요.', 'ok']);
        notes.push(['세전 연봉으로는 ' + won(s.gross * 12) + '원(퇴직금 별도)이에요.']);
      } else {
        var monthly = o.basis === 'month' ? o.amount : o.amount / (o.sev13 ? 13 : 12);
        var gross = Math.round(o.inclNT ? monthly : monthly + ntPaid);
        if (gross <= 0) return err(pane, '급여 계산 결과', '금액을 입력해주세요.');
        if (o.inclNT && ntPaid > gross) return err(pane, '급여 계산 결과', '비과세 수당이 월급보다 커요. 금액을 확인해주세요.');
        s = C.salary(salaryInput(o, gross));
        cond = (o.basis === 'month' ? '월급 ' : '연봉 ') + won(o.amount) + '원' + (o.basis === 'year' ? (o.sev13 ? '(퇴직금 포함 ÷13)' : '(÷12)') : '') + ' · ' + ntCond(o) + ' · ' + personCond(o);
        notes.push(['연간 실수령액 약 ' + won(s.net * 12) + '원 · 회사 연간 인건비 약 ' + won(s.cost * 12) + '원(퇴직금 제외)']);
      }
      if (o.npBase || o.hiBase) notes.push(['국민연금·건강보험은 직접 넣은 신고 금액으로 계산했어요.']);
      show(pane, salaryDoc(s, pane, o, '급여 계산 결과', cond, notes));
    },

    hiset: function (pane, o) {
      showIf(pane, o);
      var mm = C.hiMonths(o.join, o.retire);
      var info = $('.hmh', pane);
      if (!mm) { info.textContent = '보수총액을 나누는 달 수(입사한 달 포함). 비워두면 자동 계산'; $('.hch', pane).textContent = '보험료를 매기는 달 수. 비워두면 자동 계산'; return err(pane, '건강보험 퇴직정산 결과', (o.join && o.retire) ? '퇴직일이 입사일보다 빨라요. 날짜를 확인해주세요.' : '입사일과 퇴직일을 넣어주세요.'); }
      if (mm.year !== 2026) return err(pane, '건강보험 퇴직정산 결과', '이 계산기는 2026년 요율 기준이라 2026년 퇴직만 계산할 수 있어요.');
      var midJoin = C.D(o.join).getUTCFullYear() === mm.year && C.D(o.join).getUTCDate() !== 1;
      info.textContent = '자동: ' + (mm.workStart + 1) + '월 ~ ' + (mm.endMonth + 1) + '월, ' + mm.workMonths + '개월';
      $('.hch', pane).textContent = '자동: ' + (mm.startMonth + 1) + '월 ~ ' + (mm.endMonth + 1) + '월, ' + mm.months + '개월' + (midJoin ? ' (1일이 아닌 날 입사해 입사한 달은 보험료를 매기지 않아요)' : '');
      var months = o.monthsOv > 0 ? o.monthsOv : mm.workMonths;
      var charge = o.chargeOv > 0 ? o.chargeOv : mm.months;
      if (!(months > 0)) return err(pane, '건강보험 퇴직정산 결과', '근무월수를 확인해주세요.');
      if (!(charge > 0)) return err(pane, '건강보험 퇴직정산 결과', '보험료 부과 월수가 0개월이에요. 입사한 달에 퇴사하면 정산할 보험료가 없을 수 있어요.');
      if (!(o.total > 0)) return err(pane, '건강보험 퇴직정산 결과', '퇴직 연도 보수총액을 넣어주세요.');
      var paidHi, paidLtc, pm;
      if (o.paidMode === 'direct') { paidHi = o.paidHi || 0; paidLtc = o.paidLtc || 0; }
      else { pm = C.hiMonthlyPaid(o.base || 0); paidHi = pm.hi * charge; paidLtc = pm.ltc * charge; }
      var r = C.hiSettle({ total: o.total, months: months, chargeMonths: charge, paidHi: paidHi, paidLtc: paidLtc });
      var sign = function (v) { return (v > 0 ? '+' : v < 0 ? '−' : '') + won(Math.abs(v)); };
      var verdict = r.diff > 0 ? '추가로 낼 금액' : r.diff < 0 ? '돌려받을 금액' : '정산 차액';
      var rows = [
        { c: ['건강보험료', won(r.hiDue), won(r.paidHi), sign(r.hiDiff)] },
        { c: ['장기요양보험료', won(r.ltcDue), won(r.paidLtc), sign(r.ltcDiff)] },
        { c: ['합계', won(r.hiDue + r.ltcDue), won(r.paidHi + r.paidLtc), sign(r.diff)], cls: 'tot' }];
      var notes = [];
      notes.push([r.diff > 0 ? '퇴사 달 급여에서 근로자분 ' + won(r.diff) + '원을 추가로 떼고, 회사도 같은 금액을 추가로 내요.' : r.diff < 0 ? '근로자에게 ' + won(-r.diff) + '원을 돌려주고, 회사분도 같은 금액을 돌려받아요.' : '정산할 차액이 없어요.', r.diff > 0 ? 'w' : 'ok']);
      if (r.diff > 0) notes.push(['추가로 낼 근로자분이 보수월액보험료 하한액 이상이면 회사 신청으로 12회 이내 분할납부할 수 있어요.']);
      notes.unshift(['모의계산은 실제 퇴직정산 금액이 아니라 모의계산이니, 꼭 참고 정도만 하시길 바랍니다.', 'w']);
      notes.push(['정산 보수월액은 보수총액 ÷ 근무월수, 내야 할 보험료는 월 보험료(10원 미만 버림) × 부과월수로 계산했어요.']);
      notes.push([ROUNDNOTE]);
      show(pane, { title: '건강보험 퇴직정산 모의계산 결과', cond: o.join + ' 입사 · ' + o.retire + ' 퇴직 · 근무월수 ' + months + '개월 · 부과월수 ' + charge + '개월 · 보수총액 ' + won(o.total) + '원',
        sum: [S('정산 보수월액', won(r.monthly)), S('근무 / 부과월수', months + ' / ' + charge, '개월'), S(verdict + '(근로자)', sign(r.diff), '원', true), S('총 정산(회사 부담 포함)', sign(r.diff * 2))],
        blocks: [
          { t: 'table', title: '1. 정산 보수월액', head: ['항목', '금액'], num: [1], rows: [
            { c: ['퇴직 연도 보수총액', won(o.total)] }, { c: ['근무월수', months + '개월'] },
            { c: [['정산 보수월액', '보수총액 ÷ 근무월수'], won(r.monthly)], cls: 'tot' }] },
          { t: 'table', title: '2. 내야 할 보험료(근로자분)', head: ['항목', '월 보험료', '부과월수', '합계'], num: [1, 2, 3], rows: [
            { c: [['건강보험료', '정산 보수월액 × 3.595%'], won(r.hiM), charge, won(r.hiDue)] },
            { c: [['장기요양보험료', '건강보험료 × 13.14%'], won(r.ltcM), charge, won(r.ltcDue)] }] },
          { t: 'table', title: '3. 정산(근로자분)', head: ['항목', '내야 할 보험료', '이미 낸 보험료', '차액'], num: [1, 2, 3], rows: rows }],
        notes: notes });
    },

    table: function (pane, o) {
      var rg = (o.range || '20-100').split('-'), lo = +rg[0], hi = +rg[1], meal = +o.meal || 0, rows = [];
      for (var m = lo; m <= hi; m++) {
        var g = Math.round(m * 1e6 / 12), s = C.salary({ gross: g, nontax: { meal: Math.min(meal, g) }, fam: +o.fam, kids: +o.kids, ratio: 100 }), e = s.emp;
        rows.push({ c: [won(m * 100) + '만', won(g), won(e.np), won(e.hi + e.ltc), won(e.ei), won(e.tax + e.local), won(s.net)], cls: m % 10 === 0 ? 'hl' : '' });
      }
      show(pane, { title: '연봉별 월 실수령액', cond: '가족 ' + o.fam + '명' + (+o.kids ? '(8~20세 자녀 ' + o.kids + '명)' : '') + ' · ' + (meal ? '비과세 식대 월 20만원 포함' : '비과세 없음') + ' · 퇴직금 별도 연봉 ÷ 12',
        blocks: [{ t: 'table', head: ['연봉', '월 세전', '국민연금', '건강+요양', '고용보험', '소득세+지방', '월 실수령액'], num: [0, 1, 2, 3, 4, 5, 6], rows: rows }], notes: [[ROUNDNOTE]] });
    },

    day: function (pane, o) {
      setLabel(pane, 'dayAmount', o.mode === 'net' ? '1일 실지급액' : '세전 일당');
      var picked = dayPicker(pane, o);
      var days = picked ? picked.length : Math.max(1, o.days | 0);
      if (picked) setK(pane, 'days', days);
      if (o.amount <= 0) return err(pane, '일용직 계산 결과', '금액을 입력해주세요.');
      if (!days) return err(pane, '일용직 계산 결과', '근무한 날을 하루 이상 골라주세요.');
      var opt = { days: days, noEI: o.o65 };
      var wage = o.mode === 'net' ? C.dailyReverse({ days: 1, noEI: o.o65 }, o.amount).wage : o.amount; // 1일 기준으로 일당을 정하고
      var one = C.daily({ wage: wage, days: 1, noEI: o.o65 });
      var d = o.pay === 'lump' ? C.daily(Object.assign({ wage: wage }, opt)) // 여러 날을 한 번에 지급
        : { wage: wage, days: days, total: one.total * days, ei: one.ei * days, tax: one.tax * days, local: one.local * days, small: one.small, ded: one.ded * days, net: one.net * days }; // 매일 지급
      var blocks = [{ t: 'table', title: '공제 내역', head: ['항목', '1일 기준', days + '일 합계'], num: [1, 2], rows: [
        { c: ['세전 일당 / 지급총액', won(one.total), won(d.total)] },
        { c: [['고용보험', o.o65 ? '65세 이상 제외' : '0.9%'], won(one.ei), won(d.ei)] },
        { c: [['소득세', '(일당 − 15만원) × 6% × 45%'], won(one.tax), won(d.tax)] },
        { c: [['지방소득세', '소득세의 10%'], won(one.local), won(d.local)] },
        { c: ['공제 합계', won(one.ded), won(d.ded)], cls: 'tot' },
        { c: ['실지급액', won(one.net), won(d.net)], cls: 'tot' }] }];
      if (picked) blocks.push({ t: 'text', text: '근무일(' + days + '일): ' + picked.map(function (x) { return md(x) + '(' + WD[x.getUTCDay()] + ')'; }).join(', ') });
      var notes = [];
      if (d.small) notes.push([o.pay === 'lump' ? '소득세가 1천원 미만이라 떼지 않았어요(소액부징수).' : '하루 소득세가 1천원 미만이라 떼지 않았어요(소액부징수).']);
      notes.push([o.pay === 'lump' ? '여러 날 일당을 한 번에 지급하는 것으로 계산했어요. 소득세 1천원 미만 여부도 지급액 전체로 판단해요.' : '일당을 매일 지급하는 것으로 계산했어요. 하루 소득세가 1천원 미만(일당 약 187,000원 이하)이면 떼지 않아요.']);
      if (days >= 8 || d.total >= 2200000) notes.push(['한 달 8일 이상 또는 220만원 이상이에요. 국민연금·건강보험 확인 대상의 경우, 지급하기 전 꼭 확인하시길 바랍니다.', 'w']);
      else notes.push(['국민연금·건강보험은 넣지 않았어요. 한 달 8일·60시간·220만원 이상이면 국민연금·건강보험 확인 대상이니, 지급하기 전 꼭 확인하시길 바랍니다.', 'w']);
      notes.push(['같은 회사에 3개월 이상(건설공사는 1년 이상) 계속 고용되면 상용직으로 전환해야 해요.', 'w']);
      notes.push([ROUNDNOTE]);
      show(pane, { title: '일용직 계산 결과', cond: (o.ws && o.we ? '근무 ' + o.ws + ' ~ ' + o.we + ' · ' : '') + days + '일' + (o.o65 ? ' · 65세 이상' : '') + (o.pay === 'lump' ? ' · 한 번에 지급' : ' · 매일 지급') + ' · ' + (o.mode === 'net' ? '1일 실지급액 ' + won(o.amount) + '원 기준' : '세전 일당 ' + won(o.amount) + '원 기준'),
        sum: [S('세전 일당', won(d.wage), '원', o.mode === 'net'), S('근무일수', days, '일'), S('1일 실지급액', won(one.net), '원', o.mode !== 'net'), S(days + '일 실지급액', won(d.net))], blocks: blocks, notes: notes });
    },

    dins: function (pane, o) {
      setLabel(pane, 'npq', o.kind === 'cons' ? '8일·220만원 중 하나 이상(국민연금, 건설)' : '8일·60시간·220만원 중 하나 이상(국민연금)');
      var endEl = $('[data-k="end"]', pane); endEl.disabled = !!o.ongoing;
      var months = buildDinsRows(pane, o);
      if (!months) { $('.wlabel', pane).textContent = ''; return err(pane, '일용직 국민연금·건강보험 판단 결과', o.start ? '근로 종료일을 넣거나 "아직 근로 중"을 체크해주세요.' : '근로 시작일과 종료일을 넣어주세요.'); }
      o = read(pane);
      var rows = months.map(function (mm) { var k = 'r' + mm.key; return { y: mm.y, m: mm.m, days: o[k + 'd'] || 0, first: o[k + 'f'] || 0, last: o[k + 'l'] || 0, hours: o[k + 'h'] || 0, income: o[k + 'i'] || 0 }; });
      var r = C.dailyInsurance({ start: o.start, end: o.end, ongoing: o.ongoing, cons: o.kind === 'cons', birth: o.birth, rows: rows, manHI: o.manHI, manNP: o.manNP, npWish: o.npWish });
      if (r.error) return err(pane, '일용직 국민연금·건강보험 판단 결과', r.error);
      var fmt = function (d) { return d ? C.ymd(d).replace(/-/g, '.') : '-'; };
      $('.wlabel', pane).textContent = '[' + fmt(C.D(o.start)).slice(2) + ' ~ ' + fmt(r.wEnd).slice(2) + ']';
      if (!rows.some(function (x) { return x.days > 0; })) return err(pane, '일용직 국민연금·건강보험 판단 결과', '달마다 일한 날수를 넣어주세요.');
      function line(name, d) {
        if (d.status === 'unknown') return { c: [name, '판단 필요', '-', '-', '첫 1개월이 두 달에 걸쳐 자동 판단이 안 돼요. 위 3번에서 예/아니오를 골라주세요.'], cls: 'hl' };
        if (d.status === 'exempt') return { c: [name, '제외', '-', '-', d.basis] };
        if (d.status === 'no') return { c: [name, '비대상', '-', '-', d.basis] };
        return { c: [name, '대상', fmt(d.acq), d.lost ? fmt(d.lost) : '근로 중', d.basis] };
      }
      var taxLabel = { daily: '일용', regular: '상용 전환', watch: '일용(확인)' }[r.tax.status];
      var res = [line('건강보험', r.hi), line('국민연금', r.np), { c: ['소득세', taxLabel, '-', '-', r.tax.basis], cls: r.tax.status === 'regular' ? 'hl' : '' }];
      var f = r.first, mrows = [];
      mrows.push({ c: [['첫 1개월', fmt(C.D(o.start)).slice(2) + '~' + fmt(r.wEnd).slice(2) + (f.ambiguous ? ' · 일부 달 판단 불가' : '')], f.sure.d + (f.ambiguous ? '+' + f.maybe.d : '') + '일', wonD(f.sure.h) + (f.ambiguous ? '+' + wonD(f.maybe.h) : ''), won(f.sure.inc) + (f.ambiguous ? '+' + won(f.maybe.inc) : ''),
        f.hi.v === null ? '?' : f.hi.v ? '충족' : '미충족', f.np.v === null ? '?' : f.np.v ? '충족' : '미충족'] });
      r.monthly.forEach(function (x) { mrows.push({ c: [x.y + '.' + ('0' + (x.m + 1)).slice(-2), (x.r.days || 0) + '일', wonD(x.r.hours || 0), won(x.r.income || 0), x.hi ? '충족' : '미충족', x.np ? '충족' : '미충족'] }); });
      var notes = [];
      var target = r.hi.status === 'yes' || r.np.status === 'yes';
      notes.push([target ? '국민연금·건강보험 확인 대상이에요. 지급하기 전 꼭 확인하시길 바랍니다.' : '국민연금·건강보험 확인 대상의 경우, 지급하기 전 꼭 확인하시길 바랍니다.', 'w']);
      if (r.tax.status === 'regular') notes.push(['같은 회사에 ' + (o.kind === 'cons' ? '1년' : '3개월') + ' 이상 계속 고용됐어요. 일용직이 아니라 상용직으로 전환해야 해요.', 'w']);
      if (r.age60 && r.np.status !== 'exempt' && (!r.np.lost || r.age60 < r.np.lost) && r.age60 > C.D(o.start)) notes.push(['근로기간 중 ' + fmt(r.age60) + '에 만 60세가 돼요. 국민연금 상실 여부를 확인해주세요.']);
      notes.push(['국민연금 소득 기준 220만원은 보건복지부장관이 고시하는 금액으로, 바뀌면 다시 확인해야 해요.']);
      notes.push(['1개월(1일~말일) 넘게 전혀 일하지 않다가 다시 일하면 그날을 최초 근로일로 보고 새로 판단해요. 이런 경우는 기간을 나눠 넣어주세요.']);
      notes.push(['취득·상실일은 참고값이에요. 실제 신고 전에는 세무사무실에 공유해 확인해주세요.']);
      show(pane, { title: '일용직 국민연금·건강보험 판단 결과', cond: o.start + ' ~ ' + (o.ongoing ? '근로 중' : o.end) + ' · ' + (o.kind === 'cons' ? '건설' : '일반') + (o.birth ? ' · 생년월일 입력' : ''),
        blocks: [
          { t: 'table', title: '판단 결과', head: ['구분', '판단', '취득일', '상실일', '근거'], num: [], rows: res },
          { t: 'table', title: '달별 요건', head: ['근로월', '근로일수', '근로시간', '소득', '건강(8일)', '국민연금'], num: [1, 2, 3], rows: mrows }],
        notes: notes });
    },

    biz: function (pane, o) {
      setLabel(pane, 'bizAmount', o.mode === 'net' ? '실지급액(3.3% 뗀 후)' : '세전 지급액');
      if (o.amount <= 0) return err(pane, '사업소득 계산 결과', '금액을 입력해주세요.');
      var b = o.mode === 'net' ? C.bizReverse(o.amount) : C.biz(o.amount);
      show(pane, { title: '3.3% 사업소득 계산 결과', cond: (o.mode === 'net' ? '실지급액 ' : '세전 지급액 ') + won(o.amount) + '원 기준',
        sum: [S('세전 지급액', won(b.gross), '원', o.mode === 'net'), S('공제 합계', won(b.ded)), S('실지급액', won(b.net), '원', o.mode !== 'net')],
        blocks: [{ t: 'table', head: ['항목', '금액'], num: [1], rows: [{ c: ['세전 지급액', won(b.gross)] }, { c: [['소득세', '3%'], won(b.tax)] }, { c: [['지방소득세', '소득세의 10%'], won(b.local)] }, { c: ['공제 합계', won(b.ded)], cls: 'tot' }, { c: ['실지급액', won(b.net)], cls: 'tot' }] }],
        notes: [['원천징수한 세금은 지급한 달의 다음 달 10일까지 신고·납부해요.'], [ROUNDNOTE]] });
    },

    etc: function (pane, o) {
      setLabel(pane, 'etcAmount', o.mode === 'net' ? '실지급액(세금 뗀 후)' : '세전 지급액');
      if (o.amount <= 0) return err(pane, '기타소득 계산 결과', '금액을 입력해주세요.');
      var b = o.mode === 'net' ? C.etcReverse(o.amount) : C.etc(o.amount);
      var notes = [];
      if (b.exempt) notes.push(['지급액이 125,000원 이하(기타소득금액 5만원 이하)라 과세최저한으로 세금을 떼지 않아요.', 'ok']);
      notes.push(['원천징수한 세금은 지급한 달의 다음 달 10일까지 신고·납부해요.']);
      notes.push([ROUNDNOTE]);
      show(pane, { title: '기타소득 계산 결과', cond: (o.mode === 'net' ? '실지급액 ' : '세전 지급액 ') + won(o.amount) + '원 기준 · 필요경비 60%',
        sum: [S('세전 지급액', won(b.gross), '원', o.mode === 'net'), S('세금 합계', won(b.ded)), S('실지급액', won(b.net), '원', o.mode !== 'net')],
        blocks: [{ t: 'table', head: ['항목', '금액'], num: [1], rows: [
          { c: ['세전 지급액', won(b.gross)] },
          { c: [['필요경비', '지급액의 60%'], won(b.cost)] },
          { c: [['기타소득금액', '지급액 − 필요경비'], won(b.income)] },
          { c: [['소득세', b.exempt ? '과세최저한' : '기타소득금액 × 20%'], won(b.tax)] },
          { c: [['지방소득세', '소득세의 10%'], won(b.local)] },
          { c: ['세금 합계', won(b.ded)], cls: 'tot' }, { c: ['실지급액', won(b.net)], cls: 'tot' }] }],
        notes: notes });
    },

    hol: function (pane, o) {
      showIf(pane, o);
      if (!(o.hourly > 0)) return err(pane, '주휴수당 계산 결과', '시급을 입력해주세요.');
      if (o.unit === 'month') {
        var weeks = [], total = 0, sumH = 0, n = 0;
        for (var w = 1; w <= 5; w++) {
          var hh = (o['w' + w + 'h'] || 0) + (+o['w' + w + 'm'] || 0) / 60;
          if (!(hh > 0)) continue;
          n++; sumH += Math.min(40, hh);
          weeks.push({ w: w, h: hh, att: o['w' + w + 'a'] });
        }
        if (!n) return err(pane, '주휴수당 계산 결과', '주차별 근무시간을 넣어주세요.');
        var avg = sumH / n, rows = [];
        weeks.forEach(function (x, idx) {
          var last = idx === weeks.length - 1;
          var r = C.holidayPay({ hourly: o.hourly, weekHOv: x.h, attended: x.att, continuing: last ? o.cont : true });
          var why = !r.eligibleHours ? '15시간 미만' : !x.att ? '결근 있음' : (last && !o.cont) ? '그 주 퇴사' : '';
          total += r.pay;
          rows.push({ c: [[x.w + '주차', why ? '미발생: ' + why : ''], [wonD(Math.min(40, x.h)) + '시간', x.h > 40 ? '입력 ' + wonD(x.h) + '시간 중 40시간' : ''], wonD(r.ok ? r.holidayH : 0) + '시간', won(r.pay)] });
        });
        rows.push({ c: ['합계', wonD(sumH) + '시간', '', won(total)], cls: 'tot' });
        var notes = [['주별로 15시간 이상·개근이면 그 주 주휴수당이 생겨요. 주휴시간 = 주 소정근로시간 ÷ 40 × 8(최대 8시간).']];
        notes.push(['15시간 기준은 원칙적으로 4주 평균으로 판단해요. 이번 입력의 주 평균은 ' + wonD(avg) + '시간이에요.' + (avg >= 15 ? '' : ' 평균이 15시간 미만이면 주휴수당 대상이 아닐 수 있어요.'), avg >= 15 ? '' : 'w']);
        notes.push([ROUNDNOTE]);
        return show(pane, { title: '주휴수당 계산 결과(월단위)', cond: '시급 ' + won(o.hourly) + '원 · ' + n + '주',
          sum: [S('주 평균 근무시간', wonD(avg), '시간'), S('한 달 주휴수당', won(total), '원', true)],
          blocks: [{ t: 'table', head: ['주차', '소정근로시간', '주휴시간', '주휴수당'], num: [1, 2, 3], rows: rows }], notes: notes });
      }
      var r = C.holidayPay({ hourly: o.hourly, dayH: o.dayH, wdays: o.wdays, weekHOv: o.weekHOv, attended: o.att, continuing: o.cont });
      if (!(r.raw > 0)) return err(pane, '주휴수당 계산 결과', '근무시간을 입력해주세요.');
      var reasons = [];
      if (!r.eligibleHours) reasons.push('주 소정근로시간이 15시간 미만');
      if (!o.att) reasons.push('개근하지 않음');
      if (!o.cont) reasons.push('그 주에 퇴사');
      var notes2 = [r.ok ? ['주휴수당 요건을 갖췄어요.', 'ok'] : ['주휴수당이 생기지 않아요: ' + reasons.join(', '), 'w']];
      if (r.over40) notes2.push(['주 소정근로시간 ' + wonD(r.raw) + '시간 중 40시간만 반영했어요. 넘는 시간은 연장근로수당으로 따로 계산해요.', 'w']);
      notes2.push(['월 환산은 1년 365일 ÷ 7일 ÷ 12개월(약 4.345주)로 계산했어요.']);
      notes2.push([ROUNDNOTE]);
      show(pane, { title: '주휴수당 계산 결과', cond: '시급 ' + won(o.hourly) + '원 · 주 ' + wonD(r.raw) + '시간' + (o.weekHOv > 0 ? '' : '(1일 ' + wonD(o.dayH) + '시간 × ' + wonD(o.wdays) + '일)'),
        sum: [S('주휴시간', wonD(r.ok ? r.holidayH : 0), '시간'), S('1주 주휴수당', won(r.pay), '원', true), S('월 환산 주휴수당', won(r.ok ? r.monthHoliday : 0))],
        blocks: [{ t: 'table', head: ['항목', '금액'], num: [1], rows: [
          { c: [['1주 근로 임금', '시급 × ' + wonD(r.weekH) + '시간'], won(r.weekWage)] },
          { c: [['1주 주휴수당', r.eligibleHours ? '시급 × 주휴 ' + wonD(r.holidayH) + '시간(주 소정 ÷ 40 × 8)' : '주 15시간 미만이라 없음'], won(r.pay)] },
          { c: ['1주 합계(주급)', won(r.weekTotal)], cls: 'tot' }] }],
        notes: notes2 });
    },

    hours: function (pane, o) {
      var r = C.holidayPay({ hourly: R.minWage[2026], dayH: o.dayH, wdays: o.wdays, weekHOv: o.weekHOv });
      if (!(r.raw > 0)) return err(pane, '근로시간 계산 결과', '근무시간을 입력해주세요.');
      var notes = [];
      if (r.over40) notes.push(['주 ' + wonD(r.raw) + '시간 중 40시간만 소정근로시간으로 봤어요. 넘는 시간은 연장근로예요.', 'w']);
      if (!r.eligibleHours) notes.push(['주 15시간 미만이라 주휴시간이 없어요(주휴수당·연차 미적용).', 'w']);
      notes.push(['월 소정근로시간 = (주 소정근로시간 + 주휴시간) × 365 ÷ 7 ÷ 12, 소수점은 반올림했어요.']);
      show(pane, { title: '근로시간 계산 결과', cond: '주 ' + wonD(r.raw) + '시간' + (o.weekHOv > 0 ? '' : '(1일 ' + wonD(o.dayH) + '시간 × ' + wonD(o.wdays) + '일)'),
        sum: [S('주 소정근로시간', wonD(r.weekH), '시간'), S('주휴시간', wonD(r.holidayH), '시간'), S('월 소정근로시간', r.monthHR, '시간', true)],
        blocks: [
          { t: 'table', head: ['항목', '시간'], num: [1], rows: [
            { c: [['주 소정근로시간', r.over40 ? '최대 40시간' : ''], wonD(r.weekH) + '시간'] },
            { c: [['주휴시간', r.eligibleHours ? '주 소정 ÷ 40 × 8' : '주 15시간 미만'], wonD(r.holidayH) + '시간'] },
            { c: [['주 유급시간', '주 소정 + 주휴'], wonD(r.weekH + r.holidayH) + '시간'] },
            { c: [['월 소정근로시간(유급)', wonD(r.monthH) + '시간 → 반올림'], r.monthHR + '시간'], cls: 'tot' },
            { c: [['연간 유급시간', '주 유급시간 × 365 ÷ 7'], wonD(Math.round((r.weekH + r.holidayH) * 365 / 7 * 100) / 100) + '시간'] }] },
          { t: 'table', title: '이 근로시간의 최저임금 월급', head: ['연도', '최저시급', '월급(최저)'], num: [1, 2], rows: [
            { c: ['2026년', won(R.minWage[2026]), won(R.minWage[2026] * r.monthHR)] },
            { c: ['2027년', won(R.minWage[2027]), won(R.minWage[2027] * r.monthHR)] }] }],
        notes: notes });
    },

    annual: function (pane, o) {
      var asof = o.asof || C.ymd(new Date(Date.UTC(new Date().getFullYear(), new Date().getMonth(), new Date().getDate())));
      var r = C.annualLeave(o.join, asof, o.basis);
      if (r.error) return err(pane, '연차 발생일수 계산 결과', r.error);
      var ST = { active: '사용 가능', expired: '기간 지남', future: '발생 예정' };
      var rows = r.rows.filter(function (x) { return x.status !== 'future' || x === r.next; }).map(function (x) {
        return { c: [[x.kind, x.note], C.ymd(x.when), wonD(x.days) + '일', C.ymd(x.until), ST[x.status]], cls: x.status === 'active' ? 'hl' : '' };
      });
      var notes = [];
      if (C.D(o.join) < C.D('2017-05-30')) notes.push(['2017년 5월 29일 이전 입사자는 1년 미만 연차를 1년차 연차에서 빼던 옛 규정이 적용될 수 있어요. 세무사무실이나 노무 사무실에 확인해주세요.', 'w']);
      if (o.basis === 'fiscal') notes.push(['입사 연도 비례 연차는 소수점까지 표시했어요. 소수점은 회사 규정에 따르되, 근로자에게 유리하게 올려 주는 경우가 많아요.']);
      notes.push(['표의 "사용 기한"까지 쓰지 않은 연차는 회사가 사용 촉진을 하지 않았다면 연차수당으로 정산해요.']);
      notes.push(['실제로 사용한 연차는 빼지 않았어요.']);
      show(pane, { title: '연차 발생일수 계산 결과', cond: o.join + ' 입사 · ' + asof + ' 기준 · ' + (o.basis === 'fiscal' ? '회계연도(1월 1일) 기준' : '입사일 기준'),
        sum: [S('근무일수', won(r.workDays), '일'), S('근속', r.years + '년 ' + r.months, '개월'), S('지금 사용 가능한 연차', wonD(r.active), '일', true), S('다음 발생', r.next ? C.ymd(r.next.when).slice(2).replace(/-/g, '.') : '-', r.next ? ' ' + wonD(r.next.days) + '일' : '')],
        blocks: [{ t: 'table', title: '연차 발생표', head: ['구분', '발생일', '일수', '사용 기한', '상태'], num: [2], rows: rows }],
        notes: notes });
    },

    ord: function (pane, o) {
      var dayH = o.dayH || 8, wdays = o.wdays || 5, weekH = dayH * wdays;
      var holiday = weekH >= 15 ? Math.min(8, weekH / 40 * 8) : 0;
      var auto = C.monthlyHours(weekH), hours = o.hoursOv > 0 ? o.hoursOv : auto;
      var mh = $('.mh', pane); if (mh) mh.textContent = '비워두면 자동 계산: 주 ' + wonD(weekH) + '시간 + 주휴 ' + wonD(holiday) + '시간 → 월 ' + auto + '시간';
      var bonusM = (o.bonusY || 0) / 12, ordM = (o.base || 0) + (o.fixed || 0) + bonusM;
      if (ordM <= 0) return err(pane, '통상임금 계산 결과', '월 기본급을 입력해주세요.');
      var hourly = C.unit(ordM / hours, o.round), daily = C.unit(hourly * dayH, o.round);
      var rows = [{ c: ['월 기본급', won(o.base || 0)] }, { c: ['월 고정수당', won(o.fixed || 0)] }];
      if (o.bonusY) rows.push({ c: [['정기상여금 월 환산', '연 ' + won(o.bonusY) + ' ÷ 12'], won(bonusM)] });
      rows.push({ c: ['월 통상임금', won(ordM)], cls: 'tot' });
      show(pane, { title: '통상임금 계산 결과', cond: '1일 ' + wonD(dayH) + '시간 · 주 ' + wonD(wdays) + '일',
        sum: [S('시간당 통상임금', wonD(hourly), '원', true), S('1일 통상임금', wonD(daily)), S('월 통상임금', won(ordM))],
        blocks: [
          { t: 'table', title: '근로시간', head: ['항목', '시간'], num: [1], rows: [{ c: ['주 소정근로시간', wonD(weekH) + '시간'] }, { c: [['주휴시간', '주 15시간 이상이면 생겨요'], wonD(holiday) + '시간'] }, { c: [['월 소정근로시간', o.hoursOv > 0 ? '직접 입력' : '(주 소정 + 주휴) × 365 ÷ 7 ÷ 12'], wonD(hours) + '시간'], cls: 'tot' }] },
          { t: 'table', title: '월 통상임금', head: ['항목', '금액'], num: [1], rows: rows },
          { t: 'calc', title: '계산식', lines: ['시간당 통상임금 = ' + won(ordM) + ' ÷ ' + wonD(hours) + '시간 = ' + wonD(hourly) + '원', '1일 통상임금   = ' + wonD(hourly) + ' × ' + wonD(dayH) + '시간 = ' + wonD(daily) + '원'] }],
        notes: [['통상시급은 연장·야간·휴일수당, 1일 통상임금은 연차수당 계산에 써요.'], [ROUNDNOTE]] });
    },

    sev: function (pane, o) {
      var a = C.D(o.join), b = C.D(o.last);
      var info = $('.svcinfo', pane);
      if (a && b && b >= a) { var dd = C.daysBetween(a, b) - (o.excl | 0), mm = C.monthsDiff(a, b) + 1; info.textContent = '재직일수 ' + won(dd) + '일 (약 ' + Math.floor(mm / 12) + '년 ' + (mm % 12) + '개월)'; }
      var p = buildSegs(pane, o);
      if (!p) return err(pane, '퇴직금 계산 결과', '입사일과 마지막 근무일을 확인해주세요.');
      o = read(pane);
      var amts = p.segs.map(function (s, i) { return (o['s' + i + 'b'] || 0) + (o['s' + i + 'o'] || 0); });
      if (!amts.some(function (x) { return x > 0; })) return err(pane, '평균임금 · 퇴직금 계산 결과', '퇴직 전 3개월 동안 받은 임금을 넣어주세요.');
      var ord = o.ord || 0;
      var s = C.severance({ join: o.join, lastDay: o.last, excludeDays: o.excl | 0, segAmounts: amts, bonus: o.bonus, leavePay: o.leaveP, ordinaryMonthly: ord, hours: 209, dayHours: 8, round: o.round });
      if (s.error) return err(pane, '퇴직금 계산 결과', s.error);
      var aw = s.aw, t = s.rt;
      var segRows = p.segs.map(function (sg, i) {
        return { c: [[C.ymd(sg.start).slice(2).replace(/-/g, '.') + ' ~ ' + C.ymd(sg.end).slice(5).replace('-', '.'), sg.full ? '' : '한 달이 안 되는 기간'], sg.days + '일', won(o['s' + i + 'b'] || 0), won(o['s' + i + 'o'] || 0), won(amts[i])] };
      });
      var sumB = p.segs.reduce(function (x, sg, i) { return x + (o['s' + i + 'b'] || 0); }, 0), sumO = p.segs.reduce(function (x, sg, i) { return x + (o['s' + i + 'o'] || 0); }, 0);
      segRows.push({ c: ['3개월 합계', p.days + '일', won(sumB), won(sumO), won(aw.wages)], cls: 'tot' });
      var avgRows = [{ c: ['3개월 임금총액', won(aw.wages)] }];
      if (o.bonus) avgRows.push({ c: [['상여금 3/' + aw.bonusMonths, (aw.bonusMonths < 12 ? '근무 ' + aw.bonusMonths + '개월 동안 ' : '1년 ') + won(o.bonus) + ' × 3/' + aw.bonusMonths], won(o.bonus * 3 / aw.bonusMonths)] });
      if (o.leaveP) avgRows.push({ c: [['연차수당 3/12', '1년 ' + won(o.leaveP) + ' × 3/12'], won(o.leaveP * 3 / 12)] });
      avgRows.push({ c: [['1일 평균임금', won(aw.wages + aw.add) + ' ÷ ' + p.days + '일'], wonD(aw.avg)], cls: 'tot' });
      if (ord) avgRows.push({ c: [['1일 통상임금(비교)', won(ord) + ' ÷ 209 × 8'], wonD(aw.ordDay)] });
      avgRows.push({ c: [['퇴직금에 쓸 1일 임금', aw.usedOrdinary ? '평균임금이 적어서 통상임금 적용' : '평균임금 적용'], wonD(aw.applied)], cls: 'tot' });
      var notes = [];
      if (s.under1y) notes.push(['재직기간이 1년 미만이라 퇴직금 지급 대상이 아닐 수 있어요.', 'w']);
      notes.push(['퇴직금에서 건강보험·고용보험 정산분은 빼지 않았어요. 퇴사 달 급여에서 따로 정산해요.']);
      notes.push([ROUNDNOTE]);
      show(pane, { title: '평균임금 · 퇴직금 계산 결과', cond: o.join + ' 입사 ~ ' + o.last + ' 퇴사 · 재직 ' + won(s.days) + '일',
        sum: [S(aw.usedOrdinary ? '적용 1일 임금(통상)' : '1일 평균임금', wonD(aw.applied)), S('퇴직금(세전)', won(s.pay)), S('퇴직소득세+지방세', won(t.tax + t.local)), S('실지급액', won(s.net), '원', true)],
        blocks: [
          { t: 'table', title: '1. 퇴직 전 3개월 임금', head: ['기간', '일수', '기본급', '기타수당', '합계'], num: [1, 2, 3, 4], rows: segRows },
          { t: 'table', title: '2. 1일 평균임금', head: ['항목', '금액'], num: [1], rows: avgRows },
          { t: 'table', title: '3. 퇴직금', head: ['항목', '금액'], num: [1], rows: [
            { c: [['재직일수', o.join + ' ~ ' + o.last + (o.excl ? ', 제외 ' + o.excl + '일' : '')], won(s.days) + '일'] },
            { c: [['퇴직금', wonD(aw.applied) + ' × ' + won(s.days) + '일 × 30 ÷ 365'], won(s.pay)], cls: 'tot' }] },
          { t: 'table', title: '4. 퇴직소득세', head: ['항목', '금액'], num: [1], rows: [
            { c: [['근속연수', '1년 미만 끝수는 1년'], t.years + '년'] }, { c: ['근속연수공제', won(t.serviceDed)] },
            { c: [['환산급여', '(퇴직금 − 근속연수공제) × 12 ÷ 근속연수'], won(t.conv)] }, { c: ['환산급여공제', won(t.convDed)] },
            { c: ['과세표준', won(t.base)] }, { c: ['환산산출세액', won(t.convTax)] },
            { c: [['퇴직소득세', '환산산출세액 × 근속연수 ÷ 12'], won(t.tax)] }, { c: [['지방소득세', '소득세의 10%'], won(t.local)] },
            { c: ['세금 합계', won(t.tax + t.local)], cls: 'tot' }, { c: ['퇴직금 실지급액', won(s.net)], cls: 'tot' }] }],
        notes: notes });
    },

    leave: function (pane, o) {
      if (o.ord <= 0) return err(pane, '연차수당 계산 결과', '월 통상임금을 입력해주세요.');
      var l = C.leavePay({ ordinaryMonthly: o.ord, hours: o.hours || 209, dayHours: o.dayH || 8, days: o.days, round: o.round });
      show(pane, { title: '연차수당 계산 결과', cond: '월 통상임금 ' + won(o.ord) + '원 · 남은 연차 ' + o.days + '일',
        sum: [S('통상시급', wonD(l.hourly)), S('1일 통상임금', wonD(l.daily)), S('연차수당', won(l.pay), '원', true)],
        blocks: [{ t: 'calc', title: '계산식', lines: ['시급        = ' + won(o.ord) + ' ÷ ' + (o.hours || 209) + ' = ' + wonD(l.hourly) + '원', '1일 통상임금 = ' + wonD(l.hourly) + ' × ' + (o.dayH || 8) + ' = ' + wonD(l.daily) + '원', '연차수당    = ' + wonD(l.daily) + ' × ' + o.days + '일 = ' + won(l.pay) + '원'] }],
        notes: [['연차수당도 근로소득이라, 지급하는 달 급여에 더해서 4대보험·소득세를 계산해요.'], [ROUNDNOTE]] });
    },

    prorate: function (pane, o) {
      var p = C.prorate(o.s, o.e, o.method);
      if (p.error) return err(pane, '일할계산 결과', p.error);
      var items = [['기본급', 'i_base'], ['연장수당', 'i_ot'], ['휴일수당', 'i_hol'], ['기타 수당', 'i_etc'], ['식대', 'i_meal'], ['자가운전보조금', 'i_car'], ['보육수당', 'i_child']];
      var rows = [], tm = 0, tp = 0;
      items.forEach(function (it) { var a = o[it[1]] || 0; if (!a) return; var v = Math.floor(a * p.ratio + 1e-7); tm += a; tp += v; rows.push({ c: [it[0], won(a), won(v)] }); });
      rows.push({ c: ['합계', won(tm), won(tp)], cls: 'tot' });
      show(pane, { title: '일할계산 결과', cond: o.s + ' ~ ' + o.e + ' · ' + p.label,
        sum: [S('근무', p.num + ' / ' + p.den, o.method === 'weekday' ? '일(평일)' : '일'), S('비율', (p.ratio * 100).toFixed(2), '%'), S('이번 달 지급액(세전)', won(tp), '원', true)],
        blocks: [{ t: 'table', head: ['항목', '월 금액', '일할 금액'], num: [1, 2], rows: rows }],
        notes: [['원 단위 미만은 버렸어요.'], ['연장·휴일수당처럼 실제 근무시간으로 계산하는 수당은 일할하지 않고 실제 시간으로 따로 계산하는 경우가 많아요.'], [ROUNDNOTE]] });
    },

    ot: function (pane, o) {
      var auto = o.ord > 0 ? C.unit(o.ord / (o.hours || 209), o.round) : 0;
      var hh = $('.hh', pane); if (hh) hh.textContent = auto ? '통상시급 ' + wonD(auto) + '원' : '';
      var hourly = o.hourly > 0 ? o.hourly : auto;
      if (!hourly) return err(pane, '수당 계산 결과', '통상시급이나 월 통상임금을 입력해주세요.');
      var r = C.overtime(hourly, { ot: o.h_ot, otn: o.h_otn, n: o.h_n, h8: o.h_h8, h8n: o.h_h8n, ho: o.h_ho, hon: o.h_hon }, o.five);
      var rows = r.rows.filter(function (x) { return x.hours; }).map(function (x) { return { c: [x.name, wonD(x.hours) + '시간', Math.round(x.rate * 100) + '%', won(x.amount)] }; });
      rows.push({ c: ['합계', '', '', won(r.total)], cls: 'tot' });
      var notes = [];
      if (!o.five) notes.push(['5인 미만 사업장이라 가산 없이 100%로 계산했어요. 소정근로 중 야간근로는 추가 지급이 없어요.', 'w']);
      notes.push([ROUNDNOTE]);
      show(pane, { title: '연장·야간·휴일수당 계산 결과', cond: (o.five ? '5인 이상' : '5인 미만') + ' 사업장',
        sum: [S('통상시급', wonD(hourly)), S('수당 합계', won(r.total), '원', true)],
        blocks: [{ t: 'table', head: ['구분', '시간', '지급률', '금액'], num: [1, 2, 3], rows: rows }], notes: notes });
    },

    min: function (pane, o) {
      var hours = C.monthlyHours(o.weekH || 40);
      var mh = $('.mh', pane); if (mh) mh.textContent = '월 소정근로시간 ' + hours + '시간(주휴 포함)';
      setLabel(pane, 'minAmount', o.mode === 'hour' ? '시급' : '월 급여(최저임금에 들어가는 임금)');
      var mw = R.minWage[o.year], minMonth = mw * hours;
      if (o.amount <= 0) return err(pane, '최저임금 확인 결과', '금액을 입력해주세요.');
      var hourly = o.mode === 'hour' ? o.amount : o.amount / hours, ok = hourly + 1e-9 >= mw;
      show(pane, { title: '최저임금 확인 결과', cond: o.year + '년 · 주 ' + (o.weekH || 40) + '시간 · ' + (o.mode === 'hour' ? '시급 ' : '월 ') + won(o.amount) + '원',
        sum: [S('환산 시급', wonD(hourly), '원', true), S(o.year + '년 최저시급', won(mw)), S('최저 월급(' + hours + '시간)', won(minMonth))],
        blocks: [{ t: 'text', cls: ok ? 'ok' : 'w', text: ok ? '최저임금(' + won(mw) + '원) 이상이에요.' : '최저임금(' + won(mw) + '원)보다 시급이 ' + wonD(mw - hourly) + '원 적어요. 월 ' + won(Math.ceil((mw - hourly) * hours)) + '원 이상 올려야 해요.' }],
        notes: [[ROUNDNOTE]] });
    }
  };

  /* ---------- 일용직: 근무일 고르기 ---------- */
  function dayPicker(pane, o) {
    var wrap = $('.dayswrap', pane), daysIn = $('[data-k="days"]', pane), hint = $('.dayhint', pane);
    var a = C.D(o.ws), b = C.D(o.we);
    if (!a || !b || b < a || C.daysBetween(a, b) > 62) {
      wrap.innerHTML = ''; daysIn.readOnly = false;
      hint.textContent = a && b && b >= a ? '기간이 62일을 넘어서 근무일수를 직접 넣어주세요.' : '근무 시작일·종료일을 넣으면 날짜를 눌러 쉰 날을 뺄 수 있어요.';
      return null;
    }
    var off = (o.off || '').split(',').filter(Boolean), list = [], h = WD.map(function (w) { return '<span class="wd">' + w + '</span>'; }).join('');
    for (var i = 0; i < a.getUTCDay(); i++) h += '<span></span>';
    for (var d = a; d <= b; d = new Date(d.getTime() + 864e5)) {
      var key = C.ymd(d), on = off.indexOf(key) < 0;
      if (on) list.push(d);
      h += '<button type="button" data-day="' + key + '" aria-pressed="' + on + '">' + d.getUTCDate() + '<small>' + (d.getUTCMonth() + 1) + '월</small></button>';
    }
    wrap.innerHTML = '<div class="days">' + h + '</div>';
    daysIn.readOnly = true; hint.textContent = '색이 칠해진 날이 근무일이에요. 쉰 날은 눌러서 빼주세요.';
    return list;
  }
  document.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-day]'); if (!btn) return;
    var pane = btn.closest('.pane'), offEl = $('[data-k="off"]', pane), off = offEl.value.split(',').filter(Boolean), k = btn.getAttribute('data-day'), i = off.indexOf(k);
    if (i >= 0) off.splice(i, 1); else off.push(k);
    offEl.value = off.join(','); run(pane);
  });

  /* ---------- 일용직 판단: 달별 입력 표 ---------- */
  var dinsKey = '';
  function buildDinsRows(pane, o) {
    var wrap = $('.dinswrap', pane), a = C.D(o.start), e = o.ongoing ? null : C.D(o.end);
    if (!a || (!o.ongoing && (!e || e < a))) { wrap.innerHTML = ''; dinsKey = ''; return null; }
    if (!e) { var t = new Date(); e = new Date(Date.UTC(t.getFullYear(), t.getMonth(), 1)); if (e < a) e = a; }
    var months = [], y = a.getUTCFullYear(), m = a.getUTCMonth();
    while ((y < e.getUTCFullYear() || (y === e.getUTCFullYear() && m <= e.getUTCMonth())) && months.length < 24) {
      months.push({ y: y, m: m, key: y + ('0' + (m + 1)).slice(-2) }); m++; if (m > 11) { m = 0; y++; }
    }
    var key = months.map(function (x) { return x.key; }).join(',');
    if (key !== dinsKey) {
      var old = {}; $$('[data-k^="r"]', wrap).forEach(function (el) { old[el.getAttribute('data-k')] = el.value; });
      var inp = function (k, cls, w) { return '<td><input type="text" inputmode="numeric" class="' + cls + '" data-k="' + k + '" value="' + esc(old[k] || '') + '"' + (w ? ' style="min-width:' + w + 'px"' : '') + '></td>'; };
      var h = '<div class="tw"><table class="segin"><thead><tr><th>근로월</th><th>근로일수</th><th>최초 근로일</th><th>최종 근로일</th><th>근로시간</th><th>소득(원)</th></tr></thead><tbody>';
      months.forEach(function (x) { var k = 'r' + x.key; h += '<tr><td>' + x.y + '.' + ('0' + (x.m + 1)).slice(-2) + '</td>' + inp(k + 'd', 'int') + inp(k + 'f', 'int') + inp(k + 'l', 'int') + inp(k + 'h', 'dec') + inp(k + 'i', 'money', 96) + '</tr>'; });
      wrap.innerHTML = h + '</tbody></table></div>';
      $$('input.money', wrap).forEach(bindMoney);
      dinsKey = key;
    }
    return months;
  }

  /* ---------- 평균임금: 달별 입력 표 ---------- */
  var segKey = '';
  function buildSegs(pane, o) {
    var p = C.avgSegments(o.last); var wrap = $('.segwrap', pane);
    if (!p || !C.D(o.join) || C.D(o.join) > C.D(o.last)) { wrap.innerHTML = ''; segKey = ''; return null; }
    var key = p.segs.map(function (s) { return C.ymd(s.start) + s.days; }).join('|');
    if (key !== segKey) {
      var old = {}; $$('[data-k^="s"]', wrap).forEach(function (el) { old[el.getAttribute('data-k')] = el.value; });
      var h = '<table class="segin"><thead><tr><th>기간</th><th>기본급</th><th>기타수당</th></tr></thead><tbody>';
      p.segs.forEach(function (s, i) {
        h += '<tr><td>' + md(s.start) + ' ~ ' + md(s.end) + '<small>' + s.days + '일' + (s.full ? '' : ' · 일부') + '</small></td>' +
          '<td><input type="text" inputmode="numeric" class="money" data-k="s' + i + 'b" value="' + esc(old['s' + i + 'b'] || '') + '"></td>' +
          '<td><input type="text" inputmode="numeric" class="money" data-k="s' + i + 'o" value="' + esc(old['s' + i + 'o'] || '') + '"></td></tr>';
      });
      wrap.innerHTML = h + '</tbody></table>';
      var empty = !$$('[data-k^="s"]', wrap).some(function (el) { return el.value; });
      if (!segKey && empty || key !== segKey && empty) fillSegs(pane, p, o);
      segKey = key;
      $$('input.money', wrap).forEach(bindMoney);
    }
    return p;
  }
  function fillSegs(pane, p, o) {
    p = p || C.avgSegments(o.last); if (!p) return;
    p.segs.forEach(function (s, i) {
      var r = s.days / s.monthDays;
      setK(pane, 's' + i + 'b', o.qB ? won(Math.floor(o.qB * r + 1e-7)) : '');
      setK(pane, 's' + i + 'o', o.qO ? won(Math.floor(o.qO * r + 1e-7)) : '');
    });
  }

  /* ---------- 요율표 ---------- */
  function ratesHtml() {
    var ex = R.ei.extra, h = '';
    h += '<div class="blk"><h4>4대보험</h4><div class="tw"><table class="t"><thead><tr><th>구분</th><th class="n">근로자</th><th class="n">회사</th><th class="n">합계</th><th>기준</th></tr></thead><tbody>' +
      '<tr><td>국민연금</td><td class="n">4.75%</td><td class="n">4.75%</td><td class="n">9.5%</td><td>기준소득월액 ' + won(R.np.min) + '원 ~ ' + won(R.np.max) + '원<small>' + R.np.period + '</small></td></tr>' +
      '<tr><td>건강보험</td><td class="n">3.595%</td><td class="n">3.595%</td><td class="n">7.19%</td><td>근로자 부담 월 상한 ' + won(R.hi.capEach) + '원</td></tr>' +
      '<tr><td>장기요양보험</td><td class="n" colspan="3" style="text-align:center">건강보험료의 13.14%(소득 대비 0.9448%)</td><td>근로자·회사 반씩</td></tr>' +
      '<tr><td>고용보험(실업급여)</td><td class="n">0.9%</td><td class="n">0.9%</td><td class="n">1.8%</td><td></td></tr>' +
      '<tr><td>고용보험(고용안정·직업능력개발)</td><td class="n">—</td><td class="n">0.25~0.85%</td><td class="n"></td><td>회사 규모별(아래 표)</td></tr>' +
      '<tr><td>산재보험</td><td class="n">—</td><td class="n">업종별</td><td class="n"></td><td>업종 요율 + 출퇴근재해 0.6‰</td></tr></tbody></table></div></div>';
    h += '<div class="blk"><h4>고용보험 회사 추가 부담(고용안정·직업능력개발)</h4><div class="tw"><table class="t"><thead><tr><th>상시 근로자 수</th><th class="n">요율</th></tr></thead><tbody>' +
      '<tr><td>150인 미만</td><td class="n">' + (ex.s150 * 100) + '%</td></tr><tr><td>150인 이상 우선지원대상기업</td><td class="n">' + (ex.p150 * 100) + '%</td></tr>' +
      '<tr><td>150인 이상 1,000인 미만(우선지원대상기업 아님)</td><td class="n">' + (ex.u1000 * 100) + '%</td></tr><tr><td>1,000인 이상·국가·지방자치단체</td><td class="n">' + (ex.o1000 * 100) + '%</td></tr></tbody></table></div></div>';
    h += '<div class="blk"><h4>2026년 사업종류별 산재보험료율</h4><p class="muted" style="font-size:.88rem">단위 ‰(천분율), 1,000원당 내는 금액이에요. 예: 8‰이면 월급 300만원에 24,000원. 모든 업종에 출퇴근재해 요율 0.6‰을 더하고, 회사가 전액 부담해요.</p><div class="tw"><table class="t"><thead><tr><th>사업 종류</th><th class="n">요율</th></tr></thead><tbody>';
    C.INDUSTRY.forEach(function (g) {
      if (g[1].length === 1 && g[1][0][0] === g[0]) h += '<tr class="grp"><td>' + esc(g[0]) + '</td><td class="n">' + g[1][0][1] + '‰</td></tr>';
      else { h += '<tr class="grp"><td colspan="2">' + esc(g[0]) + '</td></tr>'; g[1].forEach(function (it) { h += '<tr><td style="padding-left:22px">' + esc(it[0]) + '</td><td class="n">' + it[1] + '‰</td></tr>'; }); }
    });
    h += '</tbody></table></div><p class="muted" style="font-size:.84rem">우리 회사가 어느 사업 종류인지는 근로복지공단의 사업종류 예시표로 정해져요. 사업장 가입 때 받은 산재보험 요율을 확인해주세요.</p></div>';
    h += '<div class="blk"><h4>근로소득 비과세 한도(월)</h4><div class="tw"><table class="t"><tbody>' +
      '<tr><td>식대(식사를 따로 제공받지 않는 경우)</td><td class="n">20만원</td></tr><tr><td>자가운전보조금(본인 차량으로 업무 수행, 실제 여비 대신 받는 경우)</td><td class="n">20만원</td></tr><tr><td>출산·보육수당(6세 이하 자녀)</td><td class="n">자녀 1명당 20만원</td></tr></tbody></table></div></div>';
    h += '<details class="law"><summary>근거</summary><p><b>보건복지부고시 제2026-31호</b> 국민연금 기준소득월액 하한액과 상한액 · <b>고용노동부고시 제2025-91호</b> 2026년도 사업종류별 산재보험료율 · 2026년 건강보험료율 7.19%, 장기요양보험료율 건강보험료의 13.14% · <b>소득세법 제12조제3호러목</b> 식대 · <b>제12조제3호머목</b> 출산·보육수당 · <b>소득세법 시행령 제12조제3호</b> 자가운전보조금</p></details>';
    return h;
  }
  $('#ratesOut').innerHTML = ratesHtml();

  /* ---------- 메뉴 ---------- */
  var links = $$('.side a[data-tab]'), side = $('#side'), picker = $('.picker');
  var ALIAS = { rev: ['pay', 'mode=net'], wage: ['ord', ''] };
  function activate(id) {
    if (!document.getElementById(id) || !$('.pane#' + id)) id = 'pay';
    links.forEach(function (a) { if (a.getAttribute('data-tab') === id) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
    $$('.pane').forEach(function (p) { p.hidden = p.id !== id; });
    var pane = document.getElementById(id);
    var name = pane.getAttribute('data-title') || '급여·노무 계산기';
    document.title = name + ' · 급여·노무 계산기';
    $('.cur', picker).textContent = name;
    side.classList.remove('open'); picker.setAttribute('aria-expanded', 'false');
    run(pane);
  }
  links.forEach(function (a) {
    a.addEventListener('click', function (e) {
      e.preventDefault(); var id = a.getAttribute('data-tab');
      history.replaceState(null, '', '#' + id); activate(id);
      var top = $('.layout').getBoundingClientRect().top + scrollY - 8; if (scrollY > top) scrollTo({ top: top });
    });
  });
  picker.addEventListener('click', function () { var o = !side.classList.contains('open'); side.classList.toggle('open', o); picker.setAttribute('aria-expanded', o); });
  document.addEventListener('click', function (e) {
    var g = e.target.closest('[data-goto]'); if (!g) return;
    e.preventDefault(); history.replaceState(null, '', '#' + g.getAttribute('data-goto')); activate(g.getAttribute('data-goto'));
    scrollTo({ top: $('.layout').getBoundingClientRect().top + scrollY - 8 });
  });

  /* ---------- 실행 ---------- */
  function run(pane) { if (CALC[pane.id]) { hints(pane); CALC[pane.id](pane, read(pane)); } }
  function bindMoney(el) {
    el.addEventListener('blur', function () { var n = num(el.value); el.value = n ? won(n) : ''; });
    if (el.value) el.value = won(num(el.value));
  }
  $$('.pane').forEach(function (pane) {
    pane.addEventListener('input', function () { run(pane); });
    pane.addEventListener('change', function () { run(pane); });
    $$('input.money', pane).forEach(bindMoney);
  });

  /* ---------- 공유 ---------- */
  var toastT;
  function toast(msg) { var t = $('.toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove('on'); }, 2600); }
  function stateUrl(pane) {
    var q = [];
    $$('[data-k]', pane).forEach(function (el) {
      var k = el.getAttribute('data-k');
      if (el.type === 'radio') { if (el.checked) q.push(k + '=' + encodeURIComponent(el.value)); }
      else if (el.type === 'checkbox') q.push(k + '=' + (el.checked ? 1 : 0));
      else if (el.value !== '') q.push(k + '=' + encodeURIComponent(el.classList.contains('money') ? num(el.value) : el.value));
    });
    return location.origin + location.pathname + '#' + pane.id + '?' + q.join('&');
  }
  function applyState(pane, qs) {
    qs.split('&').forEach(function (pair) {
      var kv = pair.split('='), k = decodeURIComponent(kv[0] || ''), v = decodeURIComponent(kv[1] || '');
      $$('[data-k="' + k + '"]', pane).forEach(function (el) {
        if (el.type === 'radio') el.checked = el.value === v;
        else if (el.type === 'checkbox') el.checked = v === '1';
        else el.value = el.classList.contains('money') && v ? won(num(v)) : v;
      });
    });
  }
  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text);
    return new Promise(function (ok) { var t = document.createElement('textarea'); t.value = text; document.body.appendChild(t); t.select(); document.execCommand('copy'); t.remove(); ok(); });
  }

  // 이미지 미리보기 창
  var dlg = $('dialog.imgdlg'), cur = { blob: null, url: '', name: '' };
  function openImage(pane) {
    var doc = DOCS[pane.id]; if (!doc) return toast('먼저 금액을 입력해주세요.');
    var cv; try { cv = docImage(doc); } catch (e) { return toast('이미지를 만들지 못했어요. 화면을 캡처해서 보내주세요.'); }
    cur.name = doc.title.replace(/\s+/g, '') + '.png';
    if (cur.url) URL.revokeObjectURL(cur.url);
    cv.toBlob(function (blob) {
      cur.blob = blob; cur.url = URL.createObjectURL(blob);
      $('img', dlg).src = cur.url;
      var file = new File([blob], cur.name, { type: 'image/png' });
      $('[data-dlg="share"]', dlg).hidden = !(navigator.canShare && navigator.canShare({ files: [file] }));
      $('[data-dlg="copy"]', dlg).hidden = !(navigator.clipboard && window.ClipboardItem && window.isSecureContext);
      if (dlg.showModal) dlg.showModal(); else window.open(cur.url, '_blank');
    }, 'image/png');
  }
  dlg.addEventListener('click', function (e) {
    var b = e.target.closest('[data-dlg]'); if (e.target === dlg) return dlg.close(); if (!b) return;
    var act = b.getAttribute('data-dlg');
    if (act === 'close') dlg.close();
    else if (act === 'copy') navigator.clipboard.write([new ClipboardItem({ 'image/png': cur.blob })]).then(function () { toast('이미지를 복사했어요. 카카오톡 채팅창에 붙여넣기(Ctrl+V) 해주세요.'); }, function () { toast('복사가 안 되면 이미지 저장을 눌러주세요.'); });
    else if (act === 'save') { var a = document.createElement('a'); a.href = cur.url; a.download = cur.name; document.body.appendChild(a); a.click(); a.remove(); toast('이미지를 저장했어요.'); }
    else if (act === 'share') navigator.share({ files: [new File([cur.blob], cur.name, { type: 'image/png' })], title: cur.name }).catch(function () {});
  });

  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-act]'); if (!b) return;
    var pane = b.closest('.pane'), act = b.getAttribute('data-act');
    if (act === 'link') copyText(stateUrl(pane)).then(function () { toast('이 조건이 담긴 링크를 복사했어요.'); });
    else if (act === 'print') window.print();
    else if (act === 'img') openImage(pane);
    else if (act === 'fill') { fillSegs(pane, null, read(pane)); $$('.segwrap input.money', pane).forEach(function (el) { if (el.value) el.value = won(num(el.value)); }); run(pane); }
  });

  /* ---------- 시작 ---------- */
  function fromHash() {
    var h = location.hash.replace(/^#/, ''), parts = h.split('?'), id = parts[0] || 'pay', qs = parts[1] || '';
    if (ALIAS[id]) { qs = ALIAS[id][1] + (qs ? '&' + qs : ''); id = ALIAS[id][0]; }
    var pane = document.getElementById(id);
    if (pane && qs) { applyState(pane, qs); if (id === 'sev') { buildSegs(pane, read(pane)); applyState(pane, qs); }
      if (id === 'dins') { buildDinsRows(pane, read(pane)); applyState(pane, qs); } }
    activate(pane ? id : 'pay');
  }
  window.addEventListener('hashchange', fromHash);
  fromHash();
})();

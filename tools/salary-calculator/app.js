/* 화면 처리: 탭, 입력 읽기, 결과 그리기, 링크·이미지 공유 */
(function () {
  'use strict';
  var C = window.PayCalc, R = C.RATES;
  var $ = function (s, el) { return (el || document).querySelector(s); };
  var $$ = function (s, el) { return Array.prototype.slice.call((el || document).querySelectorAll(s)); };

  /* ---------- 숫자 표시 ---------- */
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
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function row(label, val, note, cls) {
    return '<tr' + (cls ? ' class="' + cls + '"' : '') + '><td>' + label + (note ? '<span class="s">' + note + '</span>' : '') + '</td><td class="n">' + val + '</td></tr>';
  }
  function cap(t) { return '<tr class="cap"><td colspan="2">' + t + '</td></tr>'; }
  function big(k, v, unit) { return '<div class="big"><span class="k">' + k + '</span><span class="v">' + v + '<small>' + (unit || '원') + '</small></span></div>'; }

  /* ---------- 공통 입력 묶음 ---------- */
  var COMMON = {
    nontax:
      '<div class="form"><h3>비과세 수당(월)</h3>' +
      '<label class="f"><span>식대</span><div class="in"><input type="text" inputmode="numeric" class="money" data-k="meal" value="200000"><em>원</em></div><small>월 20만원까지 비과세</small></label>' +
      '<label class="f"><span>자가운전보조금</span><div class="in"><input type="text" inputmode="numeric" class="money" data-k="car"><em>원</em></div><small>본인 차로 업무에 쓰는 경우 월 20만원까지</small></label>' +
      '<label class="f"><span>출산·보육수당</span><div class="in"><input type="text" inputmode="numeric" class="money" data-k="child"><em>원</em></div><small>6세 이하 자녀 1명당 월 20만원까지</small></label>' +
      '<label class="f"><span>6세 이하 자녀 수</span><div class="in"><input type="text" inputmode="numeric" class="int" data-k="childKids" value="1"><em>명</em></div></label></div>',
    person:
      '<div class="form"><h3>가족·세금</h3>' +
      '<label class="f"><span>공제대상 가족 수(본인 포함)</span><div class="in"><input type="text" inputmode="numeric" class="int" data-k="fam" value="1"><em>명</em></div><small>본인과 배우자도 각각 1명이에요.</small></label>' +
      '<label class="f"><span>그중 8세~20세 자녀 수</span><div class="in"><input type="text" inputmode="numeric" class="int" data-k="kids" value="0"><em>명</em></div></label>' +
      '<label class="f"><span>소득세 원천징수 비율</span><select data-k="ratio"><option value="100" selected>100%(기본)</option><option value="80">80%</option><option value="120">120%</option></select><small>직원이 신청한 경우에만 80%·120%</small></label>' +
      '<div class="f" style="justify-content:flex-end;gap:6px"><label class="chk"><input type="checkbox" data-k="noNP">국민연금 제외(만 60세 이상 등)</label><label class="chk"><input type="checkbox" data-k="noEI">고용보험 제외(65세 이후 새로 고용 등)</label></div></div>',
    employer: function () {
      var opts = C.INDUSTRY.map(function (g) {
        return '<optgroup label="' + esc(g[0]) + '">' + g[1].map(function (it) {
          var v = it[1], sel = it[0] === '도소매·음식·숙박업' ? ' selected' : '';
          return '<option value="' + v + '"' + sel + ' data-name="' + esc(it[0]) + '">' + esc(it[0]) + ' (' + v + '‰)</option>';
        }).join('') + '</optgroup>';
      }).join('');
      return '<div class="form"><h3>회사 부담 계산</h3>' +
        '<label class="f"><span>상시 근로자 수</span><select data-k="size"><option value="s150" selected>150인 미만</option><option value="p150">150인 이상 우선지원대상기업</option><option value="u1000">150인 이상 1,000인 미만</option><option value="o1000">1,000인 이상·국가 등</option></select><small>고용보험 회사 부담률이 달라져요.</small></label>' +
        '<label class="f"><span>산재보험 업종</span><select data-k="ind">' + opts + '</select><small>요율은 <a href="#rates" data-goto="rates">요율표</a>에서 확인할 수 있어요. 출퇴근재해 0.6‰은 자동으로 더해요.</small></label></div>';
    },
    round:
      '<div class="form"><label class="f full"><span>시급·일급 끝전 처리</span><select data-k="round"><option value="round" selected>원 미만 반올림(일반적)</option><option value="floor">원 미만 버림</option><option value="none">끝전 그대로 계산</option></select><small>시급·1일 임금 같은 단가의 원 미만 처리 방법이에요. 마지막 지급액은 원 미만을 버려요.</small></label></div>'
  };
  $$('[data-common]').forEach(function (el) {
    var c = COMMON[el.getAttribute('data-common')];
    el.outerHTML = typeof c === 'function' ? c() : c;
  });

  /* ---------- 입력 읽기 ---------- */
  function num(v) { v = String(v == null ? '' : v).replace(/[^0-9.\-]/g, ''); var n = parseFloat(v); return isNaN(n) ? 0 : n; }
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
  function selText(pane, k) { var s = $('[data-k="' + k + '"]', pane); return s && s.selectedOptions[0] ? (s.selectedOptions[0].getAttribute('data-name') || s.selectedOptions[0].textContent) : ''; }
  function setLabel(pane, key, text) { var l = $('[data-lbl="' + key + '"]', pane); if (l) l.textContent = text; }
  function showIf(pane, o) {
    $$('[data-show]', pane).forEach(function (el) { var p = el.getAttribute('data-show').split('='); el.hidden = String(o[p[0]]) !== p[1]; });
  }
  function hints(pane) {
    $$('input.money', pane).forEach(function (el) {
      var k = el.closest('.f'); var h = k && $('.kr', k); if (h) h.textContent = kr(num(el.value));
    });
  }

  /* ---------- 결과 상자 ---------- */
  function frame(pane, title, cond, body) {
    var out = $('[data-out]', pane);
    out.innerHTML =
      '<div class="r-head"><h3>' + title + '</h3><span class="stamp">' + R.asOf + ' 기준 · 참고용</span></div>' +
      (cond ? '<p class="r-cond">' + cond + '</p>' : '') + body +
      '<div class="acts" data-html2canvas-ignore><button class="btn main" data-act="img">이미지로 저장·보내기</button><button class="btn" data-act="link">링크 복사</button><button class="btn" data-act="print">인쇄</button></div>';
  }
  function errBox(pane, title, msg) { frame(pane, title, '', '<p class="err">' + msg + '</p>'); }

  function personCond(o) {
    var s = '가족 ' + (o.fam || 1) + '명';
    if (o.kids) s += '(8~20세 자녀 ' + o.kids + '명)';
    if (o.ratio && o.ratio !== '100') s += ' · 원천징수 ' + o.ratio + '%';
    return s;
  }
  function ntCond(o) {
    var a = [];
    if (o.meal) a.push('식대 ' + won(o.meal));
    if (o.car) a.push('자가운전 ' + won(o.car));
    if (o.child) a.push('보육수당 ' + won(o.child));
    return a.length ? '비과세 ' + a.join(', ') : '비과세 없음';
  }
  function salaryInput(o, gross) {
    return { gross: gross, nontax: { meal: o.meal, car: o.car, child: o.child, childKids: o.childKids }, fam: Math.max(1, o.fam | 0), kids: Math.max(0, o.kids | 0), ratio: +o.ratio || 100, noNP: o.noNP, noEI: o.noEI, size: o.size, indRate: +o.ind };
  }
  function salaryBody(s, pane, o, extraTop) {
    var e = s.emp, r = s.er, h = '';
    h += extraTop || '';
    h += '<table class="rt">';
    h += cap('직원 급여에서 떼는 금액');
    h += row('세전 월급', won(s.gross));
    if (s.nontax.allowed) h += row('그중 비과세', won(s.nontax.allowed), '', 'sub');
    h += row('국민연금', won(e.np), o.noNP ? '제외' : '4.75%');
    h += row('건강보험', won(e.hi), '3.595%');
    h += row('장기요양보험', won(e.ltc), '건강보험료의 13.14%');
    h += row('고용보험', won(e.ei), o.noEI ? '제외' : '0.9%');
    h += row('소득세', won(e.tax), '간이세액표');
    h += row('지방소득세', won(e.local), '소득세의 10%');
    h += row('공제 합계', won(e.sum), '', 'tot');
    h += row('실수령액', won(s.net), '', 'tot');
    h += cap('회사가 따로 내는 금액');
    h += row('국민연금', won(r.np), '4.75%');
    h += row('건강보험', won(r.hi), '3.595%');
    h += row('장기요양보험', won(r.ltc));
    h += row('고용보험', won(r.ei), (o.noEI ? '제외' : (0.9 + R.ei.extra[o.size || 's150'] * 100).toFixed(2).replace(/0$/, '') + '%'));
    h += row('산재보험', won(r.ind), selText(pane, 'ind').replace(/ \(.+\)$/, '') + ' ' + o.ind + '‰ + 출퇴근 0.6‰');
    h += row('회사 부담 4대보험 합계', won(r.sum), '', 'tot');
    h += row('월 인건비(급여 + 회사 부담)', won(s.cost), '', 'tot');
    h += row('퇴직금 적립 참고(월급의 1/12)', won(s.severanceMonthly), '1년 이상 근무 시', 'sub');
    h += '</table>';
    if (s.nontax.excess > 0) h += '<p class="warnline">비과세 한도를 넘는 ' + won(s.nontax.excess) + '원은 과세 급여로 계산했어요.</p>';
    if (s.taxable > R.np.max) h += '<p class="muted" style="font-size:.85rem">국민연금은 기준소득월액 상한 ' + won(R.np.max) + '원까지만 매겨요(' + R.np.period + ').</p>';
    return h;
  }

  /* ---------- 탭별 계산 ---------- */
  var CALC = {
    pay: function (pane, o) {
      setLabel(pane, 'amount', o.basis === 'month' ? '월급(세전)' : '연봉(세전)');
      showIf(pane, o);
      var monthly = o.basis === 'month' ? o.amount : o.amount / (o.sev13 ? 13 : 12);
      var nt = (o.meal || 0) + (o.car || 0) + (o.child || 0);
      var gross = Math.round(o.inclNT ? monthly : monthly + nt);
      if (gross <= 0) return errBox(pane, '급여 계산 결과', '금액을 입력해주세요.');
      if (o.inclNT && nt > gross) return errBox(pane, '급여 계산 결과', '비과세 수당이 월급보다 커요. 금액을 확인해주세요.');
      var s = C.salary(salaryInput(o, gross));
      var top = '<div class="bigs">' + big('월 실수령액', won(s.net)) + big('회사 월 인건비', won(s.cost)) + '</div>';
      var cond = (o.basis === 'month' ? '월급 ' : '연봉 ') + won(o.amount) + '원' + (o.basis === 'year' && o.sev13 ? '(퇴직금 포함, ÷13)' : '') + ' · ' + ntCond(o) + ' · ' + personCond(o);
      frame(pane, '급여 계산 결과', cond, top + salaryBody(s, pane, o) +
        '<p class="muted" style="font-size:.85rem">연간 실수령액 약 ' + won(s.net * 12) + '원 · 회사 연간 인건비 약 ' + won(s.cost * 12) + '원(퇴직금 제외)</p>');
    },
    rev: function (pane, o) {
      if (o.target <= 0) return errBox(pane, '세후→세전 계산 결과', '원하는 실수령액을 입력해주세요.');
      var s = C.salaryReverse(salaryInput(o, 0), o.target, +o.step || 1);
      var diff = s.net - o.target;
      var top = '<div class="bigs">' + big('필요한 세전 월급', won(s.gross)) + big('회사 월 인건비', won(s.cost)) + '</div>' +
        '<p class="' + (diff ? 'muted' : 'okline') + '" style="font-size:.88rem">이 금액이면 실수령액은 ' + won(s.net) + '원' + (diff ? '(목표보다 ' + won(diff) + '원 많음)' : '으로 목표와 같아요') + '. 세전 연봉으로는 ' + won(s.gross * 12) + '원이에요.</p>';
      frame(pane, '세후→세전 계산 결과', '목표 실수령액 ' + won(o.target) + '원 · ' + ntCond(o) + ' · ' + personCond(o), top + salaryBody(s, pane, o));
    },
    day: function (pane, o) {
      setLabel(pane, 'dayAmount', o.mode === 'rev' ? '1일 실지급액(차인지급액)' : '세전 일당');
      var days = Math.max(1, o.days | 0), opt = { days: days, noEI: o.o65 };
      if (o.amount <= 0) return errBox(pane, '일용직 계산 결과', '금액을 입력해주세요.');
      var d = o.mode === 'rev' ? C.dailyReverse(opt, o.amount) : C.daily(Object.assign({ wage: o.amount }, opt));
      var top = '<div class="bigs">' + big('세전 일당', won(d.wage)) + big(days > 1 ? days + '일 실지급액 합계' : '실지급액', won(d.net)) + '</div>';
      var h = top + '<table class="rt">' +
        row('세전 일당 × ' + days + '일', won(d.total)) +
        row('고용보험', won(d.ei), o.o65 ? '65세 이상 제외' : '0.9%') +
        row('소득세', won(d.tax), d.small ? '1천원 미만이라 떼지 않음' : '(일당 − 15만원) × 2.7%') +
        row('지방소득세', won(d.local), '소득세의 10%') +
        row('공제 합계', won(d.ded), '', 'tot') + row('실지급액', won(d.net), '', 'tot') + '</table>';
      var cond = [];
      if (o.ws || o.we) cond.push('근무 ' + (o.ws || '?') + ' ~ ' + (o.we || '?'));
      if (o.pd) cond.push('지급일 ' + o.pd);
      cond.push(days + '일');
      if (o.o65) cond.push('65세 이상');
      frame(pane, '일용직 계산 결과', cond.join(' · '), h + '<p class="muted" style="font-size:.85rem">국민연금·건강보험은 넣지 않았어요. 아래 참고사항을 확인해주세요.</p>');
    },
    biz: function (pane, o) {
      setLabel(pane, 'bizAmount', o.mode === 'rev' ? '실제로 줄 금액(세후)' : '지급할 금액(세전)');
      if (o.amount <= 0) return errBox(pane, '사업소득 계산 결과', '금액을 입력해주세요.');
      var b = o.mode === 'rev' ? C.bizReverse(o.amount) : C.biz(o.amount);
      frame(pane, '3.3% 사업소득 계산 결과', o.mode === 'rev' ? '세후 ' + won(o.amount) + '원 기준' : '세전 ' + won(o.amount) + '원 기준',
        '<div class="bigs">' + big('세전 지급액', won(b.gross)) + big('실지급액', won(b.net)) + '</div><table class="rt">' +
        row('세전 지급액', won(b.gross)) + row('소득세', won(b.tax), '3%') + row('지방소득세', won(b.local), '소득세의 10%') +
        row('공제 합계', won(b.ded), '', 'tot') + row('실지급액', won(b.net), '', 'tot') + '</table>' +
        '<p class="muted" style="font-size:.85rem">10원 미만은 버렸어요. 원천징수한 세금은 다음 달 10일까지 신고·납부해요.</p>');
    },
    table: function (pane, o) {
      var rg = (o.range || '20-100').split('-'), lo = +rg[0], hi = +rg[1], meal = +o.meal || 0;
      var h = '<div class="tw"><table class="t"><thead><tr><th class="n">연봉</th><th class="n">월급</th><th class="n">국민연금</th><th class="n">건강+요양</th><th class="n">고용</th><th class="n">소득세+지방</th><th class="n">월 실수령액</th></tr></thead><tbody>';
      for (var m = lo; m <= hi; m++) {
        var g = Math.round(m * 1e6 / 12);
        var s = C.salary({ gross: g, nontax: { meal: Math.min(meal, g) }, fam: +o.fam, kids: +o.kids, ratio: 100 });
        var e = s.emp;
        h += '<tr' + (m % 10 === 0 ? ' class="hl"' : '') + '><td class="n">' + won(m * 100) + '만</td><td class="n">' + won(g) + '</td><td class="n">' + won(e.np) + '</td><td class="n">' + won(e.hi + e.ltc) + '</td><td class="n">' + won(e.ei) + '</td><td class="n">' + won(e.tax + e.local) + '</td><td class="n"><b>' + won(s.net) + '</b></td></tr>';
      }
      h += '</tbody></table></div>';
      frame(pane, '연봉별 월 실수령액', '가족 ' + o.fam + '명' + (+o.kids ? '(8~20세 자녀 ' + o.kids + '명)' : '') + ' · ' + (meal ? '비과세 식대 월 20만원 포함' : '비과세 없음') + ' · 퇴직금 별도 연봉 ÷ 12', h);
    },
    leave: function (pane, o) {
      if (o.ord <= 0) return errBox(pane, '연차수당 계산 결과', '월 통상임금을 입력해주세요.');
      var l = C.leavePay({ ordinaryMonthly: o.ord, hours: o.hours || 209, dayHours: o.dayH || 8, days: o.days, round: o.round });
      var calc = '시급        = ' + won(o.ord) + ' ÷ ' + (o.hours || 209) + ' = ' + wonD(l.hourly) + '원\n' +
        '1일 통상임금 = ' + wonD(l.hourly) + ' × ' + (o.dayH || 8) + ' = ' + wonD(l.daily) + '원\n' +
        '연차수당    = ' + wonD(l.daily) + ' × ' + o.days + '일 = ' + won(l.pay) + '원';
      frame(pane, '연차수당 계산 결과', '월 통상임금 ' + won(o.ord) + '원 · 남은 연차 ' + o.days + '일',
        big('연차수당', won(l.pay)) + '<div class="calc">' + calc + '</div><p class="muted" style="font-size:.85rem">연차수당도 근로소득이라 지급하는 달 급여에 더해서 4대보험·소득세를 계산해요.</p>');
    },
    prorate: function (pane, o) {
      var p = C.prorate(o.s, o.e, o.method);
      if (p.error) return errBox(pane, '일할계산 결과', p.error);
      var items = [['기본급', 'i_base'], ['연장수당', 'i_ot'], ['휴일수당', 'i_hol'], ['기타 수당', 'i_etc'], ['식대', 'i_meal'], ['자가운전보조금', 'i_car'], ['보육수당', 'i_child']];
      var h = '<table class="rt">', tm = 0, tp = 0;
      items.forEach(function (it) {
        var a = o[it[1]] || 0; if (!a) return;
        var v = Math.floor(a * p.ratio + 1e-7); tm += a; tp += v;
        h += row(it[0], won(v), won(a) + ' × ' + p.num + '/' + p.den);
      });
      h += row('합계', won(tp), '월 ' + won(tm), 'tot') + '</table>';
      frame(pane, '일할계산 결과', o.s + ' ~ ' + o.e + ' · ' + p.label,
        big('이번 달 지급액(세전)', won(tp)) + '<p class="muted" style="font-size:.9rem">근무 ' + p.num + (o.method === 'weekday' ? '일(평일)' : '일') + ' ÷ ' + p.den + '일 = ' + (p.ratio * 100).toFixed(2) + '%</p>' + h);
    },
    wage: function (pane, o) {
      var hours = C.monthlyHours(o.weekH || 40);
      var mh = $('.mh', pane); if (mh) mh.textContent = '월 소정근로시간 ' + hours + '시간(주휴 포함)';
      var ordM = (o.base || 0) + (o.fixed || 0);
      if (ordM <= 0) return errBox(pane, '통상·평균임금 계산 결과', '기본급을 입력해주세요.');
      var a = C.averageWage({ lastDay: o.last, monthly: o.monthly, total3: o.total3, bonus: o.bonus, leavePay: o.leaveP, ordinaryMonthly: ordM, hours: hours, dayHours: o.dayH || 8, round: o.round });
      var h = '<div class="bigs">' + big('통상시급', wonD(a.ordHour)) + big('1일 통상임금', wonD(a.ordDay)) + '</div>';
      h += '<div class="calc">통상시급 = ' + won(ordM) + ' ÷ ' + hours + '시간 = ' + wonD(a.ordHour) + '원\n1일 통상임금 = ' + wonD(a.ordHour) + ' × ' + (o.dayH || 8) + '시간 = ' + wonD(a.ordDay) + '원</div>';
      if (a.error) { h += '<p class="muted">평균임금은 마지막 근무일을 넣으면 계산돼요.</p>'; }
      else {
        var p = a.period;
        h += '<div class="bigs">' + big('1일 평균임금', wonD(a.avg)) + big('퇴직금 등에 쓸 금액', wonD(a.applied)) + '</div>';
        h += '<div class="calc">기간 = ' + C.ymd(p.start) + ' ~ ' + C.ymd(p.end) + ' (' + p.days + '일)\n' +
          '3개월 임금 = ' + won(a.wages) + '원\n' + (a.add ? '상여·연차 3/12 = ' + won(a.add) + '원\n' : '') +
          '평균임금 = ' + won(a.wages + a.add) + ' ÷ ' + p.days + ' = ' + wonD(a.avg) + '원</div>';
        h += a.usedOrdinary ? '<p class="warnline">평균임금이 통상임금보다 적어서, 1일 통상임금(' + wonD(a.ordDay) + '원)을 평균임금으로 써요.</p>' : '';
      }
      frame(pane, '통상·평균임금 계산 결과', '월 통상임금 ' + won(ordM) + '원 · 주 ' + (o.weekH || 40) + '시간', h);
    },
    sev: function (pane, o) {
      var ord = o.ord > 0 ? o.ord : o.monthly;
      var s = C.severance({ join: o.join, lastDay: o.last, excludeDays: o.excl | 0, monthly: o.monthly, total3: o.total3, bonus: o.bonus, leavePay: o.leaveP, ordinaryMonthly: ord, hours: 209, dayHours: 8, round: o.round });
      if (s.error) return errBox(pane, '퇴직금 계산 결과', s.error);
      var a = s.aw, t = s.rt, p = a.period;
      var h = '';
      if (s.under1y) h += '<p class="warnline">재직기간이 1년 미만이라 퇴직금 지급 대상이 아닐 수 있어요.</p>';
      h += '<div class="bigs">' + big('퇴직금(세전)', won(s.pay)) + big('실지급액', won(s.net)) + '</div>';
      h += '<table class="rt">' + cap('퇴직금 계산') +
        row('재직일수', won(s.days) + '일', o.excl ? '제외 ' + o.excl + '일 반영' : '') +
        row('평균임금 기간', p.days + '일', C.ymd(p.start) + ' ~ ' + C.ymd(p.end)) +
        row('3개월 임금총액', won(a.wages)) +
        (a.add ? row('상여·연차수당 3/12', won(a.add)) : '') +
        row('1일 평균임금', wonD(a.avg)) +
        row('1일 통상임금', wonD(a.ordDay), won(ord) + ' ÷ 209 × 8') +
        row('적용 금액', wonD(a.applied), a.usedOrdinary ? '통상임금이 더 커서 통상임금 적용' : '평균임금 적용', 'tot') +
        row('퇴직금', won(s.pay), wonD(a.applied) + ' × ' + won(s.days) + ' × 30 ÷ 365', 'tot') +
        cap('퇴직소득세') +
        row('근속연수', t.years + '년', '1년 미만 끝수는 1년') +
        row('근속연수공제', won(t.serviceDed)) +
        row('환산급여', won(t.conv), '(퇴직금 − 근속연수공제) × 12 ÷ 근속연수') +
        row('환산급여공제', won(t.convDed)) +
        row('과세표준', won(t.base)) +
        row('환산산출세액', won(t.convTax)) +
        row('퇴직소득세', won(t.tax), '환산산출세액 × 근속연수 ÷ 12') +
        row('지방소득세', won(t.local), '소득세의 10%') +
        row('세금 합계', won(t.tax + t.local), '', 'tot') +
        row('실지급액', won(s.net), '', 'tot') + '</table>';
      frame(pane, '퇴직금 계산 결과', o.join + ' 입사 ~ ' + o.last + ' 퇴사 · 월 임금 ' + won(o.total3 > 0 ? o.total3 / 3 : o.monthly) + '원', h +
        '<p class="muted" style="font-size:.85rem">퇴직금에서 건강보험·고용보험 정산분은 빼지 않았어요. 퇴사 달 급여에서 따로 정산해요.</p>');
    },
    ot: function (pane, o) {
      var hourlyAuto = o.ord > 0 ? C.unit(o.ord / (o.hours || 209), o.round) : 0;
      var hh = $('.hh', pane); if (hh) hh.textContent = hourlyAuto ? '통상시급 ' + wonD(hourlyAuto) + '원으로 계산' : '';
      var hourly = o.hourly > 0 ? o.hourly : hourlyAuto;
      if (!hourly) return errBox(pane, '수당 계산 결과', '통상시급이나 월 통상임금을 입력해주세요.');
      var hrs = { ot: o.h_ot, otn: o.h_otn, n: o.h_n, h8: o.h_h8, h8n: o.h_h8n, ho: o.h_ho, hon: o.h_hon };
      var r = C.overtime(hourly, hrs, o.five);
      var h = big('수당 합계', won(r.total)) + '<table class="rt">';
      r.rows.forEach(function (x) { if (x.hours) h += row(x.name, won(x.amount), x.hours + '시간 × ' + Math.round(x.rate * 100) + '%'); });
      h += row('합계', won(r.total), '', 'tot') + '</table>';
      if (!o.five) h += '<p class="warnline">5인 미만 사업장이라 가산 없이 100%로 계산했어요. 소정근로 중 야간근로는 추가 지급이 없어요.</p>';
      frame(pane, '연장·야간·휴일수당 계산 결과', '통상시급 ' + wonD(hourly) + '원 · ' + (o.five ? '5인 이상' : '5인 미만'), h);
    },
    min: function (pane, o) {
      var hours = C.monthlyHours(o.weekH || 40);
      var mh = $('.mh', pane); if (mh) mh.textContent = '월 소정근로시간 ' + hours + '시간(주휴 포함)';
      setLabel(pane, 'minAmount', o.mode === 'hour' ? '시급' : '월 급여(최저임금에 들어가는 임금)');
      var mw = R.minWage[o.year], minMonth = mw * hours;
      if (o.amount <= 0) return errBox(pane, '최저임금 확인 결과', '금액을 입력해주세요.');
      var hourly = o.mode === 'hour' ? o.amount : o.amount / hours;
      var ok = hourly + 1e-9 >= mw;
      var h = '<div class="bigs">' + big('환산 시급', wonD(hourly)) + big(o.year + '년 최저 월급(' + hours + '시간)', won(minMonth)) + '</div>' +
        (ok ? '<p class="okline">최저임금(' + won(mw) + '원) 이상이에요.</p>' : '<p class="warnline">최저임금(' + won(mw) + '원)보다 시급이 ' + wonD(mw - hourly) + '원 적어요. 월 ' + won(Math.ceil((mw - hourly) * hours)) + '원 이상 올려야 해요.</p>');
      frame(pane, '최저임금 확인 결과', o.year + '년 · 주 ' + (o.weekH || 40) + '시간 · ' + (o.mode === 'hour' ? '시급 ' : '월 ') + won(o.amount) + '원', h);
    }
  };

  /* ---------- 요율표 ---------- */
  function ratesHtml() {
    var ex = R.ei.extra, h = '';
    h += '<h3 style="margin:8px 0">4대보험</h3><div class="tw"><table class="t"><thead><tr><th>구분</th><th class="n">근로자</th><th class="n">회사</th><th class="n">합계</th><th>기준</th></tr></thead><tbody>' +
      '<tr><td>국민연금</td><td class="n">4.75%</td><td class="n">4.75%</td><td class="n">9.5%</td><td>기준소득월액 ' + won(R.np.min) + '원 ~ ' + won(R.np.max) + '원(' + R.np.period + ')</td></tr>' +
      '<tr><td>건강보험</td><td class="n">3.595%</td><td class="n">3.595%</td><td class="n">7.19%</td><td>근로자 부담 월 상한 ' + won(R.hi.capEach) + '원</td></tr>' +
      '<tr><td>장기요양보험</td><td class="n" colspan="3" style="text-align:center">건강보험료의 13.14% (소득 대비 0.9448%)</td><td>근로자·회사 반씩</td></tr>' +
      '<tr><td>고용보험(실업급여)</td><td class="n">0.9%</td><td class="n">0.9%</td><td class="n">1.8%</td><td></td></tr>' +
      '<tr><td>고용보험(고용안정·직업능력개발)</td><td class="n">—</td><td class="n">0.25~0.85%</td><td class="n"></td><td>회사 규모별(아래 표)</td></tr>' +
      '<tr><td>산재보험</td><td class="n">—</td><td class="n">업종별</td><td class="n"></td><td>업종 요율 + 출퇴근재해 0.6‰</td></tr>' +
      '</tbody></table></div>';
    h += '<h3 style="margin:22px 0 8px">고용보험 회사 추가 부담(고용안정·직업능력개발)</h3><div class="tw narrow"><table class="t"><thead><tr><th>상시 근로자 수</th><th class="n">요율</th></tr></thead><tbody>' +
      '<tr><td>150인 미만</td><td class="n">' + (ex.s150 * 100) + '%</td></tr><tr><td>150인 이상 우선지원대상기업</td><td class="n">' + (ex.p150 * 100) + '%</td></tr>' +
      '<tr><td>150인 이상 1,000인 미만(우선지원대상기업 아님)</td><td class="n">' + (ex.u1000 * 100) + '%</td></tr><tr><td>1,000인 이상·국가·지방자치단체</td><td class="n">' + (ex.o1000 * 100) + '%</td></tr></tbody></table></div>';
    h += '<h3 style="margin:22px 0 8px">2026년 사업종류별 산재보험료율</h3><p class="muted" style="font-size:.9rem;margin-bottom:8px">단위 ‰(천분율). 1,000원당 내는 금액이에요. 예: 8‰이면 월급 300만원에 24,000원. 여기에 출퇴근재해 요율 0.6‰을 모든 업종에 더해요. 회사 전액 부담이에요.</p>' +
      '<div class="tw narrow"><table class="t"><thead><tr><th>사업 종류</th><th class="n">요율</th></tr></thead><tbody>';
    C.INDUSTRY.forEach(function (g) {
      if (g[1].length === 1 && g[1][0][0] === g[0]) h += '<tr class="grp"><td>' + esc(g[0]) + '</td><td class="n">' + g[1][0][1] + '‰</td></tr>';
      else { h += '<tr class="grp"><td colspan="2">' + esc(g[0]) + '</td></tr>'; g[1].forEach(function (it) { h += '<tr><td style="padding-left:20px">' + esc(it[0]) + '</td><td class="n">' + it[1] + '‰</td></tr>'; }); }
    });
    h += '</tbody></table></div><p class="muted" style="font-size:.85rem;margin-top:8px">우리 회사가 어느 사업 종류에 해당하는지는 근로복지공단이 정한 사업종류 예시표로 판단해요. 사업장 가입 시 받은 산재보험 요율을 확인해주세요.</p>';
    h += '<h3 style="margin:22px 0 8px">근로소득 비과세 한도(월)</h3><div class="tw narrow"><table class="t"><tbody>' +
      '<tr><td>식대(식사를 따로 제공받지 않는 경우)</td><td class="n">20만원</td></tr>' +
      '<tr><td>자가운전보조금(본인 차량으로 업무 수행, 실제 여비 대신 받는 경우)</td><td class="n">20만원</td></tr>' +
      '<tr><td>출산·보육수당(6세 이하 자녀)</td><td class="n">자녀 1명당 20만원</td></tr></tbody></table></div>';
    h += '<details class="law" style="margin-top:14px"><summary>근거</summary><p><b>보건복지부고시 제2026-31호</b> 국민연금 기준소득월액 하한액과 상한액 · <b>고용노동부고시 제2025-91호</b> 2026년도 사업종류별 산재보험료율 · 2026년 건강보험료율 7.19%, 장기요양보험료율 건강보험료의 13.14% · <b>소득세법 제12조제3호러목</b> 식대 · <b>제12조제3호머목</b> 출산·보육수당 · <b>소득세법 시행령 제12조제3호</b> 자가운전보조금</p></details>';
    return h;
  }
  $('#ratesOut').innerHTML = ratesHtml();

  /* ---------- 탭 ---------- */
  var tabs = $$('.tabs button');
  function activate(id, focusTab) {
    if (!document.getElementById(id) || !CALC[id] && id !== 'rates') id = 'pay';
    tabs.forEach(function (b) { var on = b.getAttribute('data-tab') === id; b.setAttribute('aria-selected', on); b.tabIndex = on ? 0 : -1; if (on) { var c = b.parentNode; c.scrollLeft = b.offsetLeft - c.clientWidth / 2 + b.offsetWidth / 2; if (focusTab) b.focus(); } });
    $$('.pane').forEach(function (p) { p.hidden = p.id !== id; });
    var pane = document.getElementById(id);
    document.title = (pane.getAttribute('data-title') || '급여·노무 계산기') + ' · 급여·노무 계산기';
    run(pane);
  }
  tabs.forEach(function (b) {
    b.setAttribute('aria-controls', b.getAttribute('data-tab'));
    b.addEventListener('click', function () { activate(b.getAttribute('data-tab')); history.replaceState(null, '', '#' + b.getAttribute('data-tab')); var nav = $('.tabs'); if (window.scrollY > nav.offsetTop) window.scrollTo({ top: nav.offsetTop }); });
    b.addEventListener('keydown', function (e) {
      var i = tabs.indexOf(b), n = e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1 : -1;
      if (n >= 0 && n < tabs.length) { e.preventDefault(); tabs[n].click(); tabs[n].focus(); }
    });
  });
  document.addEventListener('click', function (e) {
    var g = e.target.closest('[data-goto]'); if (g) { e.preventDefault(); activate(g.getAttribute('data-goto')); history.replaceState(null, '', '#' + g.getAttribute('data-goto')); window.scrollTo({ top: $('.tabs').offsetTop }); }
  });

  /* ---------- 실행 ---------- */
  function run(pane) { if (CALC[pane.id]) { hints(pane); CALC[pane.id](pane, read(pane)); } }
  $$('.pane').forEach(function (pane) {
    pane.addEventListener('input', function () { run(pane); });
    pane.addEventListener('change', function () { run(pane); });
    $$('input.money', pane).forEach(function (el) {
      el.addEventListener('blur', function () { var n = num(el.value); el.value = n ? won(n) : ''; });
      if (el.value) el.value = won(num(el.value));
    });
  });

  /* ---------- 공유: 링크·이미지·인쇄 ---------- */
  var toastT;
  function toast(msg) { var t = $('.toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove('on'); }, 2200); }
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
  function copy(text) {
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text);
    return new Promise(function (ok) { var t = document.createElement('textarea'); t.value = text; document.body.appendChild(t); t.select(); document.execCommand('copy'); t.remove(); ok(); });
  }
  var h2cLoading;
  function loadH2C() {
    if (window.html2canvas) return Promise.resolve();
    if (h2cLoading) return h2cLoading;
    h2cLoading = new Promise(function (ok, no) {
      var s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
      s.onload = ok; s.onerror = function () { h2cLoading = null; no(); };
      document.head.appendChild(s);
    });
    return h2cLoading;
  }
  function saveImage(pane) {
    var el = $('[data-out]', pane);
    toast('이미지를 만드는 중이에요…');
    loadH2C().then(function () {
      var bg = getComputedStyle(document.body).backgroundColor;
      el.style.padding = '18px 16px 10px';
      return window.html2canvas(el, { backgroundColor: bg, scale: 2, useCORS: true }).finally(function () { el.style.padding = ''; });
    }).then(function (canvas) {
      canvas.toBlob(function (blob) {
        var name = (pane.getAttribute('data-title') || '계산 결과') + '.png';
        var file = new File([blob], name, { type: 'image/png' });
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          navigator.share({ files: [file], title: name }).catch(function () {});
        } else {
          var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click();
          setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
          toast('이미지를 저장했어요. 카카오톡에서 사진으로 보내주세요.');
        }
      }, 'image/png');
    }).catch(function () { toast('이미지를 만들지 못했어요. 화면을 캡처해서 보내주세요.'); });
  }
  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-act]'); if (!b) return;
    var pane = b.closest('.pane'), act = b.getAttribute('data-act');
    if (act === 'link') copy(stateUrl(pane)).then(function () { toast('이 조건이 담긴 링크를 복사했어요.'); });
    else if (act === 'print') window.print();
    else if (act === 'img') saveImage(pane);
  });

  /* ---------- 시작 ---------- */
  function fromHash() {
    var h = location.hash.replace(/^#/, ''), parts = h.split('?'), id = parts[0] || 'pay';
    var pane = document.getElementById(id);
    if (pane && parts[1]) applyState(pane, parts[1]);
    activate(pane ? id : 'pay');
  }
  window.addEventListener('hashchange', fromHash);
  fromHash();
})();

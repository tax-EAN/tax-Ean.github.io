/* 급여·노무 계산 엔진 (화면과 분리된 순수 계산 함수)
   기준: 2026년 요율. 요율이 바뀌면 아래 RATES만 고치면 됩니다. */
(function (root) {
  'use strict';

  var RATES = {
    asOf: '2026년 11월',
    np: { rate: 0.0475, min: 410000, max: 6590000, period: '2026년 7월 ~ 2027년 6월' }, // 국민연금(근로자·사업주 각각)
    hi: { rate: 0.03595, total: 0.0719, capEach: 4591740, floorTotal: 20160 },          // 건강보험(각각)
    ltc: { incomeRate: 0.009448, ofHi: 0.1314 },                                         // 장기요양(소득 대비 / 건보료 대비)
    ei: { emp: 0.009, er: 0.009, extra: { s150: 0.0025, p150: 0.0045, u1000: 0.0065, o1000: 0.0085 } },
    ind: { commute: 0.6 },                                                                // 출퇴근재해 ‰
    minWage: { 2026: 10320, 2027: 10700 },
    nontax: { meal: 200000, car: 200000, childPer: 200000 },
    day: { ded: 150000, rate: 0.06, credit: 0.55 }                                        // 일용근로
  };

  // 2026년 사업종류별 산재보험료율(고용노동부고시 제2025-91호), 단위 ‰
  var INDUSTRY = [
    ['광업', [['석탄광업 및 채석업', 185], ['석회석·금속·비금속·기타광업', 57]]],
    ['제조업', [['식료품 제조업', 16], ['섬유 및 섬유제품 제조업', 11], ['목재 및 종이제품 제조업', 20], ['출판·인쇄·제본업', 9],
      ['화학 및 고무제품 제조업', 13], ['의약품·화장품·연탄·석유제품 제조업', 7], ['기계기구·금속·비금속광물제품 제조업', 13],
      ['금속제련업', 10], ['전기기계기구·정밀기구·전자제품 제조업', 6], ['선박건조 및 수리업', 24], ['수제품 및 기타제품 제조업', 12]]],
    ['전기·가스·증기·수도사업', [['전기·가스·증기·수도사업', 7]]],
    ['건설업', [['건설업', 35]]],
    ['운수·창고·통신업', [['철도·항공·창고·운수관련서비스업', 8], ['육상 및 수상운수업', 18], ['통신업', 9]]],
    ['임업', [['임업', 58]]],
    ['어업', [['어업', 27]]],
    ['농업', [['농업', 20]]],
    ['기타의 사업', [['시설관리 및 사업지원 서비스업', 8], ['기타의 각종사업', 8], ['전문·보건·교육·여가관련 서비스업', 6],
      ['도소매·음식·숙박업', 8], ['부동산 및 임대업', 7], ['국가 및 지방자치단체의 사업', 9]]],
    ['금융 및 보험업', [['금융 및 보험업', 5]]],
    ['해외파견자', [['해외파견자', 14]]]
  ];

  var EPS = 1e-7;
  function floor10(x) { return x <= 0 ? 0 : Math.floor(x / 10 + EPS) * 10; }
  function floor1(x) { return x <= 0 ? 0 : Math.floor(x + EPS); }
  function unit(x, mode) { // 단가(시급·일급·평균임금) 끝전 처리
    if (mode === 'floor') return Math.floor(x + EPS);
    if (mode === 'none') return x;
    return Math.round(x);
  }

  /* ---------- 근로소득 간이세액표 ---------- */
  function tableTax(pay, fam) {
    var T = root.TAX_TABLE_2026;
    if (!T || pay < 770000) return 0;
    var k = Math.floor(pay / 1000);
    function col(row, f) {
      if (f <= 11) return row[f - 1];
      return Math.max(0, row[10] - (row[9] - row[10]) * (f - 11));
    }
    if (k < 10000) {
      var rows = T.rows, lo = 0, hi = rows.length - 1;
      while (lo <= hi) {
        var m = (lo + hi) >> 1, r = rows[m];
        if (k < r[0]) hi = m - 1; else if (k >= r[1]) lo = m + 1;
        else return col(r.slice(2), fam);
      }
      return 0;
    }
    var base = col(T.at10000, fam);
    if (k === 10000) return base;
    var t;
    if (pay <= 14000000) t = base + (pay - 10000000) * 0.98 * 0.35 + 25000;
    else if (pay <= 28000000) t = base + 1397000 + (pay - 14000000) * 0.98 * 0.38;
    else if (pay <= 30000000) t = base + 6610600 + (pay - 28000000) * 0.98 * 0.40;
    else if (pay <= 45000000) t = base + 7394600 + (pay - 30000000) * 0.40;
    else if (pay <= 87000000) t = base + 13394600 + (pay - 45000000) * 0.42;
    else t = base + 31034600 + (pay - 87000000) * 0.45;
    return floor10(t);
  }
  function kidDeduction(k) {
    if (k <= 0) return 0;
    if (k === 1) return 20830;
    if (k === 2) return 45830;
    return 45830 + 33330 * (k - 2);
  }
  function incomeTax(taxable, fam, kids, ratio) {
    var t = tableTax(taxable, Math.max(1, fam));
    t = Math.max(0, t - kidDeduction(kids));
    t = floor10(t * (ratio || 100) / 100);
    return { tax: t, local: floor10(t * 0.1) };
  }

  /* ---------- 비과세 ---------- */
  function nontaxSplit(nt) { // nt: {meal, car, child, childKids}
    nt = nt || {};
    var lim = RATES.nontax, kids = Math.max(1, nt.childKids || 1);
    var m = nt.meal || 0, c = nt.car || 0, ch = nt.child || 0;
    var ok = Math.min(m, lim.meal) + Math.min(c, lim.car) + Math.min(ch, lim.childPer * kids);
    return { paid: m + c + ch, allowed: ok, excess: m + c + ch - ok };
  }

  /* ---------- 월 급여: 세전 → 세후 ---------- */
  // o: {gross, nontax:{...}, fam, kids, ratio, noNP, noEI, size, indRate}
  function salary(o) {
    var R = RATES, ns = nontaxSplit(o.nontax);
    var gross = Math.max(0, Math.round(o.gross || 0));
    var taxable = Math.max(0, gross - ns.allowed);
    var npSrc = o.npBase > 0 ? o.npBase : taxable, hiSrc = o.hiBase > 0 ? o.hiBase : taxable;
    var npBase = Math.min(R.np.max, Math.max(R.np.min, Math.floor(npSrc / 1000) * 1000));
    var np = (o.noNP || npSrc <= 0) ? 0 : floor10(npBase * R.np.rate);
    var hi = hiSrc <= 0 ? 0 : Math.min(R.hi.capEach, Math.max(floor10(hiSrc * R.hi.rate), R.hi.floorTotal / 2));
    var ltc = floor10(hi * R.ltc.incomeRate / R.hi.total);
    var ei = o.noEI ? 0 : floor10(taxable * R.ei.emp);
    var it = incomeTax(taxable, o.fam || 1, o.kids || 0, o.ratio || 100);
    var ded = np + hi + ltc + ei + it.tax + it.local;
    var extra = R.ei.extra[o.size || 's150'] || 0.0025;
    var erEI = o.noEI ? 0 : floor10(taxable * (R.ei.er + extra));
    var ind = floor10(taxable * ((o.indRate == null ? 8 : o.indRate) + R.ind.commute) / 1000);
    var er = { np: np, hi: hi, ltc: ltc, ei: erEI, ind: ind };
    er.sum = np + hi + ltc + erEI + ind;
    return {
      gross: gross, taxable: taxable, nontax: ns, npBase: npBase, hiBase: hiSrc,
      emp: { np: np, hi: hi, ltc: ltc, ei: ei, tax: it.tax, local: it.local, ins: np + hi + ltc + ei, sum: ded },
      net: gross - ded, er: er, cost: gross + er.sum, severanceMonthly: Math.floor(gross / 12)
    };
  }

  // 세후 → 세전: 비과세는 그대로 두고 과세 급여를 찾음
  function minSearch(lo, hi, ok) { while (lo < hi) { var m = Math.floor((lo + hi) / 2); if (ok(m)) hi = m; else lo = m + 1; } return lo; }
  function salaryReverse(o, targetNet, step) {
    var ns = nontaxSplit(o.nontax);
    var f = function (g) { var c = Object.assign({}, o, { gross: g }); return salary(c); };
    var g = minSearch(ns.paid, ns.paid + 200000000, function (g) { return f(g).net >= targetNet; });
    step = step || 1;
    if (step > 1) g = Math.ceil(g / step) * step;
    return f(g);
  }

  /* ---------- 일용근로 ---------- */
  function daily(o) { // {wage(일급), days, noEI}
    var R = RATES.day, d = Math.max(1, o.days || 1), w = Math.max(0, Math.round(o.wage || 0));
    var total = w * d;
    var ei = o.noEI ? 0 : floor10(total * RATES.ei.emp);
    var perDay = Math.max(0, w - R.ded) * R.rate * (1 - R.credit);
    var tax = floor10(perDay * d);
    var small = tax > 0 && tax < 1000;
    if (small) tax = 0;
    var local = floor10(tax * 0.1);
    var ded = ei + tax + local;
    return { wage: w, days: d, total: total, ei: ei, tax: tax, local: local, small: small, ded: ded, net: total - ded, netPerDay: (total - ded) / d };
  }
  function dailyReverse(o, targetPerDay) {
    var d = Math.max(1, o.days || 1);
    var w = minSearch(0, 100000000, function (w) { return daily(Object.assign({}, o, { wage: w })).net >= targetPerDay * d; });
    return daily(Object.assign({}, o, { wage: w }));
  }

  /* ---------- 사업소득 3.3% ---------- */
  function biz(gross) {
    gross = Math.max(0, Math.round(gross || 0));
    var tax = floor10(gross * 0.03), local = floor10(tax * 0.1);
    return { gross: gross, tax: tax, local: local, ded: tax + local, net: gross - tax - local };
  }
  function bizReverse(net) { return biz(minSearch(0, 10000000000, function (g) { return biz(g).net >= net; })); }

  /* ---------- 날짜 ---------- */
  function D(s) { if (!s) return null; var p = String(s).split('-'); if (p.length < 3) return null; var d = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2])); return isNaN(d) ? null : d; }
  function ymd(d) { return d.toISOString().slice(0, 10); }
  function addDays(d, n) { return new Date(d.getTime() + n * 864e5); }
  function daysBetween(a, b) { return Math.round((b - a) / 864e5) + 1; } // 양끝 포함
  function dim(y, m) { return new Date(Date.UTC(y, m + 1, 0)).getUTCDate(); } // m: 0~11
  function addMonths(d, n) {
    var y = d.getUTCFullYear(), m = d.getUTCMonth() + n, day = d.getUTCDate();
    var ty = y + Math.floor(m / 12), tm = ((m % 12) + 12) % 12;
    return new Date(Date.UTC(ty, tm, Math.min(day, dim(ty, tm))));
  }
  function monthsDiff(a, b) { // 엑셀 DATEDIF(a,b,"m")
    var m = (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + b.getUTCMonth() - a.getUTCMonth();
    if (b.getUTCDate() < a.getUTCDate()) m--;
    return m;
  }

  /* ---------- 일할계산 ---------- */
  function weekdays(a, b) { var n = 0; for (var d = a; d <= b; d = addDays(d, 1)) { var w = d.getUTCDay(); if (w !== 0 && w !== 6) n++; } return n; }
  function prorate(start, end, method) {
    var a = D(start), b = D(end);
    if (!a || !b || b < a) return { error: '시작일과 종료일을 확인해주세요.' };
    if (a.getUTCFullYear() !== b.getUTCFullYear() || a.getUTCMonth() !== b.getUTCMonth())
      return { error: '일할계산은 같은 달 안에서만 할 수 있어요. 달이 바뀌면 달마다 나눠서 계산해주세요.' };
    var y = a.getUTCFullYear(), m = a.getUTCMonth(), md = dim(y, m);
    var num, den, label;
    if (method === 'fixed30') { num = Math.min(30, daysBetween(a, b)); den = 30; label = '30일 기준'; }
    else if (method === 'weekday') { num = weekdays(a, b); den = weekdays(new Date(Date.UTC(y, m, 1)), new Date(Date.UTC(y, m, md))); label = '근무일(월~금) 기준'; }
    else { num = daysBetween(a, b); den = md; label = '역일수(달력 날수) 기준'; }
    return { num: num, den: den, ratio: num / den, label: label, monthDays: md };
  }

  /* ---------- 통상·평균임금 ---------- */
  function monthlyHours(weekH) { // 주 소정근로시간 → 월 소정근로시간(주휴 포함)
    weekH = +weekH || 0;
    var holiday = weekH >= 15 ? Math.min(8, weekH / 40 * 8) : 0;
    return Math.round((weekH + holiday) * 365 / 7 / 12);
  }
  function avgWagePeriod(lastDay) { // 마지막 근무일 포함 이전 3개월
    var b = D(lastDay); if (!b) return null;
    var a = addMonths(addDays(b, 1), -3);
    return { start: a, end: b, days: daysBetween(a, b) };
  }
  function wageInPeriod(monthly, p) { // 매달 같은 월급을 기간 날수로 나눔(퇴직금 서식과 같은 방식)
    var total = 0, d = p.start;
    while (d <= p.end) {
      var y = d.getUTCFullYear(), m = d.getUTCMonth(), md = dim(y, m);
      var mEnd = new Date(Date.UTC(y, m, md)); if (mEnd > p.end) mEnd = p.end;
      total += monthly * daysBetween(d, mEnd) / md;
      d = addDays(mEnd, 1);
    }
    return total;
  }
  function avgSegments(lastDay) { // 3개월을 달력의 달 단위로 나눔
    var p = avgWagePeriod(lastDay); if (!p) return null;
    var segs = [], d = p.start;
    while (d <= p.end) {
      var y = d.getUTCFullYear(), m = d.getUTCMonth(), md = dim(y, m);
      var e = new Date(Date.UTC(y, m, md)); if (e > p.end) e = p.end;
      segs.push({ key: y + '-' + (m + 1), start: d, end: e, days: daysBetween(d, e), monthDays: md, full: daysBetween(d, e) === md });
      d = addDays(e, 1);
    }
    p.segs = segs; return p;
  }
  // o: {lastDay, segAmounts:[달별 임금], monthly, total3, bonus, leavePay, ordinaryMonthly, hours, dayHours, round}
  function averageWage(o) {
    var p = avgSegments(o.lastDay); if (!p) return { error: '마지막 근무일을 입력해주세요.' };
    var wages = o.segAmounts ? o.segAmounts.reduce(function (a, b) { return a + (b || 0); }, 0) : (o.total3 > 0 ? o.total3 : wageInPeriod(o.monthly || 0, p));
    var add = (o.bonus || 0) * 3 / 12 + (o.leavePay || 0) * 3 / 12;
    var avg = unit((wages + add) / p.days, o.round);
    var ordHour = o.ordinaryMonthly > 0 ? unit(o.ordinaryMonthly / (o.hours || 209), o.round) : 0;
    var ordDay = unit(ordHour * (o.dayHours || 8), o.round);
    return { period: p, wages: wages, add: add, avg: avg, ordHour: ordHour, ordDay: ordDay, applied: Math.max(avg, ordDay), usedOrdinary: ordDay > avg };
  }

  /* ---------- 퇴직소득세 ---------- */
  function progressive(x) {
    var B = [[14e6, .06, 0], [50e6, .15, 126e4], [88e6, .24, 576e4], [150e6, .35, 1544e4], [300e6, .38, 1994e4], [500e6, .40, 2594e4], [1e9, .42, 3594e4], [Infinity, .45, 6594e4]];
    for (var i = 0; i < B.length; i++) if (x <= B[i][0]) return x * B[i][1] - B[i][2];
  }
  function serviceDeduction(y) {
    if (y <= 5) return 1e6 * y;
    if (y <= 10) return 5e6 + 2e6 * (y - 5);
    if (y <= 20) return 15e6 + 2.5e6 * (y - 10);
    return 40e6 + 3e6 * (y - 20);
  }
  function convDeduction(c) {
    if (c <= 8e6) return c;
    if (c <= 70e6) return 8e6 + (c - 8e6) * 0.6;
    if (c <= 100e6) return 45.2e6 + (c - 70e6) * 0.55;
    if (c <= 300e6) return 61.7e6 + (c - 100e6) * 0.45;
    return 151.7e6 + (c - 300e6) * 0.35;
  }
  function retirementTax(pay, start, end) {
    var a = D(start), b = D(end);
    var months = monthsDiff(a, b) + 1;              // 1개월 미만은 1개월
    var years = Math.max(1, Math.ceil(months / 12));// 1년 미만은 1년
    var sd = Math.min(pay, serviceDeduction(years));
    var conv = (pay - sd) * 12 / years;
    var cd = Math.floor(convDeduction(conv));
    var base = Math.max(0, Math.floor(conv - cd));
    var convTax = Math.max(0, Math.floor(progressive(base)));
    var tax = Math.floor(convTax * years / 12);
    var income = floor10(tax), local = floor10(income * 0.1);
    return { years: years, months: months, serviceDed: sd, conv: Math.floor(conv), convDed: cd, base: base, convTax: convTax, calcTax: tax, tax: income, local: local };
  }

  /* ---------- 퇴직금 ---------- */
  // o: {join, lastDay, excludeDays, monthly, total3, bonus, leavePay, ordinaryMonthly, hours, dayHours, round}
  function severance(o) {
    var a = D(o.join), b = D(o.lastDay);
    if (!a || !b || b < a) return { error: '입사일과 퇴사일(마지막 근무일)을 확인해주세요.' };
    var days = daysBetween(a, b) - (o.excludeDays || 0);
    var aw = averageWage(o);
    var pay = floor1(aw.applied * days * 30 / 365);
    var under1y = daysBetween(a, b) < 365;
    var rt = retirementTax(pay, o.join, o.lastDay);
    return { days: days, under1y: under1y, aw: aw, pay: pay, rt: rt, net: pay - rt.tax - rt.local };
  }

  /* ---------- 연차·수당 ---------- */
  function leavePay(o) { // {ordinaryMonthly, hours, dayHours, days, round}
    var h = unit(o.ordinaryMonthly / (o.hours || 209), o.round);
    var d = unit(h * (o.dayHours || 8), o.round);
    return { hourly: h, daily: d, pay: floor1(d * (o.days || 0)) };
  }
  var OT = [ // [키, 이름, 5인 이상 배율, 5인 미만 배율, 법령]
    ['ot', '평일 연장근로', 1.5, 1.0, '근로기준법 제56조제1항'],
    ['otn', '평일 연장 + 야간(22시~06시)', 2.0, 1.0, '근로기준법 제56조제1항·제3항'],
    ['n', '야간근로만(소정근로시간 중 22시~06시)', 0.5, 0, '근로기준법 제56조제3항'],
    ['h8', '휴일근로 8시간 이내', 1.5, 1.0, '근로기준법 제56조제2항제1호'],
    ['h8n', '휴일근로 8시간 이내 + 야간', 2.0, 1.0, '근로기준법 제56조제2항·제3항'],
    ['ho', '휴일근로 8시간 초과', 2.0, 1.0, '근로기준법 제56조제2항제2호'],
    ['hon', '휴일근로 8시간 초과 + 야간', 2.5, 1.0, '근로기준법 제56조제2항·제3항']
  ];
  function overtime(hourly, hours, five) {
    var rows = OT.map(function (r) {
      var h = +hours[r[0]] || 0, rate = five ? r[2] : r[3];
      return { key: r[0], name: r[1], hours: h, rate: rate, law: r[4], amount: floor1(hourly * h * rate) };
    });
    return { rows: rows, total: rows.reduce(function (s, r) { return s + r.amount; }, 0) };
  }

  var api = {
    RATES: RATES, INDUSTRY: INDUSTRY, floor10: floor10, unit: unit,
    tableTax: tableTax, incomeTax: incomeTax, kidDeduction: kidDeduction, nontaxSplit: nontaxSplit,
    salary: salary, salaryReverse: salaryReverse, daily: daily, dailyReverse: dailyReverse,
    biz: biz, bizReverse: bizReverse, prorate: prorate, monthlyHours: monthlyHours,
    averageWage: averageWage, avgSegments: avgSegments, wageInPeriod: wageInPeriod, monthsDiff: monthsDiff, retirementTax: retirementTax, severance: severance,
    leavePay: leavePay, overtime: overtime, OT: OT, D: D, ymd: ymd, daysBetween: daysBetween
  };
  root.PayCalc = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);

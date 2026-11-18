/* 한통돌봄 시연 화면 (정적 데모)
   접수 건·통화 내용·긴급도는 시나리오 값이고, 단지 좌표와 동선은 실제 지도 값입니다. */
(function () {
  'use strict';

  var DATA = window.__CARE__ || { complexes: [], cases: [], route: { km: 0, min: 0, line: [] } };
  var byId = {};
  DATA.complexes.forEach(function (c) { byId[c.id] = c; });

  var LEVEL = { red: { rank: 3, label: '적색' }, amber: { rank: 2, label: '황색' }, green: { rank: 1, label: '일반' } };
  var STAFF = ['생활지원사 A', '생활지원사 B', '생활지원사 C'];

  var cases = DATA.cases.map(function (c, i) { return Object.assign({}, c, { seq: i, fresh: false }); });
  var selectedId = null;
  var map = null, markers = {}, routeLine = null, tileLayer = null;

  /* ---------- 유틸 ---------- */
  function el(sel, root) { return (root || document).querySelector(sel); }
  function els(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (m) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[m]; });
  }
  function cx(id) { return byId[id] || { short: id, name: id, lat: 0, lon: 0 }; }
  function fmtUnit(c) {
    return cx(c.cx).short + ' ' + c.unit;
  }
  function levelOf(list) {
    var best = 'green';
    list.forEach(function (c) { if (LEVEL[c.level].rank > LEVEL[best].rank) best = c.level; });
    return best;
  }

  var toastTimer = null;
  function toast(msg) {
    var t = el('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('show'); }, 2400);
  }

  function ordered() {
    return cases.slice().sort(function (a, b) {
      if (a.fresh !== b.fresh) return a.fresh ? -1 : 1;
      var d = LEVEL[b.level].rank - LEVEL[a.level].rank;
      if (d !== 0) return d;
      if (b.repeat !== a.repeat) return b.repeat - a.repeat;
      return a.seq - b.seq;
    });
  }

  /* ---------- KPI ---------- */
  function renderKpis() {
    var total = cases.length;
    var red = cases.filter(function (c) { return c.level === 'red'; }).length;
    var amber = cases.filter(function (c) { return c.level === 'amber'; }).length;
    var done = cases.filter(function (c) { return c.status === 'done'; }).length;
    el('#kpis').innerHTML =
      '<div class="kpi"><span>오늘 접수</span><b>' + total + '<small>건</small></b></div>' +
      '<div class="kpi red"><span>적색</span><b>' + red + '<small>건</small></b></div>' +
      '<div class="kpi amber"><span>황색</span><b>' + amber + '<small>건</small></b></div>' +
      '<div class="kpi"><span>방문 완료</span><b>' + done + '<small>건</small></b></div>';
  }

  /* ---------- 목록 ---------- */
  function statusChip(c) {
    if (c.status === 'done') return '<span class="chip green">방문 완료</span>';
    if (c.status === 'assigned') return '<span class="chip blue">' + esc(c.who) + ' 배정</span>';
    return '<span class="chip grey">배정 전</span>';
  }

  function renderCases() {
    var list = ordered();
    var host = el('#caseList');
    host.innerHTML = list.map(function (c, i) {
      var open = c.id === selectedId;
      var detail =
        '<div class="case-detail"' + (open ? '' : ' hidden') + '>' +
          '<p>' + esc(c.detail) + '</p>' +
          '<p class="act"><b>권장 조치</b>' + esc(c.action) + '</p>' +
          '<div class="case-actions">' +
            (c.status === 'wait' ? '<button type="button" class="btn primary" data-act="assign" data-id="' + c.id + '">배정하기</button>' : '') +
            (c.status !== 'done' ? '<button type="button" class="btn" data-act="done" data-id="' + c.id + '">방문 완료</button>' : '<span class="chip green">방문 완료 · ' + esc(c.who) + '</span>') +
          '</div>' +
        '</div>';
      return '<li class="case ' + c.level + (open ? ' open' : '') + (c.status === 'done' ? ' done' : '') + '" data-id="' + c.id + '">' +
        '<button type="button" class="case-main" aria-expanded="' + (open ? 'true' : 'false') + '" data-id="' + c.id + '">' +
          '<span class="rank">' + (i + 1) + '</span>' +
          '<span class="case-body">' +
            '<span class="case-top"><b>' + esc(fmtUnit(c)) + '</b><em>' + c.age + '세 · ' + esc(c.hh) + ' · ' + esc(c.ch) + '</em></span>' +
            '<span class="case-title">' + esc(c.title) + '</span>' +
            '<span class="case-meta">' +
              '<span class="chip ' + c.level + '">' + LEVEL[c.level].label + '</span>' +
              '<span class="meta-time">' + esc(c.time) + '</span>' +
              (c.repeat ? '<span class="meta-flag">' + (c.repeat + 1) + '회째 접수</span>' : '') +
              statusChip(c) +
            '</span>' +
          '</span>' +
        '</button>' + detail +
      '</li>';
    }).join('');
  }

  function selectCase(id, opts) {
    selectedId = (selectedId === id) ? null : id;
    renderCases();
    if (selectedId && map) {
      var c = cases.filter(function (x) { return x.id === selectedId; })[0];
      if (c) map.panInside([cx(c.cx).lat, cx(c.cx).lon], { padding: [46, 46], animate: true, duration: 0.35 });
    }
    paintMarkers();
    if (opts && opts.scroll && selectedId) {
      var node = el('.case[data-id="' + selectedId + '"]');
      if (node && node.scrollIntoView) node.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }
  function act(id, kind) {
    var c = cases.filter(function (x) { return x.id === id; })[0];
    if (!c) return;
    if (kind === 'assign') {
      if (c.status !== 'wait') return;
      c.status = 'assigned';
      c.who = c.who || STAFF[(c.seq + 1) % STAFF.length];
      toast(fmtUnit(c) + ' 방문을 ' + c.who + '에게 배정했습니다.');
    } else if (kind === 'done') {
      if (c.status === 'done') return;
      if (!c.who) c.who = STAFF[(c.seq + 1) % STAFF.length];
      c.status = 'done';
      toast(fmtUnit(c) + ' 방문 완료로 기록했습니다.');
    }
    renderKpis();
    renderCases();
    paintMarkers();
  }

  /* ---------- 지도 ---------- */
  function pinHtml(level, count, sel) {
    var inner = count > 1 ? count : '<i class="pin-dot"></i>';
    return '<span class="pin-wrap"><span class="pin ' + level + (sel ? ' sel' : '') + '">' + inner + '</span></span>';
  }

  function stopHtml(n, level, sel, done) {
    return '<span class="pin-wrap"><span class="pin stop ' + level + (sel ? ' sel' : '') + (done ? ' done-stop' : '') + '"><b>' + n + '</b></span></span>';
  }

  function buildMap() {
    if (map || typeof L === 'undefined') return;
    map = L.map('map', {
      zoomControl: true,
      scrollWheelZoom: false,
      attributionControl: false,
      zoomSnap: 0.25,
      minZoom: 12,
      maxZoom: 18
    });
    L.control.attribution({ prefix: false, position: 'bottomright' }).addTo(map);

    tileLayer = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap'
    }).addTo(map);

    var bounds = L.latLngBounds(DATA.complexes.map(function (c) { return [c.lat, c.lon]; }));
    map.fitBounds(bounds, {
      paddingTopLeft: [26, 46],
      paddingBottomRight: [26, 72],
      maxZoom: 15
    });

    routeLine = L.polyline(DATA.route.line || [], {
      color: '#0a84ff',
      weight: 3.5,
      opacity: 0.42,
      lineJoin: 'round',
      lineCap: 'round'
    }).addTo(map);
    if (routeLine.bringToBack) routeLine.bringToBack();

    paintMarkers();
    setTimeout(function () { map.invalidateSize(); }, 120);
  }

  function paintMarkers() {
    if (!map) return;
    Object.keys(markers).forEach(function (k) {
      map.removeLayer(markers[k]);
      delete markers[k];
    });

    var order = (DATA.route && DATA.route.ids) || [];

    DATA.complexes.forEach(function (c) {
      var here = cases.filter(function (x) { return x.cx === c.id; });
      var open = here.filter(function (x) { return x.status !== 'done'; });
      var onRoute = order.indexOf(c.id) >= 0;
      if (!here.length || (!onRoute && !open.length)) return;
      var level = open.length ? levelOf(open) : 'green';
      var count = open.length || here.length;
      var sel = here.some(function (x) { return x.id === selectedId; });
      var stop = order.indexOf(c.id);
      var html, size, anchor;

      if (stop >= 0) {
        html = stopHtml(stop + 1, level, sel, !open.length);
        size = [28, 28]; anchor = [14, 14];
      } else {
        html = pinHtml(level, count, sel);
        size = [30, 30]; anchor = [15, 15];
      }

      var icon = L.divIcon({
        className: 'pin-holder' + (stop >= 0 ? ' stop-holder' : ''),
        html: html + '<span class="pin-lab' + (sel ? ' on' : '') + '">' + esc(c.short) + '</span>',
        iconSize: size,
        iconAnchor: anchor
      });
      var m = L.marker([c.lat, c.lon], { icon: icon, keyboard: false, title: c.name + ' ' + count + '건' })
        .addTo(map)
        .on('click', function () {
          var target = open[0] || here[0];
          selectedId = target.id;
          renderCases();
          paintMarkers();
        });
      markers[c.id] = m;
    });

    var foot = el('#mapFoot');
    if (foot) {
      foot.innerHTML =
        '<span>오늘 오전 동선 5곳 · <b>' + DATA.route.km + 'km</b> · ' + DATA.route.min + '분</span>' +
        '<span>행정복지센터까지 12.1km · 21분</span>';
    }
  }

  /* ---------- 전화 시연 ---------- */
  var SCEN = {
    health: {
      who: { complex: 'su', unit: '105동 1203호', age: 82, hh: '독거' },
      lines: [
        { d: 700, who: 'sys', text: '통화가 연결되었습니다' },
        { d: 600, who: 'elder', text: '여보세요? 나 수자인 105동 사는 할매인데예.' },
        { d: 1100, who: 'ai', text: '네, 어르신. 어디가 불편하십니까?' },
        { d: 1200, who: 'elder', text: '어제부터 어지럽고, 밥을 못 먹었어예. 약도 못 타 먹었고.' },
        { d: 1400, who: 'ai', text: '언제부터 그러셨습니까? 지금은 앉아 계십니까?' },
        { d: 1500, who: 'elder', text: '아침에 일어나니 하늘이 빙빙 도는데, 지금은 겨우 앉았어예.' },
        { d: 1200, who: 'ai', text: '네, 알겠습니다. 지금 바로 사람 보내 드리겠습니다. 전화 끊지 마시고 기다려 주이소.' },
        { d: 700, who: 'sys', text: '통화 종료 · 접수 내용을 정리했습니다' }
      ],
      ticket: {
        type: '건강 이상', level: 'red', seconds: 20,
        heard: [['"어지럽다예"', '어지럼'], ['"못 타 먹었어예"', '복약 누락'], ['"겨우 앉았어예"', '자세 불안정']],
        rows: [
          ['증상', '어지럼이 어제부터 이어짐. 아침에 일어설 때 심하고, 지금은 앉은 자세만 유지'],
          ['확인한 것', '혈압약 이틀 미복용, 식사 이틀 못함. 같은 집에서 3일 안에 두 번째 접수'],
          ['긴급도', '적색 · 30분 안에 방문'],
          ['추천 조치', '혈압과 혈당 확인, 식사 상태 확인, 119 이송 판단'],
          ['배정', '생활지원사 A · 수자인 단지 담당']
        ]
      }
    },
    home: {
      who: { complex: 'jh', unit: '106동 401호', age: 76, hh: '독거' },
      lines: [
        { d: 700, who: 'sys', text: '통화가 연결되었습니다' },
        { d: 700, who: 'elder', text: '보일러가 안 된다예. 물이 차가워서 씻지를 못하겠어.' },
        { d: 1200, who: 'ai', text: '언제부터 안 되셨습니까?' },
        { d: 1300, who: 'elder', text: '그제 저녁부터고. 관리사무소에 말해도 사람이 안 와예.' },
        { d: 1400, who: 'ai', text: '네, 도시가스 점검과 관리사무소 연계를 넣겠습니다. 오늘 오후에 방문도 함께 잡겠습니다.' },
        { d: 1200, who: 'elder', text: '그래 주이소. 고맙다.' },
        { d: 700, who: 'sys', text: '통화 종료 · 접수 내용을 정리했습니다' }
      ],
      ticket: {
        type: '생활 민원', level: 'amber', seconds: 18,
        heard: [['"안 된다예"', '작동 중단'], ['"안 와예"', '미처리 2일'], ['"씻지를 못하겠어"', '온수 불가']],
        rows: [
          ['증상', '보일러 온수가 나오지 않아 씻지 못함. 그제 저녁부터'],
          ['확인한 것', '관리사무소에 두 번 연락, 방문 일정 없음. 같은 단지 미처리 2건'],
          ['긴급도', '황색 · 오늘 오후 방문'],
          ['추천 조치', '관리사무소 수리 접수, 도시가스 점검 연계, 방문 시 온수 확인'],
          ['배정', '생활지원사 C · 중흥S-클래스 담당']
        ]
      }
    },
    ride: {
      who: { complex: 'ep', unit: '108동 1502호', age: 81, hh: '독거' },
      lines: [
        { d: 700, who: 'sys', text: '통화가 연결되었습니다' },
        { d: 700, who: 'elder', text: '내일 병원 가야 하는데, 혼자 가기가 어렵어예.' },
        { d: 1100, who: 'ai', text: '어느 병원이고 몇 시 예약입니까?' },
        { d: 1300, who: 'elder', text: '부산대병원, 아침 열 시 예약이에요.' },
        { d: 1300, who: 'ai', text: '내일 아홉 시에 모시러 가겠습니다. 차량과 동행 담당을 정해서 다시 연락드리겠습니다.' },
        { d: 1100, who: 'elder', text: '고맙다. 허리가 안 좋아서 걱정이었는데.' },
        { d: 700, who: 'sys', text: '통화 종료 · 접수 내용을 정리했습니다' }
      ],
      ticket: {
        type: '동행 요청', level: 'amber', seconds: 16,
        heard: [['"어렵어예"', '이동 곤란'], ['"열 시 예약"', '일정 확인'], ['"허리가 안 좋아서"', '보행 제약']],
        rows: [
          ['증상', '부산대병원 다음 날 10시 외래. 보행 보조기를 쓰고 혼자 이동이 어려움'],
          ['확인한 것', '보호자 없음, 차량 없음. 같은 단지 동행 대기 1건'],
          ['긴급도', '황색 · 다음 날 09시 출발'],
          ['추천 조치', '동행 담당 배정, 차량 확인, 병원 접수 서류 준비'],
          ['배정', '생활지원사 B · 센터포인트 담당']
        ]
      }
    }
  };

  var timers = [];
  var ticker = null;
  var callSeconds = 0;
  var callStart = 0;
  var callElapsed = 0;
  var running = null;
  var added = {};

  function clearCall() {
    timers.forEach(function (t) { clearTimeout(t); });
    timers = [];
    if (ticker) { clearInterval(ticker); ticker = null; }
  }

  function setState(txt) { el('#callState').textContent = txt; }

  function setTimer() {
    callSeconds += 1;
    var m = String(Math.floor(callSeconds / 60)).padStart(2, '0');
    var s = String(callSeconds % 60).padStart(2, '0');
    el('#callTimer').textContent = m + ':' + s;
  }

  var MAX_LINES = 5;
  function trim(host) {
    while (host.children.length > MAX_LINES) host.removeChild(host.firstElementChild);
  }

  function addLine(who, text) {
    var host = el('#transcript');
    var li = document.createElement('li');
    li.className = 'ln ' + who;
    var label = who === 'elder' ? '어르신' : (who === 'ai' ? '한통돌봄 AI' : '');
    li.innerHTML = (label ? '<span class="who-l">' + label + '</span>' : '') + '<span class="bub">' + esc(text) + '</span>';
    host.appendChild(li);
    trim(host);
    host.scrollTop = 0;
  }

  function showTyping(who) {
    var host = el('#transcript');
    var li = document.createElement('li');
    li.className = 'ln ' + who + ' typing-row';
    li.innerHTML = '<span class="bub"><span class="typing"><i></i><i></i><i></i></span></span>';
    host.appendChild(li);
    trim(host);
    host.scrollTop = 0;
    return li;
  }

  function runScenario(key) {
    var s = SCEN[key];
    if (!s) return;
    clearCall();
    running = key;
    added = added || {};
    callSeconds = 0;
    callElapsed = 0;
    callStart = Date.now();
    el('#callTimer').textContent = '00:00';
    el('#transcript').innerHTML = '';
    el('#replay').disabled = true;
    el('#hangup').disabled = false;
    setState('연결 중');
    els('.sc').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.sc === key)); });
    renderTicketEmpty('통화 내용을 듣고 있습니다. 끝나면 정리된 티켓이 여기에 뜹니다.');

    ticker = setInterval(setTimer, 1000);
    var acc = 0;
    s.lines.forEach(function (ln, i) {
      acc += ln.d;
      timers.push(setTimeout(function () {
        if (i === 1) setState('통화 중');
        var typing = ln.who === 'ai' ? showTyping('ai') : null;
        var wait = typing ? 520 : 0;
        timers.push(setTimeout(function () {
          if (typing) typing.remove();
          addLine(ln.who, ln.text);
          if (i === s.lines.length - 1) {
            setState('통화 종료');
            el('#hangup').disabled = true;
            el('#replay').disabled = false;
            callElapsed = Math.round((Date.now() - callStart) / 1000);
            if (ticker) { clearInterval(ticker); ticker = null; }
            timers.push(setTimeout(function () { renderTicket(key); }, 380));
          }
        }, wait));
      }, acc));
    });
  }

  function renderTicketEmpty(msg) {
    var t = el('#ticket');
    t.className = 'ticket empty';
    t.innerHTML = '<p class="empty-text">' + esc(msg) + '</p>';
  }

  function renderTicket(key) {
    var s = SCEN[key];
    var t = s.ticket;
    var who = s.who;
    var c = byId[who.complex] || { short: '' };
    var host = el('#ticket');
    host.className = 'ticket';
    host.innerHTML =
      '<div class="tk-head">' +
        '<b>' + esc(t.type) + '</b>' +
        '<span class="right"><span class="chip ' + t.level + '">' + LEVEL[t.level].label + '</span>' +
        '<span class="chip grey">통화 ' + Math.max(1, callElapsed) + '초</span></span>' +
      '</div>' +
      '<p class="tk-sub">' + esc(c.short) + ' ' + esc(who.unit) + ' · ' + who.age + '세 · ' + esc(who.hh) + ' · 전화 접수</p>' +
      '<div class="tk-rows">' +
        t.rows.map(function (r) {
          var val = r[1];
          if (r[0] === '긴급도') {
            var parts = val.split(' · ');
            val = '<b>' + esc(parts[0]) + '</b>' + (parts[1] ? ' · ' + esc(parts[1]) : '');
          } else {
            val = esc(val);
          }
          return '<div class="tk-row"><dt>' + esc(r[0]) + '</dt><dd>' + val + '</dd></div>';
        }).join('') +
      '</div>' +
      '<p class="heard-label">들은 말</p>' +
      '<div class="heard">' + t.heard.map(function (h) {
        return '<span>' + esc(h[0]) + ' → <i>' + esc(h[1]) + '</i></span>';
      }).join('') + '</div>' +
      '<div class="tk-foot">' +
        '<button type="button" class="btn primary" id="addCase">오늘 목록에 넣기</button>' +
        '<span class="meta-time">긴급도는 말의 내용, 접수 이력, 위치를 함께 보고 정했습니다</span>' +
      '</div>';

    var btn = el('#addCase');
    if (added[key]) {
      btn.disabled = true;
      btn.textContent = '오늘 목록에 있음';
    }
    btn.addEventListener('click', function () { addTicket(key); });
  }

  function addTicket(key) {
    if (added[key]) return;
    var s = SCEN[key];
    var t = s.ticket;
    var now = new Date();
    var hh = String(now.getHours()).padStart(2, '0');
    var mm = String(now.getMinutes()).padStart(2, '0');
    var rowGet = function (name) {
      var hit = t.rows.filter(function (r) { return r[0] === name; })[0];
      return hit ? hit[1] : '';
    };
    var item = {
      id: 'n_' + key,
      cx: s.who.complex,
      unit: s.who.unit,
      age: s.who.age,
      hh: s.who.hh,
      time: hh + ':' + mm,
      ch: '전화',
      type: t.type,
      title: t.type === '건강 이상' ? '어지럽고 이틀째 밥을 못 먹음' : (t.type === '생활 민원' ? '보일러 온수가 안 나옴' : '내일 부산대병원 동행 요청'),
      detail: rowGet('증상') + ' ' + rowGet('확인한 것'),
      level: t.level,
      action: rowGet('추천 조치'),
      repeat: key === 'health' ? 1 : 0,
      status: 'wait',
      who: '',
      seq: -1,
      fresh: true
    };
    cases.unshift(item);
    added[key] = true;
    selectCase(null);
    renderKpis();
    renderCases();
    paintMarkers();
    var btn = el('#addCase');
    if (btn) { btn.disabled = true; btn.textContent = '오늘 목록에 있음'; }
    toast('접수 1건을 오늘 목록 맨 위에 올렸습니다. 자녀 앱에 접수 알림을 보냈습니다.');
    var note = el('.notes .nt');
    if (note) {
      note.classList.add('ping');
      setTimeout(function () { note.classList.remove('ping'); }, 1900);
    }
    if (map) {
      map.panInside([cx(item.cx).lat, cx(item.cx).lon], { padding: [46, 46], animate: true, duration: 0.45 });
    }
  }

  /* ---------- 탭 ---------- */
  var callAutoStarted = false;
  function switchTab(name) {
    window.scrollTo({ top: 0, behavior: 'auto' });
    els('.tabs button').forEach(function (b) {
      var on = b.dataset.tab === name;
      b.setAttribute('aria-selected', String(on));
      b.tabIndex = on ? 0 : -1;
    });
    ['today', 'call', 'link'].forEach(function (k) {
      el('#p-' + k).hidden = (k !== name);
    });
    if (name === 'today' && map) setTimeout(function () { map.invalidateSize(); }, 60);
    if (name === 'today' && !map) setTimeout(buildMap, 40);
    if (name === 'call' && !callAutoStarted) {
      callAutoStarted = true;
      setTimeout(function () { if (!running) runScenario('health'); }, 350);
    }
  }

  /* ---------- 이벤트 ---------- */
  document.addEventListener('click', function (e) {
    var tab = e.target.closest('.tabs button');
    if (tab) { switchTab(tab.dataset.tab); return; }

    var actBtn = e.target.closest('[data-act]');
    if (actBtn) {
      e.stopPropagation();
      if (actBtn.dataset.act !== 'none') act(actBtn.dataset.id, actBtn.dataset.act);
      return;
    }

    var main = e.target.closest('.case-main');
    if (main) { selectCase(main.dataset.id); return; }

    var sc = e.target.closest('.sc');
    if (sc) { runScenario(sc.dataset.sc); return; }
  });

  el('#replay').addEventListener('click', function () { if (running) runScenario(running); });
  el('#hangup').addEventListener('click', function () {
    clearCall();
    setState('통화 종료');
    el('#hangup').disabled = true;
    el('#replay').disabled = false;
    renderTicketEmpty('통화를 일찍 끊었습니다. 다시 듣기로 이어서 들을 수 있습니다.');
  });

  document.addEventListener('keydown', function (e) {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    var onTab = document.activeElement && document.activeElement.closest('.tabs');
    if (!onTab) return;
    e.preventDefault();
    var order = ['today', 'call', 'link'];
    var now = order.indexOf(document.activeElement.dataset.tab);
    var next = order[(now + (e.key === 'ArrowRight' ? 1 : order.length - 1)) % order.length];
    switchTab(next);
    el('#tab-' + next).focus();
  });

  window.addEventListener('resize', function () { if (map) map.invalidateSize(); });

  /* ---------- 시작 ---------- */
  renderKpis();
  renderCases();
  buildMap();
  renderTicketEmpty('왼쪽에서 상황을 고르면 통화가 시작됩니다.');
})();

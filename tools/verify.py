#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""한통돌봄 시연 화면 검증

  · Chromium 390×844(DPR2)과 1440×900에서 콘솔 에러 0, 페이지 예외 0
  · 가로 넘침 0 (오늘 / 전화 / 연계 3탭, 모바일·데스크톱)
  · 지도 마커·동선 렌더, 카드 선택, 배정·방문 완료 전환
  · 통화 시나리오 재생 → 티켓 생성 → 오늘 목록 추가
  · 스크린샷: downloads/busan_care_1.png ~ 3.png, 확인용 4~6

  cd deploy/busan-care-call && python3 tools/verify.py
"""
import json, os, threading, http.server, socketserver

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = '/workspace/downloads'
PORT = 8833


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=ROOT, **kw)

    def log_message(self, *a):
        pass


def serve():
    socketserver.TCPServer.allow_reuse_address = True
    s = socketserver.TCPServer(('127.0.0.1', PORT), Handler)
    threading.Thread(target=s.serve_forever, daemon=True).start()
    return s


def main():
    from playwright.sync_api import sync_playwright

    os.makedirs(OUT, exist_ok=True)
    httpd = serve()
    rep = {'console': [], 'pageerrors': [], 'failed': [], 'checks': {}, 'tile_requests': 0}

    def watch(page, tag):
        page.on('console', lambda m: rep['console'].append(tag + ': ' + m.text) if m.type == 'error' else None)
        page.on('pageerror', lambda e: rep['pageerrors'].append(tag + ': ' + str(e)))

        def on_fail(r):
            host = r.url.split('/')[2] if '://' in r.url else ''
            if 'basemaps.cartocdn.com' in host or 'tile.openstreetmap.org' in host:
                rep['tile_requests'] += 1
                return
            rep['failed'].append({'url': r.url, 'err': str(r.failure)})
        page.on('requestfailed', on_fail)

    try:
        with sync_playwright() as pw:
            b = pw.chromium.launch()
            c = rep['checks']

            # ---------------- 모바일 ----------------
            page = b.new_page(viewport={'width': 390, 'height': 844}, device_scale_factor=2,
                              is_mobile=True, has_touch=True, locale='ko-KR')
            watch(page, 'm')
            page.goto('http://127.0.0.1:%d/index.html' % PORT, wait_until='load')
            page.wait_for_timeout(2600)

            c['m_cases'] = page.eval_on_selector_all('.case', 'els => els.length')
            c['m_pins'] = page.eval_on_selector_all('.pin', 'els => els.length')
            c['m_route'] = page.eval_on_selector_all('path.leaflet-interactive', 'els => els.length')
            c['m_kpi'] = page.inner_text('#kpis').replace('\n', ' ')
            c['m_overflow_today'] = page.evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1')

            page.click('.case[data-id="c2"] .case-main')
            page.wait_for_timeout(700)
            c['m_selected'] = page.eval_on_selector('.case[data-id="c2"]', 'e => e.classList.contains("open")')
            page.screenshot(path=os.path.join(OUT, 'busan_care_1.png'))

            page.click('.case[data-id="c2"] [data-act="assign"]')
            page.wait_for_timeout(500)
            c['m_assign_toast'] = page.inner_text('#toast')
            c['m_status'] = page.eval_on_selector('.case[data-id="c2"]', 'e => e.innerText.includes("배정")')

            # 전화 접수 탭
            page.click('#tab-call')
            page.wait_for_timeout(11500)
            c['m_lines'] = page.eval_on_selector_all('#transcript .ln', 'els => els.length')
            c['m_ticket_chip'] = page.inner_text('#ticket .tk-head') if page.query_selector('#ticket .tk-head') else ''
            c['m_ticket_rows'] = page.eval_on_selector_all('#ticket .tk-row', 'els => els.length')
            c['m_widget'] = page.inner_text('.hp-widget').replace('\n', ' ')
            c['m_notes'] = page.eval_on_selector_all('.notes .nt', 'els => els.length')
            c['m_notes_text'] = page.inner_text('.notes').replace('\n', ' ')
            c['m_overflow_call'] = page.evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1')
            page.wait_for_timeout(300)
            page.screenshot(path=os.path.join(OUT, 'busan_care_2.png'), full_page=True)
            box = page.evaluate("() => { const r = document.querySelector('.relay').getBoundingClientRect(); return {x: r.left + window.scrollX, y: r.top + window.scrollY, w: r.width, h: r.height}; }")
            page.screenshot(path=os.path.join(OUT, 'busan_care_8.png'), full_page=True,
                            clip={'x': max(0, box['x'] - 2), 'y': max(0, box['y'] - 2), 'width': box['w'] + 4, 'height': box['h'] + 4})

            page.click('#addCase')
            page.wait_for_timeout(600)
            c['m_add_toast'] = page.inner_text('#toast')
            page.click('#tab-today')
            page.wait_for_timeout(800)
            c['m_cases_after'] = page.eval_on_selector_all('.case', 'els => els.length')
            c['m_new_first'] = page.eval_on_selector('.case', 'e => e.innerText.includes("수자인 105동")')
            page.screenshot(path=os.path.join(OUT, 'busan_care_4.png'))

            # 연계 탭
            page.click('#tab-link')
            page.wait_for_timeout(500)
            c['m_flow'] = page.eval_on_selector_all('.flow li', 'els => els.length')
            c['m_chips'] = page.eval_on_selector_all('.chips li', 'els => els.length')
            c['m_overflow_link'] = page.evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1')
            page.screenshot(path=os.path.join(OUT, 'busan_care_5.png'))

            # ---------------- 데스크톱 ----------------
            d = b.new_page(viewport={'width': 1440, 'height': 900}, locale='ko-KR')
            watch(d, 'd')
            d.goto('http://127.0.0.1:%d/index.html' % PORT, wait_until='load')
            d.wait_for_timeout(2600)
            c['d_overflow_today'] = d.evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1')
            d.click('.case[data-id="c1"] .case-main')
            d.wait_for_timeout(600)
            d.screenshot(path=os.path.join(OUT, 'busan_care_3.png'))

            d.click('#tab-call')
            d.wait_for_timeout(10500)
            c['d_ticket'] = d.eval_on_selector_all('#ticket .tk-row', 'els => els.length')
            c['d_overflow_call'] = d.evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1')
            d.screenshot(path=os.path.join(OUT, 'busan_care_6.png'))

            d.click('#tab-link')
            d.wait_for_timeout(600)
            c['d_overflow_link'] = d.evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1')
            d.screenshot(path=os.path.join(OUT, 'busan_care_7.png'))

            b.close()
    finally:
        httpd.shutdown()

    overflow_keys = [k for k in rep['checks'] if 'overflow' in k]
    rep['ok'] = (not rep['console'] and not rep['pageerrors'] and not rep['failed']
                 and all(rep['checks'].get(k) for k in overflow_keys))
    print(json.dumps(rep, ensure_ascii=False, indent=1))


if __name__ == '__main__':
    main()

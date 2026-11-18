#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""한통돌봄 시연 데이터 생성 (data/bundle.js)

좌표는 OSM에서 읽은 단지 위치이고, 접수 건·긴급도·통화 내용은 시연용 시나리오 값이다.
동선은 OSRM 도로 경로를 한 번 받아 tools/route_cache.json에 두고 재사용한다.

  python3 tools/build_bundle.py
"""
import json, os, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = os.path.join(ROOT, 'tools', 'route_cache.json')

# 단지: 이름, 좌표(OSM), 세대수(공개 자료)
COMPLEXES = [
    dict(id='sb', name='스마트빌리지', short='스마트빌리지', lat=35.13205, lon=128.91490, units=56, note='국가시범도시 실증단지'),
    dict(id='ho', name='호반써밋 스마트시티', short='호반써밋', lat=35.13862, lon=128.90731, units=526, note='2023년 입주'),
    dict(id='su', name='에코델타시티 수자인', short='수자인', lat=35.13985, lon=128.91550, units=554, note='2024년 입주'),
    dict(id='pr', name='에코델타시티 푸르지오린', short='푸르지오린', lat=35.14157, lon=128.91889, units=886, note='2025년 입주'),
    dict(id='ja', name='강서자이 에코델타', short='강서자이', lat=35.14231, lon=128.91539, units=856, note='2025년 입주'),
    dict(id='ep', name='e편한세상 에코델타 센터포인트', short='센터포인트', lat=35.14462, lon=128.91553, units=953, note='2025년 입주'),
    dict(id='pc', name='에코델타시티 푸르지오 센터파크', short='푸르지오센터파크', lat=35.14690, lon=128.91592, units=972, note='2025년 입주'),
    dict(id='bh', name='에코델타시티 대성베르힐', short='대성베르힐', lat=35.14981, lon=128.91608, units=1120, note='2026년 입주'),
    dict(id='de', name='에코델타시티 디에트르 더 퍼스트', short='디에트르', lat=35.15004, lon=128.92259, units=972, note='2026년 입주'),
    dict(id='jh', name='에코델타시티 중흥S-클래스', short='중흥S-클래스', lat=35.15262, lon=128.91579, units=1067, note='2026년 입주'),
]

# 오늘 접수 (시연 시나리오 값). order = 우선순위
CASES = [
    dict(id='c1', cx='sb', unit='3호', age=84, hh='독거', time='06:40', ch='센서', type='건강',
         title='활동 미감지 6시간', detail='침실 레이더에서 06:40부터 움직임이 잡히지 않습니다. 야간 화장실 이동 2회 뒤 신호가 끊겼습니다.',
         level='red', action='즉시 방문, 문 열림 확인, 필요 시 119 연계', repeat=0, status='wait', who=''),
    dict(id='c2', cx='su', unit='103동 802호', age=82, hh='독거', time='07:52', ch='전화', type='건강',
         title='어지럽고 이틀째 밥을 못 먹음', detail='혈압약을 이틀 걸렀고, 앉아서 통화하셨습니다. 같은 집에서 3일 안에 두 번째 접수입니다.',
         level='red', action='30분 안에 방문, 혈압 확인, 119 이송 판단', repeat=1, status='wait', who=''),
    dict(id='c3', cx='bh', unit='112동 802호', age=79, hh='노인부부', time='08:10', ch='전화', type='건강',
         title='허리가 아파 일어나지를 못함', detail='배우자도 거동이 불편해 부축이 어렵다고 하셨습니다. 식사는 어제 저녁 이후 없습니다.',
         level='red', action='방문 2인 배정, 낙상 여부 확인, 보호자 알림', repeat=0, status='assigned', who='생활지원사 A'),
    dict(id='c4', cx='jh', unit='106동 401호', age=76, hh='독거', time='08:35', ch='전화', type='생활민원',
         title='보일러 온수가 안 나옴', detail='그제 저녁부터라고 하셨습니다. 관리사무소에 두 번 연락했지만 방문 일정을 못 받았습니다.',
         level='amber', action='관리사무소·도시가스 연계, 오늘 오후 방문 확인', repeat=0, status='wait', who=''),
    dict(id='c5', cx='ep', unit='108동 1502호', age=81, hh='독거', time='09:02', ch='전화', type='동행',
         title='내일 부산대병원 10시 예약', detail='혼자 이동이 어렵다고 하셨습니다. 보행 보조기를 쓰고 계십니다.',
         level='amber', action='동행 배정, 차량 확인, 보호자 알림', repeat=0, status='wait', who=''),
    dict(id='c6', cx='ho', unit='101동 903호', age=73, hh='장애인 1인', time='09:20', ch='전화', type='생활민원',
         title='현관 전등이 나가 어두움', detail='형광등 교체가 필요합니다. 집 안 이동이 불편해 직접 교체가 어렵습니다.',
         level='green', action='관리사무소 수리 접수, 방문 시 전구 지참', repeat=0, status='wait', who=''),
    dict(id='c7', cx='de', unit='110동 1201호', age=68, hh='독거', time='09:45', ch='전화', type='건강',
         title='혈압약이 떨어졌는데 병원 갈 시간이 없음', detail='외래 예약이 3일 뒤입니다. 약을 끊은 지 이틀입니다.',
         level='amber', action='약국·병원 연계, 방문 시 복약 확인', repeat=0, status='wait', who=''),
    dict(id='c8', cx='pc', unit='103동 704호', age=77, hh='노인부부', time='10:05', ch='센서', type='건강',
         title='야간 화장실 이동이 12분', detail='평소 3분이던 야간 이동이 12분으로 늘었습니다. 거실 조명이 꺼진 시간이 길어졌습니다.',
         level='amber', action='야간 조명 점검, 낙상 위험 상담', repeat=0, status='wait', who=''),
    dict(id='c9', cx='ja', unit='107동 202호', age=85, hh='독거', time='10:30', ch='전화', type='건강',
         title='기침이 오래가고 밥맛이 없음', detail='3주째 이어졌고 체중이 줄었다고 하셨습니다. 보건소 검진을 권했습니다.',
         level='green', action='보건소 방문 연계, 다음 주 재확인', repeat=0, status='done', who='생활지원사 C'),
    dict(id='c10', cx='pr', unit='109동 1103호', age=74, hh='독거', time='10:50', ch='전화', type='생활민원',
         title='싱크대 물이 안 빠짐', detail='이틀째라고 하셨습니다. 수리 기사 방문은 오늘 17시로 잡혔습니다.',
         level='green', action='수리 연계, 방문 결과 확인', repeat=0, status='done', who='생활지원사 B'),
    dict(id='c11', cx='sb', unit='12호', age=80, hh='노인부부', time='11:10', ch='전화', type='동행',
         title='다음 주 치과 동행 요청', detail='다음 주 화요일 오전으로 일정을 등록했습니다.',
         level='green', action='동행 일정 등록', repeat=0, status='done', who='생활지원사 A'),
]

# 오늘 오전 권장 동선 (우선순위 5곳)
ROUTE_IDS = ['sb', 'su', 'bh', 'jh', 'ep']


def fetch_route():
    if os.path.exists(CACHE):
        with open(CACHE, encoding='utf-8') as f:
            return json.load(f)
    by_id = {c['id']: c for c in COMPLEXES}
    pts = [(by_id[i]['lon'], by_id[i]['lat']) for i in ROUTE_IDS]
    coord = ';'.join(f'{a},{b}' for a, b in pts)
    url = f'http://router.project-osrm.org/route/v1/driving/{coord}?overview=full&geometries=geojson'
    try:
        with urllib.request.urlopen(url, timeout=40) as r:
            d = json.load(r)['routes'][0]
        out = dict(
            km=round(d['distance'] / 1000, 1),
            min=round(d['duration'] / 60),
            line=[[round(p[1], 5), round(p[0], 5)] for p in d['geometry']['coordinates']],
            ids=ROUTE_IDS,
        )
    except Exception as e:  # 네트워크가 없으면 두 점을 잇는 직선으로 대체
        print('route fetch failed:', e)
        out = dict(km=0, min=0, line=[[by_id[i]['lat'], by_id[i]['lon']] for i in ROUTE_IDS], ids=ROUTE_IDS)
    with open(CACHE, 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False)
    return out


def main():
    route = fetch_route()
    data = dict(complexes=COMPLEXES, cases=CASES, route=route)
    js = 'window.__CARE__ = ' + json.dumps(data, ensure_ascii=False, separators=(',', ':')) + ';\n'
    path = os.path.join(ROOT, 'data', 'bundle.js')
    with open(path, 'w', encoding='utf-8') as f:
        f.write(js)
    print('wrote', path, len(js), 'bytes; route', route['km'], 'km', route['min'], 'min')


if __name__ == '__main__':
    main()

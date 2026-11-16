// =====================================================================
// ★ [메인 애플리케이션 및 카카오맵 제어 모듈] ★
// =====================================================================

let kakaoMap = null;
let kakaoGeocoder = null;
let kakaoPlaces = null;

let phoneGroups = {};
let phoneOrder = [];
let selectedPhoneFilter = 'ALL';
let allStationsMap = {};
let stationUidCounter = 0;
let logSeqCounter = 0;
let lastActiveGroup = null;

let soundEnabled = true;
let showRadius = true;
let showRoute = true;
let labelMode = 'AUTO';

function sysLog(msg, color = '#00e676') {
    const box = document.getElementById('sys-console');
    if (!box) return;
    const now = new Date();
    const dtStr = formatDateTimeShort(now);
    const line = document.createElement('div');
    line.style.color = color;
    line.innerHTML = `[${dtStr}] &gt; ${msg}`;
    box.prepend(line);
}

window.addEventListener('DOMContentLoaded', function() {
    document.getElementById('header-ver-badge').innerText = APP_VERSION;
    document.getElementById('modal-ver-text').innerText = APP_VERSION;
    document.getElementById('report-email-display').innerText = REPORT_EMAIL;
    renderChangelogList();

    sysLog(`기지국 위치추적 시스템 (${APP_VERSION}) 가동 시작...`, "#00e5ff");

    try {
        const lastSeenVer = localStorage.getItem('CELL_TRACKER_SEEN_VERSION');
        if (lastSeenVer && lastSeenVer !== APP_VERSION) {
            openInfoModal('changelog');
            sysLog(`[업데이트 안내] ${APP_VERSION} 버전의 새로운 변경사항을 확인하세요.`, "#ffab00");
        }
        localStorage.setItem('CELL_TRACKER_SEEN_VERSION', APP_VERSION);
    } catch (e) {}

    setInterval(refreshActiveOfflineTimers, 10000);

    if (window.location.protocol === 'file:') {
        document.getElementById('status-box-content').innerHTML = `
            <div class="status-title" style="color:#ff1744;">⚠️ 파일을 더블클릭(file://)해서 여셨습니다!</div>
            <div class="status-text">
                카카오맵은 보안 정책상 <code>http://localhost</code> 환경(안드로이드 앱 내부 또는 로컬 웹 서버)에서만 열립니다.
            </div>
        `;
        return;
    }

    if (!KAKAO_JS_KEY || KAKAO_JS_KEY.includes("여기에") || KAKAO_JS_KEY.length < 15) {
        document.getElementById('status-box-content').innerHTML = `
            <div class="status-title" style="color:#ffab00;">🔑 카카오 API 키를 입력해 주세요</div>
            <div class="status-text">
                메모장으로 <code>config.js</code> 파일을 열고 <code>KAKAO_JS_KEY</code> 따옴표 안에 본인의 카카오 JavaScript 키를 넣은 뒤 저장해 주세요.
            </div>
        `;
        return;
    }

    loadKakaoMapSdk(KAKAO_JS_KEY.trim());
});

// ===== 업데이트 내역 및 버그 제보 모달 =====
function renderChangelogList() {
    const container = document.getElementById('changelog-container');
    if (!container || typeof UPDATE_HISTORY === 'undefined') return;

    container.innerHTML = UPDATE_HISTORY.map((item, idx) => {
        const isFirst = (idx === 0);
        const newBadge = isFirst ? `<span class="cl-badge-new">최신</span>` : '';
        const liHtml = item.changes.map(c => `<li>${c}</li>`).join('');
        return `
            <div class="changelog-card ${isFirst ? 'latest' : ''}">
                <div class="cl-head">
                    <div><span class="cl-ver">${item.version}</span>${newBadge}</div>
                    <span class="cl-date">${item.date}</span>
                </div>
                <ul class="cl-items">${liHtml}</ul>
            </div>
        `;
    }).join('');
}

window.openInfoModal = function(defaultTab = 'changelog') {
    switchInfoModalTab(defaultTab);
    document.getElementById('info-modal').style.display = 'flex';
};
window.closeInfoModal = function() {
    document.getElementById('info-modal').style.display = 'none';
};
window.switchInfoModalTab = function(tabName) {
    const paneCl = document.getElementById('mpane-changelog');
    const paneFb = document.getElementById('mpane-feedback');
    const btnCl  = document.getElementById('mtab-changelog');
    const btnFb  = document.getElementById('mtab-feedback');

    if (tabName === 'changelog') {
        paneCl.style.display = 'block';
        paneFb.style.display = 'none';
        btnCl.classList.add('active');
        btnFb.classList.remove('active');
    } else {
        paneCl.style.display = 'none';
        paneFb.style.display = 'block';
        btnCl.classList.remove('active');
        btnFb.classList.add('active');
    }
};

window.copyReportEmail = function() {
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(REPORT_EMAIL).then(() => {
            alert(`제보 이메일 주소(${REPORT_EMAIL})가 복사되었습니다!`);
        }).catch(() => fallbackCopyEmail());
    } else {
        fallbackCopyEmail();
    }
};
function fallbackCopyEmail() {
    const temp = document.createElement('textarea');
    temp.value = REPORT_EMAIL;
    document.body.appendChild(temp);
    temp.select();
    document.execCommand('copy');
    document.body.removeChild(temp);
    alert(`제보 이메일 주소(${REPORT_EMAIL})가 복사되었습니다!`);
}
window.sendFeedbackMail = function() {
    const type = document.getElementById('fb-type').value;
    const bodyText = document.getElementById('fb-body').value.trim();
    const subject = `[기지국위치추적 ${APP_VERSION}] ${type}`;
    const content = `■ 프로그램 버전: ${APP_VERSION}\n■ 제보 유형: ${type}\n\n■ 상세 내용:\n${bodyText || '(내용을 입력해 주세요)'}\n`;
    window.location.href = `mailto:${REPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(content)}`;
};

// ===== 선택형 초기화 모달 및 2중 확인창 =====
window.openResetModal = function() {
    if (phoneOrder.length === 0) {
        alert("현재 초기화할 추적 데이터가 없습니다.");
        return;
    }
    renderResetModalList();
    document.getElementById('reset-modal').style.display = 'flex';
};
window.closeResetModal = function() {
    document.getElementById('reset-modal').style.display = 'none';
};

function renderResetModalList() {
    const box = document.getElementById('reset-phone-list-box');
    box.innerHTML = phoneOrder.map(phone => {
        const g = phoneGroups[phone];
        const displayPhone = phone.startsWith('#') ? `뒷자리 ${phone.substring(1)}` : phone;
        return `
            <div class="reset-phone-item" style="border-left-color:${g.color};">
                <div class="reset-phone-info">
                    <span class="phone-color-dot" style="background:${g.color};"></span>
                    <span>📱 ${displayPhone}</span>
                    <span style="font-size:11px; color:#8ab8cc; font-weight:normal;">(포착 기지국: ${g.stations.length}개소)</span>
                </div>
                <button class="btn btn-red" onclick="confirmAndClearSinglePhone('${phone}')">선택 삭제</button>
            </div>
        `;
    }).join('');
}

window.confirmAndClearSinglePhone = function(phoneKey) {
    const displayPhone = phoneKey.startsWith('#') ? `뒷자리 ${phoneKey.substring(1)}` : phoneKey;
    const ok = confirm(`정말 [📱 ${displayPhone}] 대상자의 추적 동선과 기록을 삭제하시겠습니까?\n(다른 전화번호의 기록은 그대로 유지됩니다.)`);
    if (!ok) return;

    const g = phoneGroups[phoneKey];
    if (!g) return;

    if (g.polyline) g.polyline.setMap(null);
    g.stations.forEach(st => {
        if (st.circle) st.circle.setMap(null);
        if (st.overlay) st.overlay.setMap(null);
        delete allStationsMap[st.stationUid];
    });

    const cards = document.querySelectorAll('#target-list .target-card');
    cards.forEach(card => {
        if (card.getAttribute('data-phone') === phoneKey) {
            card.remove();
        }
    });

    delete phoneGroups[phoneKey];
    phoneOrder = phoneOrder.filter(p => p !== phoneKey);

    sysLog(`[선택 초기화] 📱 ${displayPhone} 대상자의 모든 추적 기록이 삭제되었습니다.`, "#ffab00");

    if (phoneOrder.length === 0) {
        resetDashboardToEmpty();
        closeResetModal();
        return;
    }

    if (selectedPhoneFilter === phoneKey) {
        selectedPhoneFilter = 'ALL';
    }
    if (lastActiveGroup && lastActiveGroup.phone === phoneKey) {
        lastActiveGroup = phoneGroups[phoneOrder[phoneOrder.length - 1]];
    }

    renderPhoneFilterBar();
    filterLogCardsByPhone();
    refreshTopDashboard();
    renderResetModalList();
};

window.confirmAndClearAll = function() {
    const ok = confirm(`정말 모든 전화번호(${phoneOrder.length}명)의 위치추적 데이터를 전체 초기화하시겠습니까?\n삭제된 이동 경로와 체류 기록은 복구할 수 없습니다.`);
    if (!ok) return;

    phoneOrder.forEach(phone => {
        const g = phoneGroups[phone];
        if (g.polyline) g.polyline.setMap(null);
        g.stations.forEach(st => {
            if (st.circle) st.circle.setMap(null);
            if (st.overlay) st.overlay.setMap(null);
        });
    });

    phoneGroups = {};
    phoneOrder = [];
    selectedPhoneFilter = 'ALL';
    allStationsMap = {};
    stationUidCounter = 0;
    logSeqCounter = 0;
    lastActiveGroup = null;

    resetDashboardToEmpty();
    closeResetModal();
    sysLog("모든 추적 데이터가 전체 초기화되었습니다.", "#ffab00");
};

function resetDashboardToEmpty() {
    renderPhoneFilterBar();
    document.getElementById('kpi-count-label').innerText = "포착 기지국";
    document.getElementById('kpi-count').innerText = "0 개소";
    document.getElementById('kpi-status').innerText = "대기중";
    document.getElementById('kpi-status').style.color = "var(--neon-green)";
    document.getElementById('kpi-status-card').classList.remove('offline');
    document.getElementById('header-dot').classList.remove('offline');
    document.getElementById('kpi-pci').innerText = "-";
    document.getElementById('kpi-dist').innerText = "0.00 km";
    document.getElementById('target-list').innerHTML = '<div style="color:#689fb8; text-align:center; padding-top:18px;">[초기화 완료] 모든 마커와 이동 경로가 삭제되었습니다.</div>';
}

// ===== 카카오맵 초기화 및 레이어 제어 =====
function loadKakaoMapSdk(appKey) {
    const script = document.createElement('script');
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${appKey}&libraries=services&autoload=false`;
    
    script.onload = function() {
        kakao.maps.load(function() {
            document.getElementById('map-status-overlay').style.display = 'none';
            const container = document.getElementById('map');
            kakaoMap = new kakao.maps.Map(container, {
                center: new kakao.maps.LatLng(37.6185, 126.7165),
                level: 4
            });
            kakaoGeocoder = new kakao.maps.services.Geocoder();
            kakaoPlaces = new kakao.maps.services.Places();

            kakao.maps.event.addListener(kakaoMap, 'zoom_changed', function() {
                applyLabelVisibilityRule();
            });

            sysLog(`카카오맵 연결 완료 (${APP_VERSION}). SKT·KT·LGU+ 실시간 문자 수신 대기중.`, "#00e676");
        });
    };

    script.onerror = function() {
        document.getElementById('status-box-content').innerHTML = `
            <div class="status-title" style="color:#ff1744;">❌ 카카오 서버가 지도 로드를 거부했습니다</div>
            <div class="status-text">
                1. 카카오 디벨로퍼스 [플랫폼 - Web]에 현재 주소(<b>${window.location.origin}</b>)가 등록되어 있는지 확인하세요.<br>
                2. [제품 설정 - 카카오맵]의 <b>사용 설정이 ON</b>인지 확인하세요.<br>
                3. <code>config.js</code>에 넣은 키가 <b>JavaScript 키</b>가 맞는지 확인하세요.
            </div>
        `;
    };

    document.head.appendChild(script);
}

function applyLabelVisibilityRule() {
    if (!kakaoMap) return;
    const mapContainer = document.getElementById('map-container');
    const level = kakaoMap.getLevel();

    if (labelMode === 'ALWAYS') {
        mapContainer.classList.remove('compact-past-labels');
    } else if (labelMode === 'HIDE_PAST') {
        mapContainer.classList.add('compact-past-labels');
    } else {
        if (level >= 6) {
            mapContainer.classList.add('compact-past-labels');
        } else {
            mapContainer.classList.remove('compact-past-labels');
        }
    }
}

window.cycleLabelMode = function() {
    const btn = document.getElementById('btn-toggle-labels');
    if (labelMode === 'AUTO') {
        labelMode = 'ALWAYS';
        btn.innerText = "🏷️ 경유지 라벨: 항상 켜짐";
        btn.classList.remove('off');
    } else if (labelMode === 'ALWAYS') {
        labelMode = 'HIDE_PAST';
        btn.innerText = "🏷️ 경유지 라벨: 숨김(번호만)";
        btn.classList.add('off');
    } else {
        labelMode = 'AUTO';
        btn.innerText = "🏷️ 경유지 라벨: 자동(축소시 숨김)";
        btn.classList.remove('off');
    }
    applyLabelVisibilityRule();
};

function refreshActiveOfflineTimers() {
    const now = new Date();
    phoneOrder.forEach(phone => {
        const group = phoneGroups[phone];
        if (!group || !group.currentStation) return;
        const st = group.currentStation;
        const lastVisit = st.visits[st.visits.length - 1];

        if (lastVisit && lastVisit.isOffline && !lastVisit.offlineEndedDate) {
            const elapsedStr = formatDurationMin(lastVisit.startDate, now);
            st.overlay.setContent(buildStationMarkerHtml(st, true));

            const badgeEl = document.getElementById(`log-status-${lastVisit.logCardId}`);
            if (badgeEl) {
                badgeEl.innerText = `⚫ 전원 꺼짐 (${elapsedStr}째 꺼져 있음)`;
            }
        }
    });
    refreshTopDashboard();
}

window.toggleRadiusLayer = function() {
    showRadius = !showRadius;
    const btn = document.getElementById('btn-toggle-radius');
    if (showRadius) {
        btn.innerText = "🔵 기지국 반경: 켜짐";
        btn.classList.remove('off');
    } else {
        btn.innerText = "⚪ 기지국 반경: 꺼짐";
        btn.classList.add('off');
    }
    syncMapLayersVisibility();
};

window.toggleRouteLayer = function() {
    showRoute = !showRoute;
    const btn = document.getElementById('btn-toggle-route');
    if (showRoute) {
        btn.innerText = "⚡ 이동동선: 켜짐";
        btn.classList.remove('off');
    } else {
        btn.innerText = "⚪ 이동동선: 꺼짐";
        btn.classList.add('off');
    }
    syncMapLayersVisibility();
};

function syncMapLayersVisibility() {
    phoneOrder.forEach(phone => {
        const group = phoneGroups[phone];
        if (!group) return;
        const isGroupVis = group.visible;

        if (group.polyline) {
            group.polyline.setMap((isGroupVis && showRoute) ? kakaoMap : null);
        }
        group.stations.forEach(st => {
            if (st.overlay) st.overlay.setMap(isGroupVis ? kakaoMap : null);
            if (st.circle) st.circle.setMap((isGroupVis && showRadius) ? kakaoMap : null);
        });
    });
}

// ===== 안드로이드 수신 브릿지 및 지오코딩 =====
window.receiveSmsFromAndroid = function(rawText) {
    if (!rawText || !rawText.trim()) return;
    if (!kakaoMap) {
        alert("지도가 아직 로드되지 않았습니다.");
        return;
    }
    sysLog(`문자 수신: "${rawText}"`, "#00e5ff");
    const parsed = parseSmsContent(rawText);
    if (!parsed.address) {
        sysLog("오류: 문자에서 유효한 주소를 추출하지 못했습니다.", "#ff1744");
        return;
    }
    geocodeOnKakao(parsed);
};

function geocodeOnKakao(parsed) {
    const { address } = parsed;
    kakaoGeocoder.addressSearch(address, function(result, status) {
        if (status === kakao.maps.services.Status.OK && result.length > 0) {
            processLocationSignal(parseFloat(result[0].y), parseFloat(result[0].x), parsed);
            return;
        }

        kakaoPlaces.keywordSearch(address, function(kwRes, kwStatus) {
            if (kwStatus === kakao.maps.services.Status.OK && kwRes.length > 0) {
                processLocationSignal(parseFloat(kwRes[0].y), parseFloat(kwRes[0].x), parsed);
                return;
            }

            const roadOnly = address.replace(/\s+(산\s*)?\d+(-\d+)?(\s*번지)?$/, '').trim();
            if (roadOnly && roadOnly !== address) {
                sysLog(`[${address}] 정식 건물번호 없음 -> [${roadOnly}] 구간으로 보정 추적합니다.`, "#ffab00");
                kakaoGeocoder.addressSearch(roadOnly, function(rRes, rStatus) {
                    if (rStatus === kakao.maps.services.Status.OK && rRes.length > 0) {
                        parsed.address = `${address} (도로보정)`;
                        processLocationSignal(parseFloat(rRes[0].y), parseFloat(rRes[0].x), parsed);
                    } else {
                        kakaoPlaces.keywordSearch(roadOnly, function(rkRes, rkStatus) {
                            if (rkStatus === kakao.maps.services.Status.OK && rkRes.length > 0) {
                                parsed.address = `${address} (인근보정)`;
                                processLocationSignal(parseFloat(rkRes[0].y), parseFloat(rkRes[0].x), parsed);
                            } else {
                                sysLog(`주소 변환 실패: [${address}]`, "#ff1744");
                            }
                        });
                    }
                });
            } else {
                sysLog(`주소 변환 실패: [${address}]`, "#ff1744");
            }
        });
    });
}

function getOrCreatePhoneGroup(phone) {
    if (!phoneGroups[phone]) {
        const colorIdx = phoneOrder.length % TARGET_PALETTE.length;
        const assignedColor = TARGET_PALETTE[colorIdx];
        const poly = new kakao.maps.Polyline({
            map: showRoute ? kakaoMap : null,
            path: [],
            strokeWeight: 4,
            strokeColor: assignedColor,
            strokeOpacity: 0.88,
            strokeStyle: 'shortdash'
        });

        phoneGroups[phone] = {
            phone: phone,
            color: assignedColor,
            visible: true,
            stations: [],
            routeCoords: [],
            polyline: poly,
            currentStation: null
        };
        phoneOrder.push(phone);
    }
    return phoneGroups[phone];
}

function processLocationSignal(lat, lng, parsed) {
    const { phone, address, pci, dateObj: eventDate, timeStr, isOffline } = parsed;
    const group = getOrCreatePhoneGroup(phone);
    lastActiveGroup = group;

    const pos = new kakao.maps.LatLng(lat, lng);
    if (group.visible) kakaoMap.panTo(pos);

    if (group.currentStation) {
        const prevStation = group.currentStation;
        const prevVisit = prevStation.visits[prevStation.visits.length - 1];
        const isSamePci = (pci !== "미상" && prevStation.pci === pci) || (pci === "미상" && prevStation.address === address);

        if (prevVisit && prevVisit.isOffline && (!isSamePci || !isOffline)) {
            prevVisit.offlineEndedDate = eventDate;
            prevVisit.endTimeStr = timeStr;
            const offDurationStr = formatDurationMin(prevVisit.startDate, eventDate);

            const badgeEl = document.getElementById(`log-status-${prevVisit.logCardId}`);
            if (badgeEl) {
                badgeEl.innerText = `⚫ 전원 재부팅됨 (총 ${offDurationStr}간 꺼져 있었음: ${prevVisit.startTimeStr} ~ ${timeStr})`;
            }
            sysLog(`[전원 재부팅 / 위치변경] ${phone} 단말기 전원 꺼짐 종료 (총 ${offDurationStr}간 오프라인 기록됨)`, "#ffab00");
        }

        if (isSamePci && prevVisit.isOffline === isOffline) {
            prevVisit.count++;
            if (!isOffline) {
                prevVisit.endDate = eventDate;
                prevVisit.endTimeStr = timeStr;
            }
            prevStation.overlay.setContent(buildStationMarkerHtml(prevStation, true));
            updateExistingLogCard(prevStation, prevVisit);
            renderPhoneFilterBar();
            refreshTopDashboard();
            playTacticalBeep(isOffline);
            return;
        }
    }

    group.stations.forEach(st => {
        st.overlay.setContent(buildStationMarkerHtml(st, false));
        st.circle.setOptions({
            strokeWeight: 1.5,
            strokeColor: group.color,
            strokeOpacity: 0.35,
            fillColor: group.color,
            fillOpacity: 0.03
        });
    });

    let station = group.stations.find(st => (pci !== "미상" && st.pci === pci && Math.abs(st.lat - lat) < 0.005) || (st.address === address));

    logSeqCounter++;
    const newVisit = {
        visitNum: station ? station.visits.length + 1 : 1,
        startTimeStr: timeStr,
        startDate: eventDate,
        endTimeStr: timeStr,
        endDate: eventDate,
        count: 1,
        isOffline: isOffline,
        offlineEndedDate: null,
        logCardId: logSeqCounter
    };

    if (station) {
        station.visits.push(newVisit);
        station.circle.setOptions({
            strokeWeight: 2,
            strokeColor: isOffline ? '#ff1744' : group.color,
            strokeOpacity: 0.85,
            fillColor: isOffline ? '#ff1744' : group.color,
            fillOpacity: 0.1
        });
        station.overlay.setContent(buildStationMarkerHtml(station, true));
        group.currentStation = station;
        sysLog(`[재방문 감지] ${phone} -> #${station.seq} 기지국(PCI:${pci}) ${station.visits.length}번째 방문!`, "#ffab00");
    } else {
        stationUidCounter++;
        const seq = group.stations.length + 1;
        const circle = new kakao.maps.Circle({
            map: (group.visible && showRadius) ? kakaoMap : null,
            center: pos,
            radius: 400,
            strokeWeight: 2,
            strokeColor: isOffline ? '#ff1744' : group.color,
            strokeOpacity: 0.85,
            strokeStyle: 'shortdash',
            fillColor: isOffline ? '#ff1744' : group.color,
            fillOpacity: 0.1
        });

        station = {
            stationUid: stationUidCounter,
            seq: seq,
            phone: phone,
            color: group.color,
            lat: lat,
            lng: lng,
            address: address,
            pci: pci,
            visits: [newVisit],
            circle: circle,
            overlay: null
        };

        const overlay = new kakao.maps.CustomOverlay({
            map: group.visible ? kakaoMap : null,
            position: pos,
            content: buildStationMarkerHtml(station, true),
            xAnchor: 0.5,
            yAnchor: 0.5,
            clickable: true
        });
        station.overlay = overlay;
        group.stations.push(station);
        group.currentStation = station;
        allStationsMap[station.stationUid] = station;
    }

    group.routeCoords.push({ lat, lng });
    group.polyline.setPath(group.routeCoords.map(c => new kakao.maps.LatLng(c.lat, c.lng)));
    group.polyline.setMap((group.visible && showRoute) ? kakaoMap : null);

    createNewLogCard(station, newVisit);
    renderPhoneFilterBar();
    refreshTopDashboard();
    applyLabelVisibilityRule();
    playTacticalBeep(isOffline);
}

function getShortPhoneLabel(phone) {
    if (phone === "번호미상") return "";
    return `<span class="phone-mini">📱${phone}</span>`;
}

function buildStationMarkerHtml(st, isCurrentActive) {
    const lastVisit = st.visits[st.visits.length - 1];
    const totalVisits = st.visits.length;
    const revisitTag = totalVisits > 1 ? `<span class="revisit-badge">${totalVisits}회 방문</span>` : '';
    const phoneBadge = getShortPhoneLabel(st.phone);

    if (isCurrentActive) {
        if (lastVisit.isOffline) {
            const elapsedStr = formatDurationMin(lastVisit.startDate, new Date());
            return `
                <div class="tactical-node offline" style="--target-color:${st.color};" onclick="openHistoryModal(${st.stationUid})">
                    <div class="node-core"></div>
                    <div class="node-label">
                        ${phoneBadge}⚫ #${st.seq} [PCI:${st.pci}] ${revisitTag}
                        <span class="sub-time">🕒${lastVisit.startTimeStr} | ⚠️전원꺼짐(${elapsedStr})</span>
                    </div>
                </div>
            `;
        } else {
            const stayMin = formatDurationMin(lastVisit.startDate, lastVisit.endDate);
            const stayText = lastVisit.count > 1 
                ? `🕒 ${lastVisit.startTimeStr} ~ ${lastVisit.endTimeStr} <span class="stay-badge">${stayMin} 체류중</span>`
                : `🕒 확인: ${lastVisit.endTimeStr}`;

            return `
                <div class="tactical-node" style="--target-color:${st.color};" onclick="openHistoryModal(${st.stationUid})">
                    <div class="ripple-ring"></div>
                    <div class="ripple-ring delay-1"></div>
                    <div class="ripple-ring delay-2"></div>
                    <div class="node-core"></div>
                    <div class="node-label">
                        ${phoneBadge}#${st.seq} 활성 [PCI:${st.pci}] ${revisitTag}
                        <span class="sub-time">${stayText}</span>
                    </div>
                </div>
            `;
        }
    }

    const stayMin = formatDurationMin(lastVisit.startDate, lastVisit.endDate);
    const pastSub = (lastVisit.count > 1 && !lastVisit.isOffline) ? ` (${stayMin} 체류)` : '';
    return `
        <div class="tactical-node past" style="--target-color:${st.color};" onclick="openHistoryModal(${st.stationUid})">
            <div class="node-core"></div>
            <div class="node-mini-badge">${st.phone !== '번호미상' ? st.phone : ''} #${st.seq}</div>
            <div class="node-label">
                ${phoneBadge}#${st.seq} [PCI:${st.pci}] 🕒${lastVisit.endTimeStr}${pastSub} ${revisitTag}
            </div>
        </div>
    `;
}

function renderPhoneFilterBar() {
    const bar = document.getElementById('phone-filter-bar');
    const totalStations = Object.keys(allStationsMap).length;

    let html = `<span style="font-size:11px; color:#8ab8cc; font-weight:bold; flex-shrink:0;">📱 추적 대상:</span>`;
    html += `
        <div class="phone-chip ${selectedPhoneFilter === 'ALL' ? 'selected' : ''}" onclick="selectPhoneFilter('ALL')">
            <span>전체 보기 (${totalStations})</span>
        </div>
    `;

    phoneOrder.forEach(phone => {
        const g = phoneGroups[phone];
        const isSel = (selectedPhoneFilter === phone) ? 'selected' : '';
        const isHidden = !g.visible ? 'hidden-on-map' : '';
        const eyeIcon = g.visible ? '👁️켜짐' : '🚫꺼짐';
        const displayPhone = phone.startsWith('#') ? `뒷자리 ${phone.substring(1)}` : phone;

        html += `
            <div class="phone-chip ${isSel} ${isHidden}" style="border-color:${g.color};" onclick="selectPhoneFilter('${phone}')">
                <span class="phone-color-dot" style="background:${g.color};"></span>
                <span>${displayPhone} (${g.stations.length})</span>
                <button class="phone-vis-btn" onclick="event.stopPropagation(); togglePhoneVisibility('${phone}');" title="지도에서 이 번호만 켜기/끄기">${eyeIcon}</button>
            </div>
        `;
    });

    bar.innerHTML = html;
}

window.selectPhoneFilter = function(phoneKey) {
    selectedPhoneFilter = phoneKey;
    renderPhoneFilterBar();
    refreshTopDashboard();
    filterLogCardsByPhone();

    if (phoneKey !== 'ALL' && phoneGroups[phoneKey] && phoneGroups[phoneKey].currentStation) {
        const st = phoneGroups[phoneKey].currentStation;
        kakaoMap.panTo(new kakao.maps.LatLng(st.lat, st.lng));
    }
};

window.togglePhoneVisibility = function(phoneKey) {
    const g = phoneGroups[phoneKey];
    if (!g) return;
    g.visible = !g.visible;
    syncMapLayersVisibility();
    renderPhoneFilterBar();
    sysLog(`[표시 제어] ${phoneKey} 동선 및 마커 ${g.visible ? '표시(ON)' : '숨김(OFF)'}`, "#00e5ff");
};

function filterLogCardsByPhone() {
    const cards = document.querySelectorAll('#target-list .target-card');
    cards.forEach(card => {
        const cardPhone = card.getAttribute('data-phone');
        if (selectedPhoneFilter === 'ALL' || cardPhone === selectedPhoneFilter) {
            card.style.display = 'flex';
        } else {
            card.style.display = 'none';
        }
    });
}

window.openHistoryModal = function(stationUid) {
    const st = allStationsMap[stationUid];
    if (!st) return;

    const displayPhone = st.phone.startsWith('#') ? `번호 뒷자리 ${st.phone.substring(1)}` : st.phone;
    document.getElementById('hist-title').innerText = `📍 [${displayPhone}] 기지국 #${st.seq} (PCI: ${st.pci}) 이력`;
    document.getElementById('hist-addr').innerText = st.address;

    let totalMs = 0;
    st.visits.forEach(v => {
        if (!v.isOffline) {
            totalMs += Math.max(0, v.endDate.getTime() - v.startDate.getTime());
        }
    });
    const totalMin = Math.floor(totalMs / 60000);
    const totalStayStr = totalMin > 0 ? `${totalMin}분` : (st.visits.some(v => !v.isOffline && v.count > 1) ? "1분 미만" : "단발 통과");

    document.getElementById('hist-summary').innerText = `총 방문 횟수: ${st.visits.length}회 | 누적 체류 시간: ${totalStayStr}`;

    const listBox = document.getElementById('hist-list');
    listBox.innerHTML = '';

    st.visits.forEach((v, idx) => {
        const div = document.createElement('div');
        div.className = v.isOffline ? 'visit-item off-visit' : 'visit-item';

        if (v.isOffline) {
            const endRef = v.offlineEndedDate || new Date();
            const offDur = formatDurationMin(v.startDate, endRef);
            const statusTxt = v.offlineEndedDate 
                ? `전원 재부팅됨 (${v.startTimeStr} ~ ${v.endTimeStr} / 총 ${offDur}간 꺼져 있었음)`
                : `현재 전원 꺼짐 상태 (최초 ${v.startTimeStr} ~ 현재 ${offDur} 경과)`;
            div.innerHTML = `
                <div><b>[${idx + 1}차 기록] ⚫ 단말기 전원 꺼짐</b></div>
                <div style="color:#ffab00;">• ${statusTxt}</div>
                <div style="color:#9ad8ed; font-size:10.5px;">• 동일 위치 수신 횟수: ${v.count}회</div>
            `;
        } else {
            const stayDur = formatDurationMin(v.startDate, v.endDate);
            const timeRange = v.count > 1 ? `${v.startTimeStr} ~ ${v.endTimeStr} (<b>${stayDur} 동안 머묾</b>)` : `${v.startTimeStr} (1회 수신)`;
            div.innerHTML = `
                <div><b>[${idx + 1}차 방문] 🟢 신호 활성 체류</b></div>
                <div style="color:#00e676;">• 체류 일시: ${timeRange}</div>
                <div style="color:#9ad8ed; font-size:10.5px;">• 연속 수신 횟수: ${v.count}회</div>
            `;
        }
        listBox.appendChild(div);
    });

    document.getElementById('history-modal').style.display = 'flex';
};

window.closeHistoryModal = function() {
    document.getElementById('history-modal').style.display = 'none';
};

function refreshTopDashboard() {
    const targetGroup = (selectedPhoneFilter !== 'ALL' && phoneGroups[selectedPhoneFilter])
        ? phoneGroups[selectedPhoneFilter]
        : lastActiveGroup;

    if (!targetGroup || !targetGroup.currentStation) return;

    const st = targetGroup.currentStation;
    const visit = st.visits[st.visits.length - 1];

    if (selectedPhoneFilter === 'ALL') {
        document.getElementById('kpi-count-label').innerText = `전체 기지국 (${phoneOrder.length}명)`;
        document.getElementById('kpi-count').innerText = `${Object.keys(allStationsMap).length} 개소`;
    } else {
        const disp = selectedPhoneFilter.startsWith('#') ? `뒷자리 ${selectedPhoneFilter.substring(1)}` : selectedPhoneFilter;
        document.getElementById('kpi-count-label').innerText = `📱 ${disp}`;
        document.getElementById('kpi-count').innerText = `${targetGroup.stations.length} 개소`;
    }

    document.getElementById('kpi-pci').innerText = `PCI ${st.pci}`;

    const statusEl = document.getElementById('kpi-status');
    const statusCard = document.getElementById('kpi-status-card');
    const headerDot = document.getElementById('header-dot');

    if (visit.isOffline) {
        const elapsed = formatDurationMin(visit.startDate, new Date());
        statusEl.innerText = `⚫ 전원꺼짐 (${elapsed} 경과)`;
        statusEl.style.color = "#ffab00";
        statusCard.classList.add('offline');
        headerDot.classList.add('offline');
    } else {
        if (visit.count > 1) {
            const stayStr = formatDurationMin(visit.startDate, visit.endDate);
            statusEl.innerText = `🟢 ${stayStr}째 체류 (${visit.endTimeStr})`;
        } else {
            statusEl.innerText = `🟢 켜짐 (${visit.endTimeStr})`;
        }
        statusEl.style.color = "#00e676";
        statusCard.classList.remove('offline');
        headerDot.classList.remove('offline');
    }

    let totalKm = 0;
    const coords = targetGroup.routeCoords;
    for (let i = 1; i < coords.length; i++) {
        totalKm += calcDistKm(coords[i-1].lat, coords[i-1].lng, coords[i].lat, coords[i].lng);
    }
    document.getElementById('kpi-dist').innerText = `${totalKm.toFixed(2)} km`;
}

function createNewLogCard(st, visit) {
    const list = document.getElementById('target-list');
    if (Object.keys(allStationsMap).length === 1 && st.visits.length === 1) {
        list.innerHTML = '';
    }

    const cleanAddrForSearch = st.address.replace(/\(.*?\)/g, '').trim();
    const card = document.createElement('div');
    card.className = visit.isOffline ? 'target-card offline-card' : 'target-card';
    card.style.borderLeftColor = st.color;
    card.id = `log-card-${visit.logCardId}`;
    card.setAttribute('data-phone', st.phone);

    if (selectedPhoneFilter !== 'ALL' && selectedPhoneFilter !== st.phone) {
        card.style.display = 'none';
    }

    const statusBadge = visit.isOffline 
        ? `<span class="t-status-tag off" id="log-status-${visit.logCardId}">⚫ 전원 꺼짐 (${formatDurationMin(visit.startDate, new Date())}째 꺼져 있음)</span>`
        : `<span class="t-status-tag on" id="log-status-${visit.logCardId}">🟢 신호 활성</span>`;

    const revisitNotice = st.visits.length > 1 ? ` <b style="color:#ffab00;">[${st.visits.length}차 방문]</b>` : '';
    const displayPhone = st.phone.startsWith('#') ? `뒷자리 ${st.phone.substring(1)}` : st.phone;

    card.innerHTML = `
        <div style="cursor:pointer; width:100%;" onclick="kakaoMap.panTo(new kakao.maps.LatLng(${st.lat}, ${st.lng})); openHistoryModal(${st.stationUid});">
            <div>
                <span class="t-phone-tag" style="background:${st.color};">📱 ${displayPhone}</span>
                <span class="t-badge" style="background:${ visit.isOffline ? '#ff1744' : st.color };">기지국 #${st.seq}</span>
                ${statusBadge}
                <span class="t-addr">${st.address}${revisitNotice}</span>
            </div>
            <div class="t-meta" id="log-meta-${visit.logCardId}">
                기지국 PCI: <b>${st.pci}</b> | 확인일시: <b>${visit.startTimeStr}</b> | 상세이력 보기(터치)
            </div>
        </div>
        <div class="t-links">
            <a href="https://map.kakao.com/link/map/${encodeURIComponent(cleanAddrForSearch)},${st.lat},${st.lng}" target="_blank">카카오맵</a>
            <a href="https://map.kakao.com/link/roadview/${st.lat},${st.lng}" target="_blank">로드뷰</a>
            <a href="https://map.naver.com/p/search/${encodeURIComponent(cleanAddrForSearch)}" target="_blank">네이버</a>
        </div>
    `;
    list.prepend(card);
}

function updateExistingLogCard(st, visit) {
    const statusEl = document.getElementById(`log-status-${visit.logCardId}`);
    const metaEl = document.getElementById(`log-meta-${visit.logCardId}`);

    if (!visit.isOffline) {
        const stayStr = formatDurationMin(visit.startDate, visit.endDate);
        if (statusEl) {
            statusEl.innerText = `🟢 동일 기지국 ${stayStr}간 체류 (${visit.count}회 연속 수신)`;
        }
        if (metaEl) {
            metaEl.innerHTML = `기지국 PCI: <b>${st.pci}</b> | 체류일시: <b>${visit.startTimeStr} ~ ${visit.endTimeStr} (${stayStr})</b> | 상세이력(터치)`;
        }
        sysLog(`[동일 PCI 연속수신] ${st.phone} #${st.seq}(PCI:${st.pci}) 체류일시: ${visit.startTimeStr} ~ ${visit.endTimeStr} (${stayStr})`, "#00e676");
    } else {
        const elapsed = formatDurationMin(visit.startDate, new Date());
        if (statusEl) {
            statusEl.innerText = `⚫ 전원 꺼짐 (${elapsed}째 꺼져 있음 / ${visit.count}회 수신)`;
        }
    }
}

window.zoomMap = function(delta) {
    if (!kakaoMap) return;
    kakaoMap.setLevel(kakaoMap.getLevel() + delta, { animate: true });
};
window.focusLastTarget = function() {
    const targetGroup = (selectedPhoneFilter !== 'ALL' && phoneGroups[selectedPhoneFilter])
        ? phoneGroups[selectedPhoneFilter]
        : lastActiveGroup;
    if (!kakaoMap || !targetGroup || !targetGroup.currentStation) return;
    kakaoMap.panTo(new kakao.maps.LatLng(targetGroup.currentStation.lat, targetGroup.currentStation.lng));
};
window.toggleBottomSheet = function() {
    const panel = document.getElementById('bottom-panel');
    const btn = document.getElementById('toggle-sheet-btn');
    panel.classList.toggle('collapsed');
    const isCollapsed = panel.classList.contains('collapsed');
    btn.innerText = isCollapsed ? "▲ 패널 펼치기" : "▼ 패널 접기";
    setTimeout(() => { if (kakaoMap) kakaoMap.relayout(); }, 280);
};
window.switchMobileTab = function(tab) {
    const targetList = document.getElementById('target-list');
    const sysConsole = document.getElementById('sys-console');
    const btnTargets = document.getElementById('tab-targets');
    const btnConsole = document.getElementById('tab-console');

    if (tab === 'targets') {
        targetList.classList.remove('mobile-hide');
        sysConsole.classList.remove('mobile-show');
        btnTargets.classList.add('active');
        btnConsole.classList.remove('active');
    } else {
        targetList.classList.add('mobile-hide');
        sysConsole.classList.add('mobile-show');
        btnTargets.classList.remove('active');
        btnConsole.classList.add('active');
    }
};

function calcDistKm(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

window.handleManualSms = function() {
    const input = document.getElementById('sms-input');
    if (!input.value.trim()) return;
    window.receiveSmsFromAndroid(input.value);
    input.value = '';
};

window.toggleSound = function() {
    soundEnabled = !soundEnabled;
    document.getElementById('sound-btn').innerText = soundEnabled ? "🔊 알림" : "🔇 무음";
};

function playTacticalBeep(isOffline) {
    if (!soundEnabled) return;
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sawtooth';
        if (isOffline) {
            osc.frequency.setValueAtTime(620, ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(280, ctx.currentTime + 0.22);
            gain.gain.setValueAtTime(0.1, ctx.currentTime);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start();
            osc.stop(ctx.currentTime + 0.24);
        } else {
            osc.frequency.setValueAtTime(980, ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(1480, ctx.currentTime + 0.09);
            gain.gain.setValueAtTime(0.08, ctx.currentTime);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start();
            osc.stop(ctx.currentTime + 0.11);
        }
    } catch (e) {}
}
// =====================================================================
// ★ [아르고스(ARGUS) 메인 애플리케이션 - 행동패턴 분석 & 관리자 샘플 생성기 연동 최종본] ★
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

let myGpsWatchId = null;
let myGpsOverlay = null;
let myGpsCircle = null;
let myLastLatLng = null;
let myCurrentPci = null;
let myCurrentNetType = "";

const STORAGE_KEY_SIGNALS = 'CELL_TRACKER_SAVED_SIGNALS_V1';
let savedSignalsHistory = [];
let isRestoringHistory = false;

let pendingSktSplit = null;
let lastIncompleteSktRecord = null;

function escapeHtml(str) {
    return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

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

// =====================================================================
// ★ [안드로이드 네이티브 -> 웹] 현재 내 휴대폰 실시간 PCI 수신 브릿지
// =====================================================================
window.updateMyPhonePci = function(pciStr, netType) {
    if (!pciStr) return;
    const changed = (myCurrentPci !== pciStr || myCurrentNetType !== netType);
    myCurrentPci = pciStr;
    myCurrentNetType = netType || "";

    if (changed) {
        renderMyPciOnDashboard();
        if (myGpsOverlay && myLastLatLng) {
            myGpsOverlay.setContent(buildMyGpsMarkerHtml());
        }
    }
};

window.showPciGuideAlert = function() {
    const msg = 
        "1. 동일 통신망끼리만 PCI 값이 같게 표시됩니다\n" +
        "• SKT·KT·LGU+는 각자 고유의 기지국 안테나를 사용하므로, 같은 장소에 있어도 타겟(피의자)과 내 휴대폰의 통신망이 같아야 동일한 PCI 번호가 표시됩니다.\n\n" +
        "2. 알뜰폰(별정통신사)은 모회사 통신망을 그대로 따릅니다\n" +
        "• 알뜰폰은 자체 기지국이 없으므로 실제 빌려 쓰는 물리적 통신망과 100% 동일한 PCI 값을 가집니다.\n" +
        "  - SKT / KT / LGU+ 및 각 망 알뜰폰 ➔ 동일 PCI 표시\n\n" +
        "3. SKT [위치자료]와 [발신기지국] 표시 기준\n" +
        "• SKT 문자에 [위치자료](T-map 측위 좌표)가 포함된 경우, 안테나 위치인 [발신기지국]보다 정확한 단말기 추정 위치인 [위치자료]를 기준으로 지도에 '📍측위' 마커가 표시됩니다.\n" +
        "• 지나온 과거 측위 지점은 지도가 복잡해지지 않도록 흐린 작은 점(●)과 얇은 회색 동선으로만 간결하게 표시되며, 점을 터치하면 상세 이력을 확인할 수 있습니다.";

    showAppAlert(msg, "📡 실시간 PCI 및 위치 표시 안내");
};

function renderMyPciOnDashboard() {
    const pciValEl = document.getElementById('kpi-pci');
    if (!pciValEl) return;

    const targetGroup = (selectedPhoneFilter !== 'ALL' && phoneGroups[selectedPhoneFilter])
        ? phoneGroups[selectedPhoneFilter]
        : lastActiveGroup;

    const targetPci = (targetGroup && targetGroup.currentStation) ? targetGroup.currentStation.pci : "-";

    if (!myCurrentPci) {
        pciValEl.innerText = targetPci !== "-" ? `PCI ${targetPci}` : "-";
        return;
    }

    const isMatch = (targetPci !== "-" && targetPci !== "미상" && String(targetPci) === String(myCurrentPci));
    const matchBadge = isMatch ? ` <span style="color:#00e676; font-weight:800;">(🎯일치!)</span>` : '';
    const netLabel = myCurrentNetType ? `${escapeHtml(myCurrentNetType)}` : '';

    pciValEl.innerHTML = `
        <div style="line-height:1.15;">
            <div>${targetPci !== "-" ? `타겟: ${escapeHtml(targetPci)}` : `타겟: -`}</div>
            <div style="font-size:10.5px; color:${isMatch ? '#00e676' : '#ffd740'}; font-weight:700; margin-top:2px;">
                📡내폰: ${escapeHtml(myCurrentPci)}${netLabel ? `(${netLabel})` : ''}${matchBadge}
            </div>
        </div>
    `;
}

function buildMyGpsMarkerHtml() {
    const pciTag = myCurrentPci ? ` [PCI:${escapeHtml(myCurrentPci)}]` : '';
    return `
        <div class="my-gps-node">
            <div class="my-gps-pulse"></div>
            <div class="my-gps-core"></div>
            <div class="my-gps-label">내 위치${pciTag}</div>
        </div>
    `;
}

// =====================================================================
// ★ [아르고스 전용 커스텀 알림창 / 확인창 제어 함수]
// =====================================================================
let customDialogCallback = null;

window.closeCustomDialog = function() {
    const modal = document.getElementById('custom-dialog-modal');
    if (modal) modal.style.display = 'none';
    customDialogCallback = null;
};

function showAppAlert(message, title = "🔔 아르고스 알림") {
    const modal = document.getElementById('custom-dialog-modal');
    if (!modal) return;

    const titleEl = document.getElementById('cd-title');
    const msgEl = document.getElementById('cd-message');
    const cancelBtn = document.getElementById('cd-cancel-btn');
    const okBtn = document.getElementById('cd-ok-btn');

    titleEl.innerText = title;
    titleEl.style.color = "var(--neon-cyan)";
    msgEl.innerText = message;

    cancelBtn.style.display = 'none';
    okBtn.innerText = "확인";
    okBtn.className = "btn btn-green";
    okBtn.onclick = function() {
        closeCustomDialog();
    };

    modal.style.display = 'flex';
}

function showAppConfirm(message, onConfirm, title = "⚠️ 작업 확인", okText = "삭제 실행", isDanger = true) {
    const modal = document.getElementById('custom-dialog-modal');
    if (!modal) return;

    const titleEl = document.getElementById('cd-title');
    const msgEl = document.getElementById('cd-message');
    const cancelBtn = document.getElementById('cd-cancel-btn');
    const okBtn = document.getElementById('cd-ok-btn');

    titleEl.innerText = title;
    titleEl.style.color = isDanger ? "#ff5252" : "var(--neon-cyan)";
    msgEl.innerText = message;

    cancelBtn.style.display = 'inline-block';
    okBtn.innerText = okText;
    okBtn.className = isDanger ? "btn btn-red" : "btn btn-green";

    customDialogCallback = onConfirm;
    okBtn.onclick = function() {
        const cb = customDialogCallback;
        closeCustomDialog();
        if (typeof cb === 'function') cb();
    };

    modal.style.display = 'flex';
}

// =====================================================================
// ★ [실시간 내 위치(GPS) 표시 및 이동 기능]
// =====================================================================
window.toggleMyLocationGps = function() {
    if (!kakaoMap) {
        showAppAlert("지도가 아직 준비되지 않았습니다.", "⏳ 잠시만 기다려 주세요");
        return;
    }

    if (!navigator.geolocation) {
        showAppAlert("현재 기기 또는 브라우저에서 GPS 위치 기능을 지원하지 않습니다.", "❌ GPS 미지원");
        return;
    }

    const btn = document.getElementById('btn-my-gps');

    if (myGpsWatchId !== null) {
        if (myLastLatLng) {
            kakaoMap.panTo(myLastLatLng);
        }
        showAppConfirm(
            "현재 내 위치(GPS) 실시간 표시가 켜져 있습니다.\n지도에서 내 위치 표시를 끄시겠습니까?\n([취소]를 누르면 내 위치 표시가 계속 유지됩니다.)",
            function() {
                stopMyLocationGps();
            },
            "🧭 내 위치(GPS) 설정",
            "GPS 끄기",
            false
        );
        return;
    }

    btn.classList.add('gps-active');
    sysLog("[내 위치 GPS] 현재 위치 위성 신호 수신 시작...", "#00e5ff");

    let isFirstFix = true;

    myGpsWatchId = navigator.geolocation.watchPosition(
        function(pos) {
            const lat = pos.coords.latitude;
            const lng = pos.coords.longitude;
            const accuracy = Math.min(Math.max(pos.coords.accuracy || 30, 15), 250);
            const loc = new kakao.maps.LatLng(lat, lng);
            myLastLatLng = loc;

            if (!myGpsCircle) {
                myGpsCircle = new kakao.maps.Circle({
                    map: kakaoMap,
                    center: loc,
                    radius: accuracy,
                    strokeWeight: 1,
                    strokeColor: '#00e5ff',
                    strokeOpacity: 0.6,
                    strokeStyle: 'solid',
                    fillColor: '#00e5ff',
                    fillOpacity: 0.12
                });
            } else {
                myGpsCircle.setPosition(loc);
                myGpsCircle.setRadius(accuracy);
                myGpsCircle.setMap(kakaoMap);
            }

            const markerHtml = buildMyGpsMarkerHtml();

            if (!myGpsOverlay) {
                myGpsOverlay = new kakao.maps.CustomOverlay({
                    map: kakaoMap,
                    position: loc,
                    content: markerHtml,
                    xAnchor: 0.5,
                    yAnchor: 0.5,
                    zIndex: 10
                });
            } else {
                myGpsOverlay.setPosition(loc);
                myGpsOverlay.setContent(markerHtml);
                myGpsOverlay.setMap(kakaoMap);
            }

            if (isFirstFix) {
                isFirstFix = false;
                kakaoMap.panTo(loc);
                const pciInfo = myCurrentPci ? `, 현재 내 폰 PCI: ${escapeHtml(myCurrentPci)}` : '';
                sysLog(`[내 위치 확인 완료] 현재 위치로 지도를 이동했습니다. (오차 약 ${Math.round(pos.coords.accuracy || 20)}m${pciInfo})`, "#00e676");
            }
        },
        function(err) {
            stopMyLocationGps();
            let errMsg = "위치 정보를 가져올 수 없습니다.\n스마트폰 상단바에서 [위치(GPS)]가 켜져 있는지, 앱의 위치 권한이 허용되어 있는지 확인해 주세요.";
            if (err.code === 1) {
                errMsg = "위치 권한이 거부되었습니다.\n스마트폰 [설정 > 애플리케이션 > 아르고스 > 권한]에서 [위치] 권한을 허용해 주세요.";
            }
            showAppAlert(errMsg, "🧭 GPS 수신 실패");
            sysLog(`[내 위치 오류] GPS 수신 실패 (코드: ${err.code})`, "#ff1744");
        },
        {
            enableHighAccuracy: true,
            maximumAge: 5000,
            timeout: 15000
        }
    );
};

function stopMyLocationGps() {
    if (myGpsWatchId !== null) {
        navigator.geolocation.clearWatch(myGpsWatchId);
        myGpsWatchId = null;
    }
    if (myGpsOverlay) myGpsOverlay.setMap(null);
    if (myGpsCircle) myGpsCircle.setMap(null);
    const btn = document.getElementById('btn-my-gps');
    if (btn) btn.classList.remove('gps-active');
    sysLog("[내 위치 GPS] 실시간 내 위치 표시를 종료했습니다.", "#ffab00");
}

function formatPhoneDisplay(phoneKey) {
    if (!phoneKey || phoneKey === "번호미상") return "번호미상";
    const cleanKey = phoneKey.replace(/^#/, '');
    const parts = cleanKey.split('-');
    const last4 = parts[parts.length - 1];

    const sameLast4Count = phoneOrder.filter(p => p.replace(/^#/, '').endsWith(last4)).length;
    return (sameLast4Count > 1 && parts.length > 1) ? cleanKey : last4;
}

function refreshAllPhoneLabelsOnUI() {
    phoneOrder.forEach(p => {
        const g = phoneGroups[p];
        if (!g) return;
        g.stations.forEach(st => {
            const isCurr = (g.currentStation === st);
            if (st.overlay) {
                st.overlay.setContent(buildStationMarkerHtml(st, isCurr));
            }
        });
    });

    const cards = document.querySelectorAll('#target-list .target-card');
    cards.forEach(card => {
        const cardPhone = card.getAttribute('data-phone');
        const tagEl = card.querySelector('.t-phone-tag');
        if (cardPhone && tagEl) {
            tagEl.innerText = `📱 ${formatPhoneDisplay(cardPhone)}`;
        }
    });
}

function saveHistoryToStorage() {
    if (isRestoringHistory) return;
    try {
        localStorage.setItem(STORAGE_KEY_SIGNALS, JSON.stringify(savedSignalsHistory));
    } catch (e) {}
}

function restoreHistoryFromStorage() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY_SIGNALS);
        if (!raw) return;
        const list = JSON.parse(raw);
        if (!Array.isArray(list) || list.length === 0) return;

        isRestoringHistory = true;
        savedSignalsHistory = [];
        list.forEach(item => {
            const restoredParsed = {
                phone: item.phone,
                address: item.address,
                pci: item.pci,
                carrier: item.carrier || '',
                netType: item.netType || '',
                cellType: item.cellType || '',
                radius: item.radius || null,
                isEstimatedPos: !!item.isEstimatedPos,
                btsAddress: item.btsAddress || '',
                posAddress: item.posAddress || '',
                dateObj: new Date(item.dateMs),
                timeStr: item.timeStr,
                isOffline: item.isOffline
            };
            processLocationSignal(item.lat, item.lng, restoredParsed);
        });
        isRestoringHistory = false;
        saveHistoryToStorage();

        // 복원 후 일괄 지도/UI 갱신
        phoneOrder.forEach(p => {
            const g = phoneGroups[p];
            if (g && g.polyline) {
                g.polyline.setPath(g.routeCoords.map(c => new kakao.maps.LatLng(c.lat, c.lng)));
                g.polyline.setMap((g.visible && showRoute) ? kakaoMap : null);
            }
        });
        if (lastActiveGroup && lastActiveGroup.currentStation && lastActiveGroup.visible) {
            kakaoMap.panTo(new kakao.maps.LatLng(lastActiveGroup.currentStation.lat, lastActiveGroup.currentStation.lng));
        }
        renderPhoneFilterBar();
        refreshTopDashboard();
        applyLabelVisibilityRule();
        syncMapLayersVisibility();

        sysLog(`[기록 자동 복원] 이전 추적 데이터 ${list.length}건을 성공적으로 불러왔습니다.`, "#00e5ff");
    } catch (e) {
        isRestoringHistory = false;
    }
}

// ★ 관리자 샘플 생성기 고속 일괄 반영 함수
window.batchImportSignals = function(batchList) {
    if (!Array.isArray(batchList) || batchList.length === 0) return;
    isRestoringHistory = true;
    batchList.forEach(item => {
        processLocationSignal(item.lat, item.lng, item.parsed);
    });
    isRestoringHistory = false;
    saveHistoryToStorage();

    // 일괄 렌더링 마무리
    phoneOrder.forEach(p => {
        const g = phoneGroups[p];
        if (g && g.polyline) {
            g.polyline.setPath(g.routeCoords.map(c => new kakao.maps.LatLng(c.lat, c.lng)));
            g.polyline.setMap((g.visible && showRoute) ? kakaoMap : null);
        }
    });
    if (lastActiveGroup && lastActiveGroup.currentStation && lastActiveGroup.visible) {
        kakaoMap.panTo(new kakao.maps.LatLng(lastActiveGroup.currentStation.lat, lastActiveGroup.currentStation.lng));
    }
    renderPhoneFilterBar();
    refreshTopDashboard();
    applyLabelVisibilityRule();
    syncMapLayersVisibility();
};

window.addEventListener('DOMContentLoaded', function() {
    document.getElementById('header-ver-badge').innerText = APP_VERSION;
    document.getElementById('modal-ver-text').innerText = APP_VERSION;
    document.getElementById('report-email-display').innerText = REPORT_EMAIL;
    renderChangelogList();

    const pciValEl = document.getElementById('kpi-pci');
    if (pciValEl && pciValEl.parentElement) {
        const pciCard = pciValEl.parentElement;
        pciCard.style.cursor = 'pointer';
        pciCard.onclick = window.showPciGuideAlert;
        const labelEl = pciCard.querySelector('.kpi-label');
        if (labelEl && !labelEl.innerHTML.includes('ⓘ')) {
            labelEl.innerHTML = `최근 PCI <span style="color:var(--neon-cyan); font-weight:bold;">ⓘ</span>`;
        }
    }

    sysLog(`📍 [SKT 측위 안내] SKT 문자에 [위치자료](T-map 좌표)가 포함된 경우 [발신기지국] 대신 단말기 추정 위치인 [위치자료] 기준으로 표시되며, 지나온 측위 지점은 흐린 작은 점(●)과 얇은 회색 동선으로 간결히 표시됩니다.`, "#00e5ff");
    sysLog(`💡 [PCI 비교 안내] 실시간 내폰 PCI는 별정통신사(알뜰폰) 여부와 무관하게 실제 사용하는 통신망(SKT망·KT망·LGU+망)이 타겟과 같을 때 동일한 PCI 값으로 표시됩니다. (상단 '최근 PCI ⓘ' 터치 시 상세안내)`, "#ffd740");
    sysLog(`🔒 [보안 작동 중] 기지국 위치추적 외 개인 문자·카톡은 절대 수집/기록하지 않으며 모든 데이터는 기기 내부에만 보관됩니다.`, "#8ab8cc");
    sysLog(`아르고스(ARGUS) 경찰 기지국 위치추적 시스템 (${APP_VERSION}) 가동 시작...`, "#00e5ff");

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
            showAppAlert(`제보 이메일 주소(${REPORT_EMAIL})가 클립보드에 복사되었습니다.`, "📋 이메일 복사 완료");
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
    showAppAlert(`제보 이메일 주소(${REPORT_EMAIL})가 클립보드에 복사되었습니다.`, "📋 이메일 복사 완료");
}
window.sendFeedbackMail = function() {
    const type = document.getElementById('fb-type').value;
    const bodyText = document.getElementById('fb-body').value.trim();
    const subject = `[아르고스(ARGUS) ${APP_VERSION}] ${type}`;
    const content = `■ 프로그램 버전: ${APP_VERSION}\n■ 제보 유형: ${type}\n\n■ 상세 내용:\n${bodyText || '(내용을 입력해 주세요)'}\n`;
    window.location.href = `mailto:${REPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(content)}`;
};

// ===== 선택형 초기화 모달 =====
window.openResetModal = function() {
    if (phoneOrder.length === 0) {
        showAppAlert("현재 초기화할 추적 데이터가 없습니다.", "🗑️ 데이터 없음");
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
        const displayPhone = escapeHtml(formatPhoneDisplay(phone));
        return `
            <div class="reset-phone-item" style="border-left-color:${g.color};">
                <div class="reset-phone-info">
                    <span class="phone-color-dot" style="background:${g.color};"></span>
                    <span>📱 ${displayPhone}</span>
                    <span style="font-size:11px; color:#8ab8cc; font-weight:normal;">(포착 지점: ${g.stations.length}개소)</span>
                </div>
                <button class="btn btn-red" onclick="confirmAndClearSinglePhone('${escapeHtml(phone)}')">선택 삭제</button>
            </div>
        `;
    }).join('');
}

window.confirmAndClearSinglePhone = function(phoneKey) {
    const displayPhone = formatPhoneDisplay(phoneKey);
    showAppConfirm(
        `정말 [📱 ${displayPhone}] 대상자의 추적 동선과 기록을 삭제하시겠습니까?\n(다른 전화번호의 기록은 그대로 유지됩니다.)`,
        function() {
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

            savedSignalsHistory = savedSignalsHistory.filter(item => item.phone !== phoneKey);
            saveHistoryToStorage();

            if (typeof window.clearPatternOverlays === 'function') {
                window.clearPatternOverlays();
            }

            sysLog(`[선택 초기화] 📱 ${escapeHtml(displayPhone)} 대상자의 모든 추적 기록이 삭제되었습니다.`, "#ffab00");

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

            refreshAllPhoneLabelsOnUI();
            renderPhoneFilterBar();
            filterLogCardsByPhone();
            refreshTopDashboard();
            renderResetModalList();
        },
        "🗑️ 개별 대상자 삭제 확인",
        "선택 삭제",
        true
    );
};

window.confirmAndClearAll = function() {
    showAppConfirm(
        `정말 모든 전화번호(${phoneOrder.length}명)의 위치추적 데이터를 전체 초기화하시겠습니까?\n삭제된 이동 경로와 체류 기록은 복구할 수 없습니다.`,
        function() {
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
            lastIncompleteSktRecord = null;

            savedSignalsHistory = [];
            try { localStorage.removeItem(STORAGE_KEY_SIGNALS); } catch (e) {}

            if (typeof window.clearPatternOverlays === 'function') {
                window.clearPatternOverlays();
            }

            resetDashboardToEmpty();
            closeResetModal();
            sysLog("모든 추적 데이터가 전체 초기화되었습니다.", "#ffab00");
        },
        "🚨 전체 데이터 초기화 경고",
        "전체 초기화",
        true
    );
};

function resetDashboardToEmpty() {
    renderPhoneFilterBar();
    document.getElementById('kpi-count-label').innerText = "포착 기지국";
    document.getElementById('kpi-count').innerText = "0 개소";
    document.getElementById('kpi-status').innerText = "대기중";
    document.getElementById('kpi-status').style.color = "var(--neon-green)";
    document.getElementById('kpi-status-card').classList.remove('offline');
    document.getElementById('header-dot').classList.remove('offline');
    renderMyPciOnDashboard();
    document.getElementById('kpi-dist').innerText = "0.00 km";
    document.getElementById('target-list').innerHTML = '<div style="color:#689fb8; text-align:center; padding-top:18px;">[초기화 완료] 모든 마커와 이동 경로가 삭제되었습니다.</div>';
}

// ===== 카카오맵 초기화 및 슬림 레이어 제어 =====
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
                const smsInput = document.getElementById('sms-input');
                if (smsInput && document.activeElement === smsInput) {
                    smsInput.blur();
                }
                applyLabelVisibilityRule();
            });

            sysLog(`카카오맵 연결 완료 (${APP_VERSION}). SKT·KT·LGU+ 실시간 문자 수신 대기중.`, "#00e676");

            restoreHistoryFromStorage();
            renderMyPciOnDashboard();
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
        btn.innerText = "🏷️ 라벨:항상";
        btn.classList.remove('off');
    } else if (labelMode === 'ALWAYS') {
        labelMode = 'HIDE_PAST';
        btn.innerText = "🏷️ 라벨:PCI만";
        btn.classList.add('off');
    } else {
        labelMode = 'AUTO';
        btn.innerText = "🏷️ 라벨:자동";
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
        btn.innerText = "🔵 반경 ON";
        btn.classList.remove('off');
    } else {
        btn.innerText = "⚪ 반경 OFF";
        btn.classList.add('off');
    }
    syncMapLayersVisibility();
};

window.toggleRouteLayer = function() {
    showRoute = !showRoute;
    const btn = document.getElementById('btn-toggle-route');
    if (showRoute) {
        btn.innerText = "⚡ 동선 ON";
        btn.classList.remove('off');
    } else {
        btn.innerText = "⚪ 동선 OFF";
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
            const isCurr = (group.currentStation === st);
            if (st.overlay) st.overlay.setMap(isGroupVis ? kakaoMap : null);
            if (st.circle) {
                const shouldShowCircle = isGroupVis && showRadius && (!st.isEstimatedPos || isCurr);
                st.circle.setMap(shouldShowCircle ? kakaoMap : null);
            }
        });
    });
}

// ===== 안드로이드 수신 브릿지 및 SKT 분할문자 병합/사후보정 =====
function maskSmsForDebug(raw) {
    let masked = raw.replace(/\d/g, '#');
    masked = masked.replace(/[가-힣]+/g, function(word) {
        if (/^(Web발신|발신기지국|위치자료|위치확인|전원꺼짐|전원|꺼짐|음영|켜짐|정상|착신전환|통화불가|기지국|중계기|일반|서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충북|충남|전북|전남|경북|경남|제주|특별자치시|특별자치도|광역시)$/.test(word)) {
            return word;
        }
        if (/(시|도|군|구|읍|면|동|리|로|길|가|번지)$/.test(word)) {
            return word;
        }
        return '*'.repeat(word.length);
    });
    return masked;
}

function applyRetroactiveSktTail(tail) {
    const rec = lastIncompleteSktRecord;
    if (!rec) return false;

    const { station, visit, historyIndex, group } = rec;
    lastIncompleteSktRecord = null;

    const baseDate = visit.startDate || new Date();
    const month = (tail.month !== null) ? tail.month : baseDate.getMonth();
    const day = (tail.day !== null) ? tail.day : baseDate.getDate();
    const updatedDate = new Date(baseDate.getFullYear(), month, day, tail.hour, tail.min, 0);
    const updatedTimeStr = `${pad2(month + 1)}/${pad2(day)} ${pad2(tail.hour)}:${pad2(tail.min)}`;

    visit.startDate = updatedDate;
    visit.endDate = updatedDate;
    visit.startTimeStr = updatedTimeStr;
    visit.endTimeStr = updatedTimeStr;
    visit.isOffline = tail.isOffline;

    if (savedSignalsHistory[historyIndex]) {
        savedSignalsHistory[historyIndex].dateMs = updatedDate.getTime();
        savedSignalsHistory[historyIndex].timeStr = updatedTimeStr;
        savedSignalsHistory[historyIndex].isOffline = tail.isOffline;
        saveHistoryToStorage();
    }

    const isCurr = (group.currentStation === station);
    if (station.overlay) {
        station.overlay.setContent(buildStationMarkerHtml(station, isCurr));
    }
    if (station.circle) {
        station.circle.setOptions({
            strokeColor: tail.isOffline ? '#ff1744' : group.color,
            fillColor: tail.isOffline ? '#ff1744' : group.color
        });
    }

    const cardEl = document.getElementById(`log-card-${visit.logCardId}`);
    const statusEl = document.getElementById(`log-status-${visit.logCardId}`);
    const metaEl = document.getElementById(`log-meta-${visit.logCardId}`);
    const badgeEl = cardEl ? cardEl.querySelector('.t-badge') : null;

    if (cardEl) {
        cardEl.className = tail.isOffline ? 'target-card offline-card' : 'target-card';
    }
    if (badgeEl) {
        badgeEl.style.background = tail.isOffline ? '#ff1744' : station.color;
    }
    if (statusEl) {
        if (tail.isOffline) {
            statusEl.className = 't-status-tag off';
            statusEl.innerText = `⚫ 전원 꺼짐 (${formatDurationMin(updatedDate, new Date())}째 꺼져 있음)`;
        } else {
            statusEl.className = 't-status-tag on';
            statusEl.innerText = '🟢 신호 활성';
        }
    }
    if (metaEl) {
        metaEl.innerHTML = `기지국 PCI: <b>${escapeHtml(station.pci)}</b> | 확인일시: <b>${updatedTimeStr}</b> | 상세이력 보기(터치)`;
    }

    refreshTopDashboard();
    playTacticalBeep(tail.isOffline);
    sysLog(`🔗 [SKT 분할문자 후속반영] 확인일시(${updatedTimeStr}) 및 전원상태(${tail.isOffline ? '⚫ 꺼짐(N)' : '🟢 켜짐(Y)'})가 반영되었습니다.`, tail.isOffline ? "#ffab00" : "#00e676");
    return true;
}

window.receiveSmsFromAndroid = function(rawText, isManualInput = false, senderNumber = '') {
    try {
        if (!rawText || !rawText.trim()) return;
        if (!kakaoMap) {
            showAppAlert("지도가 아직 로드되지 않았습니다. 잠시 후 다시 시도해 주세요.", "⏳ 지도 로딩 중");
            return;
        }

        // 1) SKT 분할 문자 2부(예: "[Web발신] 06:33, N") 도착 여부 확인
        const tail = (typeof parseSktSplitTail === 'function') ? parseSktSplitTail(rawText) : null;
        if (tail) {
            if (pendingSktSplit) {
                clearTimeout(pendingSktSplit.timer);
                const tailText = `${pad2(tail.hour)}:${pad2(tail.min)},${tail.isOffline ? 'N' : 'Y'}`;
                const mergedText = `${pendingSktSplit.rawText} ${tailText}`;
                const mergedSender = pendingSktSplit.senderNumber || senderNumber;
                pendingSktSplit = null;
                window.receiveSmsFromAndroid(mergedText, isManualInput, mergedSender);
                return;
            }
            if (lastIncompleteSktRecord && (Date.now() - lastIncompleteSktRecord.createdAt < 180000)) {
                applyRetroactiveSktTail(tail);
                return;
            }
            if (lastActiveGroup && lastActiveGroup.currentStation) {
                const st = lastActiveGroup.currentStation;
                const lastVisit = st.visits[st.visits.length - 1];
                const lastHistIdx = savedSignalsHistory.length - 1;
                if (lastVisit) {
                    lastIncompleteSktRecord = {
                        station: st,
                        visit: lastVisit,
                        historyIndex: lastHistIdx,
                        group: lastActiveGroup,
                        createdAt: Date.now()
                    };
                    applyRetroactiveSktTail(tail);
                    return;
                }
            }
            sysLog(`⏳ [SKT 분할문자 2부] 연결할 직전 SKT 1부(주소) 문자가 없어 반영을 건너뛰었습니다.`, "#ffab00");
            return;
        }

        const parsed = parseSmsContent(rawText, senderNumber);

        // 2) SKT 분할 문자 1부(시간·Y/N 누락)가 자동 수신된 경우 3.5초 대기 후 병합/처리
        if (parsed.isIncompleteSkt && !isManualInput) {
            if (pendingSktSplit) clearTimeout(pendingSktSplit.timer);
            pendingSktSplit = {
                rawText,
                senderNumber,
                timer: setTimeout(function() {
                    const hold = pendingSktSplit;
                    pendingSktSplit = null;
                    if (hold) dispatchParsedSignal(parseSmsContent(hold.rawText, hold.senderNumber));
                }, 3500)
            };
            return;
        }

        if (!parsed.address && !(parsed.directLat && parsed.directLng)) {
            const hasCellHint = /(PCI|CPI|기지국|발신기지국|위치자료|위치확인|tmap|중계기|음영|\br\(\d+|D:\s*\d{4}|[CP]:\s*\d{4,5}|\[\s*[a-zA-Z]?\d{1,4}\s*\])/i.test(rawText);

            if (isManualInput || hasCellHint) {
                const debugPattern = escapeHtml(maskSmsForDebug(rawText));
                sysLog(`⚠️ [양식 미인식 디버그] 주소 추출 실패 | 양식구조: "${debugPattern}" (개인정보 자동보호됨)`, "#ff1744");
            }
            return;
        }

        dispatchParsedSignal(parsed);
    } catch (err) {
        sysLog(`❌ [처리 오류] ${escapeHtml(err && err.message ? err.message : String(err))}`, "#ff1744");
    }
};

function dispatchParsedSignal(parsed) {
    const dispPhone = escapeHtml(formatPhoneDisplay(parsed.phone));
    const carrierTag = [parsed.carrier, parsed.netType, parsed.cellType].filter(Boolean).join('·');
    const radiusTag = parsed.radius ? ` | 반경:${parsed.radius}m` : '';
    const safeAddr = escapeHtml(parsed.address || '좌표 직결 위치');

    if (parsed.directLat && parsed.directLng) {
        const btsInfo = parsed.btsAddress ? ` (발신기지국: ${escapeHtml(parsed.btsAddress)})` : '';
        sysLog(`📍 [${escapeHtml(carrierTag)} 위치자료 측위] 📱${dispPhone} | PCI:${escapeHtml(parsed.pci)} | ${safeAddr}${btsInfo}`, "#00e5ff");
        processLocationSignal(parsed.directLat, parsed.directLng, parsed);
        return;
    }

    sysLog(`📡 [${escapeHtml(carrierTag)} 신호포착] 📱${dispPhone} | PCI:${escapeHtml(parsed.pci)}${radiusTag} | ${safeAddr}`, "#00e5ff");
    geocodeOnKakao(parsed);
}

function geocodeOnKakao(parsed) {
    const primaryQuery = parsed.searchAddress || parsed.address;
    const fallbackQuery = parsed.fallbackAddress || '';

    function trySearch(query, onFail) {
        kakaoGeocoder.addressSearch(query, function(result, status) {
            if (status === kakao.maps.services.Status.OK && result.length > 0) {
                processLocationSignal(parseFloat(result[0].y), parseFloat(result[0].x), parsed);
                return;
            }
            kakaoPlaces.keywordSearch(query, function(kwRes, kwStatus) {
                if (kwStatus === kakao.maps.services.Status.OK && kwRes.length > 0) {
                    processLocationSignal(parseFloat(kwRes[0].y), parseFloat(kwRes[0].x), parsed);
                    return;
                }
                const roadOnly = query.replace(/\s+(산\s*)?\d+(-\d+)?(\s*번지)?$/, '').trim();
                if (roadOnly && roadOnly !== query) {
                    sysLog(`[${escapeHtml(query)}] 정식 번지 없음 -> [${escapeHtml(roadOnly)}] 구간으로 보정 추적합니다.`, "#ffab00");
                    kakaoGeocoder.addressSearch(roadOnly, function(rRes, rStatus) {
                        if (rStatus === kakao.maps.services.Status.OK && rRes.length > 0) {
                            parsed.address = `${parsed.address} (구간보정)`;
                            processLocationSignal(parseFloat(rRes[0].y), parseFloat(rRes[0].x), parsed);
                        } else {
                            kakaoPlaces.keywordSearch(roadOnly, function(rkRes, rkStatus) {
                                if (rkStatus === kakao.maps.services.Status.OK && rkRes.length > 0) {
                                    parsed.address = `${parsed.address} (인근보정)`;
                                    processLocationSignal(parseFloat(rkRes[0].y), parseFloat(rkRes[0].x), parsed);
                                } else {
                                    onFail();
                                }
                            });
                        }
                    });
                } else {
                    onFail();
                }
            });
        });
    }

    trySearch(primaryQuery, function() {
        if (fallbackQuery && fallbackQuery !== primaryQuery) {
            sysLog(`[위치자료] 주소 검색 실패 -> [발신기지국] 주소(${escapeHtml(fallbackQuery)})로 대체 추적합니다.`, "#ffab00");
            parsed.isEstimatedPos = false;
            parsed.address = parsed.btsAddress || fallbackQuery;
            trySearch(fallbackQuery, function() {
                sysLog(`주소 변환 실패: [${escapeHtml(primaryQuery)}]`, "#ff1744");
            });
        } else {
            sysLog(`주소 변환 실패: [${escapeHtml(primaryQuery)}]`, "#ff1744");
        }
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

        if (!isRestoringHistory) {
            refreshAllPhoneLabelsOnUI();
        }
    }
    return phoneGroups[phone];
}

function processLocationSignal(lat, lng, parsed) {
    const { phone, address, pci, dateObj: eventDate, timeStr, isOffline } = parsed;
    const isEstimatedPos = !!parsed.isEstimatedPos;
    const btsAddress = parsed.btsAddress || '';
    const posAddress = parsed.posAddress || '';

    const historyIndex = savedSignalsHistory.length;
    savedSignalsHistory.push({
        lat: lat,
        lng: lng,
        phone: phone,
        address: address,
        pci: pci,
        carrier: parsed.carrier || '',
        netType: parsed.netType || '',
        cellType: parsed.cellType || '',
        radius: parsed.radius || null,
        isEstimatedPos: isEstimatedPos,
        btsAddress: btsAddress,
        posAddress: posAddress,
        dateMs: eventDate ? eventDate.getTime() : Date.now(),
        timeStr: timeStr,
        isOffline: isOffline
    });
    saveHistoryToStorage();

    const group = getOrCreatePhoneGroup(phone);
    lastActiveGroup = group;

    const pos = new kakao.maps.LatLng(lat, lng);
    if (group.visible && !isRestoringHistory) kakaoMap.panTo(pos);

    if (group.currentStation) {
        const prevStation = group.currentStation;
        const prevVisit = prevStation.visits[prevStation.visits.length - 1];
        const distFromPrevKm = calcDistKm(prevStation.lat, prevStation.lng, lat, lng);

        const isSameSpot = (isEstimatedPos || prevStation.isEstimatedPos)
            ? (distFromPrevKm < 0.03)
            : ((pci !== "미상" && prevStation.pci === pci) || (pci === "미상" && prevStation.address === address));

        if (prevVisit && prevVisit.isOffline && (!isSameSpot || !isOffline)) {
            prevVisit.offlineEndedDate = eventDate;
            prevVisit.endTimeStr = timeStr;
            const offDurationStr = formatDurationMin(prevVisit.startDate, eventDate);

            const badgeEl = document.getElementById(`log-status-${prevVisit.logCardId}`);
            if (badgeEl) {
                badgeEl.innerText = `⚫ 전원 재부팅됨 (총 ${offDurationStr}간 꺼져 있었음: ${prevVisit.startTimeStr} ~ ${timeStr})`;
            }
            if (!isRestoringHistory) {
                sysLog(`[전원 재부팅 / 위치변경] ${escapeHtml(formatPhoneDisplay(phone))} 단말기 전원 꺼짐 종료 (총 ${offDurationStr}간 오프라인 기록됨)`, "#ffab00");
            }
        }

        if (isSameSpot && prevVisit.isOffline === isOffline) {
            prevVisit.count++;
            if (!isOffline) {
                prevVisit.endDate = eventDate;
                prevVisit.endTimeStr = timeStr;
            }
            prevStation.overlay.setContent(buildStationMarkerHtml(prevStation, true));
            updateExistingLogCard(prevStation, prevVisit);
            if (parsed.isIncompleteSkt && !isRestoringHistory) {
                lastIncompleteSktRecord = { station: prevStation, visit: prevVisit, historyIndex, group, createdAt: Date.now() };
            }
            if (!isRestoringHistory) {
                renderPhoneFilterBar();
                refreshTopDashboard();
                playTacticalBeep(isOffline);
            }
            return;
        }
    }

    group.stations.forEach(st => {
        st.overlay.setContent(buildStationMarkerHtml(st, false));
        if (st.isEstimatedPos) {
            st.circle.setMap(null);
        } else {
            st.circle.setOptions({
                strokeWeight: 1.5,
                strokeColor: group.color,
                strokeOpacity: 0.35,
                fillColor: group.color,
                fillOpacity: 0.03
            });
        }
    });

    let station = group.stations.find(st => {
        if (isEstimatedPos || st.isEstimatedPos) {
            return calcDistKm(st.lat, st.lng, lat, lng) < 0.03;
        }
        return (pci !== "미상" && st.pci === pci && Math.abs(st.lat - lat) < 0.005) || (st.address === address);
    });

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
        station.circle.setMap((group.visible && showRadius) ? kakaoMap : null);
        station.overlay.setContent(buildStationMarkerHtml(station, true));
        group.currentStation = station;
        if (!isRestoringHistory) {
            const locType = station.isEstimatedPos ? '위치자료' : '기지국';
            sysLog(`[재방문 감지] ${escapeHtml(formatPhoneDisplay(phone))} -> #${station.seq} ${locType}(PCI:${escapeHtml(pci)}) ${station.visits.length}번째 방문!`, "#ffab00");
        }
    } else {
        stationUidCounter++;
        const seq = group.stations.length + 1;
        const circleRadius = parsed.radius
            ? Math.min(Math.max(parsed.radius, 50), 2500)
            : (isEstimatedPos ? 150 : 400);

        const circle = new kakao.maps.Circle({
            map: (group.visible && showRadius) ? kakaoMap : null,
            center: pos,
            radius: circleRadius,
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
            isEstimatedPos: isEstimatedPos,
            btsAddress: btsAddress,
            posAddress: posAddress,
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

    if (parsed.isIncompleteSkt && !isRestoringHistory) {
        lastIncompleteSktRecord = { station, visit: newVisit, historyIndex, group, createdAt: Date.now() };
    }

    if (isEstimatedPos) {
        group.polyline.setOptions({
            strokeWeight: 2,
            strokeColor: '#7b8794',
            strokeOpacity: 0.45,
            strokeStyle: 'shortdash'
        });
    }

    group.routeCoords.push({ lat, lng });
    createNewLogCard(station, newVisit);

    if (!isRestoringHistory) {
        group.polyline.setPath(group.routeCoords.map(c => new kakao.maps.LatLng(c.lat, c.lng)));
        group.polyline.setMap((group.visible && showRoute) ? kakaoMap : null);
        renderPhoneFilterBar();
        refreshTopDashboard();
        applyLabelVisibilityRule();
        playTacticalBeep(isOffline);
    }
}

function getShortPhoneLabel(phone) {
    if (phone === "번호미상") return "";
    return `<span class="phone-mini">📱${escapeHtml(formatPhoneDisplay(phone))}</span>`;
}

function buildStationMarkerHtml(st, isCurrentActive) {
    const lastVisit = st.visits[st.visits.length - 1];
    const totalVisits = st.visits.length;
    const revisitTag = totalVisits > 1 ? `<span class="revisit-badge">${totalVisits}회 방문</span>` : '';
    const phoneBadge = getShortPhoneLabel(st.phone);
    const safePci = escapeHtml(st.pci);
    const modeTag = st.isEstimatedPos ? '📍측위' : '활성';

    if (isCurrentActive) {
        if (lastVisit.isOffline) {
            const elapsedStr = formatDurationMin(lastVisit.startDate, new Date());
            return `
                <div class="tactical-node offline" style="--target-color:${st.color};" onclick="openHistoryModal(${st.stationUid})">
                    <div class="node-core"></div>
                    <div class="node-label">
                        ${phoneBadge}⚫ #${st.seq} [PCI:${safePci}] ${revisitTag}
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
                        ${phoneBadge}#${st.seq} ${modeTag} [PCI:${safePci}] ${revisitTag}
                        <span class="sub-time">${stayText}</span>
                    </div>
                </div>
            `;
        }
    }

    if (st.isEstimatedPos) {
        return `
            <div class="tactical-node past" style="--target-color:${st.color};" onclick="openHistoryModal(${st.stationUid})" title="#${st.seq} 측위 (${lastVisit.endTimeStr})">
                <div class="node-core" style="width:8px; height:8px; opacity:0.35; border-width:1.5px; box-shadow:none;"></div>
            </div>
        `;
    }

    const stayMin = formatDurationMin(lastVisit.startDate, lastVisit.endDate);
    const pastSub = (lastVisit.count > 1 && !lastVisit.isOffline) ? ` (${stayMin} 체류)` : '';
    const miniPciText = st.pci !== '미상' ? `PCI:${safePci}` : `#${st.seq}`;

    return `
        <div class="tactical-node past" style="--target-color:${st.color};" onclick="openHistoryModal(${st.stationUid})">
            <div class="node-core"></div>
            <div class="node-mini-badge">${miniPciText}</div>
            <div class="node-label">
                ${phoneBadge}#${st.seq} [PCI:${safePci}] 🕒${lastVisit.endTimeStr}${pastSub} ${revisitTag}
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
        const displayPhone = escapeHtml(formatPhoneDisplay(phone));
        const safePhoneKey = escapeHtml(phone);

        html += `
            <div class="phone-chip ${isSel} ${isHidden}" style="border-color:${g.color};" onclick="selectPhoneFilter('${safePhoneKey}')">
                <span class="phone-color-dot" style="background:${g.color};"></span>
                <span>${displayPhone} (${g.stations.length})</span>
                <button class="phone-vis-btn" onclick="event.stopPropagation(); togglePhoneVisibility('${safePhoneKey}');" title="지도에서 이 번호만 켜기/끄기">${eyeIcon}</button>
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
    sysLog(`[표시 제어] ${escapeHtml(formatPhoneDisplay(phoneKey))} 동선 및 마커 ${g.visible ? '표시(ON)' : '숨김(OFF)'}`, "#00e5ff");
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

    const displayPhone = formatPhoneDisplay(st.phone);
    const typeTitle = st.isEstimatedPos ? '위치자료(측위)' : '기지국';
    document.getElementById('hist-title').innerText = `📍 [${displayPhone}] ${typeTitle} #${st.seq} (PCI: ${st.pci}) 이력`;

    if (st.isEstimatedPos && st.btsAddress) {
        document.getElementById('hist-addr').innerText = `📍 위치자료(측위): ${st.address}\n📡 발신기지국: ${st.btsAddress}`;
    } else {
        document.getElementById('hist-addr').innerText = st.address;
    }

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
    renderMyPciOnDashboard();

    const targetGroup = (selectedPhoneFilter !== 'ALL' && phoneGroups[selectedPhoneFilter])
        ? phoneGroups[selectedPhoneFilter]
        : lastActiveGroup;

    if (!targetGroup || !targetGroup.currentStation) return;

    const st = targetGroup.currentStation;
    const visit = st.visits[st.visits.length - 1];

    if (selectedPhoneFilter === 'ALL') {
        document.getElementById('kpi-count-label').innerText = `전체 지점 (${phoneOrder.length}명)`;
        document.getElementById('kpi-count').innerText = `${Object.keys(allStationsMap).length} 개소`;
    } else {
        const disp = formatPhoneDisplay(selectedPhoneFilter);
        document.getElementById('kpi-count-label').innerText = `📱 ${disp}`;
        document.getElementById('kpi-count').innerText = `${targetGroup.stations.length} 개소`;
    }

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
    const displayPhone = escapeHtml(formatPhoneDisplay(st.phone));
    const safeAddr = escapeHtml(st.address);
    const safePci = escapeHtml(st.pci);
    const seqBadgeText = st.isEstimatedPos ? `📍위치자료 #${st.seq}` : `기지국 #${st.seq}`;
    const btsSubRow = (st.isEstimatedPos && st.btsAddress)
        ? `<div style="font-size:10.5px; color:#8ab8cc; margin-top:2px;">📡 발신기지국: ${escapeHtml(st.btsAddress)}</div>`
        : '';

    card.innerHTML = `
        <div style="cursor:pointer; width:100%;" onclick="kakaoMap.panTo(new kakao.maps.LatLng(${st.lat}, ${st.lng})); openHistoryModal(${st.stationUid});">
            <div>
                <span class="t-phone-tag" style="background:${st.color};">📱 ${displayPhone}</span>
                <span class="t-badge" style="background:${ visit.isOffline ? '#ff1744' : st.color };">${seqBadgeText}</span>
                ${statusBadge}
                <span class="t-addr">${safeAddr}${revisitNotice}</span>
            </div>
            ${btsSubRow}
            <div class="t-meta" id="log-meta-${visit.logCardId}">
                기지국 PCI: <b>${safePci}</b> | 확인일시: <b>${visit.startTimeStr}</b> | 상세이력 보기(터치)
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
    const safePci = escapeHtml(st.pci);
    const locLabel = st.isEstimatedPos ? '동일 위치' : '동일 기지국';

    if (!visit.isOffline) {
        const stayStr = formatDurationMin(visit.startDate, visit.endDate);
        if (statusEl) {
            statusEl.innerText = `🟢 ${locLabel} ${stayStr}간 체류 (${visit.count}회 연속 수신)`;
        }
        if (metaEl) {
            metaEl.innerHTML = `기지국 PCI: <b>${safePci}</b> | 체류일시: <b>${visit.startTimeStr} ~ ${visit.endTimeStr} (${stayStr})</b> | 상세이력(터치)`;
        }
        if (!isRestoringHistory) {
            sysLog(`[동일 지점 연속수신] ${escapeHtml(formatPhoneDisplay(st.phone))} #${st.seq}(PCI:${safePci}) 체류일시: ${visit.startTimeStr} ~ ${visit.endTimeStr} (${stayStr})`, "#00e676");
        }
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
    window.receiveSmsFromAndroid(input.value, true);
    input.value = '';
    input.blur();
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

// =====================================================================
// ★ [스마트 터치 판별기 & 키보드 가림/포커스 버그 원천 차단 모듈]
// =====================================================================
(function initSmartMarkerTapAndKeyboardFix() {
    let startX = 0, startY = 0, startTime = 0;

    function releaseInputFocusIfOutside(e) {
        const smsInput = document.getElementById('sms-input');
        if (!smsInput) return;
        if (document.activeElement === smsInput && !e.target.closest('.toolbar')) {
            smsInput.blur();
        }
    }

    document.addEventListener('touchstart', releaseInputFocusIfOutside, { capture: true, passive: true });
    document.addEventListener('pointerdown', function(e) {
        releaseInputFocusIfOutside(e);

        if (!e.target.closest('#map')) return;
        startX = e.clientX;
        startY = e.clientY;
        startTime = Date.now();
    }, true);

    document.addEventListener('pointerup', function(e) {
        if (!startTime || !e.target.closest('#map')) return;

        const moveX = Math.abs(e.clientX - startX);
        const moveY = Math.abs(e.clientY - startY);
        const elapsed = Date.now() - startTime;
        startTime = 0;

        if (moveX < 10 && moveY < 10 && elapsed < 400) {
            const nodes = document.querySelectorAll('.tactical-node');
            for (const node of nodes) {
                const targets = [
                    node.querySelector('.node-core'),
                    node.querySelector('.node-label'),
                    node.querySelector('.node-mini-badge')
                ];

                for (const el of targets) {
                    if (!el) continue;
                    const rect = el.getBoundingClientRect();
                    if (rect.width === 0 || rect.height === 0) continue;

                    if (
                        e.clientX >= rect.left - 8 && e.clientX <= rect.right + 8 &&
                        e.clientY >= rect.top - 8 && e.clientY <= rect.bottom + 8
                    ) {
                        node.click();
                        return;
                    }
                }
            }
        }
    }, true);

    window.addEventListener('DOMContentLoaded', function() {
        const smsInput = document.getElementById('sms-input');
        const bottomPanel = document.getElementById('bottom-panel');

        if (smsInput && bottomPanel) {
            smsInput.addEventListener('focus', function() {
                if (bottomPanel.classList.contains('collapsed')) {
                    window.toggleBottomSheet();
                }
                setTimeout(function() {
                    smsInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }, 250);
            });
        }

        if (window.visualViewport) {
            window.visualViewport.addEventListener('resize', function() {
                document.body.style.height = window.visualViewport.height + 'px';
                if (kakaoMap) kakaoMap.relayout();
            });
        }
    });
})();

// =====================================================================
// ★ [익명 사용자 수 집계 & 제작자 전용 숨김 관리자 패널 - 3초 롱프레스 적용]
// =====================================================================
(function initArgusAnonymousStats() {
    const NAMESPACE = 'argus_police_tracker_hsw';
    const FIRST_VISIT_KEY = 'ARGUS_DEVICE_REGISTERED_V1';

    window.addEventListener('DOMContentLoaded', function() {
        fetch(`https://api.counterapi.dev/v1/${NAMESPACE}/total_launches/up`).catch(() => {});

        try {
            if (!localStorage.getItem(FIRST_VISIT_KEY)) {
                fetch(`https://api.counterapi.dev/v1/${NAMESPACE}/unique_users/up`)
                    .then(res => {
                        if (res.ok) localStorage.setItem(FIRST_VISIT_KEY, 'true');
                    })
                    .catch(() => {});
            }
        } catch (e) {}

        const verBadge = document.getElementById('header-ver-badge');
        if (!verBadge) return;

        verBadge.style.userSelect = 'none';
        verBadge.style.webkitUserSelect = 'none';
        verBadge.addEventListener('contextmenu', e => e.preventDefault());

        let pressTimer = null;
        let isLongPressTriggered = false;

        const startPress = function() {
            isLongPressTriggered = false;
            if (pressTimer) clearTimeout(pressTimer);
            pressTimer = setTimeout(function() {
                isLongPressTriggered = true;
                if (typeof window.openAdminPanel === 'function') {
                    window.openAdminPanel();
                } else {
                    openCreatorStatsModal();
                }
            }, 3000);
        };

        const cancelPress = function() {
            if (pressTimer) {
                clearTimeout(pressTimer);
                pressTimer = null;
            }
        };

        verBadge.addEventListener('click', function(e) {
            if (isLongPressTriggered) {
                e.stopImmediatePropagation();
                e.preventDefault();
                isLongPressTriggered = false;
            }
        }, true);

        verBadge.addEventListener('touchstart', startPress, { passive: true });
        verBadge.addEventListener('touchend', cancelPress);
        verBadge.addEventListener('touchmove', cancelPress);
        verBadge.addEventListener('touchcancel', cancelPress);
        verBadge.addEventListener('mousedown', startPress);
        verBadge.addEventListener('mouseup', cancelPress);
        verBadge.addEventListener('mouseleave', cancelPress);
    });

    async function openCreatorStatsModal() {
        showAppAlert("📊 실시간 사용 통계를 불러오는 중입니다...", "🔐 제작자 전용 통계 (Admin)");
        try {
            const [userRes, launchRes] = await Promise.all([
                fetch(`https://api.counterapi.dev/v1/${NAMESPACE}/unique_users`),
                fetch(`https://api.counterapi.dev/v1/${NAMESPACE}/total_launches`)
            ]);

            const userData = userRes.ok ? await userRes.json() : { count: 0 };
            const launchData = launchRes.ok ? await launchRes.json() : { count: 0 };

            const users = userData.count || 1;
            const launches = launchData.count || 1;

            const statsMsg =
                `현재 전국에서 아르고스(ARGUS)를 사용 중인 현황입니다.\n\n` +
                `👮 누적 사용 인원(기기): 총 ${users.toLocaleString()} 명\n` +
                `🚀 누적 시스템 가동 횟수: 총 ${launches.toLocaleString()} 회\n\n` +
                `※ 본 통계는 개인정보 없이 기기별 최초 1회 익명 카운트로만 집계됩니다.`;

            showAppAlert(statsMsg, "🔐 아르고스(ARGUS) 배포 현황");
        } catch (err) {
            showAppAlert("통계 서버에 연결할 수 없습니다. 인터넷 연결을 확인해 주세요.", "⚠️ 조회 실패");
        }
    }
})();
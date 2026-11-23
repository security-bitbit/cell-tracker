// =====================================================================
// ★ [아르고스(ARGUS) 온디바이스 행동패턴 분석 & 관리자 패널 v1.1] ★
// - 100% 기기 내 로컬 연산 (외부 서버 전송 없음)
// - 전원 꺼짐 구간(위치·시간)은 거점·활동반경·신뢰도 산정에서 완전 제외
// - 관리자 창: 실시간 추적 중 수사관 수(시간대별) + 누적 통계 + 샘플 생성기
// =====================================================================

let patternOverlays = [];
let isPatternOverlayVisible = false;
let lastPatternResult = null;

window.addEventListener('DOMContentLoaded', function() {
    injectPatternStylesAndModals();
});

function injectPatternStylesAndModals() {
    if (document.getElementById('pattern-modal')) return;

    const styleEl = document.createElement('style');
    styleEl.textContent = `
        .pat-badge { display:inline-block; padding:2px 7px; border-radius:10px; font-size:10.5px; font-weight:700; }
        .pat-card { background:rgba(8, 25, 42, 0.85); border:1px solid rgba(0, 229, 255, 0.25); border-radius:8px; padding:10px 12px; margin-bottom:8px; }
        .pat-card-title { font-size:11.5px; font-weight:700; color:#00e5ff; margin-bottom:5px; display:flex; justify-content:space-between; align-items:center; }
        .pat-row { font-size:11.5px; color:#e0f4ff; line-height:1.55; margin-bottom:3px; word-break:keep-all; }
        .pat-sub { font-size:10.5px; color:#8ab8cc; }
        .pat-bar-wrap { background:rgba(255,255,255,0.08); border-radius:4px; height:6px; overflow:hidden; margin-top:4px; }
        .pat-bar-fill { height:100%; border-radius:4px; background:linear-gradient(90deg, #00e5ff, #00e676); }
        .pat-map-tag {
            background:rgba(10, 18, 34, 0.92); border:1.5px solid #b388ff; color:#ffffff;
            font-size:11px; font-weight:800; padding:3px 8px; border-radius:12px;
            white-space:nowrap; box-shadow:0 2px 8px rgba(0,0,0,0.65); pointer-events:none;
        }
        .pat-map-tag.home { border-color:#00e676; color:#00e676; }
        .pat-map-tag.work { border-color:#ffd740; color:#ffd740; }
        .pat-select {
            width:100%; background:#071828; color:#e6f4ff; border:1px solid rgba(0,229,255,0.35);
            border-radius:6px; padding:7px 8px; font-size:12px; margin-bottom:8px;
        }
        .admin-section {
            background:rgba(6, 20, 34, 0.88); border:1px solid rgba(0,229,255,0.28);
            border-radius:8px; padding:10px 12px; margin-bottom:10px;
        }
        .admin-grid-2 { display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-bottom:8px; }
        .admin-label { font-size:11px; color:#8ab8cc; display:block; margin-bottom:3px; }
        .admin-stat-grid { display:grid; grid-template-columns:1fr 1fr; gap:6px; margin-top:6px; }
        .admin-stat-box {
            background:rgba(0,0,0,0.28); border:1px solid rgba(0,229,255,0.18);
            border-radius:6px; padding:7px 9px;
        }
        .admin-stat-label { font-size:10px; color:#8ab8cc; }
        .admin-stat-val { font-size:14px; font-weight:800; color:#ffffff; margin-top:2px; }
    `;
    document.head.appendChild(styleEl);

    const modalsHtml = `
        <!-- 모달 5: 온디바이스 행동패턴 & 핵심 활동반경 분석 -->
        <div id="pattern-modal" class="modal-overlay" style="z-index: 9500;" onclick="if(event.target.id==='pattern-modal') closePatternModal()">
            <div class="modal-card" style="max-width:420px; max-height:85vh; display:flex; flex-direction:column;">
                <div class="modal-header">
                    <span class="modal-title" style="color:#b388ff;">🧠 행동패턴 · 핵심 활동반경 분석</span>
                    <button class="modal-close" onclick="closePatternModal()">닫기 ✕</button>
                </div>

                <div id="pattern-phone-selector-wrap" style="margin-bottom:8px; display:none;">
                    <select id="pattern-phone-select" class="pat-select" onchange="runPatternAnalysis(this.value)"></select>
                </div>

                <div id="pattern-body" style="overflow-y:auto; flex:1; padding-right:2px;"></div>

                <div style="display:flex; gap:6px; margin-top:10px; flex-wrap:wrap;">
                    <button class="btn" id="btn-toggle-pattern-map" style="flex:1; border-color:#b388ff; color:#e0c3ff;" onclick="toggleActivityRadiusOnMap()">🗺️ 지도에 활동반경 표시</button>
                    <button class="btn btn-amber" onclick="copyPatternBriefing()">📋 브리핑 복사</button>
                    <button class="btn btn-green" onclick="closePatternModal()">닫기</button>
                </div>
            </div>
        </div>

        <!-- 모달 6: 제작자 전용 관리자 패널 (실시간 활성 + 누적 통계 + 샘플 생성기) -->
        <div id="admin-modal" class="modal-overlay" style="z-index: 9600;" onclick="if(event.target.id==='admin-modal') closeAdminModal()">
            <div class="modal-card" style="max-width:390px; max-height:86vh; overflow-y:auto;">
                <div class="modal-header">
                    <span class="modal-title" style="color:#ffd740;">🔐 아르고스 관리자 패널 (Admin)</span>
                    <button class="modal-close" onclick="closeAdminModal()">닫기 ✕</button>
                </div>

                <div class="admin-section">
                    <div class="pat-card-title" style="color:#00e5ff;">
                        <span>📊 실시간 가동 · 배포 현황</span>
                        <button class="btn" style="padding:2px 7px; font-size:10px;" onclick="refreshAdminStats()">🔄 새로고침</button>
                    </div>
                    <div id="admin-stats-box" class="pat-row" style="color:#cceeff;">통계를 불러오는 중...</div>
                </div>

                <div class="admin-section" style="border-color:rgba(179,136,255,0.45);">
                    <div class="pat-card-title" style="color:#b388ff;">🧪 행동패턴 테스트용 샘플 생성기</div>
                    <div class="pat-sub" style="margin-bottom:8px; line-height:1.45;">
                        현재 시각 기준 과거 지정 기간 동안 실제 생활 패턴(취침·출퇴근·근무·점심·주말 외출)으로 문자가 수신된 것처럼 지도에 자동 생성합니다.
                    </div>

                    <div class="admin-grid-2">
                        <div>
                            <label class="admin-label">추적 기간 (1일~7일)</label>
                            <select id="sample-days-select" class="pat-select" style="margin-bottom:0;">
                                <option value="1">1일 (24시간)</option>
                                <option value="2">2일 (48시간)</option>
                                <option value="3" selected>3일 (72시간 · 권장)</option>
                                <option value="4">4일 (96시간)</option>
                                <option value="5">5일 (120시간)</option>
                                <option value="6">6일 (144시간)</option>
                                <option value="7">7일 (168시간)</option>
                            </select>
                        </div>
                        <div>
                            <label class="admin-label">문자 수신 간격</label>
                            <select id="sample-interval-select" class="pat-select" style="margin-bottom:0;">
                                <option value="5" selected>5분 간격</option>
                                <option value="15">15분 간격</option>
                                <option value="30">30분 간격</option>
                            </select>
                        </div>
                    </div>

                    <div style="font-size:11px; color:#9ad8ed; background:rgba(0,0,0,0.25); padding:7px 9px; border-radius:6px; margin-bottom:10px; line-height:1.5;">
                        • <b>🏠 주거/생활 거점:</b> 인천 계양 코아루아파트<br>
                        • <b>🏢 주간/근무 거점:</b> 인천계양경찰서<br>
                        • <b>📱 테스트 번호:</b> 1234-5678 (SKT 측위 형식)
                    </div>

                    <button class="btn btn-green" id="btn-run-sample-gen" style="width:100%; padding:9px; font-weight:800;" onclick="generateRealisticSampleData()">
                        ⚡ 샘플 동선 즉시 생성하기
                    </button>
                </div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalsHtml);
}

// =====================================================================
// ★ 2. 온디바이스 행동패턴 & 핵심 활동반경 분석 엔진 (전원 꺼짐 구간 완전 제외)
// =====================================================================
window.openPatternModal = function() {
    if (!savedSignalsHistory || savedSignalsHistory.length === 0) {
        showAppAlert("분석할 위치추적 데이터가 아직 없습니다.\n문자가 수신되거나 샘플 데이터를 생성한 뒤 다시 시도해 주세요.", "🧠 데이터 없음");
        return;
    }

    const phones = [...new Set(savedSignalsHistory.map(s => s.phone))];
    const selWrap = document.getElementById('pattern-phone-selector-wrap');
    const selEl = document.getElementById('pattern-phone-select');

    let targetPhone = (selectedPhoneFilter !== 'ALL' && phones.includes(selectedPhoneFilter))
        ? selectedPhoneFilter
        : (lastActiveGroup && phones.includes(lastActiveGroup.phone) ? lastActiveGroup.phone : phones[phones.length - 1]);

    if (phones.length > 1) {
        selWrap.style.display = 'block';
        selEl.innerHTML = phones.map(p => {
            const cnt = savedSignalsHistory.filter(s => s.phone === p).length;
            const selectedAttr = (p === targetPhone) ? 'selected' : '';
            return `<option value="${escapeHtml(p)}" ${selectedAttr}>📱 ${escapeHtml(formatPhoneDisplay(p))} (수신 ${cnt}건)</option>`;
        }).join('');
    } else {
        selWrap.style.display = 'none';
    }

    runPatternAnalysis(targetPhone);
    document.getElementById('pattern-modal').style.display = 'flex';
};

window.closePatternModal = function() {
    const modal = document.getElementById('pattern-modal');
    if (modal) modal.style.display = 'none';
};

window.runPatternAnalysis = function(phoneKey) {
    const allSignals = savedSignalsHistory
        .filter(s => s.phone === phoneKey)
        .slice()
        .sort((a, b) => a.dateMs - b.dateMs);

    const bodyEl = document.getElementById('pattern-body');
    if (allSignals.length === 0) {
        lastPatternResult = null;
        bodyEl.innerHTML = `<div class="pat-card"><div class="pat-row">선택한 대상자의 수신 데이터가 없습니다.</div></div>`;
        return;
    }

    // ★ 전원 켜짐(활성) 신호와 꺼짐(오프라인) 신호 분리
    const activeSignals = allSignals.filter(s => !s.isOffline);
    const offlineSignals = allSignals.filter(s => s.isOffline);

    if (activeSignals.length === 0) {
        lastPatternResult = null;
        bodyEl.innerHTML = `
            <div class="pat-card" style="border-color:rgba(255,171,0,0.45);">
                <div class="pat-card-title" style="color:#ffab00;">⚠️ 유효한 활성 위치 데이터 없음</div>
                <div class="pat-row">현재 수신된 ${allSignals.length}건이 모두 <b>단말기 전원 꺼짐</b> 상태입니다.</div>
                <div class="pat-sub">전원 꺼짐 중 기록된 위치는 생활반경 왜곡을 막기 위해 분석에서 제외됩니다. 단말기 전원이 켜진 뒤 수신 데이터가 쌓이면 자동으로 분석됩니다.</div>
            </div>
        `;
        return;
    }

    // 1) 유효 추적 시간 계산 (전원 꺼짐 구간 완전 제외)
    let activeDurationMin = 0;
    let excludedOfflineMin = 0;
    const activeWeights = new Map();

    for (let i = 0; i < allSignals.length; i++) {
        const curr = allSignals[i];
        const prev = i > 0 ? allSignals[i - 1] : null;

        if (!prev) {
            if (!curr.isOffline) activeWeights.set(curr, 5);
            continue;
        }

        const gapMin = Math.max(0, (curr.dateMs - prev.dateMs) / 60000);
        if (prev.isOffline || curr.isOffline) {
            // 꺼짐 구간은 유효 시간에서 제외하고 별도 집계
            excludedOfflineMin += Math.min(gapMin, 720);
            if (!curr.isOffline) activeWeights.set(curr, 5);
        } else {
            // 5분·15분·30분·60분 간격 자동 대응 (2시간 초과는 비연속 공백으로 보고 30분 캡)
            const validGap = (gapMin <= 120) ? gapMin : 30;
            activeDurationMin += validGap;
            activeWeights.set(curr, (gapMin > 0 && gapMin <= 60) ? gapMin : 5);
        }
    }

    const activeSpanHours = activeDurationMin / 60;

    let confLabel, confColor, confDesc;
    if (activeSpanHours < 6) {
        confLabel = "낮음 (초기 참고용)";
        confColor = "#ff5252";
        confDesc = "유효 추적 시간 6시간 미만 — 주·야간 생활 패턴을 확정하기 이른 단계입니다.";
    } else if (activeSpanHours < 24) {
        confLabel = "보통 (단기 흐름)";
        confColor = "#ffab00";
        confDesc = "유효 추적 시간 6~24시간 — 당일 주요 이동 흐름과 단기 체류지 파악이 가능합니다.";
    } else if (activeSpanHours < 66) {
        confLabel = "높음 (생활 패턴 포착)";
        confColor = "#00e5ff";
        confDesc = "유효 추적 시간 1~3일 — 취침지(주거지)와 주간 활동 거점이 뚜렷하게 구분됩니다.";
    } else {
        confLabel = "매우 높음 (거점 확정 수준)";
        confColor = "#00e676";
        confDesc = "유효 추적 시간 약 3일 이상 — 반복 생활권 및 잠복 권장 시간대 신뢰도가 매우 높습니다.";
    }

    const spanText = formatSpanHours(activeSpanHours);
    const excludedText = offlineSignals.length > 0
        ? `꺼짐 ${offlineSignals.length}건(약 ${formatMinutes(excludedOfflineMin)}) 분석 제외됨`
        : '전원 꺼짐 제외 구간 없음';

    // 2) 공간 클러스터링 — ★ 전원 켜짐(activeSignals) 데이터만 사용
    const clusters = [];
    activeSignals.forEach(sig => {
        const durMin = activeWeights.get(sig) || 5;

        let targetCluster = null;
        let bestDist = Infinity;
        for (const cl of clusters) {
            const d = calcDistKm(cl.lat, cl.lng, sig.lat, sig.lng);
            if (d <= 0.35 && d < bestDist) {
                bestDist = d;
                targetCluster = cl;
            }
        }

        if (!targetCluster) {
            targetCluster = {
                lat: sig.lat,
                lng: sig.lng,
                sumLat: 0,
                sumLng: 0,
                count: 0,
                totalMin: 0,
                nightMin: 0,   // 00:00 ~ 06:59 (취침/주거)
                commuteMin: 0, // 07:00 ~ 08:59 (출근)
                dayMin: 0,     // 09:00 ~ 17:59 (주간/근무)
                eveningMin: 0, // 18:00 ~ 23:59 (저녁/귀가)
                hourHist: new Array(24).fill(0),
                addrFreq: {},
                pciFreq: {},
                daysSet: new Set()
            };
            clusters.push(targetCluster);
        }

        targetCluster.sumLat += sig.lat;
        targetCluster.sumLng += sig.lng;
        targetCluster.count += 1;
        targetCluster.lat = targetCluster.sumLat / targetCluster.count;
        targetCluster.lng = targetCluster.sumLng / targetCluster.count;
        targetCluster.totalMin += durMin;

        const dObj = new Date(sig.dateMs);
        const h = dObj.getHours();
        targetCluster.hourHist[h] += durMin;
        targetCluster.daysSet.add(`${dObj.getFullYear()}-${dObj.getMonth() + 1}-${dObj.getDate()}`);

        if (h >= 0 && h < 7) targetCluster.nightMin += durMin;
        else if (h >= 7 && h < 9) targetCluster.commuteMin += durMin;
        else if (h >= 9 && h < 18) targetCluster.dayMin += durMin;
        else targetCluster.eveningMin += durMin;

        const cleanAddr = (sig.address || '').replace(/\s*\(구간보정\)|\s*\(인근보정\)/g, '').trim();
        if (cleanAddr) targetCluster.addrFreq[cleanAddr] = (targetCluster.addrFreq[cleanAddr] || 0) + 1;
        if (sig.pci && sig.pci !== '미상') targetCluster.pciFreq[sig.pci] = (targetCluster.pciFreq[sig.pci] || 0) + 1;
    });

    clusters.forEach(cl => {
        cl.repAddress = getTopKey(cl.addrFreq) || '주소 미상';
        cl.repPci = getTopKey(cl.pciFreq) || '미상';
    });

    const totalTrackedMin = clusters.reduce((acc, c) => acc + c.totalMin, 0) || 1;
    const totalNightMin = clusters.reduce((acc, c) => acc + c.nightMin, 0);
    const totalDayMin = clusters.reduce((acc, c) => acc + c.dayMin, 0);
    const totalEveningMin = clusters.reduce((acc, c) => acc + c.eveningMin, 0);

    // 3) 시간대별 최다 체류 거점 추출
    const homeCluster = totalNightMin > 0
        ? clusters.slice().sort((a, b) => b.nightMin - a.nightMin)[0]
        : null;

    const workCandidates = clusters.slice().sort((a, b) => b.dayMin - a.dayMin);
    const workCluster = (totalDayMin > 0 && workCandidates.length > 0) ? workCandidates[0] : null;
    const isSameHomeWork = (homeCluster && workCluster && homeCluster === workCluster);

    const eveningCluster = totalEveningMin > 0
        ? clusters.slice().sort((a, b) => b.eveningMin - a.eveningMin)[0]
        : null;

    // 4) 핵심 활동반경(상위 80% 밀집 구역) — ★ activeSignals만 산입
    const sampleStep = Math.max(1, Math.floor(activeSignals.length / 150));
    const sampled = [];
    for (let i = 0; i < activeSignals.length; i += sampleStep) sampled.push(activeSignals[i]);

    let medoid = sampled[0];
    let minSumDist = Infinity;
    for (const a of sampled) {
        let sum = 0;
        for (const b of sampled) sum += calcDistKm(a.lat, a.lng, b.lat, b.lng);
        if (sum < minSumDist) {
            minSumDist = sum;
            medoid = a;
        }
    }

    const withDist = activeSignals.map(s => ({ s, d: calcDistKm(medoid.lat, medoid.lng, s.lat, s.lng) }))
        .sort((a, b) => a.d - b.d);
    const coreCount = Math.max(1, Math.ceil(withDist.length * 0.8));
    const coreSlice = withDist.slice(0, coreCount);

    const coreLat = coreSlice.reduce((acc, x) => acc + x.s.lat, 0) / coreSlice.length;
    const coreLng = coreSlice.reduce((acc, x) => acc + x.s.lng, 0) / coreSlice.length;
    let coreRadiusKm = 0;
    for (const x of coreSlice) {
        const d = calcDistKm(coreLat, coreLng, x.s.lat, x.s.lng);
        if (d > coreRadiusKm) coreRadiusKm = d;
    }
    const coreRadiusM = Math.max(250, Math.round(coreRadiusKm * 1000));
    const corePct = Math.round((coreSlice.length / activeSignals.length) * 100);

    // 5) 전원 꺼짐 패턴 (위치 산입 없이 시각 패턴만 참고용으로 요약)
    let offlineSummary = "전원 꺼짐 이력 없음";
    if (offlineSignals.length > 0) {
        const offHours = offlineSignals.map(s => new Date(s.dateMs).getHours());
        const avgOffH = Math.round(offHours.reduce((a, b) => a + b, 0) / offHours.length);
        offlineSummary = `총 ${offlineSignals.length}건 감지 (주로 ${pad2(avgOffH)}시경 · 활동반경 산입 제외)`;
    }

    // 6) 권장 확인(잠복) 시간대 도출
    let recommendText = "유효 추적 데이터가 더 누적되면 권장 시간대가 정밀화됩니다.";
    if (homeCluster && homeCluster.nightMin > 0) {
        const peakHomeHour = findPeakHourRange(homeCluster.hourHist);
        recommendText = `주거 추정지(${shortAddr(homeCluster.repAddress)})는 ${peakHomeHour} 체류 비중이 가장 높습니다.`;
        if (workCluster && !isSameHomeWork) {
            const peakWorkHour = findPeakHourRange(workCluster.hourHist);
            recommendText += ` 주간 거점(${shortAddr(workCluster.repAddress)})은 ${peakWorkHour} 집중 포착됩니다.`;
        }
    }

    lastPatternResult = {
        phoneKey,
        displayPhone: formatPhoneDisplay(phoneKey),
        signalCount: activeSignals.length,
        offlineCount: offlineSignals.length,
        spanText,
        confLabel,
        coreLat,
        coreLng,
        coreRadiusM,
        corePct,
        homeCluster,
        workCluster,
        isSameHomeWork,
        eveningCluster,
        offlineSummary,
        recommendText,
        topClusters: clusters.slice().sort((a, b) => b.totalMin - a.totalMin).slice(0, 3),
        totalTrackedMin,
        totalNightMin,
        totalDayMin
    };

    const homePct = homeCluster && totalNightMin > 0 ? Math.round((homeCluster.nightMin / totalNightMin) * 100) : 0;
    const workPct = workCluster && totalDayMin > 0 ? Math.round((workCluster.dayMin / totalDayMin) * 100) : 0;

    const topHtml = lastPatternResult.topClusters.map((cl, i) => {
        const pct = Math.round((cl.totalMin / totalTrackedMin) * 100);
        return `
            <div style="margin-bottom:6px;">
                <div class="pat-row" style="margin-bottom:1px;">
                    <b>${i + 1}위. ${escapeHtml(cl.repAddress)}</b>
                    <span class="pat-sub">(PCI ${escapeHtml(cl.repPci)} · ${cl.daysSet.size}일 방문 · 약 ${formatMinutes(cl.totalMin)} / ${pct}%)</span>
                </div>
                <div class="pat-bar-wrap"><div class="pat-bar-fill" style="width:${Math.max(4, pct)}%;"></div></div>
            </div>
        `;
    }).join('');

    bodyEl.innerHTML = `
        <div class="pat-card">
            <div class="pat-card-title">
                <span>⏱️ 유효 추적 시간 및 신뢰도</span>
                <span class="pat-badge" style="background:${confColor}22; color:${confColor}; border:1px solid ${confColor};">${confLabel}</span>
            </div>
            <div class="pat-row">• <b>유효 추적 시간:</b> ${spanText} (정상 신호 ${activeSignals.length.toLocaleString()}건)</div>
            <div class="pat-sub">• ${excludedText}</div>
            <div class="pat-sub" style="margin-top:2px;">${confDesc}</div>
        </div>

        <div class="pat-card" style="border-color:rgba(179,136,255,0.45);">
            <div class="pat-card-title" style="color:#d1b3ff;">⭕ 핵심 활동반경 (주요 생활권)</div>
            <div class="pat-row">• <b>반경 규모:</b> 중심점 기준 약 <b>${coreRadiusM >= 1000 ? (coreRadiusM / 1000).toFixed(2) + ' km' : coreRadiusM + ' m'}</b></div>
            <div class="pat-row">• <b>집중도:</b> 정상 포착 신호의 <b>${corePct}%</b>가 이 생활권 안에 집중됨</div>
            <div class="pat-sub">※ 전원 꺼짐 위치 및 일시적 원거리 이동(상위 20%)은 제외했습니다.</div>
        </div>

        <div class="pat-card">
            <div class="pat-card-title">🕒 시간대별 주요 거점 추정</div>
            <div class="pat-row">
                🌙 <b>주거지 추정 (00~07시):</b>
                ${homeCluster ? `<b style="color:#00e676;">${escapeHtml(homeCluster.repAddress)}</b> <span class="pat-sub">(심야 포착률 ${homePct}% · PCI ${escapeHtml(homeCluster.repPci)})</span>` : '<span class="pat-sub">심야 데이터 없음</span>'}
            </div>
            <div class="pat-row">
                ☀️ <b>주간 거점 (09~18시):</b>
                ${workCluster ? `<b style="color:#ffd740;">${escapeHtml(workCluster.repAddress)}</b>${isSameHomeWork ? ' <span class="pat-sub">(주거지와 동일 구역)</span>' : ''} <span class="pat-sub">(주간 포착률 ${workPct}% · PCI ${escapeHtml(workCluster.repPci)})</span>` : '<span class="pat-sub">주간 데이터 없음</span>'}
            </div>
            <div class="pat-row">
                🌆 <b>저녁 생활권 (18~24시):</b>
                ${eveningCluster ? `${escapeHtml(eveningCluster.repAddress)} <span class="pat-sub">(PCI ${escapeHtml(eveningCluster.repPci)})</span>` : '<span class="pat-sub">저녁 데이터 없음</span>'}
            </div>
            <div class="pat-row" style="margin-top:4px; color:#ffab00;">
                ⚫ <b>전원 꺼짐 패턴:</b> ${offlineSummary}
            </div>
        </div>

        <div class="pat-card">
            <div class="pat-card-title">🏆 누적 체류 상위 거점 TOP 3</div>
            ${topHtml}
        </div>

        <div class="pat-card" style="border-color:rgba(0,230,118,0.35);">
            <div class="pat-card-title" style="color:#00e676;">🎯 현장 확인·잠복 요약 브리핑</div>
            <div class="pat-row">${escapeHtml(recommendText)}</div>
        </div>
    `;

    updatePatternMapButtonLabel();
};

window.toggleActivityRadiusOnMap = function() {
    if (!kakaoMap || !lastPatternResult) return;

    if (isPatternOverlayVisible) {
        clearPatternOverlays();
        updatePatternMapButtonLabel();
        sysLog("[활동반경] 지도 위 핵심 활동반경 표시를 숨겼습니다.", "#ffab00");
        return;
    }

    clearPatternOverlays();
    const r = lastPatternResult;
    const center = new kakao.maps.LatLng(r.coreLat, r.coreLng);

    const coreCircle = new kakao.maps.Circle({
        map: kakaoMap,
        center: center,
        radius: r.coreRadiusM,
        strokeWeight: 2.5,
        strokeColor: '#b388ff',
        strokeOpacity: 0.9,
        strokeStyle: 'solid',
        fillColor: '#b388ff',
        fillOpacity: 0.11
    });
    patternOverlays.push(coreCircle);

    const radiusLabelStr = r.coreRadiusM >= 1000 ? `${(r.coreRadiusM / 1000).toFixed(2)}km` : `${r.coreRadiusM}m`;
    const coreLabel = new kakao.maps.CustomOverlay({
        map: kakaoMap,
        position: center,
        content: `<div class="pat-map-tag">⭕ 핵심 활동반경 (${radiusLabelStr} · ${r.corePct}%)</div>`,
        xAnchor: 0.5,
        yAnchor: 1.8,
        zIndex: 15
    });
    patternOverlays.push(coreLabel);

    if (r.homeCluster) {
        const homeOverlay = new kakao.maps.CustomOverlay({
            map: kakaoMap,
            position: new kakao.maps.LatLng(r.homeCluster.lat, r.homeCluster.lng),
            content: `<div class="pat-map-tag home">🏠 주거지 추정 (PCI:${escapeHtml(r.homeCluster.repPci)})</div>`,
            xAnchor: 0.5,
            yAnchor: 2.3,
            zIndex: 16
        });
        patternOverlays.push(homeOverlay);
    }

    if (r.workCluster && !r.isSameHomeWork) {
        const workOverlay = new kakao.maps.CustomOverlay({
            map: kakaoMap,
            position: new kakao.maps.LatLng(r.workCluster.lat, r.workCluster.lng),
            content: `<div class="pat-map-tag work">🏢 주간 거점 추정 (PCI:${escapeHtml(r.workCluster.repPci)})</div>`,
            xAnchor: 0.5,
            yAnchor: 2.3,
            zIndex: 16
        });
        patternOverlays.push(workOverlay);
    }

    isPatternOverlayVisible = true;
    updatePatternMapButtonLabel();
    closePatternModal();
    kakaoMap.panTo(center);
    sysLog(`🧠 [핵심 활동반경 표시] 반경 ${radiusLabelStr} 및 추정 거점을 지도에 표시했습니다.`, "#b388ff");
};

window.clearPatternOverlays = function() {
    patternOverlays.forEach(ov => {
        try { ov.setMap(null); } catch (e) {}
    });
    patternOverlays = [];
    isPatternOverlayVisible = false;
};

function updatePatternMapButtonLabel() {
    const btn = document.getElementById('btn-toggle-pattern-map');
    if (!btn) return;
    btn.innerText = isPatternOverlayVisible ? "🗺️ 활동반경 숨기기" : "🗺️ 지도에 활동반경 표시";
}

window.copyPatternBriefing = function() {
    if (!lastPatternResult) return;
    const r = lastPatternResult;
    const radStr = r.coreRadiusM >= 1000 ? `${(r.coreRadiusM / 1000).toFixed(2)}km` : `${r.coreRadiusM}m`;
    const homeStr = r.homeCluster ? `${r.homeCluster.repAddress} (PCI ${r.homeCluster.repPci})` : '데이터 없음';
    const workStr = r.workCluster ? `${r.workCluster.repAddress} (PCI ${r.workCluster.repPci})` : '데이터 없음';

    const text =
        `[ARGUS 행동패턴 분석 브리핑]\n` +
        `• 대상: 📱 ${r.displayPhone}\n` +
        `• 유효 추적 시간: ${r.spanText} (정상 ${r.signalCount}건 / 꺼짐 ${r.offlineCount}건 제외 · 신뢰도: ${r.confLabel})\n` +
        `• 핵심 활동반경: 약 ${radStr} (신호 ${r.corePct}% 집중)\n` +
        `• 주거지 추정(심야): ${homeStr}\n` +
        `• 주간 거점(09~18시): ${workStr}\n` +
        `• 전원 꺼짐 패턴: ${r.offlineSummary}\n` +
        `• 요약: ${r.recommendText}`;

    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(() => {
            showAppAlert("행동패턴 분석 브리핑이 클립보드에 복사되었습니다.", "📋 복사 완료");
        }).catch(() => fallbackCopyText(text));
    } else {
        fallbackCopyText(text);
    }
};

function fallbackCopyText(str) {
    const t = document.createElement('textarea');
    t.value = str;
    document.body.appendChild(t);
    t.select();
    document.execCommand('copy');
    document.body.removeChild(t);
    showAppAlert("행동패턴 분석 브리핑이 클립보드에 복사되었습니다.", "📋 복사 완료");
}

function getTopKey(freqObj) {
    let bestKey = '';
    let bestVal = -1;
    for (const k in freqObj) {
        if (freqObj[k] > bestVal) {
            bestVal = freqObj[k];
            bestKey = k;
        }
    }
    return bestKey;
}

function shortAddr(addr) {
    if (!addr) return '미상';
    return addr.replace(/^(인천광역시|서울특별시|경기도|인천|서울|경기)\s+/, '').slice(0, 22);
}

function formatSpanHours(hours) {
    if (hours < 1) return `${Math.max(1, Math.round(hours * 60))}분`;
    if (hours < 24) {
        const h = Math.floor(hours);
        const m = Math.round((hours - h) * 60);
        return m > 0 ? `${h}시간 ${m}분` : `${h}시간`;
    }
    const d = Math.floor(hours / 24);
    const h = Math.round(hours % 24);
    return h > 0 ? `${d}일 ${h}시간` : `${d}일`;
}

function formatMinutes(min) {
    const m = Math.round(min);
    if (m < 60) return `${m}분`;
    const h = Math.floor(m / 60);
    const rem = m % 60;
    return rem > 0 ? `${h}시간 ${rem}분` : `${h}시간`;
}

function findPeakHourRange(hourHist) {
    let bestH = 0;
    let bestVal = -1;
    for (let h = 0; h < 24; h++) {
        const windowSum = hourHist[h] + hourHist[(h + 1) % 24] + hourHist[(h + 2) % 24];
        if (windowSum > bestVal) {
            bestVal = windowSum;
            bestH = h;
        }
    }
    const endH = (bestH + 3) % 24;
    return `${pad2(bestH)}:00~${pad2(endH)}:00`;
}

// =====================================================================
// ★ 3. 관리자 패널 (실시간 추적 중 수사관 수 + 누적 통계 + 샘플 생성기)
// =====================================================================
async function fetchCounterVal(action, key) {
    const ns = window.ARGUS_STATS_NS || 'argus-police-hsw';
    try {
        const res = await fetch(`https://counterapi.com/api/${ns}/${action}/${key}?readOnly=true`, { cache: 'no-store' });
        if (!res.ok) return 0;
        const data = await res.json();
        return Number(data.value ?? data.count ?? 0) || 0;
    } catch (e) {
        return null;
    }
}

window.refreshAdminStats = async function() {
    const statsBox = document.getElementById('admin-stats-box');
    if (!statsBox) return;
    statsBox.innerHTML = '📊 실시간 가동 현황을 불러오는 중...';

    const currKst = window.getArgusKstKeys ? window.getArgusKstKeys(0) : null;
    const prevKst = window.getArgusKstKeys ? window.getArgusKstKeys(-1) : null;

    if (!currKst || !prevKst) {
        statsBox.innerHTML = '<span style="color:#ffab00;">통계 모듈 초기화 중입니다.</span>';
        return;
    }

    const [activeNow, activePrev, activeToday, totalUsers, totalLaunches] = await Promise.all([
        fetchCounterVal('active', currKst.hourKey),
        fetchCounterVal('active', prevKst.hourKey),
        fetchCounterVal('daily', currKst.dayKey),
        fetchCounterVal('users', 'total'),
        fetchCounterVal('launches', 'total')
    ]);

    if (totalUsers === null && totalLaunches === null) {
        statsBox.innerHTML = `<span style="color:#ffab00;">통계 서버 연결 실패 (네트워크 확인 필요)</span>`;
        return;
    }

    const nowVal = activeNow || 0;
    const prevVal = activePrev || 0;
    const todayVal = activeToday || 0;
    const usersVal = totalUsers || 0;
    const launchVal = totalLaunches || 0;

    statsBox.innerHTML = `
        <div class="admin-stat-grid">
            <div class="admin-stat-box" style="border-color:rgba(0,230,118,0.45);">
                <div class="admin-stat-label">🟢 현재 추적 중 (${currKst.hourLabel})</div>
                <div class="admin-stat-val" style="color:#00e676;">${nowVal.toLocaleString()} 명</div>
                <div class="pat-sub" style="font-size:9.5px;">직전(${prevKst.hourLabel}): ${prevVal.toLocaleString()}명</div>
            </div>
            <div class="admin-stat-box" style="border-color:rgba(0,229,255,0.4);">
                <div class="admin-stat-label">📅 오늘 추적 참여</div>
                <div class="admin-stat-val" style="color:#00e5ff;">${todayVal.toLocaleString()} 명</div>
                <div class="pat-sub" style="font-size:9.5px;">문자 수신 기준(중복제외)</div>
            </div>
            <div class="admin-stat-box">
                <div class="admin-stat-label">👮 누적 사용 기기</div>
                <div class="admin-stat-val">${usersVal.toLocaleString()} 대</div>
            </div>
            <div class="admin-stat-box">
                <div class="admin-stat-label">🚀 누적 실행 횟수</div>
                <div class="admin-stat-val">${launchVal.toLocaleString()} 회</div>
            </div>
        </div>
        <div class="pat-sub" style="margin-top:6px; font-size:10px; line-height:1.4;">
            ※ '현재 추적 중'은 해당 시간대에 위치추적 문자를 1건 이상 수신한 기기 수입니다. (개인정보·문자내용 미전송)
        </div>
    `;
};

window.openAdminPanel = function() {
    const modal = document.getElementById('admin-modal');
    if (!modal) return;
    modal.style.display = 'flex';
    window.refreshAdminStats();
};

window.closeAdminModal = function() {
    const modal = document.getElementById('admin-modal');
    if (modal) modal.style.display = 'none';
};

function resolvePlaceCoord(keyword, fallback) {
    return new Promise(resolve => {
        if (!kakaoPlaces) {
            resolve(fallback);
            return;
        }
        kakaoPlaces.keywordSearch(keyword, function(res, status) {
            if (status === kakao.maps.services.Status.OK && res && res.length > 0) {
                resolve({
                    lat: parseFloat(res[0].y),
                    lng: parseFloat(res[0].x),
                    address: res[0].road_address_name || res[0].address_name || fallback.address
                });
            } else {
                resolve(fallback);
            }
        });
    });
}

window.generateRealisticSampleData = async function() {
    if (!kakaoMap) {
        showAppAlert("지도가 아직 로드되지 않았습니다.", "⏳ 잠시만 기다려 주세요");
        return;
    }

    const days = parseInt(document.getElementById('sample-days-select').value, 10) || 3;
    const intervalMin = parseInt(document.getElementById('sample-interval-select').value, 10) || 5;
    const btn = document.getElementById('btn-run-sample-gen');
    btn.disabled = true;
    btn.innerText = "⏳ 실제 좌표 조회 및 샘플 생성 중...";

    try {
        const [homePlace, workPlace, lunchPlace, eveningPlace] = await Promise.all([
            resolvePlaceCoord('인천 계양 코아루아파트', {
                lat: 37.5305, lng: 126.7224, address: '인천 계양구 효성동 코아루아파트'
            }),
            resolvePlaceCoord('인천계양경찰서', {
                lat: 37.5376, lng: 126.7375, address: '인천 계양구 계산새로 68 (인천계양경찰서)'
            }),
            resolvePlaceCoord('계산역', {
                lat: 37.5433, lng: 126.7282, address: '인천 계양구 경명대로 1086 (계산역 인근)'
            }),
            resolvePlaceCoord('홈플러스 계산점', {
                lat: 37.5397, lng: 126.7351, address: '인천 계양구 오조산공원로 14 (상권 인근)'
            })
        ]);

        const nowMs = Date.now();
        const startMs = nowMs - (days * 24 * 60 * 60 * 1000);
        const stepMs = intervalMin * 60 * 1000;
        const samplePhone = '1234-5678';
        const batchList = [];

        for (let t = startMs; t <= nowMs; t += stepMs) {
            const d = new Date(t);
            const dow = d.getDay();
            const isWeekend = (dow === 0 || dow === 6);
            const hm = d.getHours() * 60 + d.getMinutes();

            let spot = homePlace;
            let pci = '281';
            let btsAddr = homePlace.address;
            let jitterM = 14;
            let isOffline = false;

            if (!isWeekend) {
                if (hm < 460) {
                    spot = homePlace; pci = '281';
                    if (d.getDate() % 2 === 0 && hm >= 120 && hm < 140) isOffline = true;
                } else if (hm < 500) {
                    const ratio = (hm - 460) / 40;
                    spot = interpolatePlace(homePlace, workPlace, ratio, '인천 계양구 이동 구간 (출근)');
                    pci = ratio < 0.5 ? '281' : '415';
                    jitterM = 25;
                } else if (hm < 720) {
                    spot = workPlace; pci = '415';
                } else if (hm < 780) {
                    spot = lunchPlace; pci = '312';
                } else if (hm < 1080) {
                    spot = workPlace; pci = '415';
                } else if (hm < 1120) {
                    const ratio = (hm - 1080) / 40;
                    spot = interpolatePlace(workPlace, homePlace, ratio, '인천 계양구 이동 구간 (퇴근)');
                    pci = ratio < 0.5 ? '415' : '281';
                    jitterM = 25;
                } else if (hm < 1230 && d.getDate() % 2 === 1) {
                    spot = eveningPlace; pci = '319';
                } else {
                    spot = homePlace; pci = '281';
                }
            } else {
                if (hm < 660) {
                    spot = homePlace; pci = '281';
                } else if (hm < 960) {
                    spot = eveningPlace; pci = '319';
                } else {
                    spot = homePlace; pci = '281';
                }
            }

            const jittered = addMeterJitter(spot.lat, spot.lng, jitterM);
            const timeStr = `${pad2(d.getMonth() + 1)}/${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;

            batchList.push({
                lat: jittered.lat,
                lng: jittered.lng,
                parsed: {
                    phone: samplePhone,
                    address: spot.address,
                    pci: pci,
                    carrier: 'SKT',
                    netType: '5G',
                    cellType: '중계기',
                    radius: null,
                    isEstimatedPos: true,
                    btsAddress: btsAddr,
                    posAddress: spot.address,
                    dateObj: d,
                    timeStr: timeStr,
                    isOffline: isOffline
                }
            });
        }

        if (typeof window.batchImportSignals === 'function') {
            window.batchImportSignals(batchList);
        }

        closeAdminModal();
        sysLog(`🧪 [샘플 생성 완료] 최근 ${days}일(${intervalMin}분 간격, 총 ${batchList.length}건) 생활 패턴 동선을 생성했습니다.`, "#b388ff");
        showAppAlert(
            `최근 ${days}일(${intervalMin}분 간격, 총 ${batchList.length.toLocaleString()}건) 샘플 데이터가 지도에 반영되었습니다.\n\n지도 좌측 상단의 [🧠 패턴 분석] 버튼을 눌러 핵심 활동반경과 주거/주간 거점 분석 결과를 확인해 보세요!`,
            "🧪 테스트 샘플 생성 완료"
        );
    } catch (err) {
        showAppAlert("샘플 생성 중 오류가 발생했습니다: " + (err.message || err), "⚠️ 오류");
    } finally {
        btn.disabled = false;
        btn.innerText = "⚡ 샘플 동선 즉시 생성하기";
    }
};

function interpolatePlace(p1, p2, ratio, label) {
    return {
        lat: p1.lat + (p2.lat - p1.lat) * ratio,
        lng: p1.lng + (p2.lng - p1.lng) * ratio,
        address: label
    };
}

function addMeterJitter(lat, lng, maxMeters) {
    const angle = Math.random() * Math.PI * 2;
    const dist = Math.random() * maxMeters;
    const dLat = (dist * Math.cos(angle)) / 111320;
    const dLng = (dist * Math.sin(angle)) / (111320 * Math.cos(lat * Math.PI / 180));
    return { lat: lat + dLat, lng: lng + dLng };
}
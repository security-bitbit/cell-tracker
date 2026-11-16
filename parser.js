// =====================================================================
// ★ [문자 파서 및 날짜/시간 유틸리티 모듈] ★
// =====================================================================

// Date 객체를 "MM.DD. HH:mm" 형태로 포맷팅 (일 뒤에도 마침표 추가!)
function formatDateTimeShort(dateObj) {
    if (!dateObj || isNaN(dateObj.getTime())) return "-";
    const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
    const dd = String(dateObj.getDate()).padStart(2, '0');
    const hh = String(dateObj.getHours()).padStart(2, '0');
    const min = String(dateObj.getMinutes()).padStart(2, '0');
    return `${mm}.${dd}. ${hh}:${min}`;
}

// 문자 내 날짜/시간 문자열을 Date 객체와 "MM.DD. HH:mm" 문자열로 변환
function parseDateTimeInfo(rawDateStr, rawTimeStr) {
    const now = new Date();
    let yr = now.getFullYear();
    let mo = now.getMonth();
    let da = now.getDate();
    let hh = now.getHours();
    let mi = now.getMinutes();
    let se = 0;

    if (rawTimeStr) {
        const tParts = rawTimeStr.split(':');
        hh = parseInt(tParts[0], 10);
        mi = parseInt(tParts[1], 10);
        if (tParts[2]) se = parseInt(tParts[2], 10);
    }

    if (rawDateStr) {
        const dParts = rawDateStr.split(/[-./]/).filter(Boolean);
        if (dParts.length === 3) {
            yr = parseInt(dParts[0], 10);
            if (yr < 100) yr += 2000;
            mo = parseInt(dParts[1], 10) - 1;
            da = parseInt(dParts[2], 10);
        } else if (dParts.length === 2) {
            mo = parseInt(dParts[0], 10) - 1;
            da = parseInt(dParts[1], 10);
        }
    }

    const resultDate = new Date(yr, mo, da, hh, mi, se);
    if (!rawDateStr && (resultDate.getTime() - now.getTime() > 60000)) {
        resultDate.setDate(resultDate.getDate() - 1);
    }

    return {
        dateObj: resultDate,
        displayStr: formatDateTimeShort(resultDate)
    };
}

// 두 Date 객체 사이의 분(minute) 차이를 한글 문자열로 변환
function formatDurationMin(startDate, endDate) {
    if (!startDate || !endDate) return "0분";
    const diffMs = Math.max(0, endDate.getTime() - startDate.getTime());
    const totalMin = Math.floor(diffMs / 60000);
    if (totalMin < 1) {
        const sec = Math.floor(diffMs / 1000);
        return sec > 0 ? `${sec}초` : "1분 미만";
    }
    if (totalMin < 60) return `${totalMin}분`;
    const hrs = Math.floor(totalMin / 60);
    const mins = totalMin % 60;
    return mins > 0 ? `${hrs}시간 ${mins}분` : `${hrs}시간`;
}

// 통신사 기지국 문자 통합 파서 (SKT, KT, LGU+ 모든 양식 대응)
function parseSmsContent(text) {
    let working = text.replace(/[\r\n]+/g, ' ').replace(/\[\s*Web\s*발신\s*\]/gi, ' ');
    let phone = null;
    let rawDate = null;
    let rawTime = null;

    // Step 0: LG U+ 특화 날짜·시간 포맷 우선 추출 -> 예: "[0611-17:12]"
    const lguDateTimeRegex = /\[?\s*(\d{2})(\d{2})\s*[-./]\s*(\d{1,2}:\d{2}(?::\d{2})?)\s*\]?/;
    const lguDtMatch = working.match(lguDateTimeRegex);
    if (lguDtMatch) {
        const mm = parseInt(lguDtMatch[1], 10);
        const dd = parseInt(lguDtMatch[2], 10);
        if (mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31) {
            rawDate = `${lguDtMatch[1]}-${lguDtMatch[2]}`;
            rawTime = lguDtMatch[3];
            working = working.replace(lguDtMatch[0], ' ');
        }
    }

    // Step 1: 전체 번호(010-1234-5678), 마스킹 번호(010-****-5678), 또는 8자리 번호(39504786) 추출 -> 뒷 4자리("#4786")로 통일
    const fullOrMaskedPhoneRegex = /(?:01[016789][-.\s]?(?:\d{3,4}|\*{3,4})[-.\s]?(\d{4}))|(?:\*{2,4}[-.\s]?(\d{4}))/;
    const fmMatch = working.match(fullOrMaskedPhoneRegex);
    if (fmMatch) {
        const last4 = fmMatch[1] || fmMatch[2];
        phone = `#${last4}`;
        working = working.replace(fmMatch[0], ' ');
    } else {
        const eightDigitPhoneRegex = /(?:^|[\s\[\]()\/,-])(\d{4})[-.\s]?(\d{4})(?=$|[\s\[\]()\/,-])/;
        const edMatch = working.match(eightDigitPhoneRegex);
        if (edMatch) {
            const first4 = parseInt(edMatch[1], 10);
            if (first4 < 1990 || first4 > 2035) {
                phone = `#${edMatch[2]}`;
                working = working.replace(edMatch[0], ' ');
            }
        }
    }

    // Step 2: 전원 꺼짐 키워드 감지 ('(전원 꺼짐)', '꺼짐-' 등 모두 포함)
    const offlineRegex = /\(\s*전원\s*꺼짐\s*\)|\[\s*전원\s*꺼짐\s*\]|전원\s*꺼짐|전원꺼짐|\(\s*꺼짐\s*\)|\[\s*꺼짐\s*\]|꺼짐\s*[-:/]|(?:^|\s)꺼짐(?=\s|$|-)|오프라인|착신\s*불가|전원\s*종료/i;
    const isOffline = offlineRegex.test(working);
    working = working.replace(offlineRegex, ' ');

    // Step 3: 일반 날짜 및 시간 추출
    if (!rawTime) {
        const fullDateTimeRegex = /(\d{2,4}[-./]\d{1,2}[-./]\d{1,2}|\d{1,2}[-./]\d{1,2})\.?\s+(\d{1,2}:\d{2}(?::\d{2})?)/;
        const fullMatch = working.match(fullDateTimeRegex);
        if (fullMatch) {
            rawDate = fullMatch[1];
            rawTime = fullMatch[2];
            working = working.replace(fullMatch[0], ' ');
        } else {
            const timeOnlyRegex = /(\d{1,2}:\d{2}(?::\d{2})?)/;
            const timeMatch = working.match(timeOnlyRegex);
            if (timeMatch) {
                rawTime = timeMatch[1];
                working = working.replace(timeMatch[0], ' ');
            }
        }
    }
    const dtInfo = parseDateTimeInfo(rawDate, rawTime);

    // Step 4: 명시적 라벨이 붙은 PCI/CPI 추출
    let pci = null;
    const explicitPci = working.match(/(?:PCI|CPI)\s*[:=\-]?\s*(\d{1,4})/i);
    if (explicitPci) {
        pci = explicitPci[1];
        working = working.replace(explicitPci[0], ' ');
    }

    // Step 5: 명시적 라벨이 붙은 4자리 전화번호 추출
    if (!phone) {
        const labeledPhone = working.match(/(?:번호|대상|단말기|뒷자리|휴대폰|고객|#)\s*[:=\-]?\s*(\d{4})(?!\d)/);
        if (labeledPhone) {
            phone = `#${labeledPhone[1]}`;
            working = working.replace(labeledPhone[0], ' ');
        }
    }

    // Step 6: 대한민국 주소 영역 분리
    let extractedAddr = null;
    const korAddrRegex = /((?:서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충북|충남|전북|전남|경북|경남|제주|[가-힣]+(?:시|도|군|구))\s+[가-힣0-9\s\-]+(?:번길|로|길|동|읍|면|리|가)\s*[0-9\-산번지]*)/;
    const addrMatch = working.match(korAddrRegex);
    if (addrMatch) {
        extractedAddr = addrMatch[1].trim();
        working = working.replace(addrMatch[0], ' ');
    }

    // Step 7: 대괄호 `[숫자]` 및 소괄호 `(숫자)` 토큰 분석
    const bracketRegex = /\[\s*(\d{1,4})\s*\]|\(\s*(\d{1,4})\s*\)/g;
    let bMatch;
    const bracketTokens = [];
    while ((bMatch = bracketRegex.exec(working)) !== null) {
        bracketTokens.push({ full: bMatch[0], digits: bMatch[1] || bMatch[2] });
    }
    bracketTokens.forEach(t => { working = working.replace(t.full, ' '); });

    if (bracketTokens.length >= 2) {
        const fourDigitIdx = bracketTokens.findIndex(t => t.digits.length === 4);
        if (!phone && fourDigitIdx !== -1) {
            phone = `#${bracketTokens[fourDigitIdx].digits}`;
            bracketTokens.splice(fourDigitIdx, 1);
        }
        if (!pci && bracketTokens.length > 0) {
            pci = bracketTokens[0].digits;
        }
    } else if (bracketTokens.length === 1) {
        const d = bracketTokens[0].digits;
        const numVal = parseInt(d, 10);
        if (pci && !phone && d.length === 4) {
            phone = `#${d}`;
        } else if (phone && !pci) {
            pci = d;
        } else if (!phone && !pci) {
            if (d.length === 4 && (numVal > 1007 || d.startsWith('0'))) {
                phone = `#${d}`;
            } else {
                pci = d;
            }
        }
    }

    // Step 8: 독립 4자리 숫자 전화번호 확인
    if (!phone) {
        const standalone4 = working.match(/(?:^|\s|\/|,|:)(\d{4})(?=\s|$|\/|,|\)|\]|-)/);
        if (standalone4) {
            phone = `#${standalone4[1]}`;
            working = working.replace(standalone4[1], ' ');
        }
    }

    // Step 9: 독립 1~3자리 숫자 PCI 확인
    if (!pci) {
        const standalonePci = working.match(/(?:^|\s|\/|,|:)(\d{1,3})(?=\s|$|\/|,|\)|\])/);
        if (standalonePci) {
            pci = standalonePci[1];
        }
    }

    if (!extractedAddr) {
        extractedAddr = working
            .replace(/\[.*?\]/g, ' ')
            .replace(/\(.*?\)/g, ' ')
            .replace(/(조회시간|기지국주소|기지국위치|위치정보|대상번호|전화번호|휴대폰|주소|시간|발신|회신|PCI|CPI)\s*[:=\-]?/gi, ' ')
            .replace(/\s+(인근|일대|주변|부근|앞|뒤|내|기지국|옥상|철탑).*$/g, '')
            .replace(/^[\s\-:/|,]+/, '')
            .replace(/\s+/g, ' ')
            .trim();
    } else {
        extractedAddr = extractedAddr
            .replace(/\s+(인근|일대|주변|부근|앞|뒤|내|기지국|옥상|철탑).*$/g, '')
            .replace(/^[\s\-:/|,]+/, '')
            .trim();
    }

    return {
        phone: phone || "번호미상",
        address: extractedAddr,
        pci: pci || "미상",
        dateObj: dtInfo.dateObj,
        timeStr: dtInfo.displayStr, // "MM.DD. HH:mm" 형태
        isOffline: isOffline
    };
}
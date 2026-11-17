// =====================================================================
// ★ [SKT / KT / LGU+ 기지국 위치추적 문자 통합 파서 모듈 - LGU+ 괄호 PCI 완벽 대응] ★
// =====================================================================

function parseSmsContent(rawText) {
    // 줄바꿈 및 불필요한 공백 정리, [Web발신] 태그 제거
    let text = rawText.replace(/\r\n|\r|\n/g, ' ').replace(/\[Web발신\]/gi, '').trim();

    // 1. 전원 꺼짐 / 켜짐(위치확인) 상태 판별
    const isOffline = /(꺼짐|전원\s*꺼짐|전원꺼짐|착신전환|통화불가|오프라인|해지|정지|불가|OFF)/i.test(text);

    // 2. 전화번호 추출 (가운뎃자리-뒷자리 8자리 전체 보존으로 가족/동일 뒷번호 완벽 분리)
    let phone = "번호미상";
    // 패턴 A: 010-3950-4786 또는 01039504786 형태
    const mobileMatch = text.match(/01[016789][-\s.]?(\d{3,4})[-\s.]?(\d{4})/);
    // 패턴 B: [281]39504786 형태 (LGU+ 등)
    const lgPhoneMatch = text.match(/(?:\[\s*\d{1,4}\s*\]|\(\s*\d{1,4}\s*\))\s*(\d{7,11})/);
    // 패턴 C: 3950-4786 형태
    const hyphen8Match = text.match(/(?:^|\D)(\d{3,4})-(\d{4})(?:\D|$)/);
    // 패턴 D: 연속 8자리 숫자 (39504786)
    const plain8Match = text.match(/(?:^|\D)(\d{4})(\d{4})(?:\D|$)/);

    if (mobileMatch) {
        phone = `${mobileMatch[1]}-${mobileMatch[2]}`;
    } else if (lgPhoneMatch) {
        const numStr = lgPhoneMatch[1];
        const mid = numStr.slice(-8, -4);
        const last = numStr.slice(-4);
        phone = mid ? `${mid}-${last}` : last;
    } else if (hyphen8Match) {
        phone = `${hyphen8Match[1]}-${hyphen8Match[2]}`;
    } else if (plain8Match) {
        phone = `${plain8Match[1]}-${plain8Match[2]}`;
    }

    // 3. 날짜 및 시간 추출
    let dateObj = new Date();
    let timeStr = formatTimeHM(dateObj);

    // 패턴 A: LGU+ 등 [MMdd-HH:mm] 또는 [MM/dd HH:mm] 형태 (예: [0611-17:12])
    const bracketDateMatch = text.match(/\[\s*(\d{2})[-/.]?(\d{2})[-\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*\]/);
    // 패턴 B: 일반 날짜+시간 (예: 2026-06-11 17:12, 06/11 17:12:30)
    const generalDateMatch = text.match(/(?:(\d{4})[-/.])?(\d{1,2})[-/.](\d{1,2})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?/);
    // 패턴 C: 시간만 있는 경우 (예: 17:12:30 또는 17:12)
    const timeOnlyMatch = text.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);

    if (bracketDateMatch) {
        const month = parseInt(bracketDateMatch[1], 10) - 1;
        const day = parseInt(bracketDateMatch[2], 10);
        const hour = parseInt(bracketDateMatch[3], 10);
        const min = parseInt(bracketDateMatch[4], 10);
        const sec = bracketDateMatch[5] ? parseInt(bracketDateMatch[5], 10) : 0;
        dateObj = new Date(dateObj.getFullYear(), month, day, hour, min, sec);
        timeStr = `${ pad2(month + 1) }/${ pad2(day) } ${ pad2(hour) }:${ pad2(min) }`;
    } else if (generalDateMatch) {
        const year = generalDateMatch[1] ? parseInt(generalDateMatch[1], 10) : dateObj.getFullYear();
        const month = parseInt(generalDateMatch[2], 10) - 1;
        const day = parseInt(generalDateMatch[3], 10);
        const hour = parseInt(generalDateMatch[4], 10);
        const min = parseInt(generalDateMatch[5], 10);
        const sec = generalDateMatch[6] ? parseInt(generalDateMatch[6], 10) : 0;
        dateObj = new Date(year, month, day, hour, min, sec);
        timeStr = `${ pad2(month + 1) }/${ pad2(day) } ${ pad2(hour) }:${ pad2(min) }`;
    } else if (timeOnlyMatch) {
        const hour = parseInt(timeOnlyMatch[1], 10);
        const min = parseInt(timeOnlyMatch[2], 10);
        const sec = timeOnlyMatch[3] ? parseInt(timeOnlyMatch[3], 10) : 0;
        dateObj.setHours(hour, min, sec, 0);
        timeStr = `${ pad2(hour) }:${ pad2(min) }`;
    }

    // ★ 4. PCI 값 추출 (SKT/KT 명시형 + LGU+ 앞쪽 괄호 `[281]` 또는 `(281)` 형태 완벽 지원) ★
    let pci = "미상";

    // (1순위) 'PCI: 281', 'PCI=281', 'CPI 281' 등 명시적 키워드가 있는 경우
    const explicitPciMatch = text.match(/(?:PCI|CPI|물리ID|기지국ID)\s*[:=\-]?\s*(\d{1,4})/i);
    if (explicitPciMatch) {
        pci = explicitPciMatch[1];
    } else {
        // (2순위) LGU+ 형태: 문자 내 대괄호 [숫자] 또는 소괄호 (숫자) 전수 조사
        // 예: "[281]39504786[0611-17:12]꺼짐-인천..." 또는 "(281) 39504786..."
        const bracketNumbers = [...text.matchAll(/[\[\(]\s*(\d{1,4})\s*[\]\)]/g)];
        for (const match of bracketNumbers) {
            const candidate = match[1];
            const numVal = parseInt(candidate, 10);
            // LTE/5G PCI 범위(0 ~ 1007) 내의 순수 숫자 괄호를 찾으면 즉시 PCI로 채택
            if (!isNaN(numVal) && numVal >= 0 && numVal <= 1007) {
                pci = candidate;
                break;
            }
        }
    }

    // 5. 대한민국 주소 추출
    let address = "";
    // 불필요한 앞부분([PCI], 전화번호, [날짜시간], 켜짐/꺼짐 표시 등)을 먼저 걷어낸 클린 텍스트 생성
    let cleanedForAddr = text
        .replace(/\[\s*\d{1,4}\s*\]/g, ' ')
        .replace(/\(\s*\d{1,4}\s*\)/g, ' ')
        .replace(/\[\s*\d{2}[-/.]?\d{2}[-\s]+\d{1,2}:\d{2}(?::\d{2})?\s*\]/g, ' ')
        .replace(/(?:PCI|CPI)\s*[:=\-]?\s*\d{1,4}/gi, ' ')
        .replace(/(01[016789])[-\s.]?\d{3,4}[-\s.]?\d{4}/g, ' ')
        .replace(/\b\d{3,4}-\d{4}\b/g, ' ')
        .replace(/\b\d{7,11}\b/g, ' ')
        .replace(/(전원\s*꺼짐|전원꺼짐|꺼짐|켜짐|정상|위치확인|착신전환|통화불가)\s*[-:\/]?/g, ' ')
        .trim();

    const krAddrRegex = /((?:서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충북|충남|전북|전남|경북|경남|제주|충청북도|충청남도|전라북도|전라남도|경상북도|경상남도|강원특별자치도|전북특별자치도|[가-힣]{2,5}(?:시|도|군|구))\s+[가-힣0-9\s\-]+?(?:로|길|동|읍|면|리|가)\s*(?:산\s*)?\d+(?:-\d+)?(?:\s*번지)?)/;
    const krAddrFallbackRegex = /((?:서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충북|충남|전북|전남|경북|경남|제주|충청북도|충청남도|전라북도|전라남도|경상북도|경상남도|강원특별자치도|전북특별자치도|[가-힣]{2,5}(?:시|도|군|구))\s+[가-힣0-9\s\-]+?(?:로|길|동|읍|면|리|가))/;

    const exactMatch = cleanedForAddr.match(krAddrRegex);
    if (exactMatch) {
        address = exactMatch[1].trim();
    } else {
        const fallbackMatch = cleanedForAddr.match(krAddrFallbackRegex);
        if (fallbackMatch) {
            address = fallbackMatch[1].trim();
        }
    }

    // 주소 뒤쪽에 붙은 잔여 기호 정리
    address = address.replace(/\s+/g, ' ').replace(/[-_,./]+$/, '').trim();

    return {
        phone,
        address,
        pci,
        dateObj,
        timeStr,
        isOffline
    };
}

function pad2(n) {
    return n < 10 ? '0' + n : '' + n;
}

function formatTimeHM(d) {
    return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function formatDateTimeShort(d) {
    return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

function formatDurationMin(startDate, endDate) {
    if (!startDate || !endDate) return "0분";
    const diffMs = Math.max(0, endDate.getTime() - startDate.getTime());
    const totalMin = Math.floor(diffMs / 60000);
    if (totalMin < 1) return "1분 미만";
    if (totalMin < 60) return `${totalMin}분`;
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    return m > 0 ? `${h}시간 ${m}분` : `${h}시간`;
}
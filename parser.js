// =====================================================================
// ★ [SKT / KT / LGU+ 기지국 위치추적 문자 통합 파서 모듈 - 번길/도로명 절단 원천 해결본] ★
// =====================================================================

function parseSmsContent(rawText) {
    // 줄바꿈 및 불필요한 공백 정리, [Web발신] 태그 제거
    let text = rawText.replace(/\r\n|\r|\n/g, ' ').replace(/\[Web발신\]/gi, '').trim();

    // 1. 전원 꺼짐 / 켜짐(위치확인) 상태 판별
    const isOffline = /(꺼짐|전원\s*꺼짐|전원꺼짐|착신전환|통화불가|오프라인|해지|정지|불가|OFF)/i.test(text);

    // 2. 전화번호 추출 (가운뎃자리-뒷자리 8자리 전체 보존)
    let phone = "번호미상";
    const mobileMatch = text.match(/01[016789][-\s.]?(\d{3,4})[-\s.]?(\d{4})/);
    const lgPhoneMatch = text.match(/(?:\[\s*\d{1,4}\s*\]|\(\s*\d{1,4}\s*\))\s*(\d{7,11})/);
    const hyphen8Match = text.match(/(?:^|\D)(\d{3,4})-(\d{4})(?:\D|$)/);
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

    const bracketDateMatch = text.match(/\[\s*(\d{2})[-/.]?(\d{2})[-\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*\]/);
    const generalDateMatch = text.match(/(?:(\d{4})[-/.])?(\d{1,2})[-/.](\d{1,2})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?/);
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

    // 4. PCI 값 추출
    let pci = "미상";
    const explicitPciMatch = text.match(/(?:PCI|CPI|물리ID|기지국ID)\s*[:=\-]?\s*(\d{1,4})/i);
    if (explicitPciMatch) {
        pci = explicitPciMatch[1];
    } else {
        const bracketNumbers = [...text.matchAll(/[\[\(]\s*(\d{1,4})\s*[\]\)]/g)];
        for (const match of bracketNumbers) {
            const candidate = match[1];
            const numVal = parseInt(candidate, 10);
            if (!isNaN(numVal) && numVal >= 0 && numVal <= 1007) {
                pci = candidate;
                break;
            }
        }
    }

    // ★ 5. 대한민국 주소 추출 (최소 매칭 '+?' 제거 및 단계별 우선순위 매칭으로 '번길' 절단 완전 해결) ★
    let address = "";
    let cleanedForAddr = text
        .replace(/\[\s*\d{1,4}\s*\]/g, ' ')
        .replace(/\(\s*\d{1,4}\s*\)/g, ' ')
        .replace(/\[\s*\d{2}[-/.]?\d{2}[-\s]+\d{1,2}:\d{2}(?::\d{2})?\s*\]/g, ' ')
        .replace(/(?:PCI|CPI|물리ID|기지국ID)\s*[:=\-]?\s*\d{1,4}/gi, ' ')
        .replace(/(01[016789])[-\s.]?\d{3,4}[-\s.]?\d{4}/g, ' ')
        .replace(/\b\d{3,4}-\d{4}\b/g, ' ')
        .replace(/\b\d{7,11}\b/g, ' ')
        .replace(/(전원\s*꺼짐|전원꺼짐|꺼짐|켜짐|정상|위치확인|착신전환|통화불가)\s*[-:\/]?/g, ' ')
        .trim();

    // 시/도 시작 위치 탐색
    const sidoStartRegex = /(서울특별시|서울시|서울|부산광역시|부산시|부산|대구광역시|대구시|대구|인천광역시|인천시|인천|광주광역시|광주시|광주|대전광역시|대전시|대전|울산광역시|울산시|울산|세종특별자치시|세종시|세종|경기도|경기|강원특별자치도|강원도|강원|충청북도|충북|충청남도|충남|전북특별자치도|전라북도|전북|전라남도|전남|경상북도|경북|경상남도|경남|제주특별자치도|제주도|제주|[가-힣]{2,4}(?:시|도|군|구))\s+/;

    const startMatch = cleanedForAddr.match(sidoStartRegex);
    if (startMatch) {
        const fromSido = cleanedForAddr.slice(startMatch.index).trim();

        // 1순위: '~번길 39', '~번안길 12-3' 등 '번길/길'이 포함된 도로명 주소 먼저 검사 (절대 '로73'에서 먼저 끊기지 않음!)
        const bungilMatch = fromSido.match(/^([가-힣0-9\s\-]+?(?:번[가-힣]*길|[가-힣0-9]+길)\s*(?:산\s*)?\d+(?:-\d+)?(?:\s*번지)?)/);
        // 2순위: 일반 '~로 123', '~대로 45' 도로명 주소 검사 (뒤에 '번길'이 이어지지 않을 때만 매칭)
        const roadMatch = fromSido.match(/^([가-힣0-9\s\-]+?(?:대로|로)(?!\s*\d+\s*번)\s*(?:산\s*)?\d+(?:-\d+)?(?:\s*번지)?)/);
        // 3순위: 일반 지번 주소 ('~동 123-4', '~읍/면/리/가 123') 검사
        const jibunMatch = fromSido.match(/^([가-힣0-9\s\-]+?(?:동|읍|면|리|가)\s*(?:산\s*)?\d+(?:-\d+)?(?:\s*번지)?)/);
        // 4순위: 건물번호가 없는 경우 ('~번길', '~로', '~동' 까지만 있는 경우)
        const fallbackMatch = fromSido.match(/^([가-힣0-9\s\-]+(?:번[가-힣]*길|대로|로|길|동|읍|면|리|가))/);

        if (bungilMatch) {
            address = bungilMatch[1].trim();
        } else if (roadMatch) {
            address = roadMatch[1].trim();
        } else if (jibunMatch) {
            address = jibunMatch[1].trim();
        } else if (fallbackMatch) {
            address = fallbackMatch[1].trim();
        } else {
            address = fromSido;
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
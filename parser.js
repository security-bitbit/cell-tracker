// =====================================================================
// ★ [아르고스(ARGUS) SKT / KT / LGU+ 실시간 위치추적 문자 통합 파서 v2.3] ★
// - SKT: [위치자료](측위)/[발신기지국] 분리, T-map 좌표 직결, 5G 'i' 제거,
//        타사 회신 무공백 주소 복원, 분할 문자 2부(06:33,N) 파싱, 020/010 인식
// - KT : 3G/4G/5G, L(PCI)/g(PN), r(반경), D:일시, C(켜짐)/P(꺼짐):뒷5자리
// - LGU+: 2G/4G/5G, [PCI]/[gPN], 8자리 번호, 꺼짐/음영, (일반)/-0번지/상호명 정제
// =====================================================================

function parseSmsContent(rawText, senderNumber = '') {
    const text = String(rawText || '')
        .replace(/[\u200B-\u200D\uFEFF\u00A0]/g, ' ')
        .replace(/\r\n|\r|\n/g, ' ')
        .replace(/[\[\(]\s*(?:Web|웹)\s*발신\s*[\]\)]/gi, ' ')
        .replace(/제목\s*:\s*(?:CSMS|[^\s]{1,12})?/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    if (!text) return createEmptyParsedResult();

    if (isSktFormat(text)) {
        return parseSktSms(text, senderNumber);
    }
    if (isKtFormat(text)) {
        return parseKtSms(text);
    }
    if (isLguFormat(text)) {
        return parseLguSms(text);
    }
    return parseGenericSms(text, senderNumber);
}

// ★ SKT 타사 회신 시 2부로 따로 도착하는 시간·전원상태 문자 판별기
// 예: "[Web발신]\n06:33,N" | "[Web 발신] 06:33, N" | "05-28 06:33,Y"
function parseSktSplitTail(rawText) {
    const cleaned = String(rawText || '')
        .replace(/[\u200B-\u200D\uFEFF\u00A0]/g, ' ')
        .replace(/\r\n|\r|\n/g, ' ')
        .replace(/[\[\(]\s*(?:Web|웹)\s*발신\s*[\]\)]/gi, ' ')
        .replace(/제목\s*:\s*(?:CSMS|[^\s]{1,12})?/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    const m = cleaned.match(/^,?\s*(?:(\d{2})-(\d{2})\s+)?(\d{1,2})\s*:\s*(\d{2})\s*,\s*([YN])$/i);
    if (!m) return null;

    return {
        month: m[1] ? parseInt(m[1], 10) - 1 : null,
        day: m[2] ? parseInt(m[2], 10) : null,
        hour: parseInt(m[3], 10),
        min: parseInt(m[4], 10),
        isOffline: (m[5].toUpperCase() === 'N')
    };
}

function createEmptyParsedResult() {
    const now = new Date();
    return {
        carrier: '기타',
        netType: '',
        cellType: '',
        phone: '번호미상',
        address: '',
        searchAddress: '',
        fallbackAddress: '',
        isEstimatedPos: false,
        btsAddress: '',
        posAddress: '',
        pci: '미상',
        radius: null,
        directLat: null,
        directLng: null,
        dateObj: now,
        timeStr: formatTimeHM(now),
        isOffline: false,
        isIncompleteSkt: false
    };
}

// =====================================================================
// ★ 1. SKT 파서 (3G / 4G / 5G / 타사 회신)
// =====================================================================
function isSktFormat(text) {
    return (
        /\[발신기지국\]|\[위치자료\]|tmap\.co\.kr/i.test(text) ||
        /\d{1,4}\s*\(\s*(?:중계기|기지국|옥외|옥내|인빌딩)\s*\)/.test(text) ||
        /[a-zA-Z]\s*\(\s*\d{1,4}\s*\)\s*,\s*\d{2}-?\d{2}\s+\d{1,2}\s*:\s*\d{2}\s*,\s*[YN]\b/i.test(text)
    );
}

function parseSktSms(text, senderNumber) {
    const result = createEmptyParsedResult();
    result.carrier = 'SKT';

    // 1) 전화번호 추출 (020 + 테스트용 010/01x)
    let senderDigits = String(senderNumber || '').replace(/\D/g, '');
    if (senderDigits.startsWith('82') && senderDigits.length >= 11) {
        senderDigits = '0' + senderDigits.slice(2);
    }

    const senderMatch = senderDigits.match(/^(?:020|01[016789])(\d{3,4})(\d{4})$/);
    const bodyPhoneMatch = text.match(/(?:020|01[016789])[-\s.]?(\d{3,4})[-\s.]?(\d{4})/);

    if (senderMatch) {
        result.phone = `${senderMatch[1]}-${senderMatch[2]}`;
    } else if (bodyPhoneMatch) {
        result.phone = `${bodyPhoneMatch[1]}-${bodyPhoneMatch[2]}`;
    }

    // 2) T-map 측위 URL에서 위도·경도 직접 추출 (줄바꿈 공백 및 & 누락 대응)
    const compactUrlText = text.replace(/\s*([?&=.\/])\s*/g, '$1');
    const tmapMatch =
        compactUrlText.match(/tmap\.co\.kr[^\s]*?[?&]x=([\d.]+)&?y=([\d.]+)/i) ||
        compactUrlText.match(/tmap\.co\.kr[^\s]*?[?&]y=([\d.]+)&?x=([\d.]+)/i);
    if (tmapMatch) {
        const v1 = parseFloat(tmapMatch[1]);
        const v2 = parseFloat(tmapMatch[2]);
        if (v1 >= 32 && v1 <= 40 && v2 >= 123 && v2 <= 133) {
            result.directLat = v1;
            result.directLng = v2;
        } else if (v2 >= 32 && v2 <= 40 && v1 >= 123 && v1 <= 133) {
            result.directLat = v2;
            result.directLng = v1;
        }
    }

    // 3) PCI / PN 및 중계기 여부 추출
    const skt4gPciMatch = text.match(/(?:^|[\s,])(?:0\s*,\s*)?(\d{1,4})\s*\(\s*(중계기|기지국|옥외|옥내|인빌딩|[가-힣A-Za-z0-9]+)\s*\)/);
    const skt3gPnMatch = text.match(/(?:^|[\s,])([a-zA-Z])\s*\(\s*(\d{1,4})\s*\)/);
    const sktPlainPciMatch = text.match(/,\s*(\d{1,4})\s*,\s*\d{2}-?\d{2}\s+\d{1,2}\s*:\s*\d{2}/);

    if (skt4gPciMatch) {
        result.pci = skt4gPciMatch[1];
        result.cellType = skt4gPciMatch[2];
        result.netType = '4G';
    } else if (skt3gPnMatch) {
        result.pci = skt3gPnMatch[2];
        result.netType = '3G';
    } else if (sktPlainPciMatch) {
        result.pci = sktPlainPciMatch[1];
        result.netType = '4G';
    }

    // 4) 측정 일시 및 전원 상태 (Y: 정상/켜짐, N: 실패/꺼짐)
    const now = new Date();
    const fullDtStatus = text.match(/,\s*(\d{2})-?(\d{2})\s+(\d{1,2})\s*:\s*(\d{2})\s*,\s*([YN])\b/i);
    const splitDateOnly = text.match(/,\s*(\d{2})-(\d{2})\s*$/);
    const headerDtMatch = text.match(/\[\s*(\d{1,2})\s*,\s*(\d{1,2})\s*:\s*(\d{2})\s*\]/);

    if (fullDtStatus) {
        const month = parseInt(fullDtStatus[1], 10) - 1;
        const day = parseInt(fullDtStatus[2], 10);
        const hour = parseInt(fullDtStatus[3], 10);
        const min = parseInt(fullDtStatus[4], 10);
        result.dateObj = new Date(now.getFullYear(), month, day, hour, min, 0);
        result.timeStr = `${pad2(month + 1)}/${pad2(day)} ${pad2(hour)}:${pad2(min)}`;
        result.isOffline = (fullDtStatus[5].toUpperCase() === 'N');
    } else if (splitDateOnly) {
        const month = parseInt(splitDateOnly[1], 10) - 1;
        const day = parseInt(splitDateOnly[2], 10);
        result.dateObj = new Date(now.getFullYear(), month, day, now.getHours(), now.getMinutes(), 0);
        result.timeStr = `${pad2(month + 1)}/${pad2(day)} ${formatTimeHM(now)}`;
        result.isIncompleteSkt = true;
    } else if (headerDtMatch) {
        const day = parseInt(headerDtMatch[1], 10);
        const hour = parseInt(headerDtMatch[2], 10);
        const min = parseInt(headerDtMatch[3], 10);
        result.dateObj = new Date(now.getFullYear(), now.getMonth(), day, hour, min, 0);
        result.timeStr = `${pad2(now.getMonth() + 1)}/${pad2(day)} ${pad2(hour)}:${pad2(min)}`;
    }

    // 5) [위치자료] 주소(측위)와 [발신기지국] 주소(안테나) 각각 분리 추출
    let posRawAddr = '';
    const posMatch = text.match(/\[위치자료\]\s*(.+?)(?=\s*https?:\/\/|$)/i);
    if (posMatch) {
        posRawAddr = posMatch[1].trim();
    }

    let stationRawAddr = '';
    let stationPart = text;
    const btsTagIdx = text.search(/\[발신기지국\]/i);
    if (btsTagIdx !== -1) {
        stationPart = text.slice(btsTagIdx + '[발신기지국]'.length).trim();
    } else {
        stationPart = text.replace(/^\[\s*\d{1,2}\s*,\s*\d{1,2}\s*:\s*\d{2}\s*\]\s*/, '').trim();
    }

    stationPart = stationPart.replace(/^(?:020|01[016789])[-\s.]?\d{3,4}[-\s.]?\d{4}\s*/, '').trim();

    const cutRegex = /(?:[,\s]+(?:0\s*,\s*)?\d{1,4}\s*\([^)]+\)|[,\s]+[a-zA-Z]\s*\(\s*\d{1,4}\s*\)|,\s*\d{1,4}\s*,\s*\d{2}-?\d{2}|,\s*\d{2}-?\d{2}\s+\d{1,2}\s*:\s*\d{2}|\[위치자료\])/;
    const cutIdx = stationPart.search(cutRegex);
    if (cutIdx !== -1) {
        stationRawAddr = stationPart.slice(0, cutIdx).trim();
    } else {
        stationRawAddr = stationPart.trim();
    }

    // SKT 5G 표시(주소 맨 끝 소문자 'i') 안전 감지 및 제거
    if (/(^|[^A-Za-z])i$/.test(stationRawAddr)) {
        result.netType = '5G';
        stationRawAddr = stationRawAddr.replace(/(^|[^A-Za-z])i$/, '$1').trim();
    }
    if (/(^|[^A-Za-z])i$/.test(posRawAddr)) {
        result.netType = '5G';
        posRawAddr = posRawAddr.replace(/(^|[^A-Za-z])i$/, '$1').trim();
    }

    const cleanedPos = cleanAddressAndDetail(posRawAddr);
    const cleanedStation = cleanAddressAndDetail(stationRawAddr);

    result.posAddress = cleanedPos.displayAddress;
    result.btsAddress = cleanedStation.displayAddress;

    if ((result.directLat && result.directLng) || cleanedPos.searchAddress) {
        result.isEstimatedPos = true;
        result.address = cleanedPos.displayAddress || cleanedStation.displayAddress || 'SKT 측위 좌표';
        result.searchAddress = cleanedPos.searchAddress;
        result.fallbackAddress = cleanedStation.searchAddress;
    } else if (cleanedStation.searchAddress) {
        result.isEstimatedPos = false;
        result.address = cleanedStation.displayAddress;
        result.searchAddress = cleanedStation.searchAddress;
    }

    return result;
}

// =====================================================================
// ★ 2. KT 파서 (3G / 4G / 5G)
// =====================================================================
function isKtFormat(text) {
    const hasCpPhone = /\b[CP]\s*:\s*\d{4,5}\b/i.test(text);
    const hasKtRadius = /\br\s*\(\s*\d+(?:\.\d+)?\s*(?:km|m)\s*\)/i.test(text);
    const hasKtDate = /\bD\s*:\s*\d{2}[-/.]?\d{2}[-\s]+\d{1,2}\s*:\s*\d{2}/i.test(text);
    return (hasCpPhone && (hasKtDate || hasKtRadius)) || (hasKtRadius && hasKtDate);
}

function parseKtSms(text) {
    const result = createEmptyParsedResult();
    result.carrier = 'KT';

    const pciMatch = text.match(/(?:^|\s)(5G|NR|LTE|[a-zA-Z])\s*\(\s*(\d{1,4})\s*\)/i);
    if (pciMatch) {
        const prefix = pciMatch[1].toUpperCase();
        result.pci = pciMatch[2];
        if (prefix === 'L' || prefix === 'LTE') result.netType = '4G';
        else if (prefix === '5G' || prefix === 'N' || prefix === 'NR') result.netType = '5G';
        else if (['G', 'A', 'B'].includes(prefix)) result.netType = '3G';
    }

    const radiusMatch = text.match(/\br\s*\(\s*(\d+(?:\.\d+)?)\s*(km|m)\s*\)/i);
    if (radiusMatch) {
        const num = parseFloat(radiusMatch[1]);
        const unit = radiusMatch[2].toLowerCase();
        result.radius = unit === 'km' ? Math.round(num * 1000) : Math.round(num);
    }

    const dateMatch = text.match(/\bD\s*:\s*(\d{2})[-/.]?(\d{2})[-\s]+(\d{1,2})\s*:\s*(\d{2})/i);
    if (dateMatch) {
        const now = new Date();
        const month = parseInt(dateMatch[1], 10) - 1;
        const day = parseInt(dateMatch[2], 10);
        const hour = parseInt(dateMatch[3], 10);
        const min = parseInt(dateMatch[4], 10);
        result.dateObj = new Date(now.getFullYear(), month, day, hour, min, 0);
        result.timeStr = `${pad2(month + 1)}/${pad2(day)} ${pad2(hour)}:${pad2(min)}`;
    }

    const cpMatch = text.match(/\b([CP])\s*:\s*(\d{4,5})\b/i);
    if (cpMatch) {
        result.isOffline = (cpMatch[1].toUpperCase() === 'P');
        const digits = cpMatch[2];
        result.phone = digits.length > 4
            ? `${digits.slice(0, -4)}-${digits.slice(-4)}`
            : digits;
    }

    let cutIdx = -1;
    if (pciMatch) cutIdx = pciMatch.index;
    else if (radiusMatch) cutIdx = radiusMatch.index;
    else if (dateMatch) cutIdx = dateMatch.index;

    const rawAddr = (cutIdx > 0 ? text.slice(0, cutIdx) : text).trim();
    const cleaned = cleanAddressAndDetail(rawAddr);
    result.address = cleaned.displayAddress;
    result.searchAddress = cleaned.searchAddress;

    return result;
}

// =====================================================================
// ★ 3. LGU+ 파서 (2G / 4G / 5G)
// =====================================================================
const LGU_HEAD_REGEX = /[\[\(]\s*([a-zA-Z]*)(\d{1,4})?\s*[\]\)]\s*([\d\-]{7,13})\s*\[\s*(\d{2})[-/.]?(\d{2})[-\s]+(\d{1,2})\s*:\s*(\d{2})(?:\s*:\s*(\d{2}))?\s*\]\s*(.*)$/i;

function isLguFormat(text) {
    return LGU_HEAD_REGEX.test(text);
}

function parseLguSms(text) {
    const result = createEmptyParsedResult();
    result.carrier = 'LGU+';

    const m = text.match(LGU_HEAD_REGEX);
    if (!m) return result;

    const pciPrefix = (m[1] || '').toUpperCase();
    const pciNum = m[2] || '';
    const rawPhone = m[3].replace(/\D/g, '');
    const month = parseInt(m[4], 10) - 1;
    const day = parseInt(m[5], 10);
    const hour = parseInt(m[6], 10);
    const min = parseInt(m[7], 10);
    const sec = m[8] ? parseInt(m[8], 10) : 0;
    let rest = (m[9] || '').trim();

    if (pciNum) {
        result.pci = pciNum;
        result.netType = (pciPrefix === 'G') ? '2G' : '4G';
    } else if (pciPrefix) {
        result.netType = pciPrefix.includes('5G') ? '5G' : '4G';
    }

    if (rawPhone.length >= 7) {
        const last4 = rawPhone.slice(-4);
        const mid = rawPhone.slice(-8, -4);
        result.phone = mid ? `${mid}-${last4}` : last4;
    }

    const now = new Date();
    result.dateObj = new Date(now.getFullYear(), month, day, hour, min, sec);
    result.timeStr = `${pad2(month + 1)}/${pad2(day)} ${pad2(hour)}:${pad2(min)}`;

    const statusPrefixMatch = rest.match(/^(전원\s*꺼짐|전원꺼짐|꺼짐|음영|착신전환|통화불가|해지|정지|불가|OFF|켜짐|정상|위치확인)\s*[-:\/]?\s*/i);
    if (statusPrefixMatch) {
        const statusWord = statusPrefixMatch[1];
        result.isOffline = /(꺼짐|음영|착신전환|통화불가|해지|정지|불가|OFF)/i.test(statusWord);
        rest = rest.slice(statusPrefixMatch[0].length).trim();
    } else if (/(전원\s*꺼짐|전원꺼짐|꺼짐|음영)/i.test(rest)) {
        result.isOffline = true;
        rest = rest.replace(/(전원\s*꺼짐|전원꺼짐|꺼짐|음영)\s*[-:\/]?/gi, ' ').trim();
    }

    const cleaned = cleanAddressAndDetail(rest);
    result.address = cleaned.displayAddress;
    result.searchAddress = cleaned.searchAddress;

    return result;
}

// =====================================================================
// ★ 4. 범용 폴백 파서
// =====================================================================
function parseGenericSms(text, senderNumber) {
    const result = createEmptyParsedResult();
    result.isOffline = /(꺼짐|전원\s*꺼짐|전원꺼짐|음영|착신전환|통화불가|오프라인|해지|정지|불가|OFF)/i.test(text);

    const mobileMatch = text.match(/(?:020|01[016789])[-\s.]?(\d{3,4})[-\s.]?(\d{4})/);
    const hyphen8Match = text.match(/(?:^|\D)(\d{3,4})-(\d{4})(?:\D|$)/);
    const plain8Match = text.match(/(?:^|\D)(\d{4})(\d{4})(?:\D|$)/);
    let senderDigits = String(senderNumber || '').replace(/\D/g, '');
    if (senderDigits.startsWith('82') && senderDigits.length >= 11) {
        senderDigits = '0' + senderDigits.slice(2);
    }
    const senderMatch = senderDigits.match(/^(?:020|01[016789])(\d{3,4})(\d{4})$/);

    if (mobileMatch) result.phone = `${mobileMatch[1]}-${mobileMatch[2]}`;
    else if (hyphen8Match) result.phone = `${hyphen8Match[1]}-${hyphen8Match[2]}`;
    else if (plain8Match) result.phone = `${plain8Match[1]}-${plain8Match[2]}`;
    else if (senderMatch) result.phone = `${senderMatch[1]}-${senderMatch[2]}`;

    const now = new Date();
    const generalDateMatch = text.match(/(?:(\d{4})[-/.])?(\d{1,2})[-/.](\d{1,2})\s+(\d{1,2})\s*:\s*(\d{2})(?::(\d{2}))?/);
    const timeOnlyMatch = text.match(/(\d{1,2})\s*:\s*(\d{2})(?::(\d{2}))?/);

    if (generalDateMatch) {
        const year = generalDateMatch[1] ? parseInt(generalDateMatch[1], 10) : now.getFullYear();
        const month = parseInt(generalDateMatch[2], 10) - 1;
        const day = parseInt(generalDateMatch[3], 10);
        const hour = parseInt(generalDateMatch[4], 10);
        const min = parseInt(generalDateMatch[5], 10);
        const sec = generalDateMatch[6] ? parseInt(generalDateMatch[6], 10) : 0;
        result.dateObj = new Date(year, month, day, hour, min, sec);
        result.timeStr = `${pad2(month + 1)}/${pad2(day)} ${pad2(hour)}:${pad2(min)}`;
    } else if (timeOnlyMatch) {
        const hour = parseInt(timeOnlyMatch[1], 10);
        const min = parseInt(timeOnlyMatch[2], 10);
        const sec = timeOnlyMatch[3] ? parseInt(timeOnlyMatch[3], 10) : 0;
        result.dateObj = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, min, sec);
        result.timeStr = `${pad2(hour)}:${pad2(min)}`;
    }

    const explicitPciMatch = text.match(/(?:PCI|CPI|물리ID|기지국ID)\s*[:=\-]?\s*(\d{1,4})/i);
    if (explicitPciMatch) {
        result.pci = explicitPciMatch[1];
    } else {
        const bracketNumbers = [...text.matchAll(/[\[\(]\s*(\d{1,4})\s*[\]\)]/g)];
        for (const match of bracketNumbers) {
            const numVal = parseInt(match[1], 10);
            if (!isNaN(numVal) && numVal >= 0 && numVal <= 1007) {
                result.pci = match[1];
                break;
            }
        }
    }

    const cleanedForAddr = text
        .replace(/\[\s*\d{1,4}\s*\]/g, ' ')
        .replace(/\(\s*\d{1,4}\s*\)/g, ' ')
        .replace(/(?:PCI|CPI|물리ID|기지국ID)\s*[:=\-]?\s*\d{1,4}/gi, ' ')
        .replace(/(?:020|01[016789])[-\s.]?\d{3,4}[-\s.]?\d{4}/g, ' ')
        .replace(/\b\d{3,4}-\d{4}\b/g, ' ')
        .replace(/\b\d{7,11}\b/g, ' ')
        .replace(/(전원\s*꺼짐|전원꺼짐|꺼짐|음영|켜짐|정상|위치확인|착신전환|통화불가)\s*[-:\/]?/g, ' ')
        .trim();

    const sidoStartRegex = /(서울특별시|서울시|서울|부산광역시|부산시|부산|대구광역시|대구시|대구|인천광역시|인천시|인천|광주광역시|광주시|광주|대전광역시|대전시|대전|울산광역시|울산시|울산|세종특별자치시|세종시|세종|경기도|경기|강원특별자치도|강원도|강원|충청북도|충북|충청남도|충남|전북특별자치도|전라북도|전북|전라남도|전남|경상북도|경북|경상남도|경남|제주특별자치도|제주도|제주|[가-힣]{2,4}(?:시|도|군|구))\s+/;
    const startMatch = cleanedForAddr.match(sidoStartRegex);

    if (startMatch) {
        const fromSido = cleanedForAddr.slice(startMatch.index).trim();
        const bungilMatch = fromSido.match(/^([가-힣0-9\s\-]+?(?:번[가-힣]*길|[가-힣0-9]+길)\s*(?:산\s*)?\d+(?:-\d+)?(?:\s*번지)?)/);
        const roadMatch = fromSido.match(/^([가-힣0-9\s\-]+?(?:대로|로)(?!\s*\d+\s*번)\s*(?:산\s*)?\d+(?:-\d+)?(?:\s*번지)?)/);
        const jibunMatch = fromSido.match(/^([가-힣0-9\s\-]+?(?:동\s*\d*가?|읍|면|리|가)\s*(?:산\s*)?\d+(?:-\d+)?(?:\s*번지)?)/);
        const fallbackMatch = fromSido.match(/^([가-힣0-9\s\-]+(?:번[가-힣]*길|대로|로|길|동\s*\d*가?|읍|면|리|가))/);

        const rawAddr = (bungilMatch || roadMatch || jibunMatch || fallbackMatch)?.[1] || fromSido;
        const cleaned = cleanAddressAndDetail(rawAddr);
        result.address = cleaned.displayAddress;
        result.searchAddress = cleaned.searchAddress;
    }

    return result;
}

// =====================================================================
// ★ 주소 정제 유틸리티 (무공백 지번/도로명 주소 복원 및 상호 분리)
// =====================================================================
function cleanAddressAndDetail(rawAddr) {
    if (!rawAddr) return { searchAddress: '', displayAddress: '' };

    let s = String(rawAddr)
        .replace(/^[-:,/\s]+/, '')
        .replace(/\(\s*일반\s*\)/g, ' ')
        .replace(/\(\s*산\s*\)/g, ' 산 ')
        .replace(/\s+/g, ' ')
        .trim();

    let detail = '';

    const nearMatch = s.match(/^(.+?),\s*(.+?)\(부터\)\s*\d+m\s*부근$/);
    if (nearMatch) {
        s = nearMatch[1].trim();
        detail = `${nearMatch[2].trim()} 부근`;
    }

    s = s.replace(
        /^(서울특별시|서울시|서울|부산광역시|부산시|부산|대구광역시|대구시|대구|인천광역시|인천시|인천|광주광역시|광주시|광주|대전광역시|대전시|대전|울산광역시|울산시|울산|세종특별자치시|세종시|세종|경기도|경기|강원특별자치도|강원도|강원|충청북도|충북|충청남도|충남|전북특별자치도|전라북도|전북|전라남도|전남|경상북도|경북|경상남도|경남|제주특별자치도|제주도|제주)(?=[가-힣])/,
        '$1 '
    );
    for (let i = 0; i < 2; i++) {
        s = s.replace(
            /^((?:[가-힣]+\s+){1,2})([가-힣]{1,4}(?:시|군|구))(?=[가-힣]{2,})/,
            '$1$2 '
        );
    }
    s = s.replace(/([가-힣]+(?:동\d*가?|읍|면|리|가))(?=(?:산\s*)?\d+(?!\s*(?:대로|로|번길|길)))/g, '$1 ');
    s = s.replace(/([가-힣0-9]+?(?:대로|번길|로|길))(?=(?:산\s*)?\d+(?!\s*(?:가\b|번?길|대로|로)))/g, '$1 ');
    s = s.replace(/(\d+)-0(?=\s*번지|\s|$)/g, '$1');

    const bunjiSplit = s.match(/^(.+?(?:산\s*)?\d+(?:-\d+)?)\s*번지\s*(.*)$/);
    if (bunjiSplit) {
        s = bunjiSplit[1].trim();
        if (bunjiSplit[2].trim()) {
            detail = detail ? `${bunjiSplit[2].trim()}, ${detail}` : bunjiSplit[2].trim();
        }
    } else {
        const trailingSplit = s.match(/^(.+?(?:번[가-힣]*길|대로|로|길|동\s*\d*가?|읍|면|리|가)\s+(?:산\s*)?\d+(?:-\d+)?)\s+([가-힣A-Za-z].+)$/);
        if (trailingSplit) {
            s = trailingSplit[1].trim();
            const extra = trailingSplit[2].trim();
            if (extra && !/^(번지|층|호)$/.test(extra)) {
                detail = detail ? `${extra}, ${detail}` : extra;
            }
        }
    }

    const searchAddress = s.replace(/\s+/g, ' ').replace(/[-_,./]+$/, '').trim();
    const displayAddress = (searchAddress && detail)
        ? `${searchAddress} (${detail})`
        : searchAddress;

    return { searchAddress, displayAddress };
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
    if (!startDate || !endDate) return '0분';
    const diffMs = Math.max(0, endDate.getTime() - startDate.getTime());
    const totalMin = Math.floor(diffMs / 60000);
    if (totalMin < 1) return '1분 미만';
    if (totalMin < 60) return `${totalMin}분`;
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    return m > 0 ? `${h}시간 ${m}분` : `${h}시간`;
}
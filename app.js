import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.15.0/firebase-app.js';
import {
  getFirestore, collection, doc, addDoc, updateDoc, onSnapshot, query, orderBy, serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js';

/* ===================== firebase ===================== */
const firebaseConfig = {
  apiKey: 'AIzaSyAxy9PLZ6odfOuiLZO4mq9nWg8sop_vqig',
  authDomain: 'card-c4c9f.firebaseapp.com',
  projectId: 'card-c4c9f',
  storageBucket: 'card-c4c9f.firebasestorage.app',
  messagingSenderId: '368407742146',
  appId: '1:368407742146:web:a4561f5553c771b3349d5b',
};
const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp);
const cardsCol = collection(db, 'cards');

/* ===================== constants ===================== */
const ACCENT = '#F26722';
const SHOW_CATEGORY = true;
const ROW_PAD = '15px';

const NAV_DEFS = [
  { key: 'dashboard', label: '메인 대시보드', icon: '◧' },
  { key: 'upload', label: '카드내역 입력', icon: '↥' },
  { key: 'transactions', label: '사용내역 관리', icon: '≣' },
  { key: 'settings', label: '카드 설정', icon: '⚙' },
];

const TITLES = {
  dashboard: ['실적 대시보드', '이번 달 각 카드의 실적 기준 충족 현황을 한눈에 확인하세요'],
  upload: ['카드내역 입력', '카드사 이용내역 엑셀을 업로드하면 실적을 자동 판정합니다'],
  transactions: ['카드별 사용내역 관리', '거래별 실적 포함 여부와 혜택 대상을 확인·수정하세요'],
  settings: ['카드 설정', '카드 정보, 실적 기준, 산정 기간, 혜택 항목을 관리합니다'],
};

const MONTH_OPTIONS = [
  { value: '2026-06', label: '2026년 6월' }, { value: '2026-05', label: '2026년 5월' },
  { value: '2026-04', label: '2026년 4월' }, { value: '2026-03', label: '2026년 3월' },
  { value: '2026-02', label: '2026년 2월' }, { value: '2026-01', label: '2026년 1월' },
];

const BADGE = {
  under: { label: '실적 미달', bg: ACCENT, fg: '#fff', border: ACCENT },
  near: { label: '기준 근접', bg: '#FEF1E9', fg: '#C2601F', border: '#F6D2BC' },
  achieved: { label: '달성 완료', bg: '#F2F1EE', fg: '#66655F', border: '#E6E5E1' },
};

const COL_MAP = [
  { excel: '이용일자', field: '거래일자', okLabel: '자동 인식', okColor: '#2E9E4F', okBg: '#EAF6EC' },
  { excel: '가맹점명', field: '가맹점명', okLabel: '자동 인식', okColor: '#2E9E4F', okBg: '#EAF6EC' },
  { excel: '이용금액', field: '금액', okLabel: '자동 인식', okColor: '#2E9E4F', okBg: '#EAF6EC' },
  { excel: '할부개월', field: '결제방식', okLabel: '자동 인식', okColor: '#2E9E4F', okBg: '#EAF6EC' },
  { excel: '이용구분', field: '(사용 안 함)', okLabel: '확인 필요', okColor: '#C2601F', okBg: '#FEF1E9' },
];
const FIELD_OPTIONS = ['거래일자', '가맹점명', '금액', '결제방식', '카테고리', '(사용 안 함)'];

const SWATCH_HEXES = ['#16213E', '#1C1C1E', '#0A3FD6', '#0067AC', '#5B4B3A', '#C8102E', '#2E9E4F', '#F26722'];

const PERIOD_MODE_DEFS = [
  { key: 'calendar', label: '매월 1일 ~ 말일', sub: '월력 기준 · 가장 일반적' },
  { key: 'cycle', label: '전월 21일 ~ 당월 20일', sub: '카드 결제일 주기 기준' },
  { key: 'custom', label: '직접 지정', sub: '시작일·종료일을 직접 설정' },
];
const DAY_OPTIONS = Array.from({ length: 31 }, (_, i) => String(i + 1));

/* ===================== helpers ===================== */
function won(n) { return Number(n || 0).toLocaleString('ko-KR') + '원'; }
function statusOf(pct) { return pct >= 100 ? 'achieved' : (pct >= 80 ? 'near' : 'under'); }
function esc(v) {
  return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function newId() { return Math.random().toString(36).slice(2, 10) + Date.now().toString(36); }

const BENEFIT_TYPES = [
  { key: 'discount', label: '할인율' },
  { key: 'point', label: '적립률' },
];
function benefitTypeLabel(key) { return (BENEFIT_TYPES.find(t => t.key === key) || BENEFIT_TYPES[0]).label; }
function benefitLabel(b) {
  const rate = b.rate === '' || b.rate == null ? null : Number(b.rate);
  const rateText = rate != null && !Number.isNaN(rate) ? rate + '% ' + benefitTypeLabel(b.benefitType) : benefitTypeLabel(b.benefitType);
  return b.matchKeyword ? (b.matchKeyword + ' ' + rateText) : rateText;
}

/* ===================== state ===================== */
const state = {
  screen: 'dashboard',
  month: '2026-06',
  txCardId: null,
  settingsCardId: null,
  uploadCardId: '',
  uploadStep: 0,
  txStatus: 'all',
  txBenefit: 'all',
  txUnclassified: false,
  txSearch: '',
  cards: [],
  cardsLoaded: false,
  cardsError: null,
  tx: {},
  txError: null,
  writeError: null,
};

function findCard(id) { return state.cards.find(c => c.id === id); }

/* ===================== firestore: reads ===================== */
let txUnsub = null;

function subscribeCards() {
  const q = query(cardsCol, orderBy('createdAt', 'asc'));
  onSnapshot(q, (snap) => {
    state.cards = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    state.cardsLoaded = true;
    state.cardsError = null;
    ensureSelection();
    render();
  }, (err) => {
    state.cardsLoaded = true;
    state.cardsError = err && err.message ? err.message : String(err);
    render();
  });
}

function ensureSelection() {
  const firstId = state.cards[0] ? state.cards[0].id : null;
  if (!findCard(state.txCardId)) state.txCardId = firstId;
  if (!findCard(state.settingsCardId)) state.settingsCardId = firstId;
  if (state.uploadCardId && !findCard(state.uploadCardId)) state.uploadCardId = '';
  subscribeTx(state.txCardId);
}

function subscribeTx(cardId) {
  if (txUnsub) { txUnsub(); txUnsub = null; }
  if (!cardId) { render(); return; }
  const q = query(collection(db, 'cards', cardId, 'transactions'), orderBy('date', 'asc'));
  txUnsub = onSnapshot(q, (snap) => {
    state.tx = { ...state.tx, [cardId]: snap.docs.map(d => ({ id: d.id, ...d.data() })) };
    state.txError = null;
    render();
  }, (err) => {
    state.txError = err && err.message ? err.message : String(err);
    render();
  });
}

/* ===================== firestore: writes ===================== */
function reportWriteError(err) {
  console.error(err);
  state.writeError = err && err.message ? err.message : String(err);
  render();
}

async function addCard() {
  try {
    const ref = await addDoc(cardsCol, {
      name: '새 카드', issuer: '', chip: '', hex: SWATCH_HEXES[0],
      threshold: 300000, spend: 0, recognized: 0, benefits: [],
      periodMode: 'calendar', customStartDay: '1', customEndDay: '1',
      createdAt: serverTimestamp(),
    });
    state.settingsCardId = ref.id;
    render();
  } catch (err) { reportWriteError(err); }
}

function updateCard(id, fields) {
  if (!id) return;
  updateDoc(doc(db, 'cards', id), fields).catch(reportWriteError);
}

function updateBenefits(id, benefits) {
  if (!id) return;
  updateDoc(doc(db, 'cards', id), { benefits }).catch(reportWriteError);
}

function addBenefit() {
  const card = findCard(state.settingsCardId);
  if (!card) return;
  const benefits = [...(card.benefits || []), { id: 'b' + newId(), place: '', benefitType: 'discount', rate: '', matchKeyword: '', got: '0원', inc: true }];
  updateBenefits(card.id, benefits);
}
function removeBenefit(bid) {
  const card = findCard(state.settingsCardId);
  if (!card) return;
  updateBenefits(card.id, (card.benefits || []).filter(b => b.id !== bid));
}
function updateBenefitField(bid, field, val) {
  const card = findCard(state.settingsCardId);
  if (!card) return;
  updateBenefits(card.id, (card.benefits || []).map(b => b.id === bid ? { ...b, [field]: val } : b));
}

function updateTxRow(cardId, rowId, fields) {
  if (!cardId || !rowId) return;
  updateDoc(doc(db, 'cards', cardId, 'transactions', rowId), fields).catch(reportWriteError);
}

/* ===================== actions ===================== */
function setScreen(s) { state.screen = s; render(); }
function openCard(id) { state.screen = 'transactions'; state.txCardId = id; subscribeTx(id); render(); }

function selectUploadCard(id) { state.uploadCardId = id; render(); }
function runUpload() { if (state.uploadCardId) { state.uploadStep = 1; render(); } }
function resetUpload() { state.uploadStep = 0; render(); }
function saveUpload() {
  state.screen = 'transactions';
  state.txCardId = state.uploadCardId;
  state.uploadStep = 0;
  subscribeTx(state.txCardId);
  render();
}

function selectTxCard(id) { state.txCardId = id; subscribeTx(id); render(); }
function toggleTxRow(rowId) {
  const arr = state.tx[state.txCardId] || [];
  const row = arr.find(r => r.id === rowId);
  if (!row) return;
  updateTxRow(state.txCardId, rowId, { included: !row.included, source: 'manual', classified: true });
}
function setTxRowBenefit(rowId, val) {
  const item = val === '해당 없음' ? '' : val;
  updateTxRow(state.txCardId, rowId, { benefitItem: item, source: 'manual', classified: true });
}

function selectSettingsCard(id) { state.settingsCardId = id; render(); }

/* ===================== focus preservation ===================== */
function captureFocus() {
  const el = document.activeElement;
  if (el && el.dataset && el.dataset.field) {
    return { field: el.dataset.field, start: el.selectionStart, end: el.selectionEnd };
  }
  return null;
}
function restoreFocus(f) {
  if (!f) return;
  const el = document.querySelector('[data-field="' + f.field + '"]');
  if (!el) return;
  el.focus();
  if (typeof f.start === 'number' && el.setSelectionRange) {
    try { el.setSelectionRange(f.start, f.end); } catch (e) { /* not a text-range input */ }
  }
}

/* ===================== derived: dashboard ===================== */
function computeDashboard() {
  const cards = state.cards;
  const enrich = cards.map(c => {
    const threshold = Number(c.threshold) || 0;
    const recognized = Number(c.recognized) || 0;
    const spend = Number(c.spend) || 0;
    const benefits = c.benefits || [];
    const pct = threshold > 0 ? Math.round(recognized / threshold * 100) : 0;
    const st = statusOf(pct);
    const gotBenefits = benefits.filter(b => b.got && b.got !== '0원' && b.got !== '0 P');
    const benefitAmt = benefits.reduce((a, b) => a + (parseInt(String(b.got).replace(/[^0-9]/g, ''), 10) || 0), 0);
    return { ...c, threshold, recognized, spend, benefits, pct, st, gotBenefits, benefitAmt };
  });
  const order = { under: 0, near: 1, achieved: 2 };
  const sorted = [...enrich].sort((a, b) => order[a.st] - order[b.st] || a.pct - b.pct);
  const cardsView = sorted.map(c => {
    const b = BADGE[c.st];
    const remain = c.threshold - c.recognized;
    return {
      id: c.id, name: c.name, issuer: c.issuer, chip: c.chip, hex: c.hex,
      recognizedFmt: won(c.recognized), thresholdFmt: won(c.threshold),
      spendFmt: won(c.spend), benefitFmt: c.benefitAmt > 0 ? won(c.benefitAmt) : '0원',
      benefitColor: c.benefitAmt > 0 ? ACCENT : '#B4B4AF',
      barPct: Math.min(100, c.pct), pctText: c.pct + '%',
      barColor: c.st === 'achieved' ? '#C9C8C3' : ACCENT,
      statusLabel: b.label, badgeBg: b.bg, badgeFg: b.fg, badgeBorder: b.border,
      stripColor: c.st === 'under' ? ACCENT : 'transparent',
      cardBorder: c.st === 'under' ? '#F3D3BF' : '#ECEBE8',
      remainText: c.st === 'achieved' ? ('기준 초과 +' + won(c.recognized - c.threshold)) : ('기준까지 ' + won(remain) + ' 남음'),
      remainColor: c.st === 'under' ? ACCENT : (c.st === 'near' ? '#C2601F' : '#7A9A82'),
      hasBenefits: c.gotBenefits.length > 0,
      benefitList: c.gotBenefits,
    };
  });
  const totSpend = enrich.reduce((a, c) => a + c.spend, 0);
  const totBenefit = enrich.reduce((a, c) => a + c.benefitAmt, 0);
  const achievedN = enrich.filter(c => c.st === 'achieved').length;
  const underN = enrich.filter(c => c.st === 'under').length;
  return {
    cardsView,
    sum: { spend: won(totSpend), benefit: won(totBenefit), achieved: achievedN, total: cards.length, under: underN },
  };
}

/* ===================== render: shell ===================== */
let isComposing = false;
let pendingRender = false;

function render() {
  if (isComposing) { pendingRender = true; return; }
  const focus = captureFocus();
  document.getElementById('app').innerHTML = renderShell();
  restoreFocus(focus);
}

function renderShell() {
  if (!state.cardsLoaded) {
    return (
      '<div class="boot-screen">' +
        '<div>Firestore에서 데이터를 불러오는 중입니다…</div>' +
        (state.bootSlow ? '<div class="boot-hint">연결이 지연되고 있습니다. 네트워크 상태와 Firebase 콘솔의 Firestore 보안 규칙(firestore.rules)을 확인하세요.</div>' : '') +
      '</div>'
    );
  }
  return (
    '<div class="app-shell">' +
      renderErrorBanner() +
      renderSidebar() +
      '<main class="main">' +
        renderTopbar() +
        '<div class="content">' + renderScreen() + '</div>' +
      '</main>' +
    '</div>'
  );
}

function renderErrorBanner() {
  const msg = state.cardsError || state.txError || state.writeError;
  if (!msg) return '';
  return (
    '<div class="error-banner">' +
      '<strong>Firestore 오류:</strong> ' + esc(msg) +
      ' — Firebase 콘솔에서 Firestore 보안 규칙이 읽기/쓰기를 허용하는지 확인하세요 (firestore.rules 참고).' +
      '<button class="error-dismiss" data-action="dismiss-error">×</button>' +
    '</div>'
  );
}

function renderSidebar() {
  const navHtml = NAV_DEFS.map(n => {
    const active = state.screen === n.key;
    return (
      '<button class="nav-btn' + (active ? ' active' : '') + '" data-action="nav" data-screen="' + n.key + '">' +
        '<span class="nav-icon">' + n.icon + '</span><span>' + n.label + '</span>' +
      '</button>'
    );
  }).join('');

  return (
    '<aside class="sidebar">' +
      '<div class="sidebar-top">' +
        '<div class="sidebar-brand-row">' +
          '<div class="sidebar-logo">실</div>' +
          '<div class="sidebar-brand-text">' +
            '<div class="sidebar-brand-name">실적관리</div>' +
            '<div class="sidebar-brand-sub">CARD PERFORMANCE</div>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div class="nav-list">' +
        '<div class="nav-section-label">MENU</div>' +
        navHtml +
      '</div>' +
      '<div class="sidebar-footer">' +
        '<div class="sidebar-user">' +
          '<div class="avatar">담</div>' +
          '<div>' +
            '<div class="sidebar-user-name">담당자</div>' +
            '<div class="sidebar-user-email">finance@company.co.kr</div>' +
          '</div>' +
        '</div>' +
      '</div>' +
    '</aside>'
  );
}

function renderTopbar() {
  const [title, subtitle] = TITLES[state.screen];
  const monthOpts = MONTH_OPTIONS.map(m =>
    '<option value="' + m.value + '"' + (m.value === state.month ? ' selected' : '') + '>' + m.label + '</option>'
  ).join('');

  return (
    '<header class="topbar">' +
      '<div class="topbar-title-wrap">' +
        '<h1 class="topbar-title">' + title + '</h1>' +
        '<p class="topbar-sub">' + subtitle + '</p>' +
      '</div>' +
      '<div class="topbar-actions">' +
        '<div class="month-picker">' +
          '<span class="month-picker-label">조회 월</span>' +
          '<select data-action="month-change">' + monthOpts + '</select>' +
        '</div>' +
        '<button class="btn-accent" data-action="go-upload"><span style="font-size:15px;line-height:1;">↥</span> 엑셀 업로드</button>' +
      '</div>' +
    '</header>'
  );
}

function renderScreen() {
  switch (state.screen) {
    case 'upload': return renderUploadScreen();
    case 'transactions': return renderTxScreen();
    case 'settings': return renderSettingsScreen();
    default: return renderDashboardScreen();
  }
}

/* ===================== screen: dashboard ===================== */
function renderDashboardScreen() {
  if (state.cards.length === 0) return renderNoCardsPanel();
  const { cardsView, sum } = computeDashboard();

  const tiles =
    '<div class="tiles-grid">' +
      '<div class="tile">' +
        '<div class="tile-label">총 사용금액</div>' +
        '<div class="tile-value">' + sum.spend + '</div>' +
        '<div class="tile-caption">이번 달 전체 카드 승인 합계</div>' +
      '</div>' +
      '<div class="tile">' +
        '<div class="tile-label">실적 달성 카드</div>' +
        '<div class="tile-value accent">' + sum.achieved + '<span class="tile-value-sub"> / ' + sum.total + '장</span></div>' +
        '<div class="tile-caption">전월 실적 기준 충족 카드 수</div>' +
      '</div>' +
      '<div class="tile">' +
        '<div class="tile-label">획득 혜택 합계</div>' +
        '<div class="tile-value accent">' + sum.benefit + '</div>' +
        '<div class="tile-caption">캐시백·할인·포인트 환산액</div>' +
      '</div>' +
      '<div class="tile warn">' +
        '<div class="tile-label">확인 필요 카드</div>' +
        '<div class="tile-value accent">' + sum.under + '<span class="tile-value-sub">장</span></div>' +
        '<div class="tile-caption">기준 미달 · 마감 전 확인하세요</div>' +
      '</div>' +
    '</div>';

  const sectionHead =
    '<div class="section-head">' +
      '<h2>카드별 실적 현황</h2>' +
      '<span class="section-head-hint">· 기준 미달 카드가 상단에 표시됩니다</span>' +
      '<div class="legend">' +
        '<span class="legend-item"><span class="legend-dot" style="background:' + ACCENT + ';"></span>실적 미달</span>' +
        '<span class="legend-item"><span class="legend-dot" style="background:#F6C6A8;"></span>기준 근접</span>' +
        '<span class="legend-item"><span class="legend-dot" style="background:#D9D9D5;"></span>달성 완료</span>' +
      '</div>' +
    '</div>';

  const cardsHtml = cardsView.map(c => {
    const benefitsBlock = c.hasBenefits
      ? '<div class="benefit-list">' + c.benefitList.map(b =>
          '<div class="benefit-row"><span class="benefit-dot"></span><span class="benefit-desc">' + esc(benefitLabel(b)) + '</span><span class="benefit-got">' + esc(b.got) + '</span></div>'
        ).join('') + '</div>'
      : '<div class="benefit-empty">아직 획득한 혜택이 없어요 · 기준 달성 시 적용됩니다</div>';

    return (
      '<div class="perf-card" style="border:1px solid ' + c.cardBorder + ';" data-action="open-card" data-card-id="' + c.id + '">' +
        '<div class="perf-card-strip" style="background:' + c.stripColor + ';"></div>' +
        '<div class="perf-card-body">' +
          '<div class="perf-card-head">' +
            '<div class="card-chip" style="background:' + (c.hex || '#999') + ';">' + esc(c.chip) + '</div>' +
            '<div class="perf-card-name-wrap">' +
              '<div class="perf-card-name">' + esc(c.name) + '</div>' +
              '<div class="perf-card-issuer">' + esc(c.issuer) + '</div>' +
            '</div>' +
            '<span class="status-badge" style="background:' + c.badgeBg + ';color:' + c.badgeFg + ';border-color:' + c.badgeBorder + ';">' + c.statusLabel + '</span>' +
          '</div>' +
          '<div class="perf-amounts">' +
            '<span class="perf-amount-main">' + c.recognizedFmt + '</span>' +
            '<span class="perf-amount-sub">/ ' + c.thresholdFmt + '</span>' +
          '</div>' +
          '<div class="perf-amount-caption">실적 인정 금액 / 전월 실적 기준</div>' +
          '<div class="progress-block">' +
            '<div class="progress-track"><div class="progress-fill" style="width:' + c.barPct + '%;background:' + c.barColor + ';"></div></div>' +
            '<div class="progress-meta"><span style="color:' + c.remainColor + ';">' + c.remainText + '</span><span class="progress-pct">' + c.pctText + '</span></div>' +
          '</div>' +
          '<div class="perf-divider"></div>' +
          '<div class="ministat-row">' +
            '<div><div class="ministat-label">이번 달 사용</div><div class="ministat-value">' + c.spendFmt + '</div></div>' +
            '<div><div class="ministat-label">획득 혜택</div><div class="ministat-value" style="color:' + c.benefitColor + ';">' + c.benefitFmt + '</div></div>' +
          '</div>' +
          '<div class="benefit-block">' + benefitsBlock + '</div>' +
          '<div class="perf-cta">상세 내역 보기 <span style="margin-left:4px;">→</span></div>' +
        '</div>' +
      '</div>'
    );
  }).join('');

  return tiles + sectionHead + '<div class="card-grid">' + cardsHtml + '</div>';
}

function renderNoCardsPanel() {
  return (
    '<div class="panel no-cards-panel">' +
      '<div class="no-cards-title">등록된 카드가 없습니다</div>' +
      '<div class="no-cards-sub">카드 설정에서 카드를 등록하면 여기에 실적 현황이 표시됩니다.</div>' +
      '<button class="btn-primary" data-action="nav" data-screen="settings">카드 설정으로 이동</button>' +
    '</div>'
  );
}

/* ===================== screen: upload ===================== */
function renderUploadScreen() {
  const cards = state.cards;
  if (cards.length === 0) return renderNoCardsPanel();
  const uploadCard = findCard(state.uploadCardId);
  const runReady = !!state.uploadCardId;

  if (state.uploadStep === 0) {
    const chips = cards.map(c => {
      const selected = state.uploadCardId === c.id;
      return (
        '<button class="card-chip-btn' + (selected ? ' selected' : '') + '" data-action="upload-select-card" data-card-id="' + c.id + '">' +
          '<span class="card-chip-swatch" style="background:' + (c.hex || '#999') + ';"></span>' + esc(c.name) +
        '</button>'
      );
    }).join('');

    const hint = runReady ? '선택한 카드: ' + esc(uploadCard.name) : '먼저 위에서 카드를 선택하세요';

    return (
      '<div class="upload-wrap">' +
        '<div class="panel"><div class="panel-title">1. 카드 선택</div><div class="chip-row">' + chips + '</div></div>' +
        '<div class="panel">' +
          '<div class="panel-title">2. 이용내역 엑셀 업로드</div>' +
          '<div class="dropzone' + (runReady ? ' ready' : '') + '">' +
            '<div class="dropzone-icon">↥</div>' +
            '<div class="dropzone-title">엑셀 파일을 여기에 끌어다 놓으세요</div>' +
            '<div class="dropzone-sub">카드사 홈페이지에서 내려받은 이용내역 파일 (.xlsx, .csv)</div>' +
            '<button class="btn-secondary" type="button">파일 선택</button>' +
          '</div>' +
          '<div class="upload-actions">' +
            '<div class="upload-hint">' + hint + '</div>' +
            '<button class="btn-run' + (runReady ? ' ready' : ' disabled') + '" data-action="run-upload">업로드하고 자동 판정 →</button>' +
          '</div>' +
        '</div>' +
      '</div>'
    );
  }

  const uploadRecognized = uploadCard ? won(uploadCard.recognized) : won(0);
  const mappingRows = COL_MAP.map(m => {
    const opts = FIELD_OPTIONS.map(f => '<option value="' + esc(f) + '"' + (f === m.field ? ' selected' : '') + '>' + esc(f) + '</option>').join('');
    return (
      '<div class="mapping-row">' +
        '<div class="mapping-excel">' + esc(m.excel) + '</div>' +
        '<div class="mapping-arrow">→</div>' +
        '<select class="mapping-select">' + opts + '</select>' +
        '<span class="mapping-status" style="color:' + m.okColor + ';background:' + m.okBg + ';">' + m.okLabel + '</span>' +
      '</div>'
    );
  }).join('');

  return (
    '<div class="upload-wrap">' +
      '<div class="upload-note">참고: 이 업로드 화면은 아직 실제 엑셀 파싱을 하지 않는 미리보기(mock)입니다. 아래 숫자는 예시이며 Firestore에 저장되지 않습니다.</div>' +
      '<div class="success-banner"><span class="success-check">✓</span><span class="success-text">' + esc(uploadCard ? uploadCard.name : '') + ' · 업로드 및 자동 판정이 완료되었습니다</span></div>' +
      '<div class="summary-tiles-sm">' +
        '<div class="tile-sm"><div class="tile-sm-label">총 거래 건수</div><div class="tile-sm-value">128<span class="sub" style="color:#C7C7C2;">건</span></div></div>' +
        '<div class="tile-sm"><div class="tile-sm-label">자동 매칭 성공</div><div class="tile-sm-value" style="color:#2E9E4F;">121<span class="sub" style="color:#A9D3B6;">건</span></div></div>' +
        '<div class="tile-sm warn"><div class="tile-sm-label">확인 필요</div><div class="tile-sm-value" style="color:' + ACCENT + ';">7<span class="sub" style="color:#E2A987;">건</span></div></div>' +
        '<div class="tile-sm"><div class="tile-sm-label">실적 인정 예상</div><div class="tile-sm-value" style="color:' + ACCENT + ';">' + uploadRecognized + '</div></div>' +
      '</div>' +
      '<div class="panel">' +
        '<div class="panel-title" style="margin-bottom:4px;">컬럼 매핑 확인</div>' +
        '<div class="mapping-desc">엑셀의 각 열이 어떤 항목으로 인식되었는지 확인하고 필요 시 변경하세요.</div>' +
        '<div class="mapping-rows">' + mappingRows + '</div>' +
      '</div>' +
      '<div class="actions-row">' +
        '<button class="btn-outline" data-action="reset-upload">다시 업로드</button>' +
        '<button class="btn-primary" data-action="save-upload">결과 저장하고 내역 관리로 →</button>' +
      '</div>' +
    '</div>'
  );
}

/* ===================== screen: transactions ===================== */
function renderTxScreen() {
  const cards = state.cards;
  if (cards.length === 0) return renderNoCardsPanel();
  const txCard = findCard(state.txCardId) || cards[0];

  const chips = cards.map(c => {
    const selected = txCard.id === c.id;
    return (
      '<button class="tx-chip' + (selected ? ' selected' : '') + '" data-action="tx-select-card" data-card-id="' + c.id + '">' +
        '<span class="tx-chip-swatch" style="background:' + (c.hex || '#999') + ';"></span>' + esc(c.name) +
      '</button>'
    );
  }).join('');

  const allRows = (state.tx && state.tx[txCard.id]) || [];
  const benefitPlaces = (txCard.benefits || []).map(b => b.place);
  const filtered = allRows.filter(r => {
    if (state.txStatus === 'in' && !r.included) return false;
    if (state.txStatus === 'out' && r.included) return false;
    if (state.txBenefit === 'yes' && !r.benefitItem) return false;
    if (state.txBenefit === 'no' && r.benefitItem) return false;
    if (state.txUnclassified && r.classified) return false;
    if (state.txSearch && !String(r.merchant || '').toLowerCase().includes(state.txSearch.toLowerCase())) return false;
    return true;
  });

  const inCount = allRows.filter(r => r.included).length;
  const unclCount = allRows.filter(r => !r.classified).length;
  const countLabel = '전체 ' + allRows.length + '건 · 실적 포함 ' + inCount + '건 · 미분류 ' + unclCount + '건';

  const filterBar =
    '<div class="filter-bar">' +
      '<div class="search-box"><span class="search-icon">⌕</span><input type="text" placeholder="가맹점명 검색" data-field="tx-search" data-action="tx-search" value="' + esc(state.txSearch) + '" /></div>' +
      '<select class="filter-select" data-action="tx-status">' +
        '<option value="all"' + (state.txStatus === 'all' ? ' selected' : '') + '>실적 포함 · 전체</option>' +
        '<option value="in"' + (state.txStatus === 'in' ? ' selected' : '') + '>실적 포함만</option>' +
        '<option value="out"' + (state.txStatus === 'out' ? ' selected' : '') + '>실적 제외만</option>' +
      '</select>' +
      '<select class="filter-select" data-action="tx-benefit">' +
        '<option value="all"' + (state.txBenefit === 'all' ? ' selected' : '') + '>혜택 · 전체</option>' +
        '<option value="yes"' + (state.txBenefit === 'yes' ? ' selected' : '') + '>혜택 대상만</option>' +
        '<option value="no"' + (state.txBenefit === 'no' ? ' selected' : '') + '>혜택 없음만</option>' +
      '</select>' +
      '<button class="unclassified-toggle' + (state.txUnclassified ? ' active' : '') + '" data-action="tx-toggle-unclassified"><span class="unclassified-check">' + (state.txUnclassified ? '✓' : '') + '</span>미분류만</button>' +
      '<div class="tx-count-label">' + countLabel + '</div>' +
    '</div>';

  const catHeader = SHOW_CATEGORY ? '<th>카테고리</th>' : '';
  const rowsHtml = filtered.map(r => {
    const has = !!r.benefitItem;
    const benefitValue = r.benefitItem || '해당 없음';
    const benefitOptions = ['해당 없음', ...benefitPlaces];
    const benefitOptsHtml = benefitOptions.map(o => '<option value="' + esc(o) + '"' + (o === benefitValue ? ' selected' : '') + '>' + esc(o) + '</option>').join('');
    const selBg = has ? '#FEF1E9' : '#fff', selColor = has ? '#C2601F' : '#8B8B86', selBorder = has ? '#F6D2BC' : '#E4E3DF', selWeight = has ? 700 : 600;
    const srcLabel = !r.classified ? '미분류' : (r.source === 'manual' ? '수동 수정' : '자동 판정');
    const srcBg = !r.classified ? '#FEF1E9' : (r.source === 'manual' ? '#EDF1FB' : '#F2F1EE');
    const srcColor = !r.classified ? ACCENT : (r.source === 'manual' ? '#3B62C4' : '#8B8B86');
    const trackBg = r.included ? ACCENT : '#D9D8D4';
    const knobX = r.included ? 'translateX(18px)' : 'translateX(0)';
    const catCell = SHOW_CATEGORY ? '<td><span class="category-pill">' + esc(r.category) + '</span></td>' : '';

    return (
      '<tr>' +
        '<td class="td-date">' + esc(r.date) + '</td>' +
        '<td class="td-merchant">' + esc(r.merchant) + '</td>' +
        catCell +
        '<td class="td-amount">' + won(r.amount) + '</td>' +
        '<td class="td-method">' + esc(r.method) + '</td>' +
        '<td class="td-toggle"><button class="toggle-switch" style="background:' + trackBg + ';" data-action="tx-row-toggle" data-row-id="' + r.id + '"><span class="toggle-knob" style="transform:' + knobX + ';"></span></button></td>' +
        '<td><select class="benefit-select" style="background:' + selBg + ';color:' + selColor + ';border-color:' + selBorder + ';font-weight:' + selWeight + ';" data-action="tx-row-benefit" data-row-id="' + r.id + '">' + benefitOptsHtml + '</select></td>' +
        '<td class="td-source"><span class="source-badge" style="background:' + srcBg + ';color:' + srcColor + ';">' + srcLabel + '</span></td>' +
      '</tr>'
    );
  }).join('');

  const emptyState = filtered.length === 0
    ? '<div class="empty-state">' + (allRows.length === 0 ? '이 카드에는 아직 거래 내역이 없습니다.' : '조건에 맞는 거래 내역이 없습니다.') + '</div>'
    : '';

  const table =
    '<div class="table-wrap" style="--row-pad:' + ROW_PAD + ';">' +
      '<table>' +
        '<thead><tr><th>거래일자</th><th>가맹점명</th>' + catHeader + '<th style="text-align:right;">금액</th><th>결제방식</th><th style="text-align:center;">실적 포함</th><th>혜택 항목</th><th style="text-align:center;">판정</th></tr></thead>' +
        '<tbody>' + rowsHtml + '</tbody>' +
      '</table>' +
      emptyState +
    '</div>';

  return '<div class="tx-chip-row">' + chips + '</div>' + filterBar + table;
}

/* ===================== screen: settings ===================== */
function renderSettingsScreen() {
  const cards = state.cards;
  const cardListHtml = cards.map(c => {
    const selected = state.settingsCardId === c.id;
    return (
      '<button class="settings-card-btn' + (selected ? ' selected' : '') + '" data-action="settings-select-card" data-card-id="' + c.id + '">' +
        '<span class="settings-card-swatch" style="background:' + (c.hex || '#999') + ';"></span>' +
        '<span class="settings-card-text"><span class="settings-card-name">' + esc(c.name) + '</span><span class="settings-card-issuer">' + esc(c.issuer) + '</span></span>' +
      '</button>'
    );
  }).join('');

  const sidebarHtml =
    '<div class="settings-sidebar">' +
      '<div class="settings-sidebar-label">등록된 카드</div>' +
      '<div class="settings-card-list">' + cardListHtml + '</div>' +
      '<button class="add-card-btn" type="button" data-action="settings-add-card">+ 카드 등록</button>' +
    '</div>';

  const setCard = findCard(state.settingsCardId);
  if (!setCard) {
    return (
      '<div class="settings-grid">' + sidebarHtml +
        '<div class="panel no-cards-panel">' +
          '<div class="no-cards-title">등록된 카드가 없습니다</div>' +
          '<div class="no-cards-sub">왼쪽의 + 카드 등록 버튼으로 첫 카드를 추가하세요.</div>' +
        '</div>' +
      '</div>'
    );
  }

  const swatchesHtml = SWATCH_HEXES.map(hex => {
    const ring = setCard.hex === hex ? '#17171A' : 'transparent';
    return '<button class="swatch" style="background:' + hex + ';border-color:' + ring + ';" data-action="settings-swatch" data-hex="' + hex + '"></button>';
  }).join('');

  const basicInfo =
    '<div class="panel">' +
      '<div class="settings-panel-title">카드 기본 정보</div>' +
      '<div class="field-grid">' +
        '<label><span class="field-label">카드명</span><input class="text-input" type="text" data-field="settings-name" data-action="settings-name" value="' + esc(setCard.name) + '" /></label>' +
        '<label><span class="field-label">카드사</span><input class="text-input" type="text" data-field="settings-issuer" data-action="settings-issuer" value="' + esc(setCard.issuer) + '" /></label>' +
        '<label><span class="field-label">카드 색상</span><div class="swatch-row">' + swatchesHtml + '</div></label>' +
        '<label><span class="field-label">전월 실적 기준 금액</span><div class="amount-field"><input type="text" inputmode="numeric" data-field="settings-threshold" data-action="settings-threshold" value="' + Number(setCard.threshold || 0).toLocaleString('ko-KR') + '" /><span class="unit">원</span></div></label>' +
      '</div>' +
    '</div>';

  const periodMode = setCard.periodMode || 'calendar';
  const periodOptsHtml = PERIOD_MODE_DEFS.map(p => {
    const selected = periodMode === p.key;
    return (
      '<button class="period-option' + (selected ? ' selected' : '') + '" data-action="settings-period-mode" data-mode="' + p.key + '">' +
        '<span class="radio-dot-outer"><span class="radio-dot-inner"></span></span>' +
        '<span><span class="period-label">' + p.label + '</span><span class="period-sub">' + p.sub + '</span></span>' +
      '</button>'
    );
  }).join('');

  const customStart = setCard.customStartDay || '1';
  const customEnd = setCard.customEndDay || '1';
  const customPeriod = periodMode === 'custom'
    ? '<div class="custom-period">' +
        '<span class="custom-period-text">전월</span>' +
        '<select class="day-select" data-action="settings-custom-start">' + DAY_OPTIONS.map(d => '<option' + (d === customStart ? ' selected' : '') + '>' + d + '</option>').join('') + '</select>' +
        '<span class="custom-period-text">일 ~ 당월</span>' +
        '<select class="day-select" data-action="settings-custom-end">' + DAY_OPTIONS.map(d => '<option' + (d === customEnd ? ' selected' : '') + '>' + d + '</option>').join('') + '</select>' +
        '<span class="custom-period-text">일</span>' +
      '</div>'
    : '';

  const period =
    '<div class="panel">' +
      '<div class="settings-panel-title" style="margin-bottom:0;">실적 산정 기간</div>' +
      '<div class="settings-panel-desc">카드사 기준에 맞춰 실적을 집계할 기간을 설정하세요.</div>' +
      '<div class="period-options">' + periodOptsHtml + '</div>' +
      customPeriod +
    '</div>';

  const benefitsHtml = (setCard.benefits || []).map(b => {
    const benefitType = b.benefitType || 'discount';
    const typeOptsHtml = BENEFIT_TYPES.map(t => '<option value="' + t.key + '"' + (t.key === benefitType ? ' selected' : '') + '>' + t.label + '</option>').join('');
    return (
      '<div class="benefit-editor-row">' +
        '<input class="benefit-input place" type="text" placeholder="혜택처" data-field="settings-benefit-place-' + b.id + '" data-action="settings-benefit-place" data-benefit-id="' + b.id + '" value="' + esc(b.place) + '" />' +
        '<select class="benefit-type-select" data-action="settings-benefit-type" data-benefit-id="' + b.id + '">' + typeOptsHtml + '</select>' +
        '<div class="benefit-rate-field"><input type="text" inputmode="decimal" placeholder="0" data-field="settings-benefit-rate-' + b.id + '" data-action="settings-benefit-rate" data-benefit-id="' + b.id + '" value="' + esc(b.rate == null ? '' : b.rate) + '" /><span class="unit">%</span></div>' +
        '<input class="benefit-input keyword" type="text" placeholder="매칭 조건 (예: 스타벅스)" data-field="settings-benefit-keyword-' + b.id + '" data-action="settings-benefit-keyword" data-benefit-id="' + b.id + '" value="' + esc(b.matchKeyword) + '" />' +
        '<button class="inc-toggle-btn' + (b.inc ? ' on' : '') + '" data-action="settings-benefit-toggle" data-benefit-id="' + b.id + '">' +
          '<span class="mini-switch' + (b.inc ? ' on' : '') + '"><span class="mini-switch-knob" style="transform:' + (b.inc ? 'translateX(16px)' : 'translateX(0)') + ';"></span></span>실적 포함' +
        '</button>' +
        '<button class="remove-btn" data-action="settings-benefit-remove" data-benefit-id="' + b.id + '">×</button>' +
      '</div>'
    );
  }).join('');

  const benefits =
    '<div class="panel">' +
      '<div class="benefit-panel-head"><div><span class="settings-panel-title" style="margin-bottom:0;">혜택 항목</span><span class="benefit-panel-hint">이 카드로 받을 수 있는 혜택을 등록하세요</span></div></div>' +
      '<div class="benefit-editor-header"><span>혜택처</span><span>혜택 내용</span><span></span><span>매칭 조건</span><span></span><span></span></div>' +
      '<div class="benefit-editor-list">' + benefitsHtml + '</div>' +
      '<button class="add-benefit-btn" data-action="settings-add-benefit">+ 혜택 항목 추가</button>' +
    '</div>';

  const history =
    '<div class="panel">' +
      '<div class="settings-panel-title" style="margin-bottom:4px;">월별 실적 이력</div>' +
      '<div class="settings-panel-desc" style="margin-top:0;">최근 6개월 실적 인정 금액과 달성 여부입니다.</div>' +
      '<div class="history-empty">아직 쌓인 이력이 없습니다 · 매월 마감 시 자동으로 기록됩니다</div>' +
    '</div>';

  return (
    '<div class="settings-grid">' + sidebarHtml +
      '<div class="settings-panels">' + basicInfo + period + benefits + history + '</div>' +
    '</div>'
  );
}

/* ===================== event delegation ===================== */
function setupDelegation() {
  const app = document.getElementById('app');

  app.addEventListener('compositionstart', () => { isComposing = true; });
  app.addEventListener('compositionend', () => {
    isComposing = false;
    if (pendingRender) { pendingRender = false; render(); }
  });

  app.addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    const action = el.dataset.action;
    switch (action) {
      case 'nav': setScreen(el.dataset.screen); break;
      case 'open-card': openCard(el.dataset.cardId); break;
      case 'go-upload': setScreen('upload'); break;
      case 'upload-select-card': selectUploadCard(el.dataset.cardId); break;
      case 'run-upload': runUpload(); break;
      case 'reset-upload': resetUpload(); break;
      case 'save-upload': saveUpload(); break;
      case 'tx-select-card': selectTxCard(el.dataset.cardId); break;
      case 'tx-toggle-unclassified': state.txUnclassified = !state.txUnclassified; render(); break;
      case 'tx-row-toggle': toggleTxRow(el.dataset.rowId); break;
      case 'settings-select-card': selectSettingsCard(el.dataset.cardId); break;
      case 'settings-add-card': addCard(); break;
      case 'settings-swatch': updateCard(state.settingsCardId, { hex: el.dataset.hex }); break;
      case 'settings-period-mode': updateCard(state.settingsCardId, { periodMode: el.dataset.mode }); break;
      case 'settings-benefit-toggle': {
        const bid = el.dataset.benefitId;
        const card = findCard(state.settingsCardId);
        if (!card) break;
        const b = (card.benefits || []).find(x => x.id === bid);
        if (b) updateBenefitField(bid, 'inc', !b.inc);
        break;
      }
      case 'settings-benefit-remove': removeBenefit(el.dataset.benefitId); break;
      case 'settings-add-benefit': addBenefit(); break;
      case 'dismiss-error': state.cardsError = null; state.txError = null; state.writeError = null; render(); break;
      default: break;
    }
  });

  app.addEventListener('input', (e) => {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    const action = el.dataset.action;
    switch (action) {
      case 'tx-search': state.txSearch = el.value; render(); break;
      case 'settings-name': updateCard(state.settingsCardId, { name: el.value }); break;
      case 'settings-issuer': updateCard(state.settingsCardId, { issuer: el.value, chip: el.value }); break;
      case 'settings-threshold': {
        const n = parseInt(el.value.replace(/[^0-9]/g, ''), 10) || 0;
        updateCard(state.settingsCardId, { threshold: n });
        break;
      }
      case 'settings-benefit-place': updateBenefitField(el.dataset.benefitId, 'place', el.value); break;
      case 'settings-benefit-rate': {
        let v = el.value.replace(/[^0-9.]/g, '');
        const parts = v.split('.');
        if (parts.length > 2) v = parts[0] + '.' + parts.slice(1).join('');
        updateBenefitField(el.dataset.benefitId, 'rate', v);
        break;
      }
      case 'settings-benefit-keyword': updateBenefitField(el.dataset.benefitId, 'matchKeyword', el.value); break;
      default: break;
    }
  });

  app.addEventListener('change', (e) => {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    const action = el.dataset.action;
    switch (action) {
      case 'month-change': state.month = el.value; render(); break;
      case 'tx-status': state.txStatus = el.value; render(); break;
      case 'tx-benefit': state.txBenefit = el.value; render(); break;
      case 'tx-row-benefit': setTxRowBenefit(el.dataset.rowId, el.value); break;
      case 'settings-custom-start': updateCard(state.settingsCardId, { customStartDay: el.value }); break;
      case 'settings-custom-end': updateCard(state.settingsCardId, { customEndDay: el.value }); break;
      case 'settings-benefit-type': updateBenefitField(el.dataset.benefitId, 'benefitType', el.value); break;
      default: break;
    }
  });
}

/* ===================== init ===================== */
document.addEventListener('DOMContentLoaded', () => {
  setupDelegation();
  render();
  subscribeCards();
  setTimeout(() => {
    if (!state.cardsLoaded) { state.bootSlow = true; render(); }
  }, 6000);
});

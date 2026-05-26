/** =========================================================
 *  공통 유틸/헬퍼
 *  - DOM 헬퍼, fetch 래퍼, 안전 문자열, 본문 표시
 * ======================================================= */
const $  = (s, p=document) => p.querySelector(s);
const $$ = (s, p=document) => Array.from(p.querySelectorAll(s));

async function safeJson(r){ try { return await r.json(); } catch { return null; } }
async function j(url, opt={}) {
  const res = await fetch(url, {
    credentials: 'include',
    headers: { 'Content-Type':'application/json', ...(opt.headers||{}) },
    ...opt
  });
  if (!res.ok) throw { status: res.status, body: await safeJson(res) };
  return safeJson(res);
}
function unhideBody() {
  document.body.classList.remove('hidden');
  document.body.style.removeProperty('display');
}
function escapeHtml(s=''){
  return s.replace(/[&<>"']/g,(c)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

/** =========================================================
 *  블로그 URL 필터 (네이버 본문만 추출)
 * ======================================================= */
function isRealBlogPost(url) {
  if (!url) return false;
  return /^https?:\/\/(?:blog|m\.blog)\.naver\.com\/(?:[^/]+\/\d+|PostView\.naver\?blogId=[^&]+&logNo=\d+)/.test(url);
}

/** topReferers / referers 에서 네이버 본문 1순위 고르기 */
function pickBlogUrlLite(d){
  // 1) 서버가 직접 준 값
  if (d.blogUrl && isRealBlogPost(d.blogUrl)) return d.blogUrl;

  const tr = d.topReferers;

  // 2) topReferers: 객체 { url: count }
  if (tr && typeof tr === 'object' && !Array.isArray(tr)) {
    const best = Object.entries(tr)
      .sort((a,b)=>(b[1]||0)-(a[1]||0))
      .find(([u]) => isRealBlogPost(u));
    if (best) return best[0];
  }

  // 3) topReferers: 배열 [{ referer|url, count }]
  if (Array.isArray(tr)) {
    const r = [...tr]
      .sort((a,b)=>(b?.count||0)-(a?.count||0))
      .find(x => isRealBlogPost(x?.referer || x?.url));
    if (r) return (r.referer || r.url);
  }

  // 4) referers: 배열 [{ referer|url, count }]
  if (Array.isArray(d.referers)) {
    const r = [...d.referers]
      .sort((a,b)=>(b?.count||0)-(a?.count||0))
      .find(x => isRealBlogPost(x?.referer || x?.url));
    if (r) return (r.referer || r.url);
  }

  return ''; // 없으면 빈 문자열
}


/** =========================================================
 *  공용 액션: 이미지 미리보기 모달, 클립보드 복사
 * ======================================================= */
window.openImagePreview = function(url){
  const wrap = $('#img-modal'), img = $('#img-modal-img');
  if (!wrap || !img) return;
  img.src = url;
  wrap.classList.remove('hidden');
};
document.addEventListener('click', (e)=>{
  const wrap = $('#img-modal');
  if (wrap && !wrap.classList.contains('hidden') && e.target === wrap) {
    $('#img-modal-img').src = '';
    wrap.classList.add('hidden');
  }
});
window.copyText = async function(text){
  try { await navigator.clipboard.writeText(text); } catch {}
};

/** =========================================================
 *  인덱스 페이지(index.html)
 *  - 단일 이미지+메모 업로드
 *  - 결과 URL/메모 표시, URL 복사, 이미지 미리보기
 * ======================================================= */
(function initIndexPage(){
  const form = $('#uploadForm');
  if (!form) return;

  const resultDiv  = $('#result');
  const previewDiv = $('#preview');
  let previewUrl   = '';

  if (resultDiv)  resultDiv.style.display  = 'none';
  if (previewDiv) previewDiv.style.display = 'none';

  $('#imageInput').onchange = (e)=>{
    const file = e.target.files[0];
    if (file) {
      previewDiv.textContent = file.name;
      previewDiv.style.display = '';
      previewUrl = URL.createObjectURL(file);
    } else {
      previewDiv.textContent = '';
      previewDiv.style.display = 'none';
      previewUrl = '';
    }
  };

  form.onsubmit = async (e)=>{
    e.preventDefault();
    const formData = new FormData(e.target);
    const memoInput = $('input[name="memo"]');
    if (memoInput) formData.set('memo', memoInput.value);

    try {
      const res  = await fetch('/upload', { method:'POST', body: formData, credentials: 'include' });
      const data = await res.json();

      const file   = $('#imageInput').files[0];
      const imgTag = file ? `<div style="text-align:center;"><img src="${previewUrl}" class="result-img" alt="업로드 이미지" id="result-img-thumb"></div>` : '';
      const url    = data.url || (data.urls && data.urls[0]);
      const memo   = data.memo || (data.memos && data.memos[0]) || '';
      const urlAbs = url ? `${location.origin}${url}` : '';

      resultDiv.innerHTML = `
        <div class="result-box">
          ${imgTag}
          <div class="result-info">
            <div class='result-url-row'>
              <span class='result-url'><span style="color:#1877f2;font-weight:bold;">URL&nbsp;</span>
                <a href="${url}" target="_blank">${urlAbs}</a>
              </span>
              <button class='copy-btn' id='copy-url-btn' type='button'>복사</button>
            </div>
            <div class='result-memo'><span style="color:#1877f2;font-weight:bold;">메모:</span> ${escapeHtml(memo)}</div>
          </div>
        </div>`;
      resultDiv.style.display = '';

      $('#copy-url-btn').onclick = function(){
        const u = this.parentNode.querySelector('a').href;
        navigator.clipboard.writeText(u).then(()=>{
          this.textContent = '✅';
          setTimeout(()=> this.textContent='복사', 1200);
        });
      };
      if (file) $('#result-img-thumb').onclick = ()=> openImagePreview(previewUrl);
    } catch (err) {
      console.error('Upload error:', err);
      alert('이미지 업로드 중 오류가 발생했습니다.');
    }
  };
})();

/** =========================================================
 *  브라우저 canvas로 텍스트 → PNG blob 생성 (공용 함수)
 * ======================================================= */
let pretendardFontLoaded = false;
async function ensurePretendardFont() {
  if (pretendardFontLoaded) return;
  try {
    await document.fonts.load('500 16px Pretendard');
  } catch(e) {
    console.warn('Pretendard load failed, using fallback:', e.message);
  }
  pretendardFontLoaded = true;
}

async function renderTextToBlob({ text, fontSize, color, bgColor }) {
  await ensurePretendardFont();

  const CANVAS_W  = 780;
  const PADDING_X = 48;
  const PADDING_Y = 40;
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const maxW  = CANVAS_W - PADDING_X * 2;

  // 폰트 크기 결정
  const tmp = document.createElement('canvas');
  tmp.width = CANVAS_W; tmp.height = 100;
  const tc  = tmp.getContext('2d');
  // 모바일(약 360px)에서도 읽히려면 780px 기준 최소 28px 이상 필요 (360/780 × 28 ≈ 13px)
  let finalSize = 28;
  if (!fontSize || fontSize === 'auto') {
    for (let sz = 80; sz >= 28; sz -= 2) {
      tc.font = `500 ${sz}px Pretendard`;
      if (lines.every(l => tc.measureText(l || ' ').width <= maxW)) { finalSize = sz; break; }
    }
  } else {
    finalSize = Math.max(10, Math.min(200, parseInt(fontSize) || 40));
  }

  const lineH   = Math.ceil(finalSize * 1.6);
  const canvasH = Math.max(80, PADDING_Y * 2 + lines.length * lineH);
  const canvas  = document.createElement('canvas');
  canvas.width  = CANVAS_W;
  canvas.height = canvasH;
  const ctx = canvas.getContext('2d');

  if (bgColor && bgColor !== '') {
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, CANVAS_W, canvasH);
  }
  ctx.font         = `500 ${finalSize}px Pretendard`;
  ctx.fillStyle    = color || '#333333';
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  lines.forEach((line, i) => {
    ctx.fillText(line || '', CANVAS_W / 2, PADDING_Y + i * lineH + lineH / 2);
  });

  return new Promise((resolve, reject) => {
    canvas.toBlob(b => b ? resolve(b) : reject(new Error('toBlob 실패')), 'image/png');
  });
}

/** =========================================================
 *  텍스트 → 이미지 생성 탭
 * ======================================================= */
(function initTextImagePage() {
  const textCard  = $('#textCard');
  if (!textCard) return;

  const tabImage  = $('#tabImage');
  const tabText   = $('#tabText');
  const imageCard = $('#imageCard');
  const resultDiv = $('#result');

  function showTab(which) {
    const isText = (which === 'text');
    tabText.classList.toggle('upload-tab--active', isText);
    tabImage.classList.toggle('upload-tab--active', !isText);
    textCard.classList.toggle('hidden', !isText);
    imageCard.classList.toggle('hidden', isText);
    if (resultDiv) resultDiv.style.display = 'none';
  }

  tabImage.onclick = () => showTab('image');
  tabText.onclick  = () => showTab('text');

  const noBgCheck     = $('#noBgCheck');
  const bgColorPicker = $('#bgColorPicker');
  noBgCheck.onchange  = () => { bgColorPicker.disabled = noBgCheck.checked; };

  $('#textForm').onsubmit = async (e) => {
    e.preventDefault();
    const text = $('#textInput').value;
    if (!text.trim()) { alert('텍스트를 입력하세요.'); return; }

    const submitBtn = e.target.querySelector('button[type=submit]');
    submitBtn.disabled = true;
    submitBtn.textContent = '생성 중…';

    try {
      const blob = await renderTextToBlob({
        text,
        fontSize : $('#fontSizeSelect').value,
        color    : $('#textColorPicker').value,
        bgColor  : noBgCheck.checked ? '' : bgColorPicker.value
      });

      const fd = new FormData();
      fd.append('image', blob, 'text-image.png');
      fd.append('memo', $('#textMemoInput').value);
      const res  = await fetch('/upload', { method: 'POST', body: fd, credentials: 'include' });
      const data = await res.json();

      const urlAbs = `${location.origin}${data.url}`;
      resultDiv.innerHTML = `
        <div class="result-box">
          <div style="text-align:center">
            <img src="${data.url}" class="result-img" alt="생성된 이미지" id="result-text-thumb" style="max-width:100%;border-radius:8px;">
          </div>
          <div class="result-info">
            <div class="result-url-row">
              <span class="result-url"><span style="color:#1877f2;font-weight:bold;">URL&nbsp;</span>
                <a href="${data.url}" target="_blank">${escapeHtml(urlAbs)}</a>
              </span>
              <button class="copy-btn" id="copy-text-url-btn" type="button">복사</button>
            </div>
            <div class="result-memo"><span style="color:#1877f2;font-weight:bold;">메모:</span> ${escapeHtml(data.memo || '')}</div>
          </div>
        </div>`;
      resultDiv.style.display = '';

      $('#copy-text-url-btn').onclick = function () {
        navigator.clipboard.writeText(urlAbs).then(() => {
          this.textContent = '✅';
          setTimeout(() => this.textContent = '복사', 1200);
        });
      };
      $('#result-text-thumb').onclick = () => openImagePreview(urlAbs);
    } catch (err) {
      console.error('Text image error:', err);
      alert('이미지 생성 중 오류가 발생했습니다.');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = '이미지 생성';
    }
  };
})();


// ===== 결과 렌더러: 작은 미리보기 + 스크롤 리스트 + 전체복사 =====
function renderCompactResult({ mount, imageUrl, items }) {
  // items: [{ url, memo, index }]
  if (!mount) mount = document.getElementById('multiMemoResult') || document.getElementById('result');

  const html = `
    <div class="result-box">
      <div class="result-header" style="display:flex;align-items:center;justify-content:space-between;gap:14px;margin-bottom:8px;">
        <img src="${imageUrl}" alt="미리보기" class="result-img"
             style="max-width:200px;max-height:140px;width:100%;border-radius:10px;object-fit:cover;margin:0;">
        <div class="result-actions" style="display:flex;gap:8px;">
          <button type="button" class="copy-all-btn"
                  style="height:32px;padding:0 12px;border-radius:8px;border:1px solid var(--line);
                         background:#111827;color:#fff;font-weight:800;cursor:pointer;">
            전체 복사
          </button>
        </div>
      </div>

      <div class="result-list" style="margin-top:10px;padding-top:10px;border-top:1px dashed var(--line);
                                      max-height:260px;overflow:auto;padding-right:6px;">
        ${items.map(it => `
          <div class="result-url-row"
               style="display:grid;grid-template-columns:auto 1fr auto;gap:10px;align-items:center;padding:6px 0;">
            <span class="label" style="color:var(--muted);font-weight:600;">URL ${it.index}:</span>
            <a href="${it.url}" target="_blank" rel="noopener"
               style="min-width:0;max-width:100%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
              ${it.url}
            </a>
            <button type="button" class="copy-btn" data-copy="${it.url}"
                    style="height:28px;padding:0 10px;border-radius:8px;border:1px solid var(--line);
                           background:#111827;color:#fff;font-weight:700;cursor:pointer;">복사</button>
          </div>
          ${it.memo ? `<div class="result-memo" style="color:#374151;padding:0 0 6px 0;"><b style="color:var(--brand)">메모:</b> ${escapeHtml(it.memo)}</div>` : ''}
        `).join('')}
      </div>
    </div>
  `;

  mount.innerHTML = html;

  // 개별 복사
  mount.querySelectorAll('.copy-btn[data-copy]').forEach(btn => {
    btn.addEventListener('click', () => {
      const text = btn.getAttribute('data-copy');
      navigator.clipboard.writeText(text).then(() => flash(btn));
    });
  });

  // 전체 복사
  const allBtn = mount.querySelector('.copy-all-btn');
  allBtn?.addEventListener('click', () => {
    const all = items.map(i => i.url).join('\n');
    navigator.clipboard.writeText(all).then(() => flash(allBtn));
  });

  function flash(el){
    const old = el.textContent;
    el.textContent = '✅';
    setTimeout(() => el.textContent = old, 900);
  }
}


/** =========================================================
 *  대시보드 페이지(dashboard.html)
 *  - 수평 행 리스트, 블로그 필터(topReferers 클라이언트 필터링)
 *  - 이미지 팝업, URL 복사, 교체/삭제/상세, 엑셀 다운로드
 * ======================================================= */
(function initDashboardPage(){
  const grid = $('#imageGrid');
  if (!grid) return;

  let allImages = [];
  let filterValue = '';

  (async function init(){
    try {
      const me = await j('/me');
      unhideBody();

      const whoami = $('#whoami');
      if (whoami) whoami.textContent = me.role === 'admin' ? `관리자 ${me.id}` : me.id;

      const images = await j('/dashboard-data');
      allImages = images.sort((a,b) => Number(b.id||0) - Number(a.id||0));

      renderImageList();
      wireTopbarButtons(me);
      wireBlogFilter();
      wireImagePopup();
    } catch (e) {
      if (e?.status === 401) location.href = 'login.html';
      else { console.error(e); alert('대시보드를 불러오지 못했습니다.'); }
    }
  })();

  /* ── 블로그 필터 ── */
  function wireBlogFilter() {
    const input = $('#blogFilterInput');
    const clearBtn = $('#blogFilterClear');
    if (!input) return;

    input.addEventListener('input', () => {
      filterValue = input.value.trim();
      if (clearBtn) clearBtn.style.display = filterValue ? '' : 'none';
      renderImageList();
    });

    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        input.value = '';
        filterValue = '';
        clearBtn.style.display = 'none';
        renderImageList();
      });
    }
  }

  /* ── 이미지 팝업 ── */
  function wireImagePopup() {
    const popup = $('#imgPopup');
    const backdrop = $('#imgPopupBackdrop');
    const closeBtn = $('#imgPopupClose');
    const img = $('#imgPopupImg');
    if (!popup) return;

    const closePopup = () => {
      popup.classList.add('hidden');
      if (img) img.src = '';
    };
    if (backdrop) backdrop.addEventListener('click', closePopup);
    if (closeBtn) closeBtn.addEventListener('click', closePopup);
  }

  function openImagePopup(imgUrl) {
    const popup = $('#imgPopup');
    const img = $('#imgPopupImg');
    if (!popup || !img) return;
    img.src = imgUrl;
    popup.classList.remove('hidden');
  }

  /* ── 필터 적용 이미지 목록 ── */
  function filteredImages() {
    if (!filterValue) return allImages;
    const q = filterValue.toLowerCase();
    return allImages.filter(img => {
      const tr = img.topReferers;
      if (!tr || typeof tr !== 'object') return false;
      return Object.keys(tr).some(k => k.toLowerCase().includes(q));
    });
  }

  /* ── 이미지 행 렌더 ── */
  function renderImageList() {
    const images = filteredImages();
    const count = $('#imageCount');
    if (count) count.textContent = `(${images.length}개)`;

    grid.innerHTML = '';

    for (const img of images) {
      const imgId = img.id || (img.url || '').split('/').pop();
      const imgUrl = img.url || `/image/${imgId}`;
      const fullUrl = `${location.origin}${imgUrl}`;
      const memo = img.memo || '';
      const replacedAt = img.replacedAt ? `마지막 교체: ${formatDate(img.replacedAt)}` : '';

      const row = document.createElement('div');
      row.className = 'img-row';
      row.dataset.imageId = imgId;
      row.innerHTML = `
        <button class="row__view" data-img-id="${imgId}">이미지 보기</button>
        <span class="row__url" data-url="${escapeHtml(fullUrl)}" title="${escapeHtml(fullUrl)}">${escapeHtml(fullUrl)}</span>
        <span class="row__memo" title="${escapeHtml(memo)}">${escapeHtml(memo)}</span>
        <span class="row__replaced">${replacedAt}</span>
        <div class="row__actions">
          <button class="btn btn--xs btn--primary row__replace" data-img-id="${imgId}">교체</button>
          <button class="btn btn--xs btn--outline row__detail" data-img-id="${imgId}">상세 보기</button>
          <button class="btn btn--xs btn--danger row__delete" data-img-id="${imgId}">삭제</button>
        </div>
        <input type="file" class="row__file-input hidden" accept="image/*" data-img-id="${imgId}" />
      `;
      grid.appendChild(row);
    }

    // 이미지 보기 → 팝업
    $$('.row__view', grid).forEach(btn => {
      btn.addEventListener('click', () => openImagePopup(`/image/${btn.dataset.imgId}`));
    });

    // URL 클릭 → 복사
    $$('.row__url', grid).forEach(el => {
      el.addEventListener('click', () => {
        const url = el.dataset.url;
        navigator.clipboard.writeText(url).then(() => {
          el.classList.add('copied');
          setTimeout(() => el.classList.remove('copied'), 1500);
        }).catch(() => {
          const ta = document.createElement('textarea');
          ta.value = url; document.body.appendChild(ta); ta.select();
          document.execCommand('copy'); document.body.removeChild(ta);
          showToast('복사됐습니다.', 'success');
        });
      });
    });

    // 교체
    $$('.row__replace', grid).forEach(btn => {
      btn.addEventListener('click', () => openReplaceModal(btn.dataset.imgId));
    });

    // 상세 보기
    $$('.row__detail', grid).forEach(btn => {
      btn.addEventListener('click', () => openDetailByImgId(btn.dataset.imgId));
    });

    // 삭제
    $$('.row__delete', grid).forEach(btn => {
      btn.addEventListener('click', async () => {
        const imgId = btn.dataset.imgId;
        if (!confirm('이미지를 삭제하시겠습니까?')) return;
        try {
          const r = await j(`/image/${imgId}`, { method: 'DELETE' });
          if (r?.success) {
            grid.querySelector(`.img-row[data-image-id="${imgId}"]`)?.remove();
            allImages = allImages.filter(i => (i.id || (i.url||'').split('/').pop()) !== imgId);
            const count = $('#imageCount');
            if (count) count.textContent = `(${filteredImages().length}개)`;
            showToast('삭제됐습니다.', 'success');
          }
        } catch { showToast('삭제 실패', 'error'); }
      });
    });
  }

  /* ── 교체 모달 ── */
  let replaceTargetId = null;

  function openReplaceModal(imgId) {
    replaceTargetId = imgId;
    const modal = $('#replaceModal');
    if (!modal) return;
    // 초기화
    $('#replaceFileInput').value = '';
    $('#replaceFileSpan').textContent = '📁 이미지 선택';
    $('#replaceImageSubmit').disabled = true;
    $('#replaceTextInput').value = '';
    showReplaceTab('image');
    modal.classList.remove('hidden');
  }

  function showReplaceTab(which) {
    const isText = which === 'text';
    $('#replaceTabImage').classList.toggle('replace-tab--active', !isText);
    $('#replaceTabText').classList.toggle('replace-tab--active', isText);
    $('#replaceImagePane').classList.toggle('hidden', isText);
    $('#replaceTextPane').classList.toggle('hidden', !isText);
  }

  function closeReplaceModal() {
    $('#replaceModal')?.classList.add('hidden');
    replaceTargetId = null;
  }

  function afterReplace(data, label) {
    if (data.success) {
      if (data.replacedAt && replaceTargetId) {
        const row = grid.querySelector(`.img-row[data-image-id="${replaceTargetId}"]`);
        if (row) {
          const el = row.querySelector('.row__replaced');
          if (el) el.textContent = `마지막 교체: ${formatDate(data.replacedAt)}`;
        }
        const imgObj = allImages.find(i => (i.id || (i.url||'').split('/').pop()) === replaceTargetId);
        if (imgObj) imgObj.replacedAt = data.replacedAt;
      }
      showToast(`${label} 교체됐습니다.`, 'success');
      closeReplaceModal();
    } else {
      showToast('교체 실패: ' + (data.error || ''), 'error');
    }
  }

  // 모달 이벤트 바인딩 (스크립트가 body 최하단에서 실행되므로 DOM 이미 준비됨)
  $('#replaceModalClose')?.addEventListener('click', closeReplaceModal);
  $('#replaceModal')?.addEventListener('click', e => { if (e.target === $('#replaceModal')) closeReplaceModal(); });
  $('#replaceTabImage')?.addEventListener('click', () => showReplaceTab('image'));
  $('#replaceTabText')?.addEventListener('click',  () => showReplaceTab('text'));

  $('#replaceNoBg')?.addEventListener('change', e => {
    $('#replaceBgColor').disabled = e.target.checked;
  });

  $('#replaceFileInput')?.addEventListener('change', e => {
    const file = e.target.files[0];
    $('#replaceFileSpan').textContent = file ? file.name : '📁 이미지 선택';
    $('#replaceImageSubmit').disabled = !file;
  });

  $('#replaceImageSubmit')?.addEventListener('click', async () => {
    const file = $('#replaceFileInput').files[0];
    if (!file || !replaceTargetId) return;
    const fd = new FormData();
    fd.append('image', file);
    fd.append('id', replaceTargetId);
    try {
      const res  = await fetch('/replace-image', { method: 'POST', body: fd, credentials: 'include' });
      const data = await res.json();
      afterReplace(data, '이미지가');
    } catch (err) { showToast('오류: ' + (err?.message || '서버 오류'), 'error'); }
  });

  $('#replaceTextSubmit')?.addEventListener('click', async () => {
    const text = $('#replaceTextInput').value;
    if (!text.trim()) { showToast('텍스트를 입력하세요.', 'error'); return; }
    if (!replaceTargetId) return;
    const btn = $('#replaceTextSubmit');
    btn.disabled = true; btn.textContent = '생성 중…';
    try {
      const blob = await renderTextToBlob({
        text,
        fontSize : $('#replaceFontSize').value,
        color    : $('#replaceTextColor').value,
        bgColor  : $('#replaceNoBg').checked ? '' : $('#replaceBgColor').value
      });
      const fd = new FormData();
      fd.append('image', blob, 'text-image.png');
      fd.append('id', replaceTargetId);
      const res  = await fetch('/replace-image', { method: 'POST', body: fd, credentials: 'include' });
      const data = await res.json();
      afterReplace(data, '텍스트로');
    } catch (err) { showToast('오류: ' + (err?.message || '서버 오류'), 'error'); }
    finally { btn.disabled = false; btn.textContent = '교체'; }
  });

  /* ── 이미지 교체 (레거시, 미사용) ── */
  async function doReplaceImage(imgId, fileInput) {
    const file = fileInput?.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.append('image', file);
    fd.append('id', imgId);
    try {
      const res = await fetch('/replace-image', { method: 'POST', body: fd, credentials: 'include' });
      const data = await res.json();
      afterReplace(data, '이미지가');
    } catch { showToast('서버 오류 발생', 'error'); }
    fileInput.value = '';
  }

  /* ── 토스트 ── */
  function showToast(msg, type = 'default', duration = 2500) {
    const container = $('#toastContainer');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast${type === 'success' ? ' toast--success' : type === 'error' ? ' toast--error' : ''}`;
    toast.textContent = msg;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), duration);
  }

  /* ── 날짜 포맷 ── */
  function formatDate(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    const pad = n => String(n).padStart(2,'0');
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  /* ── 상단 버튼들 ── */
  function wireTopbarButtons(me) {
    const authLink = $('#authLink');
    if (authLink) {
      authLink.textContent = 'Logout';
      authLink.href = '#';
      authLink.onclick = async (e) => {
        e.preventDefault();
        try { await j('/logout', { method: 'POST' }); } catch {}
        location.href = 'index.html';
      };
    }

    const excelBtn = $('#excelDownload');
    if (excelBtn) {
      excelBtn.onclick = async () => {
        try {
          const res = await fetch('/dashboard-excel', { credentials: 'include' });
          if (!res.ok) throw new Error('실패');
          const blob = await res.blob();
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url; a.download = 'dashboard.xlsx';
          document.body.appendChild(a); a.click(); a.remove();
          URL.revokeObjectURL(url);
        } catch { alert('엑셀 다운로드 실패'); }
      };
    }

    const regBtn = $('#registerUserBtn');
    if (regBtn) {
      regBtn.style.display = me.role === 'admin' ? '' : 'none';
      if (me.role === 'admin') regBtn.onclick = () => location.href = 'register.html';
    }
  }

  /* ── 상세 모달 ── */
  function openDetailByImgId(imgId) {
    const img = allImages.find(i => (i.id || (i.url||'').split('/').pop()) === imgId);
    if (img) openDetail(img);
  }

  async function openDetail(img) {
    const imgId = img.id || (img.url||'').split('/').pop();
    try {
      const detail = await j(`/image/${imgId}/detail`);
      const modal = $('#modal'), body = $('#modal-body');
      modal.classList.remove('hidden');
      const closeModal = () => {
        modal.classList.add('hidden');
        body.innerHTML = '';
        modal.removeEventListener('click', onOverlay);
      };
      const onOverlay = (e) => { if (e.target === modal) closeModal(); };
      modal.addEventListener('click', onOverlay);

      const bestBlog = (() => {
        if (detail.blogUrl) return detail.blogUrl;
        if (detail.topReferers) {
          const best = Object.entries(detail.topReferers)
            .filter(([u]) => isRealBlogPost(u)).sort((a,b)=>b[1]-a[1])[0];
          return best ? best[0] : '-';
        }
        return '-';
      })();

      const visitors = (detail.visitors || []).sort((a,b) => (b.count||0)-(a.count||0));
      const ipRows = visitors.map(x => {
        const ipv4 = (x.ip||'').match(/\b(?:\d{1,3}\.){3}\d{1,3}\b/);
        return `<tr><td class="ip-cell">${ipv4 ? ipv4[0] : escapeHtml(x.ip||'')}</td><td class="text-left">${escapeHtml(x.ua||'-')}</td><td>${x.count||0}</td></tr>`;
      }).join('');

      body.innerHTML = `
        <div class="modal-title-row-main">
          <div class="modal-title-filename">${escapeHtml(detail.filename||imgId)}</div>
          <div class="modal-actions">
            <button id="showDaily" class="dashboard-btn-blue btn-32 btn-w-96">방문일자</button>
            <button id="downloadDetail" class="dashboard-btn-blue btn-32 btn-w-120 btn-success">엑셀</button>
            <button id="closeModal" class="dashboard-btn-blue btn-32">닫기</button>
          </div>
        </div>
        <div class="modal-section">
          <div class="modal-row"><span class="modal-label">총 방문수</span><span class="modal-value">${detail.views||0}</span></div>
          <div class="modal-row"><span class="modal-label">오늘 방문</span><span class="modal-value">${detail.todayVisits||0}</span></div>
        </div>
        <div class="modal-section">
          <div class="modal-row">
            <span class="modal-label">블로그</span>
            <span class="modal-value">${bestBlog === '-' ? '-' : `<a href="${bestBlog}" target="_blank" class="dashboard-blog-link">${bestBlog}</a>`}</span>
          </div>
        </div>
        <div class="modal-table-wrap">
          <table class="modal-table">
            <thead><tr><th>IP</th><th>User-Agent</th><th>방문수</th></tr></thead>
            <tbody>${ipRows || `<tr><td colspan="3">접속 기록 없음</td></tr>`}</tbody>
          </table>
        </div>
      `;

      $('#closeModal').onclick = closeModal;

      $('#showDaily').onclick = async () => {
        try {
          const r = await j(`/image/${imgId}/daily-visits`);
          const rows = (r.dailyVisits||[]).map(v=>`<tr><td>${v.date}</td><td>${v.count}</td></tr>`).join('');
          if (!document.getElementById('daily-visits-wrap')) {
            const wrap = document.createElement('div');
            wrap.id = 'daily-visits-wrap'; wrap.className = 'modal-table-wrap modal-subscroll';
            wrap.innerHTML = `<table class="modal-table"><thead><tr><th>날짜</th><th>방문수</th></tr></thead><tbody>${rows||'<tr><td colspan="2">없음</td></tr>'}</tbody></table>`;
            body.appendChild(wrap);
          }
          $('#showDaily').disabled = true; $('#showDaily').textContent = '불러옴';
        } catch { alert('방문일자 로딩 실패'); }
      };

      $('#downloadDetail').onclick = async () => {
        if (typeof XLSX === 'undefined') { alert('엑셀 라이브러리 없음'); return; }
        let dailyVisits = [];
        try { const r = await j(`/image/${imgId}/daily-visits`); dailyVisits = r.dailyVisits||[]; } catch {}
        const wb = XLSX.utils.book_new();
        const ws1 = XLSX.utils.aoa_to_sheet([['날짜','방문수'],...dailyVisits.map(v=>[v.date,v.count])]);
        const ws2 = XLSX.utils.aoa_to_sheet([['IP','UA','방문수'],...visitors.map(v=>[v.ip,v.ua,v.count])]);
        XLSX.utils.book_append_sheet(wb, ws1, '날짜별'); XLSX.utils.book_append_sheet(wb, ws2, '유저별');
        XLSX.writeFile(wb, `${(img.memo||imgId).replace(/[<>:"/\\|?*]/g,'_')}.xlsx`);
      };
    } catch (e) { console.error(e); alert('상세 정보 로딩 실패'); }
  }

})();


/** =========================================================
 *  로그인 페이지(login.html) - login-body
 *  - 사용자/관리자 탭 전환, 로그인 처리, 엔터키 제출
 *  - ✅ 어떤 계정이든 로그인 성공 시 항상 index.html로 이동
 * ======================================================= */
(function initLoginPage(){
  const isLoginPage = document.body && document.body.classList.contains('login-body');
  if (!isLoginPage) return;

  const userTab        = document.getElementById('userTab');
  const adminTab       = document.getElementById('adminTab');
  const userLoginForm  = document.getElementById('userLoginForm');
  const adminLoginForm = document.getElementById('adminLoginForm');
  const errorMessage   = document.getElementById('errorMessage');

  const showError = (msg)=>{
    if (!errorMessage) return;
    errorMessage.textContent = msg;
    errorMessage.style.display = 'block';
  };
  const hideError = ()=>{
    if (!errorMessage) return;
    errorMessage.style.display = 'none';
    errorMessage.textContent = '';
  };

  // 탭 전환
  if (userTab && adminTab && userLoginForm && adminLoginForm) {
    userTab.onclick = () => {
      userTab.classList.add('active');
      adminTab.classList.remove('active');
      userLoginForm.classList.remove('hidden');
      adminLoginForm.classList.add('hidden');
      hideError();
    };
    adminTab.onclick = () => {
      adminTab.classList.add('active');
      userTab.classList.remove('active');
      adminLoginForm.classList.remove('hidden');
      userLoginForm.classList.add('hidden');
      hideError();
    };
  }

  // 사용자 로그인
  if (userLoginForm) {
    userLoginForm.onsubmit = async (e) => {
      e.preventDefault(); hideError();
      const id = (document.getElementById('username')?.value || '').trim();
      const pw = document.getElementById('password')?.value || '';
      if (!id || !pw) return showError('아이디와 비밀번호를 모두 입력해주세요.');

      try {
        const res  = await fetch('/login', {
          method: 'POST',
          headers: { 'Content-Type':'application/json' },
          body: JSON.stringify({ id, pw }),
          credentials: 'include'
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || '로그인 실패');

        // ✅ 어떤 계정이든 로그인 성공 후 항상 첫 페이지로 이동
        location.href = 'index.html';
      } catch (err) {
        showError(err.message || '로그인 실패');
      }
    };
    document.getElementById('password')?.addEventListener('keypress', (e)=>{
      if (e.key === 'Enter') userLoginForm.dispatchEvent(new Event('submit'));
    });
  }

  // 관리자 로그인
  if (adminLoginForm) {
    adminLoginForm.onsubmit = async (e) => {
      e.preventDefault(); hideError();
      const pw = document.getElementById('adminPassword')?.value || '';
      if (!pw) return showError('관리자 비밀번호를 입력해주세요.');

      try {
        const res  = await fetch('/login', {
          method: 'POST',
          headers: { 'Content-Type':'application/json' },
          body: JSON.stringify({ id: 'hwaseon', pw }),
          credentials: 'include'
        });
        const data = await res.json();
        if (!res.ok || data.role !== 'admin') throw new Error(data.error || '관리자 로그인 실패');

        // ✅ 관리자도 예외 없이 첫 페이지로 이동
        location.href = 'index.html';
      } catch (err) {
        showError(err.message || '관리자 로그인 실패');
      }
    };
    document.getElementById('adminPassword')?.addEventListener('keypress', (e)=>{
      if (e.key === 'Enter') adminLoginForm.dispatchEvent(new Event('submit'));
    });
  }
})();


/** =========================================================
 *  다중 URL 페이지(multi-memo.html)
 *  - 엑셀에서 메모 추출 → 동일 이미지+각 메모로 업로드 → 결과 URL/메모 리스트
 *  - 복사/미리보기
 * ======================================================= */
(function MultiMemoIntegration() {
  const form = $('#multiMemoForm');
  if (!form) return;

  const memoList     = $('#multiMemoList');      // 선택적
  const addMemoBtn   = $('#addMultiMemoBtn');    // 선택적
  const resultDiv    = $('#multiMemoResult');
  const previewDiv   = $('#multiMemoPreview');
  const fileInput    = $('#multiMemoImage');
  const excelInput   = $('#multiMemoExcel');
  const excelNameDiv = $('#multiMemoExcelName');

  const esc = (s) => String(s ?? '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;')
    .replace(/'/g,'&#39;');

  let excelMemos = [];

  // 엑셀 파일에서 메모 추출
  if (excelInput) {
    excelInput.addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (!file) return;

      if (excelNameDiv) { excelNameDiv.textContent = file.name; excelNameDiv.classList.remove('hidden'); excelNameDiv.style.display=''; }

      if (typeof XLSX === 'undefined') { alert('엑셀 라이브러리가 로드되지 않았습니다.'); return; }

      const reader = new FileReader();
      reader.onload = (evt) => {
        const data = new Uint8Array(evt.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheet    = workbook.Sheets[workbook.SheetNames[0]];
        const rows     = XLSX.utils.sheet_to_json(sheet, { header: 1 });
        if (rows.length && rows[0][0] && rows[0][0].toString().includes('메모')) rows.shift();
        excelMemos = rows.map(r => r[0] ? r[0].toString() : '').filter(Boolean);
      };
      reader.readAsArrayBuffer(file);
    });
  }

  // 이미지 파일명 프리뷰
  if (fileInput && previewDiv) {
    fileInput.addEventListener('change', (e) => {
      const files = Array.from(e.target.files || []);
      if (files.length) {
        previewDiv.textContent = files.map(f => f.name).join('\n');
        previewDiv.classList.remove('hidden');
        previewDiv.style.display = '';
      } else {
        previewDiv.textContent = '';
        previewDiv.classList.add('hidden');
        previewDiv.style.display = 'none';
      }
    });
  }

  // 추가 메모 인풋(옵션)
  if (addMemoBtn && memoList) {
    addMemoBtn.onclick = function() {
      const count = memoList.querySelectorAll('input[name="memo"]').length;
      if (count >= 5) return alert('메모는 최대 5개까지 추가할 수 있습니다.');

      const wrapper = document.createElement('div');
      wrapper.className = 'input-group multi-memo-input-group';
      wrapper.style.display = 'flex';
      wrapper.style.alignItems = 'center';
      wrapper.style.gap = '8px';
      wrapper.style.marginBottom = '10px';
      wrapper.style.width = '100%';

      const input = document.createElement('input');
      input.type = 'text'; input.name = 'memo'; input.required = true; input.placeholder = '메모 입력';
      input.style.flex = '1'; input.style.fontSize = '1.08rem'; input.style.padding = '13px 14px';
      input.style.borderRadius = '8px'; input.style.border = '1.5px solid #e3e8f0';

      const del = document.createElement('button');
      del.type = 'button'; del.className = 'multi-memo-remove'; del.textContent = '삭제';
      Object.assign(del.style, { background:'#dc3545', color:'#fff', border:'none', borderRadius:'7px', padding:'0 10px', fontSize:'0.93rem', minWidth:'0', marginLeft:'8px', cursor:'pointer', height:'26px', lineHeight:'1', display:'flex', alignItems:'center', justifyContent:'center' });
      del.onclick = () => wrapper.remove();

      wrapper.appendChild(input);
      wrapper.appendChild(del);
      memoList.appendChild(wrapper);
    };
  }

  // 업로드 처리
  form.onsubmit = async function(e) {
    e.preventDefault();

    const files = fileInput?.files;
    if (!files || files.length !== 1) return alert('이미지는 1개만 선택하세요.');
    if (!excelMemos.length)         return alert('엑셀 파일에서 메모를 추출하지 못했습니다.');

    resultDiv.innerHTML = '<div class="mm-uploading">업로드 중...</div>';
    resultDiv.style.display = 'block';

    const results = [];
    for (let i = 0; i < excelMemos.length; i++) {
      const fd = new FormData();
      fd.append('image', files[0]);     // 동일 이미지
      fd.append('memo',  excelMemos[i]); // 메모만 변경
      try {
        const res  = await fetch('/upload', { method:'POST', body: fd });
        const data = await res.json();
        results.push({ url: data.url || (data.urls && data.urls[0]), memo: data.memo || (data.memos && data.memos[0]) });
      } catch (err) {
        console.error('Upload error:', err);
        results.push({ error: '업로드 실패' });
      }
    }

    // 결과 렌더 (스타일은 CSS로 분리)
    const previewUrl = URL.createObjectURL(files[0]);
    let html = `
      <div class="result-box mm-result-box">
        <div class="mm-img-wrap">
          <img src="${previewUrl}" class="mm-img result-img" alt="업로드 이미지">
        </div>
        <div class="mm-result-list">`;
    results.forEach((r, idx) => {
      if (r.error) {
        html += `<div class="mm-fail">${idx + 1}번째 업로드 실패</div>`;
      } else {
        const urlText = r.url ? `${location.origin}${r.url}` : '';
        html += `
          <div class="mm-result-item">
            <div class="mm-item-head">
              <span class="mm-url-label">URL ${idx + 1}:</span>
              <a href="${r.url}" target="_blank" class="mm-url">${esc(urlText)}</a>
              <button class="copy-btn" type="button">복사</button>
            </div>
            <div class="mm-item-body">
              <span class="mm-memo-label">메모:</span> ${esc(r.memo || '')}
            </div>
          </div>`;
      }
    });
    html += `</div></div>`;
    resultDiv.innerHTML = html;

    // === 전체 복사 버튼 주입 ===
    (() => {
      const box = resultDiv.querySelector('.mm-result-box');
      const list = resultDiv.querySelector('.mm-result-list');
      if (!box || !list) return;

      const topbar = document.createElement('div');
      topbar.style.display = 'flex';
      topbar.style.justifyContent = 'flex-end';
      topbar.style.gap = '8px';
      topbar.style.margin = '8px 0 6px';

      topbar.innerHTML = `
        <button type="button" id="copyAllMulti"
                style="height:32px;padding:0 12px;border-radius:8px;border:1px solid var(--line);
                      background:#111827;color:#fff;font-weight:800;cursor:pointer;">
          전체 복사
        </button>
      `;

      // 리스트 위에 삽입
      box.insertBefore(topbar, list);

      const btn = topbar.querySelector('#copyAllMulti');
      btn.addEventListener('click', async () => {
        const urls = Array.from(resultDiv.querySelectorAll('.mm-result-item a'))
          .map(a => a.href).filter(Boolean);
        if (!urls.length) return;
        await navigator.clipboard.writeText(urls.join('\n'));
        const old = btn.textContent;
        btn.textContent = '✅';
        setTimeout(() => (btn.textContent = old), 900);
      });
    })();


    // 복사 버튼
    resultDiv.querySelectorAll('.copy-btn').forEach(btn => {
      btn.addEventListener('click', function() {
        const url = this.parentNode.querySelector('a')?.href || '';
        if (!url) return;
        navigator.clipboard.writeText(url).then(() => {
          this.textContent = '✅';
          setTimeout(() => { this.textContent = '복사'; }, 1200);
        });
      });
    });

    // 이미지 모달(존재 시)
    const thumb = resultDiv.querySelector('.result-img');
    if (thumb) {
      thumb.addEventListener('click', () => {
        const modal    = $('#img-modal');
        const modalImg = $('#img-modal-img');
        if (!modal || !modalImg) return;
        modalImg.src = previewUrl;
        modal.style.display = 'flex';
      });
    }
  };
})();

/** =========================================================
 *  전역 네비게이션 버튼
 *  - 대시보드 버튼: 세션 확인 후 이동
 *  - 다중 URL 버튼: multi-memo.html로 이동
 * ======================================================= */
(function navButtons(){
  const dashBtn = $('#dashboardBtn');
  if (dashBtn) {
    dashBtn.addEventListener('click', async (e)=>{
      e.preventDefault();
      try { await j('/me'); location.href='dashboard.html'; }
      catch { location.href='login.html'; }
    });
  }
  const multiBtn = $('#multiMemoBtn');
  if (multiBtn) {
    multiBtn.addEventListener('click', (e) => {
      e.preventDefault();
      location.href = 'multi-memo.html';
    });
  }
})();

/** =========================================================
 *  관리자 페이지(admin.html) - admin-body
 *  - 관리자 인증 → 사용자 목록/생성/삭제/비번 표시+초기화
 * ======================================================= */
(function initAdminPage(){
  if (!document.body || !document.body.classList.contains('admin-body')) return;

  const usersTableBody    = document.querySelector('#usersTableBody');
  const createUserForm    = document.querySelector('#createUserForm');
  const createUserMessage = document.querySelector('#createUserMessage');

  // ----- 로컬 비밀번호 캐시 (브라우저에만 저장) -----
  const PW_CACHE_KEY = 'hw_pw_cache_v1';
  const loadPwCache = () => {
    try { return new Map(Object.entries(JSON.parse(localStorage.getItem(PW_CACHE_KEY) || '{}'))); }
    catch { return new Map(); }
  };
  const savePwCache = (map) => {
    localStorage.setItem(PW_CACHE_KEY, JSON.stringify(Object.fromEntries(map)));
  };
  const pwCache = loadPwCache();

  // ----- JSON fetch (안전) -----
  async function getJSON(url, opt = {}) {
    const res = await fetch(url, {
      credentials:'include',
      headers:{ Accept:'application/json', ...(opt.headers||{}) },
      ...opt
    });
    const type = res.headers.get('content-type') || '';
    const data = type.includes('application/json') ? await res.json() : null;
    if (!res.ok) throw new Error((data && (data.error||data.message)) || `HTTP ${res.status}`);
    return data;
  }

  const showMessage = (msg, ok) => {
    if (!createUserMessage) return;
    createUserMessage.textContent = msg;
    createUserMessage.className   = ok ? 'success-message' : 'error-message';
    setTimeout(()=>{ createUserMessage.textContent=''; createUserMessage.className=''; }, 3000);
  };

  // 권한 확인
  (async ()=>{
    try { const me = await getJSON('/me'); if (!me.id || me.role!=='admin') location.href='login.html'; }
    catch { location.href='login.html'; }
  })();

  // ----- 사용자 테이블 렌더 -----
  async function loadUsers(){
    const users = await getJSON('/users');
    usersTableBody.innerHTML = '';

    users.forEach(u=>{
      const tr = document.createElement('tr');

      // 권한 뱃지
      const roleHtml = (u.role==='admin')
        ? `<span class="role-badge role-badge--admin">관리자</span>`
        : `<span class="role-badge">일반사용자</span>`;

      // 비밀번호 셀
      let pwCellHTML = '<span class="muted">—</span>';
      if (u.role !== 'admin') {
        const plain = pwCache.get(u.id);
        if (plain) {
          // 기본: 보이는 상태(요청대로)
          pwCellHTML = `
            <div class="pw-wrap" data-user="${u.id}" data-plain="${escapeHtml(plain)}">
              <span class="pw-value" data-show="true">${escapeHtml(plain)}</span>
            </div>`;
        } else {
          pwCellHTML = `<button class="pw-reset-btn" data-reset="${u.id}">초기화</button>`;
        }
      }

      // 관리 셀
      const manageCell = (u.role==='admin')
        ? `<span class="muted">—</span>`
        : `<button class="delete-btn" data-id="${u.id}">삭제</button>`;

      tr.innerHTML = `
        <td>${u.id}</td>
        <td class="pw-cell">${pwCellHTML}</td>
        <td>${roleHtml}</td>
        <td>${manageCell}</td>
      `;
      usersTableBody.appendChild(tr);
    });

    

    // 보기/숨김 + 복사
    usersTableBody.querySelectorAll('.pw-wrap').forEach(wrap=>{
      const plain = wrap.dataset.plain || '';
      const span  = wrap.querySelector('.pw-value');
      wrap.addEventListener('click', e=>{
        const act = e.target?.dataset?.action;
        if (!act) return;
        if (act==='toggle'){
          const showing = span.getAttribute('data-show')==='true';
          if (showing){
            span.textContent = '••••••••';
            span.setAttribute('data-show','false');
            e.target.textContent = '보기';
          }else{
            span.textContent = plain;
            span.setAttribute('data-show','true');
          }
        }
        if (act==='copy'){
          if (!plain) return;
          navigator.clipboard.writeText(plain).then(()=>{
            e.target.textContent='✅'; setTimeout(()=> e.target.textContent='복사',900);
          });
        }
      });
    });

    // 삭제
    usersTableBody.querySelectorAll('.delete-btn').forEach(btn=>{
      btn.onclick = async ()=>{
        const id = btn.getAttribute('data-id');
        if (!confirm(`'${id}' 사용자를 삭제할까요?`)) return;
        try{
          const r = await getJSON(`/users/${encodeURIComponent(id)}`, { method:'DELETE' });
          if (r.success){ pwCache.delete(id); savePwCache(pwCache); btn.closest('tr')?.remove(); }
          else alert(r.error||'삭제 실패');
        }catch(e){ alert(e.message||'삭제 실패'); }
      };
    });
  }

  // ----- 사용자 생성: 성공 시 캐시에 비번 저장 → 목록 갱신 -----
  if (createUserForm){
    createUserForm.addEventListener('submit', async (e)=>{
      e.preventDefault();
      createUserMessage.textContent='';
      const id = document.querySelector('#newUsername').value.trim();
      const pw = document.querySelector('#newPassword').value;
      try{
        const r = await getJSON('/register', {
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ id, pw })
        });
        if (r.success===false) throw new Error(r.error||'생성 실패');
        pwCache.set(id, pw);          // ← 저장
        savePwCache(pwCache);         // ← 영구화
        showMessage('사용자 생성 성공!', true);
        createUserForm.reset();
        await loadUsers();
      }catch(err){ showMessage(err.message, false); }
    });
  }

  loadUsers().catch(e=>alert(e.message||'사용자 목록을 불러오지 못했습니다.'));
})();


// ===== Topbar 로그인 상태 토글 & Dashboard 가드 =====
(function topbarAuthAndGuard(){
  const authLink = document.getElementById('authLink');
  const navDash  = document.getElementById('navDashboard');

  // 로그인 상태 확인 → 버튼 토글
  if (authLink) {
    j('/me').then(me => {
      // 로그인 상태
      authLink.textContent = 'Logout';
      authLink.href = '#';
      authLink.onclick = async (e) => {
        e.preventDefault();
        try { await j('/logout', { method:'POST' }); }
        finally { location.href = 'login.html'; }
      };
    }).catch(() => {
      // 비로그인 상태
      authLink.textContent = 'Login';
      authLink.href = 'login.html';
      authLink.onclick = null;
    });
  }

  // Dashboard 링크 클릭 시 로그인 가드 (비로그인 → 로그인 페이지로)
  if (navDash) {
    navDash.addEventListener('click', async (e) => {
      e.preventDefault();
      try { await j('/me'); location.href = 'dashboard.html'; }
      catch { location.href = 'login.html'; }
    });
  }
})();


// ===== Topbar: 로그인 상태 반영 + 대시보드 접근 가드 =====
(function initTopbar(){
  const dashLink = document.getElementById('navDashboard');
  const authLink = document.getElementById('authLink');

  // 로그인 여부 확인 → Login/Logout 토글
  j('/me')
    .then(me => {
      // 로그인 상태: Logout으로 전환
      if (authLink) {
        authLink.textContent = 'Logout';
        authLink.href = '#';
        authLink.onclick = async (e) => {
          e.preventDefault();
          try { await j('/logout', { method: 'POST' }); } catch {}
          location.href = 'index.html'; // 로그아웃 후 첫 페이지로
        };
      }
    })
    .catch(() => {
      // 미로그인 상태: Login 유지
      if (authLink) {
        authLink.textContent = 'Login';
        authLink.href = 'login.html';
        authLink.onclick = null;
      }
    });

  // Dashboard 클릭 시 로그인 필수
  if (dashLink) {
    dashLink.addEventListener('click', async (e) => {
      e.preventDefault();
      try {
        await j('/me');                // 세션 OK면
        location.href = 'dashboard.html';
      } catch {
        location.href = 'login.html';  // 미로그인 → 로그인 페이지로
      }
    });
  }
})();


// ===== Topbar: 로그인 상태 반영 + 메뉴 가드 =====
(function initTopbar(){
  const userLink = document.getElementById('navUser');
  const dashLink = document.getElementById('navDashboard');
  const authLink = document.getElementById('authLink');

  // 로그인 여부 확인 → Login/Logout 토글
  j('/me')
    .then(me => {
      // 로그인 상태: Logout으로 전환
      if (authLink) {
        authLink.textContent = 'Logout';
        authLink.href = '#';
        authLink.onclick = async (e) => {
          e.preventDefault();
          try { await j('/logout', { method: 'POST' }); } catch {}
          location.href = 'index.html';      // 로그아웃 후 항상 첫 페이지
        };
      }
    })
    .catch(() => {
      // 미로그인 상태: Login 유지
      if (authLink) {
        authLink.textContent = 'Login';
        authLink.href = 'login.html';
        authLink.onclick = null;
      }
    });

  // Dashboard: 로그인 필수
  if (dashLink) {
    dashLink.addEventListener('click', async (e) => {
      e.preventDefault();
      try {
        await j('/me');                      // 세션 OK
        location.href = 'dashboard.html';
      } catch {
        location.href = 'login.html';        // 미로그인 → 로그인 페이지
      }
    });
  }

    // User(사용자 등록): 로그인 + 관리자만
  if (userLink) {
    userLink.addEventListener('click', async (e) => {
      e.preventDefault();
      try {
        const me = await j('/me');                 // 로그인 확인
        if (me.role === 'admin') {
          location.href = 'register.html';         // 관리자면 접근 OK
        } else {
          alert('관리자만 접근할 수 있습니다.');
        }
      } catch {
        // ✅ 미로그인인 경우: 먼저 안내 → 로그인 페이지로
        location.href = 'login.html';
      }
    });
  }

/** =========================================================
 *  헤더 네비 상태/동작
 *  - 로그인 여부/역할에 따라 링크 동작/표시 제어
 *  - 로그인한 ID 뱃지 표시
 *  - Dashboard: 미로그인 → login.html / 로그인 → dashboard.html
 *  - User: 관리자만 진입, 그 외엔 경고 + 로그인 유도
 *  - Auth: Login ↔ Logout 토글, Logout 시 index.html
 * ======================================================= */
(function initHeaderNav(){
  const dashLink = document.getElementById('dashboardLink');
  const userLink = document.getElementById('userLink');
  const authLink = document.getElementById('authLink');
  const whoami   = document.getElementById('whoami');

  if (!dashLink && !userLink && !authLink && !whoami) return; // 헤더 없는 페이지

  // 공통: ID 배지 숨김 헬퍼
  const hideWho = () => { if (whoami){ whoami.textContent=''; whoami.style.display='none'; } };
  const showWho = (id) => { if (whoami){ whoami.textContent = id || ''; whoami.style.display = id ? '' : 'none'; } };

  // 미로그인용 동작
  function wireAsGuest(){
    hideWho();
    if (authLink){
      authLink.textContent = 'Login';
      authLink.onclick = null;
      authLink.setAttribute('href','login.html');
    }
    if (dashLink){
      dashLink.onclick = (e)=>{ e.preventDefault(); location.href='login.html'; };
    }
    if (userLink){
      userLink.onclick = (e)=>{
        e.preventDefault();
        alert('관리자로 로그인해야 접근할 수 있습니다.');
        location.href = 'login.html';
      };
    }
  }

  // 로그인/역할별 동작
  function wireAsUser(me){
    showWho(me?.id);

    // Auth → Logout
    if (authLink){
      authLink.textContent = 'Logout';
      authLink.setAttribute('href','#');
      authLink.onclick = async (e)=>{
        e.preventDefault();
        try { await j('/logout', { method:'POST' }); } catch {}
        // 로그아웃 후 항상 첫 페이지
        location.href = 'index.html';
      };
    }

    // Dashboard → 대시보드로
    if (dashLink){
      dashLink.onclick = (e)=>{ e.preventDefault(); location.href='dashboard.html'; };
    }

    // User → 관리자만 register.html, 그 외엔 경고
    if (userLink){
      userLink.onclick = (e)=>{
        e.preventDefault();
        if (me?.role === 'admin') location.href = 'register.html';
        else alert('관리자만 접근할 수 있습니다.');
      };
    }
  }

    // 세션 확인 후 배선
    (async ()=>{
      try {
        const me = await j('/me');         // { id, role }
        if (!me?.id) return wireAsGuest();
        wireAsUser(me);
      } catch {
        wireAsGuest();
      }
    })();
  })();

})();
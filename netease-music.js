/**
 * Roche 插件: 网易云音乐
 *
 * 功能:
 *   - 搜索歌曲
 *   - 播放 (支持歌词滚动)
 *   - 每日推荐 (需登录)
 *   - 扫码登录 (cookie 存 localStorage)
 *
 * 依赖: https://rochemusic.zxinyi404.workers.dev
 *
 * 挂载方式:
 *   A. 自动挂载: HTML 里有 <div id="netease-music"></div> 即可
 *   B. 手动挂载: window.NeteaseMusicPlugin.mount(containerElement)
 *   C. Roche 注册: window.RochePlugin.register({ id, apps: [...] }) — 见文件底部
 */

(function () {
  'use strict';

  const WORKER = 'https://rochemusic.zxinyi404.workers.dev';
  const STORAGE_KEY = 'netease_cookie';

  /* ============== 存储 ============== */

  const getCookie = () => {
    try { return localStorage.getItem(STORAGE_KEY) || ''; }
    catch { return ''; }
  };
  const setCookie = (c) => {
    try { localStorage.setItem(STORAGE_KEY, c); } catch {}
  };
  const clearCookie = () => {
    try { localStorage.removeItem(STORAGE_KEY); } catch {}
  };

  /* ============== 网络 ============== */

  const CALL_TIMEOUT = 10000; // 10 秒, 防止 Worker 抽风时插件卡死
let currentCtrl = null; // 当前请求的 AbortController, 用于取消

  async function call(action, params = {}, { withCookie = true } = {}) {
    const headers = { 'Content-Type': 'application/json' };
    const cookie = withCookie ? getCookie() : '';
    if (cookie) headers['X-Netease-Cookie'] = cookie;

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), CALL_TIMEOUT);
    currentCtrl = ctrl;

    let res;
    try {
      res = await fetch(`${WORKER}/netease/${action}`, {
        method: 'POST',
        headers,
        body: JSON.stringify(params),
        signal: ctrl.signal,
      });
    } catch (e) {
      clearTimeout(timer);
      if (currentCtrl === ctrl) currentCtrl = null;
      if (e.name === 'AbortError') {
        throw new Error(`请求超时 (${CALL_TIMEOUT/1000}s): ${action}`);
      }
      throw new Error(`网络错误: ${e.message || e}`);
    }
    clearTimeout(timer);
    if (currentCtrl === ctrl) currentCtrl = null;

    if (!res.ok) throw new Error(`HTTP ${res.status} (${action})`);
    const data = await res.json();
    console.log(`[netease] ${action} ->`, data);
    return data;
  }

  // 取消当前在飞的请求
  function abortCurrent() {
    if (currentCtrl) { try { currentCtrl.abort(); } catch {} currentCtrl = null; }
  }

  /* ============== 工具 ============== */

  function el(tag, attrs, ...children) {
    const node = document.createElement(tag);
    if (attrs) {
      for (const k in attrs) {
        const v = attrs[k];
        if (v == null || v === false) continue;
        if (k === 'class') node.className = v;
        else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
        else if (k === 'html') node.innerHTML = v;
        else if (k.startsWith('on') && typeof v === 'function') {
          node.addEventListener(k.slice(2).toLowerCase(), v);
        } else node.setAttribute(k, v);
      }
    }
    for (const c of children.flat()) {
      if (c == null || c === false) continue;
      node.appendChild(
        typeof c === 'string' || typeof c === 'number'
          ? document.createTextNode(c)
          : c
      );
    }
    return node;
  }

  function fmt(t) {
    if (!t || t < 0) t = 0;
    const m = Math.floor(t / 60);
    const s = Math.floor(t % 60);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  function parseLyric(lrc) {
    if (!lrc) return [];
    const lines = [];
    const re = /\[(\d{1,2}):(\d{1,2})(?:\.(\d{1,3}))?](.*)/g;
    let m;
    while ((m = re.exec(lrc))) {
      const min = +m[1], sec = +m[2];
      const ms = m[3] ? +m[3].padEnd(3, '0') : 0;
      const text = (m[4] || '').trim();
      if (text) lines.push({ time: min * 60 + sec + ms / 1000, text });
    }
    return lines.sort((a, b) => a.time - b.time);
  }

  /* ============== 业务 API ============== */

  const api = {
    async search(keywords) {
      const r = await call('search', { keywords, type: 1, limit: 30 }, { withCookie: !!getCookie() });
      return r?.result?.songs || [];
    },
    async getSongUrl(id, level = 'standard') {
      const r = await call('song/url', { id, level }, { withCookie: !!getCookie() });
      return r?.data?.[0] || null;
    },
    async getLyric(id) {
      const r = await call('lyric', { id }, { withCookie: !!getCookie() });
      return parseLyric(r?.lrc?.lyric || '');
    },
    async getDailyRecommend() {
      const r = await call('recommend/songs', {}, { withCookie: true });
      return r?.data?.dailySongs || r?.dailySongs || [];
    },
    async getQrKey() {
      const r = await call('login/qrcode/key', {}, { withCookie: false });
      return r?.data?.unikey || r?.unikey || '';
    },
    async checkQrLogin(key) {
      return call('login/qrcode/check', { key }, { withCookie: false });
    },
    logout() {
      clearCookie();
      return Promise.resolve({ ok: true });
    },
  };

  /* ============== 样式 (使用 CSS 变量以适配明暗主题) ============== */

  const CSS = `
  .nm-root {
    display: flex; flex-direction: column; gap: 12px;
    padding: 12px; font-size: 14px;
    color: var(--text, #333);
  }
  .nm-bar { display: flex; gap: 8px; flex-wrap: wrap; }
  .nm-input {
    flex: 1; min-width: 120px;
    padding: 8px 12px; border-radius: 8px;
    border: 1px solid var(--border, #ddd);
    background: var(--bg-2, #fff);
    color: inherit; outline: none;
  }
  .nm-input:focus { border-color: var(--accent, #d33); }
  .nm-btn {
    padding: 8px 14px; border-radius: 8px; border: 0;
    background: var(--accent, #d33); color: #fff; cursor: pointer;
    white-space: nowrap;
  }
  .nm-btn:hover { opacity: 0.85; }
  .nm-btn.secondary { background: var(--bg-3, #555); }
  .nm-btn.ghost { background: transparent; color: var(--text, #333); }
  .nm-list {
    list-style: none; padding: 0; margin: 0;
    max-height: 45vh; overflow-y: auto;
  }
  .nm-item {
    display: flex; align-items: center; gap: 8px;
    padding: 8px 10px; border-radius: 6px; cursor: pointer;
  }
  .nm-item:hover { background: var(--bg-2, #f5f5f5); }
  .nm-item .info { flex: 1; min-width: 0; }
  .nm-item .name {
    font-weight: 500; overflow: hidden; text-overflow: ellipsis;
    white-space: nowrap;
  }
  .nm-item .meta {
    color: var(--text-2, #888); font-size: 12px;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .nm-item .dur { color: var(--text-2, #888); font-size: 12px; }
  .nm-player {
    display: flex; align-items: center; gap: 10px;
    padding: 10px;
    background: var(--bg-2, #f5f5f5);
    border-radius: 8px;
  }
  .nm-player audio { flex: 1; min-width: 0; }
  .nm-player .title { font-size: 12px; color: var(--text-2, #888); }
  .nm-lyric {
    height: 200px; overflow-y: auto;
    text-align: center; padding: 90px 8px;
    scroll-behavior: smooth;
    mask-image: linear-gradient(180deg, transparent 0, #000 80px, #000 calc(100% - 80px), transparent 100%);
    -webkit-mask-image: linear-gradient(180deg, transparent 0, #000 80px, #000 calc(100% - 80px), transparent 100%);
  }
  .nm-lyric .line {
    padding: 6px 0; color: var(--text-2, #888);
    transition: color .2s, font-size .2s, transform .2s;
  }
  .nm-lyric .line.active {
    color: var(--accent, #d33);
    font-size: 16px; font-weight: 600;
    transform: scale(1.05);
  }
  .nm-login { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 16px; }
  .nm-login img { width: 180px; height: 180px; border: 1px solid var(--border, #ddd); border-radius: 8px; }
  .nm-qr-img { width: 200px; height: 200px; background: #fff; padding: 8px; border-radius: 8px; }
  .nm-url-box { word-break: break-all; padding: 8px; background: var(--bg-2, #f5f5f5); border-radius: 6px; font-size: 12px; max-width: 280px; }
  .nm-empty { padding: 40px; text-align: center; color: var(--text-2, #888); }
  .nm-tip { font-size: 12px; color: var(--text-2, #888); }
  .nm-status { font-size: 12px; color: var(--text-2, #888); padding: 4px 8px; }
  .nm-status.logged { color: var(--accent, #d33); }
  `;

  function ensureStyles() {
    if (document.getElementById('netease-music-style')) return;
    const s = document.createElement('style');
    s.id = 'netease-music-style';
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  /* ============== 视图 ============== */

  function createView(root) {
    let audio = null;
    let lyricEl = null;
    let lyricLines = [];
    let pollTimer = null;
    let unmounted = false;

    const state = {
      queue: [],
      index: -1,
      currentSong: null,
    };

    function artistsOf(song) {
      return (song.ar || song.artists || []).map(a => a.name).join(' / ') || '未知艺人';
    }

    function albumOf(song) {
      return song.al?.name || song.album?.name || '';
    }

    function renderSongList(songs, onClick) {
      const list = el('ul', { class: 'nm-list' });
      if (!songs.length) {
        list.appendChild(el('li', { class: 'nm-empty' }, '没有结果'));
        return list;
      }
      songs.forEach((s, i) => {
        list.appendChild(
          el('li', {
            class: 'nm-item',
            onclick: () => onClick(s, i),
          },
            el('div', { class: 'info' },
              el('div', { class: 'name' }, s.name || '未知歌曲'),
              el('div', { class: 'meta' }, `${artistsOf(s)} · ${albumOf(s)}`),
            ),
            el('div', { class: 'dur' }, fmt((s.dt || 0) / 1000)),
          ),
        );
      });
      return list;
    }

    function renderLyric() {
      if (!lyricEl) return;
      lyricEl.innerHTML = '';
      if (!lyricLines.length) {
        lyricEl.appendChild(el('div', { class: 'line' }, '暂无歌词'));
        return;
      }
      lyricLines.forEach((l) => {
        lyricEl.appendChild(el('div', { class: 'line', 'data-time': l.time }, l.text || ' '));
      });
    }

    function syncLyric(t) {
      if (!lyricEl || !lyricLines.length) return;
      const lines = lyricEl.querySelectorAll('.line');
      let active = -1;
      for (let i = 0; i < lyricLines.length; i++) {
        if (lyricLines[i].time <= t) active = i;
        else break;
      }
      lines.forEach((ln, i) => ln.classList.toggle('active', i === active));
      if (active >= 0 && lines[active]) {
        const target = lines[active];
        const offset = target.offsetTop - lyricEl.clientHeight / 2 + target.clientHeight / 2;
        lyricEl.scrollTo({ top: offset, behavior: 'smooth' });
      }
    }

    async function playSong(song, index) {
      const list = root.querySelector('.nm-list-wrap');
      list.style.opacity = '0.5';
      try {
        const urlInfo = await api.getSongUrl(song.id, 'standard');
        if (!urlInfo || !urlInfo.url) {
          alert('该歌曲暂无可用音源 (可能需要 VIP)');
          return;
        }
        const lyric = await api.getLyric(song.id).catch(() => []);
        lyricLines = lyric;
        renderLyric();

        if (unmounted) return;
        state.currentSong = song;
        state.queue = [song];
        state.index = 0;

        audio.src = urlInfo.url;
        try { await audio.play(); } catch (_) { /* 用户手势后自动播放 */ }

        root.querySelector('.nm-player-title').textContent =
          `${song.name} - ${artistsOf(song)}`;
      } catch (e) {
        alert('播放失败: ' + e.message);
      } finally {
        if (list) list.style.opacity = '1';
      }
    }

    async function doSearch() {
      const input = root.querySelector('.nm-input');
      const kw = input.value.trim();
      if (!kw) return;
      const listWrap = root.querySelector('.nm-list-wrap');
      listWrap.innerHTML = '';
      listWrap.appendChild(el('div', { class: 'nm-empty' }, '搜索中...'));
      try {
        const songs = await api.search(kw);
        listWrap.innerHTML = '';
        listWrap.appendChild(renderSongList(songs, playSong));
      } catch (e) {
        listWrap.innerHTML = '';
        listWrap.appendChild(el('div', { class: 'nm-empty' }, '搜索失败: ' + e.message));
      }
    }

    async function doRecommend() {
      if (!getCookie()) {
        alert('请先登录网易云账号');
        return;
      }
      const listWrap = root.querySelector('.nm-list-wrap');
      listWrap.innerHTML = '';
      listWrap.appendChild(el('div', { class: 'nm-empty' }, '加载每日推荐中...'));
      try {
        const songs = await api.getDailyRecommend();
        listWrap.innerHTML = '';
        if (!songs.length) {
          listWrap.appendChild(el('div', { class: 'nm-empty' }, '今日暂无推荐'));
          return;
        }
        listWrap.appendChild(renderSongList(songs, playSong));
      } catch (e) {
        listWrap.innerHTML = '';
        listWrap.appendChild(el('div', { class: 'nm-empty' }, '加载失败: ' + e.message));
      }
    }

    async function doLogin() {
      const wrap = root.querySelector('.nm-login-wrap');
      wrap.innerHTML = '';

      // 加载状态: 提示 + 取消按钮
      const loading = el('div', { class: 'nm-empty' }, '正在获取登录 key...');
      const cancelBtn = el('button', {
        class: 'nm-btn ghost',
        onclick: () => { abortCurrent(); wrap.innerHTML = ''; },
      }, '取消');
      wrap.appendChild(loading);
      wrap.appendChild(cancelBtn);

      try {
        const key = await api.getQrKey();
        if (!key) throw new Error('获取 key 失败 (响应为空)');

        // 本地用 unikey 生成 QR 码图片 (qrserver.com 免费 API, 国内有时不稳)
        const loginUrl = `https://music.163.com/login?codekey=${encodeURIComponent(key)}`;
        const qrServices = [
          `https://api.qrserver.com/v1/create-qr-code/?size=200x200&margin=10&data=${encodeURIComponent(loginUrl)}`,
          `https://api.qrtools.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(loginUrl)}`,
        ];

        wrap.innerHTML = '';
        const status = el('div', { class: 'nm-tip' }, '请用网易云 APP 扫码登录');
        const img = el('img', { alt: 'QR Code', class: 'nm-qr-img' });
        let svcIdx = 0;
        img.src = qrServices[0];
        img.onerror = () => {
          if (svcIdx < qrServices.length - 1) {
            svcIdx++;
            img.src = qrServices[svcIdx];
          } else {
            // 所有 QR 服务都失败, 退化为显示 URL 文字让用户手动复制
            wrap.innerHTML = '';
            const tip = el('div', { class: 'nm-tip' }, 'QR 图加载失败, 请复制以下链接到网易云 APP 打开:');
            const urlBox = el('div', { class: 'nm-url-box' }, loginUrl);
            const copyBtn = el('button', {
              class: 'nm-btn ghost',
              onclick: () => {
                try { navigator.clipboard.writeText(loginUrl); alert('已复制, 粘贴到浏览器打开'); }
                catch { prompt('复制此链接:', loginUrl); }
              },
            }, '复制链接');
            const cancel = el('button', {
              class: 'nm-btn ghost',
              onclick: () => { if (pollTimer) { clearInterval(pollTimer); pollTimer = null; } wrap.innerHTML = ''; },
            }, '取消');
            wrap.appendChild(tip);
            wrap.appendChild(urlBox);
            wrap.appendChild(copyBtn);
            wrap.appendChild(cancel);
          }
        };
        const cancel = el('button', {
          class: 'nm-btn ghost',
          onclick: () => {
            if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
            wrap.innerHTML = '';
            updateStatus();
          },
        }, '取消');
        wrap.appendChild(img);
        wrap.appendChild(status);
        wrap.appendChild(cancel);

        // 轮询扫码状态
        pollTimer = setInterval(async () => {
          if (unmounted) return;
          try {
            const r = await api.checkQrLogin(key);
            if (r?.code === 803) {
              clearInterval(pollTimer); pollTimer = null;
              if (r.cookie) setCookie(r.cookie);
              wrap.innerHTML = '';
              wrap.appendChild(el('div', { class: 'nm-empty' }, '登录成功 ✅'));
              setTimeout(() => {
                if (!unmounted) { wrap.innerHTML = ''; updateStatus(); }
              }, 1500);
            } else if (r?.code === 800) {
              clearInterval(pollTimer); pollTimer = null;
              wrap.innerHTML = '';
              wrap.appendChild(el('div', { class: 'nm-empty' }, '二维码已过期，请重新登录'));
            } else if (r?.code === 802) {
              status.textContent = '已扫码，请在手机上确认';
            }
          } catch (e) {
            clearInterval(pollTimer); pollTimer = null;
            wrap.innerHTML = '';
            wrap.appendChild(el('div', { class: 'nm-empty' }, '登录出错: ' + e.message));
          }
        }, 2000);
      } catch (e) {
        wrap.innerHTML = '';
        wrap.appendChild(el('div', { class: 'nm-empty' }, '登录失败: ' + e.message));
        wrap.appendChild(el('button', {
          class: 'nm-btn ghost',
          onclick: () => { wrap.innerHTML = ''; },
        }, '关闭'));
      }
    }

    function doLogout() {
      if (!confirm('确定要退出登录吗?')) return;
      api.logout();
      updateStatus();
    }

    function updateStatus() {
      const s = root.querySelector('.nm-status');
      if (!s) return;
      if (getCookie()) {
        s.textContent = '● 已登录';
        s.classList.add('logged');
      } else {
        s.textContent = '○ 未登录';
        s.classList.remove('logged');
      }
    }

    function mount() {
      if (root._neteaseMounted) return;
      root._neteaseMounted = true;
      ensureStyles();
      root.classList.add('nm-root');
      root.innerHTML = '';

      const status = el('div', { class: 'nm-status' });
      const backBtn = el('button', {
        class: 'nm-btn ghost',
        onclick: () => {
          // 1) 停掉所有在飞的操作
          if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
          abortCurrent();
          // 2) 清空登录区 + 暂停播放
          const lw = root.querySelector('.nm-login-wrap');
          if (lw) lw.innerHTML = '';
          if (audio) { try { audio.pause(); } catch {} }
          const t = root.querySelector('.nm-player-title');
          if (t) t.textContent = '未播放';
          // 3) 尝试返回 Roche 上层页面 (按优先级试多种方式)
          try {
            if (typeof window.RochePlugin?.navigateBack === 'function') {
              window.RochePlugin.navigateBack();
            } else if (typeof window.Roche?.back === 'function') {
              window.Roche.back();
            } else if (window.parent && window.parent !== window && typeof window.parent.postMessage === 'function') {
              window.parent.postMessage({ type: 'roche-navigate-back', source: 'netease-music' }, '*');
            } else if (window.history.length > 1) {
              window.history.back();
            } else {
              // 最后兜底: 调用 plugin 自己的 unmount, 让 Roche 把这个 App 卸掉
              window.NeteaseMusicPlugin?.unmount?.(root);
            }
          } catch (e) {
            console.warn('[netease] back navigation failed', e);
            try { window.NeteaseMusicPlugin?.unmount?.(root); } catch {}
          }
        },
      }, '← 返回');
      const loginBtn = el('button', { class: 'nm-btn secondary', onclick: doLogin }, '登录');
      const logoutBtn = el('button', { class: 'nm-btn ghost', onclick: doLogout }, '退出');
      const header = el('div', { class: 'nm-bar' }, backBtn, status, loginBtn, logoutBtn);

      const input = el('input', {
        class: 'nm-input', type: 'text', placeholder: '搜索歌曲 / 歌手',
      });
      const searchBtn = el('button', { class: 'nm-btn', onclick: doSearch }, '搜索');
      const recBtn = el('button', { class: 'nm-btn secondary', onclick: doRecommend }, '每日推荐');
      const searchBar = el('div', { class: 'nm-bar' }, input, searchBtn, recBtn);
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') doSearch(); });

      const listWrap = el('div', { class: 'nm-list-wrap' });
      listWrap.appendChild(el('div', { class: 'nm-empty' }, '请输入关键词搜索'));

      const loginWrap = el('div', { class: 'nm-login-wrap' });

      lyricEl = el('div', { class: 'nm-lyric' });
      lyricEl.appendChild(el('div', { class: 'line' }, ' '));

      audio = el('audio', { controls: 'true', preload: 'metadata' });
      audio.addEventListener('timeupdate', () => syncLyric(audio.currentTime));
      const playerTitle = el('div', { class: 'title nm-player-title' }, '未播放');
      const player = el('div', { class: 'nm-player' }, playerTitle, audio);

      root.appendChild(header);
      root.appendChild(searchBar);
      root.appendChild(listWrap);
      root.appendChild(loginWrap);
      root.appendChild(lyricEl);
      root.appendChild(player);

      updateStatus();
    }

    function unmount() {
      unmounted = true;
      if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
      if (audio) {
        try { audio.pause(); } catch {}
        audio.removeAttribute('src');
        audio.load();
        audio = null;
      }
      lyricEl = null;
      lyricLines = [];
      root.classList.remove('nm-root');
      root.innerHTML = '';
      root._neteaseMounted = false;
    }

    updateStatus();
    return { mount, unmount, isMounted: () => !!root._neteaseMounted };
  }

  /* ============== 注册到 Roche 插件系统 ============== */

  const PLUGIN_ID  = 'netease-music';
  const APP_MUSIC  = 'netease-music-app';

  function mountTo(container) {
    if (!container) return;
    const view = createView(container);
    view.mount();
    container._neteaseView = view;
    return view;
  }

  function unmountFrom(container) {
    if (container && container._neteaseView) {
      container._neteaseView.unmount();
      delete container._neteaseView;
    }
  }

  // 暴露给 DevTools / 手动挂载
  window.NeteaseMusicPlugin = {
    id: PLUGIN_ID,
    name: '网易云音乐',
    version: '1.0.0',
    mount: mountTo,
    unmount: unmountFrom,
  };

  // 自动挂载 (如果 HTML 里有 <div id="netease-music">)
  function tryAutoMount() {
    const target = document.getElementById('netease-music')
      || document.querySelector('[data-plugin="netease-music"]');
    if (target && !target._neteaseView) mountTo(target);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', tryAutoMount);
  } else {
    tryAutoMount();
  }

  // 向 Roche 注册一个 App
  if (window.RochePlugin && typeof window.RochePlugin.register === 'function') {
    window.RochePlugin.register({
      id: PLUGIN_ID,
      name: '网易云音乐',
      version: '1.0.0',
      apps: [
        {
          id: APP_MUSIC,
          name: '网易云音乐',
          icon: 'music_note',
          iconImage: '',
          async mount(container, root) { mountTo(container); },
          async unmount(container) { unmountFrom(container); },
        }
      ]
    });
  }
})();
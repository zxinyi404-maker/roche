;(function () {
  // ══════════════════════════════════════════════════════
  //  记忆曲线·简  v1.1.0
  //  改动：
  //   - 完全移除向量记忆 API，仅用 getLongTerm
  //   - 批量遗忘保护重要/情感记忆
  //   - 排序按影响权重降序
  //   - 展示标记 “受保护”
  // ══════════════════════════════════════════════════════

  const PLUGIN_ID  = "memory-curve-lite"
  const APP_HOME   = "mcl-home"
  const APP_COG    = "mcl-cognition"
  const APP_RECALL = "mcl-recall"

  // ── 遗忘曲线参数（单位: 天）─────────────────────────
  const STABILITY = { emotional: 60, important: 21, normal: 7, trivial: 2 }
  const EMOTIONAL_KW = ["伤心","难过","哭","开心","感动","害怕","愤怒","爱","恨",
                        "心疼","失望","惊喜","触动","心理阴影","委屈","孤独","温暖","痛苦","后悔"]
  const IMPORTANT_KW = ["喜欢","讨厌","习惯","偏好","总是","从不","生日","名字","工作",
                        "家人","朋友","梦想","目标","不喜欢","最爱","害怕"]

  // ── 工具函数 ──────────────────────────────────────
  function classifyText(t) {
    t = t || ""
    if (EMOTIONAL_KW.some(k => t.includes(k))) return "emotional"
    if (IMPORTANT_KW.some(k => t.includes(k))) return "important"
    if (t.length > 25) return "normal"
    return "trivial"
  }

  function calcRetention(mem, overrides) {
    const text = mem.summaryText || mem.action || mem.text || ""
    const kind = (overrides || {})[mem.id] || classifyText(text)
    const S    = STABILITY[kind] || 7
    let days   = 0
    const raw  = mem.createdAt || mem.timestamp
    if (raw) {
      const ts = typeof raw === "number" ? raw : Date.parse(raw)
      if (!isNaN(ts)) days = (Date.now() - ts) / 86400000
    }
    return Math.max(0, Math.round(Math.exp(-days / S) * 100))
  }

  function retLabel(r) { return r > 70 ? "清晰" : r > 40 ? "模糊" : r > 20 ? "淡化" : "即将遗忘" }
  function kindLabel(k) { return ({ emotional: "情感", important: "重要", normal: "普通", trivial: "琐碎" }[k] || k) }

  // 获取记忆的影响权重（用于排序）
  function getWeight(mem, overrides) {
    const kind = overrides[mem.id] || classifyText(mem.summaryText || mem.action || mem.text || "")
    return { emotional: 4, important: 3, normal: 2, trivial: 1 }[kind] || 0
  }

  // 判断该记忆是否受批量遗忘保护（情感/重要）
  function isProtected(mem, overrides) {
    const kind = overrides[mem.id] || classifyText(mem.summaryText || mem.action || mem.text || "")
    return kind === "emotional" || kind === "important"
  }

  function fmtAge(mem) {
    const raw = mem.createdAt || mem.timestamp
    if (!raw) return ""
    const ts = typeof raw === "number" ? raw : Date.parse(raw)
    if (isNaN(ts)) return ""
    const d = Math.floor((Date.now() - ts) / 86400000)
    if (d === 0) return "今天"
    if (d === 1) return "昨天"
    if (d < 7) return `${d}天前`
    if (d < 30) return `${Math.floor(d / 7)}周前`
    return `${Math.floor(d / 30)}个月前`
  }
  function escHtml(s) { return String(s || "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;") }

  // ── 极简样式 ──────────────────────────────────────
  const STYLE_ID  = "mcl-style"
  const STYLE_CSS = `
.mcl-root{display:flex;flex-direction:column;height:100%;overflow:hidden;font-family:system-ui,-apple-system,sans-serif;font-size:14px;background:#0c0c0e;color:#e4e4f0}
.mcl-header{display:flex;align-items:center;gap:10px;padding:10px 16px;border-bottom:1px solid rgba(255,255,255,.07);flex-shrink:0}
.mcl-header h2{margin:0;font-size:15px;font-weight:600;flex:1}
.mcl-back{background:none;border:none;color:#e4e4f0;cursor:pointer;padding:4px 8px;border-radius:6px;font-size:15px;opacity:.7}
.mcl-back:hover{opacity:1;background:rgba(255,255,255,.08)}
.mcl-controls{display:flex;gap:6px;padding:8px 16px;flex-shrink:0;flex-wrap:wrap;align-items:center}
.mcl-select{flex:1;min-width:0;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);color:#e4e4f0;border-radius:6px;padding:5px 10px;font-size:13px}
.mcl-btn{background:rgba(167,139,250,.15);border:1px solid rgba(167,139,250,.3);color:#a78bfa;border-radius:6px;padding:5px 10px;cursor:pointer;font-size:12px;white-space:nowrap}
.mcl-btn:hover{background:rgba(167,139,250,.28)}
.mcl-btn:disabled{opacity:.35;cursor:not-allowed}
.mcl-btn.red{background:rgba(248,113,113,.1);border-color:rgba(248,113,113,.3);color:#f87171}
.mcl-btn.red:hover{background:rgba(248,113,113,.2)}
.mcl-btn.green{background:rgba(74,222,128,.1);border-color:rgba(74,222,128,.3);color:#4ade80}
.mcl-btn.green:hover{background:rgba(74,222,128,.2)}
.mcl-stat-row{display:flex;gap:6px;padding:6px 16px;flex-shrink:0}
.mcl-stat{flex:1;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08);border-radius:6px;padding:6px 4px;text-align:center;font-size:11px;opacity:.85}
.mcl-stat strong{display:block;font-size:17px;font-weight:700;margin-bottom:1px}
.mcl-list{flex:1;overflow-y:auto;padding:6px 16px 20px}
.mcl-empty{text-align:center;opacity:.3;padding:40px 0;font-size:13px}
.mcl-loading{text-align:center;opacity:.4;padding:30px 0;font-size:13px}
.mcl-card{background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08);border-radius:8px;padding:10px;margin-bottom:6px}
.mcl-card-text{font-size:13px;line-height:1.5;margin-bottom:6px}
.mcl-kind-tag{display:inline-block;font-size:10px;padding:1px 6px;border-radius:3px;background:rgba(167,139,250,.14);color:#c4b5fd}
.mcl-bar-row{display:flex;align-items:center;gap:6px;margin-bottom:4px}
.mcl-bar{flex:1;height:4px;background:rgba(255,255,255,.1);border-radius:2px;overflow:hidden}
.mcl-bar-fill{height:100%;border-radius:2px;transition:width .3s}
.mcl-bar-label{font-size:10px;width:60px;text-align:right}
.mcl-card-meta{font-size:10px;opacity:.3;margin-bottom:4px}
.mcl-card-actions{display:flex;gap:4px;flex-wrap:wrap}
.mcl-mini{font-size:10px;padding:2px 7px;border-radius:4px;cursor:pointer;border:1px solid;transition:background .1s}
.mcl-mini.g{background:rgba(74,222,128,.09);border-color:rgba(74,222,128,.25);color:#4ade80}
.mcl-mini.g:hover{background:rgba(74,222,128,.18)}
.mcl-mini.o{background:rgba(251,146,60,.09);border-color:rgba(251,146,60,.25);color:#fb923c}
.mcl-mini.o:hover{background:rgba(251,146,60,.18)}
.mcl-mini.r{background:rgba(248,113,113,.09);border-color:rgba(248,113,113,.2);color:#f87171}
.mcl-mini.r:hover{background:rgba(248,113,113,.18)}
.mcl-dist-wrap{padding:0 16px 6px;flex-shrink:0}
.mcl-dist{display:flex;height:5px;border-radius:3px;overflow:hidden;gap:1px}
.mcl-dist-seg{border-radius:1px;transition:flex .3s}
.mcl-dist-labels{display:flex;justify-content:space-between;margin-top:2px;font-size:9px;opacity:.35}
.mcl-msg-sender{font-weight:600;font-size:11px;opacity:.6;margin-bottom:2px}
.mcl-msg-text{font-size:12px;line-height:1.5}
.mcl-cog-body{flex:1;overflow-y:auto;padding:14px 16px}
.mcl-cog-hint{text-align:center;opacity:.35;padding:30px 20px;font-size:13px}
.mcl-cog-section{background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.07);border-radius:8px;padding:12px;margin-bottom:8px}
.mcl-cog-section h3{margin:0 0 6px;font-size:13px;color:#c4b5fd;font-weight:600}
.mcl-cog-section p{margin:0;font-size:13px;line-height:1.7;opacity:.88;white-space:pre-wrap}
.mcl-thinking{text-align:center;opacity:.4;padding:24px;font-size:12px;font-style:italic}
.mcl-cog-meta{font-size:10px;opacity:.25;padding:4px 0 8px;text-align:center}
.mcl-cache-bar{display:flex;align-items:center;gap:8px;padding:6px 12px;margin-bottom:8px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.07);border-radius:6px;font-size:11px;opacity:.7}
.mcl-cache-bar span{flex:1}
/* recall */
.mcl-rc-root{display:flex;flex-direction:column;height:100%;overflow:hidden;font-family:system-ui,-apple-ui,sans-serif;background:#0c0c0e;color:#e4e4f0;font-size:14px}
.mcl-rc-search-bar{display:flex;gap:6px;padding:8px 16px;flex-shrink:0;align-items:center}
.mcl-rc-input{flex:1;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);color:#e4e4f0;border-radius:6px;padding:5px 10px;font-size:13px;outline:none}
.mcl-rc-input:focus{border-color:#a78bfa}
.mcl-rc-row{display:flex;gap:4px;padding:4px 16px;flex-wrap:wrap;align-items:center}
.mcl-rc-item{padding:8px 16px;border-bottom:1px solid rgba(255,255,255,.06)}
.mcl-rc-code{font-size:10px;color:#8585a0;font-family:monospace;letter-spacing:.5px}
.mcl-rc-body{font-size:12px;line-height:1.6;margin:4px 0 6px;word-break:break-word}
.mcl-rc-meta{display:flex;gap:6px;flex-wrap:wrap;align-items:center;font-size:10px}
.mcl-rc-chip{padding:1px 5px;border-radius:3px}
.mcl-rc-chip.green{color:#4ade80;border:1px solid rgba(74,222,128,.2)}
.mcl-rc-chip.yellow{color:#facc15;border:1px solid rgba(250,204,21,.2)}
.mcl-rc-chip.orange{color:#fb923c;border:1px solid rgba(251,146,60,.2)}
.mcl-rc-chip.red{color:#f87171;border:1px solid rgba(248,113,113,.2)}
.mcl-rc-rel{font-size:10px;margin-left:4px;color:#a78bfa}
.mcl-rc-stats{padding:6px 16px;display:flex;gap:10px;flex-wrap:wrap;font-size:10px;color:#8585a0;border-top:1px solid rgba(255,255,255,.06);flex-shrink:0}
.mcl-rc-inject{background:rgba(167,139,250,.1);border:1px solid rgba(167,139,250,.25);color:#a78bfa;padding:8px 16px;flex-shrink:0;cursor:pointer;font-size:11px;text-align:center}
.mcl-rc-inject:hover{background:rgba(167,139,250,.2)}
.protected-icon{color:#4ade80;font-size:11px;margin-left:4px}
  `

  function ensureStyle() {
    if (!document.getElementById(STYLE_ID)) {
      const s = document.createElement("style")
      s.id = STYLE_ID
      s.textContent = STYLE_CSS
      document.head.appendChild(s)
    }
  }
  function removeStyle() {
    const el = document.getElementById(STYLE_ID)
    if (el) el.remove()
  }

  // ── 加载角色列表 ──────────────────────────────────
  async function loadCharOptions(sel, roche) {
    const chars = await roche.character.list().catch(() => [])
    sel.innerHTML = '<option value="">— 选择角色 —</option>' +
      chars.map(c =>
        `<option value="${escHtml(c.id)}" data-conv="${escHtml(c.conversationId || c.id)}">${escHtml(c.handle || c.name)}</option>`
      ).join("")
    return chars
  }

  // ══════════════════════════════════════════════════════
  //  App 1: Home — 记忆管理（含遗忘曲线 & 保护）
  // ══════════════════════════════════════════════════════
  async function mountHome(container, roche) {
    ensureStyle()
    container.innerHTML = `
<div class="mcl-root">
  <div class="mcl-header">
    <button class="mcl-back" id="mh-back">←</button>
    <h2>记忆曲线</h2>
    <button class="mcl-btn green" id="mh-export" style="font-size:11px;padding:3px 8px">导出</button>
    <button class="mcl-btn" id="mh-refresh" style="font-size:11px;padding:3px 8px">刷新</button>
  </div>
  <div class="mcl-controls">
    <select class="mcl-select" id="mh-char"></select>
    <button class="mcl-btn green" id="mh-bulk-emote" style="font-size:11px">批量强化情感</button>
    <button class="mcl-btn red" id="mh-apply-forget" style="font-size:11px">应用遗忘</button>
  </div>
  <div class="mcl-dist-wrap" id="mh-dist-wrap" style="display:none">
    <div class="mcl-dist" id="mh-dist"></div>
    <div class="mcl-dist-labels"><span>清晰</span><span>模糊</span><span>淡化</span><span>遗忘</span></div>
  </div>
  <div class="mcl-stat-row" id="mh-stats"></div>
  <div class="mcl-list" id="mh-list"><div class="mcl-loading">请先选择角色</div></div>
</div>`

    let data = { facts: [], short: [], core: null }
    let overrides = (await roche.storage.get("mcl-overrides").catch(() => null)) || {}
    let convId = null

    const $ = id => container.querySelector(id)

    $("#mh-back").onclick    = () => roche.ui.closeApp()
    $("#mh-refresh").onclick = () => { if (convId) load() }

    // 导出
    $("#mh-export").onclick = () => {
      const items = data.facts
      if (!items.length) { roche.ui.toast("暂无记忆"); return }
      const text = items.map((f, i) => {
        const r = calcRetention(f, overrides)
        const k = kindLabel(overrides[f.id] || classifyText(f.summaryText || f.action || f.text || ""))
        return `[${String(i + 1).padStart(3, "0")}][${k}][${retLabel(r)} ${r}%] ${f.summaryText || f.action || f.text || "（无）"}`
      }).join("\n")
      navigator.clipboard?.writeText(text).catch(() => {})
      roche.ui.toast(`复制了 ${items.length} 条记忆`)
    }

    // 批量强化情感
    $("#mh-bulk-emote").onclick = async () => {
      const items = data.facts
      if (!items.length) { roche.ui.toast("请先加载记忆"); return }
      const targets = items.filter(f => {
        const t = f.summaryText || f.action || f.text || ""
        const cur = overrides[f.id] || classifyText(t)
        return cur === "emotional" || EMOTIONAL_KW.some(k => t.includes(k))
      })
      if (!targets.length) { roche.ui.toast("未发现情感记忆"); return }
      const ok = await roche.ui.confirm({ title: "批量强化", message: `将 ${targets.length} 条内存标为最高保留级别（60天）` })
      if (!ok) return
      targets.forEach(f => { overrides[f.id] = "emotional" })
      await roche.storage.set("mcl-overrides", overrides)
      renderStats(); render(); renderDist()
      roche.ui.toast("已强化")
    }

    // 应用遗忘（保护重要/情感记忆）
    $("#mh-apply-forget").onclick = async () => {
      if (!convId) { roche.ui.toast("请先选择角色"); return }
      const toDel = data.facts.filter(f => {
        const r = calcRetention(f, overrides)
        // 保留率 < 15% 且 不受保护（不是情感/重要）才删除
        return r < 15 && !isProtected(f, overrides)
      })
      if (!toDel.length) { roche.ui.toast("暂无符合条件的可遗忘记忆"); return }
      const ok = await roche.ui.confirm({
        title: "应用遗忘",
        message: `将删除 ${toDel.length} 条淡化记忆（情感/重要记忆不受影响）`
      })
      if (!ok) return
      let done = 0
      for (const m of toDel) {
        try { await roche.memory.delete(m.id); done++ } catch {}
      }
      await load()
      roche.ui.toast(`已清理 ${done} 条日常记忆`)
    }

    const sel = $("#mh-char")
    await loadCharOptions(sel, roche)
    sel.onchange = () => { convId = sel.value || null; if (convId) load() }

    async function load() {
      if (!convId) return
      $("#mh-list").innerHTML = '<div class="mcl-loading">读取中…</div>'
      try {
        const [lt, st] = await Promise.all([
          roche.memory.getLongTerm({ conversationId: convId, limit: 300 }),
          roche.memory.getShortTerm({ conversationId: convId, limit: 120 })
        ])
        data.facts = lt.facts || []
        data.short = st || []
        data.core = lt.core || null
        renderDist()
        renderStats()
        render()
      } catch (e) {
        $("#mh-list").innerHTML = `<div class="mcl-empty">读取失败：${escHtml(e.message)}</div>`
      }
    }

    function renderDist() {
      const wrap = $("#mh-dist-wrap")
      if (!data.facts.length) { wrap.style.display = "none"; return }
      wrap.style.display = ""
      const b = { clear: 0, fuzzy: 0, fading: 0, gone: 0 }
      data.facts.forEach(f => {
        const r = calcRetention(f, overrides)
        if (r > 70) b.clear++
        else if (r > 40) b.fuzzy++
        else if (r > 20) b.fading++
        else b.gone++
      })
      const total = data.facts.length
      $("#mh-dist").innerHTML = [
        [b.clear, "#4ade80"],
        [b.fuzzy, "#facc15"],
        [b.fading, "#fb923c"],
        [b.gone, "#f87171"]
      ].map(([n, col]) => n > 0 ? `<div class="mcl-dist-seg" style="flex:${n};background:${col}"></div>` : "").join("")
    }

    function renderStats() {
      const rets = data.facts.map(f => calcRetention(f, overrides))
      const clear = rets.filter(r => r > 70).length
      const fade = rets.filter(r => r <= 20).length
      const protect = data.facts.filter(f => isProtected(f, overrides)).length
      $("#mh-stats").innerHTML = `
        <div class="mcl-stat"><strong>${data.facts.length}</strong>事实记忆</div>
        <div class="mcl-stat"><strong style="color:#4ade80">${clear}</strong>清晰</div>
        <div class="mcl-stat"><strong style="color:#f87171">${fade}</strong>即将遗忘</div>
        <div class="mcl-stat"><strong style="color:#818cf8">${protect}</strong>受保护</div>`
    }

    function render() {
      const list = $("#mh-list")
      if (!data.facts.length) { list.innerHTML = '<div class="mcl-empty">暂无事实记忆</div>'; return }

      // 排序：按权重（情感>重要>普通>琐碎）降序，再按保留率升序
      const sorted = data.facts.map(f => ({
        ...f,
        _r: calcRetention(f, overrides),
        _w: getWeight(f, overrides),
        _protected: isProtected(f, overrides)
      })).sort((a, b) => (b._w - a._w) || (a._r - b._r))

      list.innerHTML = sorted.map(f => {
        const r = f._r
        const text = escHtml(f.summaryText || f.action || f.text || "（无）")
        const kind = overrides[f.id] || classifyText(f.summaryText || f.action || f.text || "")
        const col = r > 70 ? "#4ade80" : r > 40 ? "#facc15" : r > 20 ? "#fb923c" : "#f87171"
        const prot = f._protected
        return `<div class="mcl-card">
          <div class="mcl-card-text">${text}
            <span class="mcl-kind-tag">${kindLabel(kind)}</span>
            ${prot ? '<span class="protected-icon">🔒 受保护</span>' : ''}
          </div>
          <div class="mcl-bar-row">
            <div class="mcl-bar"><div class="mcl-bar-fill" style="width:${r}%;background:${col}"></div></div>
            <div class="mcl-bar-label" style="color:${col}">${retLabel(r)} ${r}%</div>
          </div>
          <div class="mcl-card-meta">${fmtAge(f)}</div>
          <div class="mcl-card-actions">
            <button class="mcl-mini g" data-id="${f.id}" data-act="reinforce">+ 强化</button>
            <button class="mcl-mini o" data-id="${f.id}" data-act="elevate">⬆ 升级</button>
            <button class="mcl-mini r" data-id="${f.id}" data-act="forget">✕ 遗忘</button>
          </div>
        </div>`
      }).join("")

      list.querySelectorAll("[data-act]").forEach(btn => {
        btn.onclick = () => handleAction(btn.dataset.act, btn.dataset.id)
      })
    }

    async function handleAction(act, memId) {
      const mem = data.facts.find(f => f.id === memId)
      if (!mem) return
      if (act === "forget") {
        const ok = await roche.ui.confirm({ title: "确认遗忘", message: "将从Roche主记忆删除，不可撤销" })
        if (!ok) return
        try {
          await roche.memory.delete(memId)
          data.facts = data.facts.filter(f => f.id !== memId)
          delete overrides[memId]
          await roche.storage.set("mcl-overrides", overrides)
          renderDist()
          renderStats()
          render()
          roche.ui.toast("已遗忘")
        } catch (e) {
          roche.ui.toast("删除失败：" + e.message)
        }
      } else {
        const levels = ["trivial", "normal", "important", "emotional"]
        const cur = overrides[memId] || classifyText(mem.summaryText || mem.action || "")
        overrides[memId] = levels[Math.min(levels.indexOf(cur) + 1, levels.length - 1)]
        await roche.storage.set("mcl-overrides", overrides)
        renderDist()
        render()
        roche.ui.toast(`已升级为 ${kindLabel(overrides[memId])}，保留期延长`)
      }
    }
  }

  // ══════════════════════════════════════════════════════
  //  App 2: 角色认知（保持不变）
  // ══════════════════════════════════════════════════════
  async function mountCognition(container, roche) {
    ensureStyle()
    container.innerHTML = `
<div class="mcl-root">
  <div class="mcl-header">
    <button class="mcl-back" id="cg-back">←</button>
    <h2>角色认知</h2>
  </div>
  <div class="mcl-controls">
    <select class="mcl-select" id="cg-char"></select>
    <button class="mcl-btn" id="cg-gen">生成自述</button>
  </div>
  <div class="mcl-cog-body" id="cg-body">
    <div class="mcl-cog-hint">选择角色后点击「生成自述」，<br>让角色用第一人称回忆对你的印象</div>
  </div>
</div>`

    const $ = id => container.querySelector(id)
    $("#cg-back").onclick = () => roche.ui.closeApp()
    const sel = $("#cg-char")
    await loadCharOptions(sel, roche)

    sel.onchange = () => { if (sel.value) checkCache(sel.value) }

    async function checkCache(charId) {
      const cached = await roche.storage.get(`mcl-cog-${charId}`).catch(() => null)
      if (cached && cached.text) renderCached(charId, cached)
    }

    function renderCached(charId, cached) {
      const body = $("#cg-body")
      body.innerHTML = `
        <div class="mcl-cache-bar">
          <span>上次生成：${(() => { const m = Math.floor((Date.now() - cached.ts) / 60000); return m < 1 ? "刚刚" : m < 60 ? m + "分钟前" : Math.floor(m / 60) + "小时前" })()}</span>
          <button class="mcl-btn" id="cg-regen" style="font-size:11px;padding:2px 7px">重新生成</button>
          <button class="mcl-btn red" id="cg-clear" style="font-size:11px;padding:2px 7px">清除缓存</button>
        </div>
        <div class="mcl-cog-section">
          <h3>${escHtml(cached.charName || "角色")} 眼中的 ${escHtml(cached.userName || "你")}</h3>
          <p>${escHtml(cached.text)}</p>
        </div>
        <div class="mcl-cog-meta">基于 ${cached.factCount} 条事实记忆${cached.hasCore ? "·含核心" : ""}${cached.emotionCount ? "·" + cached.emotionCount + "条情感" : ""}</div>`
      $("#cg-regen").onclick = async () => {
        await roche.storage.delete(`mcl-cog-${charId}`).catch(() => {})
        await generate(charId)
      }
      $("#cg-clear").onclick = async () => {
        await roche.storage.delete(`mcl-cog-${charId}`).catch(() => {})
        body.innerHTML = '<div class="mcl-cog-hint">缓存已清除</div>'
      }
    }

    async function generate(charId) {
      const body = $("#cg-body")
      body.innerHTML = '<div class="mcl-thinking">角色正在回忆…</div>'
      try {
        const char = await roche.character.get(charId).catch(() => null)
        if (!char) { body.innerHTML = '<div class="mcl-empty">读取角色失败</div>'; return }
        const [activeUser, lt] = await Promise.all([
          roche.persona.getActiveUserPersona().catch(() => null),
          roche.memory.getLongTerm({ conversationId: char.conversationId, limit: 200 }).catch(() => ({}))
        ])
        const ov = (await roche.storage.get("mcl-overrides").catch(() => null)) || {}
        const charName = char.handle || char.name || "角色"
        const userName = activeUser ? (activeUser.handle || activeUser.name || "你") : "你"
        const coreSummary = lt.core?.summary || lt.core?.text || ""
        const facts = (lt.facts || []).map(f => f.summaryText || f.action || f.text || "").filter(Boolean)
        const grouped = { emotional: [], important: [], normal: [], trivial: [] }
        facts.forEach((text, i) => {
          const mem = (lt.facts || [])[i] || {}
          grouped[ov[mem.id] || classifyText(text)].push(text)
        })
        const memBlock = [
          grouped.emotional.length ? `【情感深刻记忆】\n${grouped.emotional.join("\n")}` : "",
          grouped.important.length ? `【重要记忆】\n${grouped.important.join("\n")}` : "",
          grouped.normal.length ? `【普通记忆】\n${grouped.normal.join("\n")}` : "",
          grouped.trivial.length ? `【可能已模糊的碎片】\n${grouped.trivial.join("\n")}` : ""
        ].filter(Boolean).join("\n\n")

        const result = await roche.ai.chat({
          messages: [{
            role: "user",
            content: `你是 ${charName}。\n${(char.persona || char.bio) ? "你的人设：\n" + (char.persona || char.bio) + "\n" : ""}以下是你与 ${userName} 之间的记忆（已按情感深度分层）：\n${coreSummary ? "【核心印象】\n" + coreSummary + "\n" : ""}${memBlock || "（暂无）"}\n${(activeUser?.persona || activeUser?.bio) ? userName + "的自我描述：\n" + (activeUser.persona || activeUser.bio) : ""}\n────────────────────────\n请用 ${charName} 的第一人称，自然地说出：1. 你对 ${userName} 的整体感受；2. 你特别记住的习惯或特点；3. 有没有印象深刻的事；4. 你们的关系状态。不要列表，不要客观描述，用你自己的语气回忆。`
          }],
          temperature: 0.88
        })

        const cacheData = {
          text: result.text || "",
          ts: Date.now(),
          charName,
          userName,
          factCount: (lt.facts || []).length,
          hasCore: !!coreSummary,
          emotionCount: grouped.emotional.length
        }
        await roche.storage.set(`mcl-cog-${charId}`, cacheData).catch(() => {})
        renderCached(charId, cacheData)
      } catch (e) {
        body.innerHTML = `<div class="mcl-empty">生成失败：${escHtml(e.message)}</div>`
      }
    }

    $("#cg-gen").onclick = async () => {
      const charId = sel.value
      if (!charId) { roche.ui.toast("请先选择角色"); return }
      await roche.storage.delete(`mcl-cog-${charId}`).catch(() => {})
      await generate(charId)
    }
  }

  // ══════════════════════════════════════════════════════
  //  App 3: 记忆召回（纯前端关键词，无向量依赖）
  // ══════════════════════════════════════════════════════
  async function mountRecall(container, roche) {
    ensureStyle()
    container.innerHTML = `
<div class="mcl-rc-root">
  <div class="mcl-header">
    <button class="mcl-back" id="rc-back">←</button>
    <h2>记忆召回</h2>
  </div>
  <div class="mcl-rc-search-bar">
    <select class="mcl-select" id="rc-char" style="flex:0.4"></select>
    <input class="mcl-rc-input" id="rc-query" placeholder="搜索关键词" />
    <button class="mcl-btn" id="rc-search">召回</button>
  </div>
  <div id="rc-results" style="flex:1;overflow-y:auto;padding:6px 0"></div>
  <div class="mcl-rc-inject" id="rc-inject">注入上下文（复制到剪贴板）</div>
  <div class="mcl-rc-stats" id="rc-stats"><span>结果：0</span><span>耗时：-</span></div>
</div>`

    const $ = id => container.querySelector(id)
    $("#rc-back").onclick = () => roche.ui.closeApp()
    let lastResult = null

    const sel = $("#rc-char")
    await loadCharOptions(sel, roche)

    $("#rc-search").onclick = doSearch

    async function doSearch() {
      const opt = sel.selectedOptions[0]
      if (!opt || !opt.value) { roche.ui.toast("请选择角色"); return }
      const convId = opt.dataset.conv || opt.value
      const query = $("#rc-query").value.trim()
      const panel = $("#rc-results")
      panel.innerHTML = '<div class="mcl-loading">搜索中…</div>'
      const t0 = Date.now()

      try {
        const ov = (await roche.storage.get("mcl-overrides").catch(() => null)) || {}
        // 只通过 getLongTerm 获取所有事实记忆，不调用 search
        const lt = await roche.memory.getLongTerm({ conversationId: convId, limit: 200 }).catch(() => ({}))
        const facts = lt.facts || []

        // 前端关键词匹配 + 保留率加权
        const queryLower = query.toLowerCase()
        const items = facts
          .map(m => {
            const text = (m.summaryText || m.action || m.text || "")
            const textLower = text.toLowerCase()
            const r = calcRetention(m, ov)

            let matchScore = 0
            if (query) {
              const words = queryLower.split(/\s+/).filter(Boolean)
              words.forEach(w => {
                let idx = textLower.indexOf(w)
                while (idx !== -1) {
                  matchScore += 1 + (w.length > 2 ? 0.5 : 0)
                  idx = textLower.indexOf(w, idx + 1)
                }
              })
            }
            // 无关键词时 matchScore = 0，用保留率排序
            const relevance = query ? matchScore * (r / 100) : (r / 100)
            return { ...m, _r: r, _relevance: relevance }
          })
          .filter(m => query ? m._relevance > 0 : m._r > 20)
          .sort((a, b) => b._relevance - a._relevance)
          .slice(0, 30)

        lastResult = { items, ov, charName: opt.textContent.trim() }

        panel.innerHTML = items.length
          ? items.map((m, i) => {
              const text = escHtml(m.summaryText || m.action || m.text || "（无内容）")
              const r = m._r
              const col = r > 70 ? "green" : r > 40 ? "yellow" : r > 20 ? "orange" : "red"
              const code = `MEM-${String(i + 1).padStart(3, "0")}`
              const kind = kindLabel(ov[m.id] || classifyText(m.summaryText || m.action || m.text || ""))
              const age = fmtAge(m)
              const relLabel = m._relevance > 0.5 ? "高相关" : m._relevance > 0.1 ? "中相关" : ""
              return `<div class="mcl-rc-item">
                <div class="mcl-rc-code">${code}</div>
                <div class="mcl-rc-body">${text}</div>
                <div class="mcl-rc-meta">
                  <span class="mcl-rc-chip ${col}">${retLabel(r)} ${r}%</span>
                  <span style="font-size:10px;color:#8585a0">${kind}</span>
                  ${age ? `<span style="font-size:10px;color:#8585a0">${age}</span>` : ""}
                  ${relLabel ? `<span class="mcl-rc-rel">${relLabel}</span>` : ""}
                </div>
              </div>`
            }).join("")
          : '<div class="mcl-empty" style="padding:30px">无相关记忆</div>'

        $("#rc-stats").innerHTML = `<span>结果：${items.length}</span><span>耗时：${Date.now() - t0}ms</span>`
      } catch (e) {
        panel.innerHTML = `<div class="mcl-empty">搜索失败：${escHtml(e.message)}</div>`
      }
    }

    // 注入上下文
    $("#rc-inject").onclick = () => {
      if (!lastResult || !lastResult.items.length) { roche.ui.toast("暂无结果可注入"); return }
      const { items, ov, charName } = lastResult
      const lines = items.slice(0, 15).map((m, i) => {
        const code = `MEM-${String(i + 1).padStart(3, "0")}`
        const text = (m.summaryText || m.action || m.text || "").slice(0, 80)
        return `[${code}][${retLabel(m._r)}${m._r}%] ${text}`
      }).join("\n")
      const block = `<memory_recall>\n以下是与当前对话相关的角色记忆（${charName}）：\n${lines}\n</memory_recall>`
      navigator.clipboard?.writeText(block).catch(() => {})
      roche.ui.toast(`已复制 ${Math.min(items.length, 15)} 条记忆到剪贴板`)
    }
  }

  // ══════════════════════════════════════════════════════
  //  注册插件
  // ══════════════════════════════════════════════════════
  window.RochePlugin.register({
    id: PLUGIN_ID,
    name: "记忆曲线·简",
    version: "1.1.0",
    apps: [
      {
        id: APP_HOME,
        name: "记忆管理",
        icon: "psychology",
        iconImage: "",
        async mount(c, r) { await mountHome(c, r) },
        async unmount(c) { removeStyle(); c.replaceChildren() }
      },
      {
        id: APP_COG,
        name: "角色认知",
        icon: "person_search",
        iconImage: "",
        async mount(c, r) { await mountCognition(c, r) },
        async unmount(c) { removeStyle(); c.replaceChildren() }
      },
      {
        id: APP_RECALL,
        name: "记忆召回",
        icon: "auto_stories",
        iconImage: "",
        async mount(c, r) { await mountRecall(c, r) },
        async unmount(c) { removeStyle(); c.replaceChildren() }
      }
    ]
  })
})()

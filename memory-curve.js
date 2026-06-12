;(function () {
  // ══════════════════════════════════════════════════════════
  //  记忆曲线插件 v1.0.0
  //  两个 App：
  //    1. memory-curve-home   — 记忆曲线（浏览/强化/遗忘）
  //    2. memory-curve-cognition — 角色认知（角色视角自述）
  // ══════════════════════════════════════════════════════════

  const PLUGIN_ID   = "memory-curve"
  const APP_HOME    = "memory-curve-home"
  const APP_COGNITION = "memory-curve-cognition"

  // ── 遗忘曲线参数：稳定期（天）────────────────────────────
  // 情感记忆保留最久，琐碎记忆最快淡化
  const STABILITY = {
    emotional : 60,   // 触景生情级别
    important : 21,   // 习惯/偏好/关键事件
    normal    : 7,    // 普通聊天内容
    trivial   : 2     // 一次性琐碎信息
  }

  // 关键词分类（简单文本匹配，不依赖 embedding）
  const EMOTIONAL_KW  = ["伤心","难过","哭","开心","感动","害怕","愤怒","爱","恨","心疼","失望","惊喜","触动","心理阴影","委屈","孤独","温暖","痛苦","后悔"]
  const IMPORTANT_KW  = ["喜欢","讨厌","习惯","偏好","总是","从不","生日","名字","工作","家人","朋友","梦想","目标","害怕","不喜欢","最爱"]

  function classifyText(text) {
    const t = text || ""
    if (EMOTIONAL_KW.some(k => t.includes(k)))  return "emotional"
    if (IMPORTANT_KW.some(k => t.includes(k)))  return "important"
    if (t.length > 25)                           return "normal"
    return "trivial"
  }

  // 艾宾浩斯遗忘曲线：R = e^(−t/S)，返回 0-100 整数
  function calcRetention(mem, overrides) {
    const text      = mem.summaryText || mem.action || mem.text || ""
    const kind      = overrides[mem.id] || classifyText(text)
    const stability = STABILITY[kind] || STABILITY.normal

    const raw  = mem.createdAt || mem.timestamp
    let days   = 0
    if (raw) {
      const ts = typeof raw === "number" ? raw : Date.parse(raw)
      if (!isNaN(ts)) days = (Date.now() - ts) / 86400000
    }

    return Math.max(0, Math.round(Math.exp(-days / stability) * 100))
  }

  function retentionColor(r) {
    if (r > 70) return "#4ade80"  // 清晰·绿
    if (r > 40) return "#facc15"  // 模糊·黄
    if (r > 20) return "#fb923c"  // 淡化·橙
    return "#f87171"              // 即将遗忘·红
  }

  function retentionLabel(r) {
    if (r > 70) return "清晰"
    if (r > 40) return "模糊"
    if (r > 20) return "淡化"
    return "即将遗忘"
  }

  function kindLabel(k) {
    return { emotional:"情感记忆", important:"重要", normal:"普通", trivial:"琐碎" }[k] || k
  }

  function formatAge(mem) {
    const raw = mem.createdAt || mem.timestamp
    if (!raw) return ""
    const ts   = typeof raw === "number" ? raw : Date.parse(raw)
    if (isNaN(ts)) return ""
    const days = Math.floor((Date.now() - ts) / 86400000)
    if (days === 0) return "今天"
    if (days === 1) return "昨天"
    if (days <  7) return `${days} 天前`
    if (days < 30) return `${Math.floor(days / 7)} 周前`
    return `${Math.floor(days / 30)} 个月前`
  }

  // ── 全局样式（只插入一次）───────────────────────────────
  const STYLE_ID = "mc-global-style"
  const STYLE_CSS = `
.mc-root {
  display: flex; flex-direction: column;
  height: 100%; overflow: hidden;
  font-family: system-ui, -apple-system, sans-serif;
  font-size: 14px;
  background: #0c0c0e;
  color: #e4e4f0;
}

/* ── 顶栏 ── */
.mc-header {
  display: flex; align-items: center; gap: 10px;
  padding: 12px 16px;
  border-bottom: 1px solid rgba(255,255,255,.07);
  flex-shrink: 0;
}
.mc-header h2 { margin: 0; font-size: 15px; font-weight: 600; flex: 1; }
.mc-back {
  background: none; border: none; color: #e4e4f0;
  cursor: pointer; padding: 4px 8px; border-radius: 7px;
  font-size: 17px; opacity: .65; transition: opacity .15s;
}
.mc-back:hover { opacity: 1; background: rgba(255,255,255,.07); }

/* ── 控制栏 ── */
.mc-controls {
  display: flex; gap: 8px; padding: 10px 16px;
  flex-shrink: 0; flex-wrap: wrap; align-items: center;
}
.mc-select {
  flex: 1; min-width: 0;
  background: rgba(255,255,255,.05);
  border: 1px solid rgba(255,255,255,.1);
  color: #e4e4f0; border-radius: 8px;
  padding: 6px 10px; font-size: 13px;
}
.mc-btn {
  background: rgba(167,139,250,.15);
  border: 1px solid rgba(167,139,250,.3);
  color: #a78bfa; border-radius: 8px;
  padding: 6px 12px; cursor: pointer;
  font-size: 12px; white-space: nowrap;
  transition: background .15s;
}
.mc-btn:hover  { background: rgba(167,139,250,.28); }
.mc-btn:disabled { opacity: .35; cursor: not-allowed; }
.mc-btn.red {
  background: rgba(248,113,113,.1);
  border-color: rgba(248,113,113,.3);
  color: #f87171;
}
.mc-btn.red:hover { background: rgba(248,113,113,.2); }

/* ── Tabs ── */
.mc-tabs {
  display: flex; padding: 0 16px;
  border-bottom: 1px solid rgba(255,255,255,.07);
  flex-shrink: 0; gap: 2px;
}
.mc-tab {
  padding: 9px 13px; cursor: pointer;
  font-size: 13px; opacity: .55;
  border-bottom: 2px solid transparent;
  transition: all .2s; user-select: none;
}
.mc-tab.active { opacity: 1; border-bottom-color: #a78bfa; color: #c4b5fd; }

/* ── 统计栏 ── */
.mc-stats {
  display: flex; gap: 6px; padding: 8px 16px;
  flex-shrink: 0;
}
.mc-stat {
  flex: 1; background: rgba(255,255,255,.04);
  border: 1px solid rgba(255,255,255,.07);
  border-radius: 8px; padding: 7px 4px;
  text-align: center; font-size: 11px;
  opacity: .85;
}
.mc-stat strong { display: block; font-size: 19px; font-weight: 700; margin-bottom: 2px; }

/* ── 列表 ── */
.mc-list {
  flex: 1; overflow-y: auto;
  padding: 6px 16px 20px;
}
.mc-empty { text-align: center; opacity: .35; padding: 48px 0; font-size: 13px; }
.mc-loading { text-align: center; opacity: .4; padding: 40px 0; font-size: 13px; }

/* ── 记忆卡片 ── */
.mc-card {
  background: rgba(255,255,255,.035);
  border: 1px solid rgba(255,255,255,.07);
  border-radius: 10px; padding: 12px;
  margin-bottom: 8px;
  transition: border-color .15s;
}
.mc-card:hover { border-color: rgba(255,255,255,.14); }
.mc-card-top {
  display: flex; gap: 8px;
  align-items: flex-start; margin-bottom: 8px;
}
.mc-card-text { flex: 1; line-height: 1.55; font-size: 13px; }
.mc-kind-tag {
  font-size: 10px; padding: 2px 6px; border-radius: 4px;
  background: rgba(167,139,250,.14); color: #c4b5fd;
  white-space: nowrap; flex-shrink: 0;
}
.mc-bar-row {
  display: flex; align-items: center; gap: 8px; margin-bottom: 6px;
}
.mc-bar {
  flex: 1; height: 4px; background: rgba(255,255,255,.1);
  border-radius: 2px; overflow: hidden;
}
.mc-bar-fill { height: 100%; border-radius: 2px; transition: width .4s; }
.mc-bar-label { font-size: 11px; width: 80px; text-align: right; }
.mc-card-meta { font-size: 10px; opacity: .35; margin-bottom: 7px; }
.mc-card-actions { display: flex; gap: 5px; flex-wrap: wrap; }
.mc-mini {
  font-size: 11px; padding: 3px 8px;
  border-radius: 5px; cursor: pointer;
  border: 1px solid; transition: background .12s;
}
.mc-mini.g { background: rgba(74,222,128,.09); border-color: rgba(74,222,128,.25); color: #4ade80; }
.mc-mini.g:hover { background: rgba(74,222,128,.18); }
.mc-mini.o { background: rgba(251,146,60,.09); border-color: rgba(251,146,60,.25); color: #fb923c; }
.mc-mini.o:hover { background: rgba(251,146,60,.18); }
.mc-mini.r { background: rgba(248,113,113,.09); border-color: rgba(248,113,113,.2); color: #f87171; }
.mc-mini.r:hover { background: rgba(248,113,113,.18); }

/* ── 消息条目（短期记忆） ── */
.mc-msg-sender { font-weight: 600; font-size: 11px; opacity: .65; margin-bottom: 2px; }
.mc-msg-text { font-size: 12px; line-height: 1.5; }

/* ── 角色认知页 ── */
.mc-cog-body { flex: 1; overflow-y: auto; padding: 14px 16px 24px; }
.mc-cog-hint { text-align: center; opacity: .38; padding: 40px 20px; font-size: 13px; line-height: 1.7; }
.mc-cog-section {
  background: rgba(255,255,255,.04);
  border: 1px solid rgba(255,255,255,.07);
  border-radius: 10px; padding: 14px; margin-bottom: 10px;
}
.mc-cog-section h3 { margin: 0 0 8px; font-size: 13px; color: #c4b5fd; font-weight: 600; }
.mc-cog-section p  { margin: 0; font-size: 13px; line-height: 1.75; opacity: .88; white-space: pre-wrap; }
.mc-thinking { text-align: center; opacity: .45; padding: 30px; font-size: 12px; font-style: italic; }
.mc-cog-meta { text-align: center; font-size: 10px; opacity: .28; padding-bottom: 4px; }
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
    document.getElementById(STYLE_ID)?.remove()
  }

  // ════════════════════════════════════════════════════════
  //  App 1 — 记忆曲线（浏览 / 强化 / 遗忘）
  // ════════════════════════════════════════════════════════
  async function mountHome(container, roche) {
    ensureStyle()

    container.innerHTML = `
<div class="mc-root">
  <div class="mc-header">
    <button class="mc-back" id="mc-back">←</button>
    <h2>记忆曲线</h2>
    <button class="mc-btn" id="mc-refresh" style="padding:5px 10px;font-size:11px">刷新</button>
  </div>

  <div class="mc-controls">
    <select class="mc-select" id="mc-char-sel"><option value="">加载角色中…</option></select>
    <button class="mc-btn red" id="mc-apply">应用遗忘</button>
  </div>

  <div class="mc-tabs">
    <div class="mc-tab active" data-tab="facts">事实记忆</div>
    <div class="mc-tab"        data-tab="short">近期消息</div>
    <div class="mc-tab"        data-tab="core" >核心记忆</div>
  </div>

  <div class="mc-stats" id="mc-stats"></div>
  <div class="mc-list"  id="mc-list"><div class="mc-loading">请先选择角色…</div></div>
</div>`

    let tab     = "facts"
    let convId  = null
    let data    = { facts: [], short: [], core: null }
    // overrides: memId → "emotional"|"important"|"normal"|"trivial"
    let overrides = {}

    overrides = (await roche.storage.get("mc-overrides").catch(() => null)) || {}

    container.querySelector("#mc-back").onclick    = () => roche.ui.closeApp()
    container.querySelector("#mc-refresh").onclick = () => load()

    // Tabs
    container.querySelectorAll(".mc-tab").forEach(t => {
      t.onclick = () => {
        container.querySelectorAll(".mc-tab").forEach(x => x.classList.remove("active"))
        t.classList.add("active")
        tab = t.dataset.tab
        render()
      }
    })

    // Character selector
    const chars = await roche.character.list().catch(() => [])
    const sel   = container.querySelector("#mc-char-sel")
    sel.innerHTML = '<option value="">— 选择角色 —</option>' +
      chars.map(c =>
        `<option value="${c.conversationId || c.id}" data-charid="${c.id}">${c.handle || c.name}</option>`
      ).join("")

    sel.onchange = () => {
      convId = sel.value || null
      if (convId) load()
    }

    // Load memories
    async function load() {
      if (!convId) return
      container.querySelector("#mc-list").innerHTML = '<div class="mc-loading">读取记忆中…</div>'
      try {
        const [lt, st] = await Promise.all([
          roche.memory.getLongTerm({ conversationId: convId, limit: 300 }),
          roche.memory.getShortTerm({ conversationId: convId, limit: 120 })
        ])
        data.facts = lt.facts   || []
        data.short = st         || []
        data.core  = lt.core    || null
        renderStats()
        render()
      } catch (e) {
        container.querySelector("#mc-list").innerHTML =
          `<div class="mc-empty">读取失败：${e.message}</div>`
      }
    }

    // Stats bar
    function renderStats() {
      const rets = data.facts.map(f => calcRetention(f, overrides))
      const clear  = rets.filter(r => r > 70).length
      const fading = rets.filter(r => r <= 20).length
      container.querySelector("#mc-stats").innerHTML = `
        <div class="mc-stat"><strong>${data.facts.length}</strong>事实记忆</div>
        <div class="mc-stat"><strong style="color:#4ade80">${clear}</strong>清晰</div>
        <div class="mc-stat"><strong style="color:#f87171">${fading}</strong>即将遗忘</div>
        <div class="mc-stat"><strong>${data.short.length}</strong>近期消息</div>`
    }

    // Render list
    function render() {
      const list = container.querySelector("#mc-list")

      if (tab === "facts") {
        if (!data.facts.length) { list.innerHTML = '<div class="mc-empty">暂无事实记忆</div>'; return }

        // 按保留率升序（最淡的排最前面，最需关注）
        const sorted = [...data.facts]
          .map(f => ({ ...f, _r: calcRetention(f, overrides) }))
          .sort((a, b) => a._r - b._r)

        list.innerHTML = sorted.map(f => {
          const r    = f._r
          const text = f.summaryText || f.action || f.text || "（无文本）"
          const kind = overrides[f.id] || classifyText(text)
          const age  = formatAge(f)
          const col  = retentionColor(r)
          return `
<div class="mc-card" data-id="${f.id}">
  <div class="mc-card-top">
    <div class="mc-card-text">${text}</div>
    <span class="mc-kind-tag">${kindLabel(kind)}</span>
  </div>
  <div class="mc-bar-row">
    <div class="mc-bar">
      <div class="mc-bar-fill" style="width:${r}%;background:${col}"></div>
    </div>
    <div class="mc-bar-label" style="color:${col}">${retentionLabel(r)} ${r}%</div>
  </div>
  <div class="mc-card-meta">${age}</div>
  <div class="mc-card-actions">
    <button class="mc-mini g" data-id="${f.id}" data-act="reinforce">💪 强化</button>
    <button class="mc-mini o" data-id="${f.id}" data-act="elevate">⬆ 升级重要性</button>
    <button class="mc-mini r" data-id="${f.id}" data-act="forget">🌫 遗忘</button>
  </div>
</div>`
        }).join("")

        list.querySelectorAll("[data-act]").forEach(btn => {
          btn.onclick = () => handleAction(btn.dataset.act, btn.dataset.id)
        })

      } else if (tab === "short") {
        if (!data.short.length) { list.innerHTML = '<div class="mc-empty">暂无近期消息</div>'; return }
        list.innerHTML = [...data.short].reverse().slice(0, 60).map(m => {
          const sender = m.senderHandle || m.senderName || "未知"
          const text   = (m.text || "（无内容）").slice(0, 140)
          const age    = formatAge({ timestamp: m.timestamp })
          return `
<div class="mc-card">
  <div class="mc-msg-sender">${sender}  <span style="opacity:.4">${age}</span></div>
  <div class="mc-msg-text">${text}</div>
</div>`
        }).join("")

      } else if (tab === "core") {
        if (!data.core) { list.innerHTML = '<div class="mc-empty">暂无核心记忆</div>'; return }
        const text = data.core.summary || data.core.text || JSON.stringify(data.core)
        list.innerHTML = `
<div class="mc-card">
  <div class="mc-cog-section" style="border:none;padding:0">
    <h3>核心记忆</h3>
    <p>${text}</p>
  </div>
</div>`
      }
    }

    // Action handlers
    async function handleAction(act, memId) {
      const mem = data.facts.find(f => f.id === memId)
      if (!mem) return

      if (act === "forget") {
        const ok = await roche.ui.confirm({
          title: "确认遗忘",
          message: "将从 Roche 主记忆中删除这条记忆，卸载插件后仍会保持删除。确定吗？"
        })
        if (!ok) return
        try {
          await roche.memory.delete(memId)
          data.facts = data.facts.filter(f => f.id !== memId)
          delete overrides[memId]
          await roche.storage.set("mc-overrides", overrides)
          renderStats(); render()
          roche.ui.toast("已遗忘这条记忆")
        } catch (e) { roche.ui.toast("删除失败：" + e.message) }

      } else if (act === "reinforce" || act === "elevate") {
        const levels = ["trivial", "normal", "important", "emotional"]
        const cur    = overrides[memId] || classifyText(mem.summaryText || mem.action || "")
        const idx    = levels.indexOf(cur)
        const next   = levels[Math.min(idx + 1, levels.length - 1)]
        overrides[memId] = next
        await roche.storage.set("mc-overrides", overrides)
        roche.ui.toast(`重要性已升级为：${kindLabel(next)}，保留期更长`)
        render()
      }
    }

    // 批量应用遗忘（删除保留率 < 15% 的记忆）
    container.querySelector("#mc-apply").onclick = async () => {
      if (!convId) { roche.ui.toast("请先选择角色"); return }
      const toForget = data.facts.filter(f => calcRetention(f, overrides) < 15)
      if (!toForget.length) { roche.ui.toast("暂无需要遗忘的记忆（阈值：保留率 < 15%）"); return }

      const ok = await roche.ui.confirm({
        title: "应用遗忘曲线",
        message: `将删除 ${toForget.length} 条高度淡化的记忆（保留率 < 15%）。\n此操作直接修改 Roche 主记忆，不可撤销。`
      })
      if (!ok) return

      let deleted = 0
      for (const m of toForget) {
        try { await roche.memory.delete(m.id); deleted++ } catch {}
      }
      await load()
      roche.ui.toast(`遗忘完成，共清理 ${deleted} 条淡化记忆`)
    }
  }

  // ════════════════════════════════════════════════════════
  //  App 2 — 角色自我认知（角色视角自述）
  // ════════════════════════════════════════════════════════
  async function mountCognition(container, roche) {
    ensureStyle()

    container.innerHTML = `
<div class="mc-root">
  <div class="mc-header">
    <button class="mc-back" id="mc-cog-back">←</button>
    <h2>角色认知</h2>
  </div>
  <div class="mc-controls">
    <select class="mc-select" id="mc-cog-char"><option value="">加载中…</option></select>
    <button class="mc-btn" id="mc-cog-gen">生成自述</button>
  </div>
  <div class="mc-cog-body" id="mc-cog-body">
    <div class="mc-cog-hint">
      选择角色，点击「生成自述」<br>
      让角色用自己的语气回忆<br>
      Ta 眼中的你是什么样的人
    </div>
  </div>
</div>`

    container.querySelector("#mc-cog-back").onclick = () => roche.ui.closeApp()

    const chars = await roche.character.list().catch(() => [])
    const sel   = container.querySelector("#mc-cog-char")
    sel.innerHTML = '<option value="">— 选择角色 —</option>' +
      chars.map(c => `<option value="${c.id}">${c.handle || c.name}</option>`).join("")

    container.querySelector("#mc-cog-gen").onclick = async () => {
      const charId = sel.value
      if (!charId) { roche.ui.toast("请先选择角色"); return }

      const char = await roche.character.get(charId).catch(() => null)
      if (!char) { roche.ui.toast("读取角色失败"); return }

      const convId = char.conversationId
      const body   = container.querySelector("#mc-cog-body")
      body.innerHTML = '<div class="mc-thinking">角色正在回忆与你相处的点滴…</div>'

      try {
        const [activeUser, lt] = await Promise.all([
          roche.persona.getActiveUserPersona().catch(() => null),
          roche.memory.getLongTerm({ conversationId: convId, limit: 200 }).catch(() => ({}))
        ])

        const charName    = char.handle || char.name || "角色"
        const charPersona = char.persona || char.bio || ""
        const userName    = activeUser ? (activeUser.handle || activeUser.name || "你") : "你"
        const userPersona = activeUser ? (activeUser.persona || activeUser.bio || "") : ""
        const coreSummary = lt.core?.summary || lt.core?.text || ""
        const facts       = (lt.facts || [])
          .map(f => f.summaryText || f.action || f.text || "")
          .filter(Boolean)

        // 按重要性分类，让 AI 知道哪些记忆更根深蒂固
        const grouped = { emotional: [], important: [], normal: [], trivial: [] }
        const overrides = (await roche.storage.get("mc-overrides").catch(() => null)) || {}
        facts.forEach((text, i) => {
          const mem = (lt.facts || [])[i] || {}
          const kind = overrides[mem.id] || classifyText(text)
          grouped[kind].push(text)
        })

        const memBlock = [
          grouped.emotional.length ? `【情感深刻记忆】\n${grouped.emotional.join("\n")}` : "",
          grouped.important.length ? `【重要记忆】\n${grouped.important.join("\n")}` : "",
          grouped.normal.length    ? `【普通记忆】\n${grouped.normal.join("\n")}` : "",
          grouped.trivial.length   ? `【可能已有些模糊的碎片】\n${grouped.trivial.join("\n")}` : "",
        ].filter(Boolean).join("\n\n")

        const prompt = `你是 ${charName}。

${charPersona ? `你的人设：\n${charPersona}\n` : ""}

以下是你与 ${userName} 之间积累的记忆（已按情感深度分层）：

${coreSummary ? `【核心印象】\n${coreSummary}\n` : ""}

${memBlock || "（暂无具体记忆）"}

${userPersona ? `${userName} 的自我描述：\n${userPersona}` : ""}

────────────────────────
请用 ${charName} 的第一人称，用你自己的语气，自然地说出：

1. 你对 ${userName} 这个人的整体感受——不是客观描述，是你真实的感觉和印象
2. 你特别记住的、关于 Ta 的某些习惯、方式或特点（可以只说你注意到的，不用面面俱到）
3. 有没有什么事情让你印象很深，或者触动了你
4. 你觉得你们现在的关系是什么状态

注意：
- 这不是总结报告，是你在自然回忆——可以有情绪、有偏差、有遗忘、有不确定
- 重要性低的碎片记忆你可以不提，甚至已经有点记不清了
- 不要用列表格式，用正常说话的方式`

        const result = await roche.ai.chat({
          messages: [{ role: "user", content: prompt }],
          temperature: 0.88
        })

        const text = result.text || ""
        const factCount = (lt.facts || []).length

        body.innerHTML = `
<div class="mc-cog-section">
  <h3>${charName} 眼中的 ${userName}</h3>
  <p>${text}</p>
</div>
<div class="mc-cog-meta">
  基于 ${factCount} 条事实记忆
  ${coreSummary ? " · 含核心记忆" : ""}
  ${grouped.emotional.length ? ` · ${grouped.emotional.length} 条情感记忆` : ""}
</div>`

      } catch (e) {
        body.innerHTML = `<div class="mc-empty">生成失败：${e.message}</div>`
      }
    }
  }

  // ════════════════════════════════════════════════════════
  //  注册插件
  // ════════════════════════════════════════════════════════
  window.RochePlugin.register({
    id      : PLUGIN_ID,
    name    : "记忆曲线",
    version : "1.0.0",

    apps: [
      {
        id        : APP_HOME,
        name      : "记忆曲线",
        icon      : "psychology",
        iconImage : "",
        async mount(container, roche)  { await mountHome(container, roche) },
        async unmount(container)       { removeStyle(); container.replaceChildren() }
      },
      {
        id        : APP_COGNITION,
        name      : "角色认知",
        icon      : "person_search",
        iconImage : "",
        async mount(container, roche)  { await mountCognition(container, roche) },
        async unmount(container)       { removeStyle(); container.replaceChildren() }
      }
    ]
  })

})()

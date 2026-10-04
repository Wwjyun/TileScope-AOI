// AOI Console — 設備（相機 / 光源 RS-232 / 存圖 / 米輪 / Sensor 中繼 / 觸發 / Sapera），工程師限定

function copyLine(text, app) {
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).catch(() => {});
  app.setStatusMsg(`已複製：${text}`);
}

function DevErr({ code, msg, app }) {
  return (
    <div className="dev-err">
      <span className="mono">{code}</span>
      <span style={{ flex: 1, minWidth: 0 }}>{msg}</span>
      <IconBtn title="複製錯誤行" onClick={() => copyLine(`${code} ${msg}`, app)}><IcCopy size={13} /></IconBtn>
    </div>
  );
}

function DevOk({ msg }) {
  return <div className="dev-ok"><IcCheck size={12} />{msg}</div>;
}

function DevicesScreen({ app }) {
  const [cam, setCam] = React.useState("offline"); // offline | connecting | online
  const [camSettings, setCamSettings] = React.useState({ exposure_us: 500, gain: 1.0, line_length: 4096, line_rate_hz: 1000 });
  const [trigger, setTrigger] = React.useState("free_run"); // free_run | external | software
  const [camSettingsDirty, setCamSettingsDirty] = React.useState(false);
  const [previewing, setPreviewing] = React.useState(false);
  const [pendingReconnect, setPendingReconnect] = React.useState(false);
  const [lines, setLines] = React.useState(0);

  const [light, setLight] = React.useState({ CH1: 120, CH2: 120, CH3: 80, CH4: 0 });
  const [lightApplied, setLightApplied] = React.useState({ CH1: 120, CH2: 120, CH3: 80, CH4: 0 });
  const [lightOn, setLightOn] = React.useState(false);
  const [lightPort, setLightPort] = React.useState("COM3");
  const [lightResp, setLightResp] = React.useState(null);

  const [snapshot, setSnapshot] = React.useState({ auto_save: true, format: "png", dir: "captures/" });
  const [lastSnap, setLastSnap] = React.useState(null);

  const [meter, setMeter] = React.useState({ card_id: 0, dll: "devices/LSI8181_64.dll", cmp_width: 0, cmp_polarity: "high", count: 128456, compare: 12288 });
  const [meterMsg, setMeterMsg] = React.useState(null);

  const [sensor, setSensor] = React.useState({ enable: false, di_port: 0, di_bit: 0, do_port: 0, do_bit: 0, active_low: true });
  const [sensorMsg, setSensorMsg] = React.useState(null);

  const [extDiag, setExtDiag] = React.useState(null); // null | running | []
  const [guided, setGuided] = React.useState(null); // null | steps[]
  const [sapera, setSapera] = React.useState({ lt_path: "C:/Program Files/Teledyne DALSA/Sapera", version: "8.70" });
  const [saperaDiag, setSaperaDiag] = React.useState(null);
  const [diag, setDiag] = React.useState(null);
  const [cmpRows, setCmpRows] = React.useState(Array.from({ length: 8 }, (_, i) => ({ id: `CMP${i}`, enable: i < 2, value: 12288, width: 24, polarity: "high" })));

  const tm = React.useRef([]);
  const lineTimer = React.useRef(null);
  React.useEffect(() => () => { tm.current.forEach(clearTimeout); clearInterval(lineTimer.current); }, []);

  const camOn = cam === "online";
  const lightDirty = JSON.stringify(light) !== JSON.stringify(lightApplied);
  const setCamField = (k, v) => { setCamSettings((s) => ({ ...s, [k]: v })); setCamSettingsDirty(true); };

  const connect = () => {
    if (cam === "online") {
      clearInterval(lineTimer.current); lineTimer.current = null;
      setCam("offline"); setPreviewing(false); setLines(0); setPendingReconnect(false);
      app.setStatusMsg("相機已中斷連線 · 資源已釋放");
      return;
    }
    setCam("connecting");
    tm.current.push(setTimeout(() => {
      setCam("online"); setPendingReconnect(false);
      app.setStatusMsg("相機已連線");
      lineTimer.current = setInterval(() => setLines((l) => l + 4096), 500);
    }, 1100));
  };

  const applyCamSettings = () => {
    if (cam !== "online" || !camSettingsDirty || previewing) return;
    setCamSettingsDirty(false); setPendingReconnect(true);
    app.setStatusMsg("套用相機設定：重新連線以寫入…");
    clearInterval(lineTimer.current); lineTimer.current = null;
    setCam("connecting");
    tm.current.push(setTimeout(() => {
      setCam("online"); setPendingReconnect(false);
      app.setStatusMsg("相機設定已寫入並重連完成 · 已恢復預覽");
      lineTimer.current = setInterval(() => setLines((l) => l + 4096), 500);
    }, 1000));
  };

  const applyLight = () => { setLightApplied(light); app.setStatusMsg("光源亮度已套用到設備"); };
  const testLight = () => {
    if (!lightPort.trim()) { setLightResp({ code: "[E-1101]", msg: "未設定光源序列埠（RS-232）。" }); return; }
    setLightResp({ ok: true, msg: `OK · ${lightPort} · CH1..CH4 = ${light.CH1}/${light.CH2}/${light.CH3}/${light.CH4}` });
  };

  const snap = () => {
    if (cam !== "online") { setLastSnap({ code: "[E-1002]", msg: "相機未連線，無法快照。" }); return; }
    const p = `${snapshot.dir}snap_${String(Date.now()).slice(-6)}.${snapshot.format}`;
    setLastSnap({ ok: true, msg: p });
    app.setStatusMsg(`快照已存：${p}`);
  };

  const readMeter = () => {
    if (!meter.dll.trim()) { setMeterMsg({ code: "[E-1203]", msg: "找不到 LSI8181_64.dll，無法讀取米輪計數。" }); return; }
    if (meter.cmp_width === 0) { setMeterMsg({ code: "[E-1204]", msg: "CMP_OUT 寬度為 0，compare 未啟用。" }); return; }
    setMeter((m) => ({ ...m, count: m.count + 4096 }));
    setMeterMsg({ ok: true, msg: `計數 ${meter.count + 4096} · compare 正常` });
  };

  const toggleSensor = (v) => {
    if (v && previewing) {
      setSensorMsg({ code: "[E-1401]", msg: "相機預覽取像中，無法佔用 I/O 板卡。請先停止預覽。" });
      return;
    }
    setSensor({ ...sensor, enable: v });
    setSensorMsg(null);
  };

  const runDiag = () => {
    setDiag("running");
    tm.current.push(setTimeout(() => setDiag([
      ["相機", cam === "online" ? "ok" : "warn", cam === "online" ? "已連線 · 有訊號" : "未連線"],
      ["光源控制器", "ok", "COM3 · 4 通道回應正常"],
      ["編碼器 / 觸發", "ok", "計數遞增 · compare 觸發正常"],
      ["I/O 卡", "warn", "DO1 未接負載"],
    ]), 1500));
  };

  const runExtDiag = () => {
    setExtDiag("running");
    tm.current.push(setTimeout(() => {
      if (cam !== "online") {
        setExtDiag([{ ok: false, label: "觸發訊號", code: "[E-1201]", msg: "相機未連線，無法偵測外部觸發訊號。" }]);
      } else {
        setExtDiag([
          { ok: true, label: "觸發訊號源", msg: "外部 BNC · 有訊號" },
          { ok: true, label: "極性", msg: "高態有效" },
          { ok: meter.cmp_width > 0, label: "米輪 compare", msg: meter.cmp_width > 0 ? "正常" : "CMP_OUT 寬度為 0", code: meter.cmp_width > 0 ? null : "[E-1204]" },
          { ok: sensor.active_low, label: "Sensor 中繼", msg: "低態有效 · 已設定" },
        ]);
      }
    }, 1200));
  };

  const GUIDED_STEPS = [
    { title: "確認相機已連線並有訊號" },
    { title: "設定觸發模式與極性" },
    { title: "確認米輪 compare 寬度與值" },
    { title: "確認 Sensor 中繼 I/O 接線" },
    { title: "試擷取單張並確認儲存" },
  ];
  const runGuided = () => {
    const steps = GUIDED_STEPS.map((s) => ({ ...s, state: "todo" }));
    setGuided(steps);
    GUIDED_STEPS.forEach((_, i) => {
      tm.current.push(setTimeout(() => {
        setGuided((prev) => prev ? prev.map((p, j) => (j === i ? { ...p, state: "active" } : p)) : prev);
      }, i * 500));
      tm.current.push(setTimeout(() => {
        setGuided((prev) => {
          if (!prev) return prev;
          return prev.map((p, j) => {
            if (j !== i) return p;
            if (i === 0 && cam !== "online") return { ...p, state: "error", code: "[E-1001]", msg: "相機未連線。" };
            if (i === 2 && meter.cmp_width === 0) return { ...p, state: "error", code: "[E-1204]", msg: "CMP_OUT 寬度為 0。" };
            return { ...p, state: "done" };
          });
        });
      }, i * 500 + 400));
    });
  };

  const runSaperaDiag = () => {
    setSaperaDiag("running");
    tm.current.push(setTimeout(() => {
      if (!sapera.lt_path.trim()) {
        setSaperaDiag([{ ok: false, label: "Sapera LT", code: "[E-1301]", msg: "找不到 Sapera LT 安裝路徑。" }]);
      } else {
        setSaperaDiag([
          { ok: true, label: "Sapera LT 路徑", msg: sapera.lt_path },
          { ok: true, label: "版本", msg: sapera.version },
          { ok: true, label: "SDK DLL", msg: "SapClassBasic.dll 已載入" },
          { ok: cam === "online", label: "相機", msg: cam === "online" ? "已列舉 1 台" : "未連線", code: cam === "online" ? null : "[E-1001]" },
        ]);
      }
    }, 1100));
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, height: "100%", minHeight: 0, overflowY: "auto" }}>
      <div className="banner info" style={{ flexShrink: 0 }}>
        <IcLock size={14} style={{ flexShrink: 0, marginTop: 2 }} />
        <span>載入 Recipe 不會寫入設備；參數變更需按「套用到設備」。忙碌中的取像會先取消再中斷連線。實機驗收另列待辦。</span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(320px, 100%), 1fr))", gap: 12, alignItems: "start" }}>
        <Panel title="相機" actions={
          <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--text-2)" }}>
            {pendingReconnect && <Badge kind="warn">待重連</Badge>}
            {camSettingsDirty && camOn && !pendingReconnect && <Badge kind="warn">未套用</Badge>}
            <span className={"dot " + (camOn ? "pass" : cam === "connecting" ? "busy" : "")}></span>{camOn ? "已連線" : cam === "connecting" ? "連線中" : "離線"}
          </span>
        }>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div className="kv">
              <span>型號</span><span>{camOn ? "Line-scan · SDK 相機" : "—"}</span>
              <span>解析度</span><span>{camOn ? "4096 × 1 line" : "—"}</span>
              <span>訊號</span><span>{camOn ? "有訊號" : "—"}</span>
              <span>已掃描行數</span><span>{camOn ? lines.toLocaleString() : "—"}</span>
            </div>
            <FormGrid>
              <FRow label="觸發模式"><Segmented value={trigger} onChange={setTrigger} options={[{ value: "free_run", label: "Free Run" }, { value: "external", label: "外部觸發" }, { value: "software", label: "軟體觸發" }]} /></FRow>
              <FRow label="曝光 (µs)"><NumField value={camSettings.exposure_us} onChange={(v) => setCamField("exposure_us", v)} min={1} /></FRow>
              <FRow label="增益"><NumField value={camSettings.gain} onChange={(v) => setCamField("gain", v)} step={0.1} decimals={1} min={0} /></FRow>
              <FRow label="影像長度（線）"><NumField value={camSettings.line_length} onChange={(v) => setCamField("line_length", v)} min={1} /></FRow>
              <FRow label="線速率（Hz）"><NumField value={camSettings.line_rate_hz} onChange={(v) => setCamField("line_rate_hz", v)} min={1} /></FRow>
            </FormGrid>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Btn variant={camOn ? "secondary" : "primary"} disabled={cam === "connecting"} onClick={connect} icon={cam === "connecting" ? <span className="spinner"></span> : <IcCamera size={14} />}>{camOn ? "中斷連線" : "連線"}</Btn>
              <Btn variant="secondary" disabled={cam !== "online" || !camSettingsDirty || previewing || pendingReconnect} onClick={applyCamSettings} icon={pendingReconnect ? <span className="spinner"></span> : <IcRefresh size={14} />}>
                {cam !== "online" ? "套用相機設定（離線）" : !camSettingsDirty ? "設定已套用" : previewing ? "待重連（取像中）" : "套用並重連"}
              </Btn>
              <Btn variant="ghost" disabled={!camOn} icon={<IcEye size={14} />} onClick={() => setPreviewing(!previewing)}>{previewing ? "停止預覽" : trigger === "software" ? "開始軟體觸發" : "開始預覽"}</Btn>
            </div>
            <div className="monitor-note">相機設定只在連線時寫入；連線中按套用會自動重連並恢復預覽。取像中或相機監控中只標記「待重連」。</div>
          </div>
        </Panel>

        <Panel title="光源（RS-232）" actions={lightDirty ? <Badge kind="warn">未套用</Badge> : <span className="dot pass" style={{ marginTop: 6 }}></span>}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <FormGrid>
              <FRow label="連接埠"><TextField mono value={lightPort} onChange={(e) => setLightPort(e.target.value)} /></FRow>
              <FRow label="開燈指令"><TextField mono value="LAMP_ON" readOnly /></FRow>
              <FRow label="關燈指令"><TextField mono value="LAMP_OFF" readOnly /></FRow>
            </FormGrid>
            {Object.entries(light).map(([ch, v]) => (
              <div key={ch} style={{ display: "grid", gridTemplateColumns: "40px 1fr 44px", alignItems: "center", gap: 10 }}>
                <span className="mono" style={{ color: "var(--text-2)" }}>{ch}</span>
                <input type="range" min="0" max="255" value={v} onChange={(e) => setLight({ ...light, [ch]: +e.target.value })} style={{ accentColor: "var(--accent)" }} />
                <span className="mono" style={{ textAlign: "right" }}>{v}</span>
              </div>
            ))}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Btn variant="primary" disabled={!lightDirty} onClick={applyLight} icon={<IcSave size={14} />}>套用到設備</Btn>
              <Btn variant="secondary" icon={lightOn ? <IcStop size={13} /> : <IcPlay size={13} />} onClick={() => { setLightOn(!lightOn); app.setStatusMsg(lightOn ? "光源已關閉" : "光源已開啟"); }}>{lightOn ? "關燈" : "開燈"}</Btn>
              <Btn variant="ghost" icon={<IcRefresh size={14} />} onClick={testLight}>測試指令</Btn>
            </div>
            {lightResp && (lightResp.ok ? <DevOk msg={lightResp.msg} /> : <DevErr code={lightResp.code} msg={lightResp.msg} app={app} />)}
          </div>
        </Panel>

        <Panel title="存圖">
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <FormGrid>
              <FRow label="依觸發自動存圖"><Toggle value={snapshot.auto_save} onChange={(v) => setSnapshot({ ...snapshot, auto_save: v })} /></FRow>
              <FRow label="格式">
                <select className="field" value={snapshot.format} onChange={(e) => setSnapshot({ ...snapshot, format: e.target.value })}>
                  <option value="png">PNG</option><option value="bmp">BMP</option><option value="tiff">TIFF</option>
                </select>
              </FRow>
              <FRow label="目錄"><TextField mono value={snapshot.dir} onChange={(e) => setSnapshot({ ...snapshot, dir: e.target.value })} /></FRow>
            </FormGrid>
            <div><Btn variant="secondary" icon={<IcImage size={14} />} onClick={snap}>快照</Btn></div>
            {lastSnap && (lastSnap.ok ? <DevOk msg={lastSnap.msg} /> : <DevErr code={lastSnap.code} msg={lastSnap.msg} app={app} />)}
          </div>
        </Panel>

        <Panel title="米輪（LSI-8181）" actions={<span className={"dot " + (meter.cmp_width > 0 ? "pass" : "warn")} style={{ marginTop: 6 }}></span>}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <FormGrid>
              <FRow label="卡片 ID"><NumField value={meter.card_id} onChange={(v) => setMeter({ ...meter, card_id: v })} min={0} /></FRow>
              <FRow label="DLL 路徑"><TextField mono value={meter.dll} onChange={(e) => setMeter({ ...meter, dll: e.target.value })} /></FRow>
              <FRow label="CMP_OUT 寬度"><NumField value={meter.cmp_width} onChange={(v) => setMeter({ ...meter, cmp_width: v })} min={0} /></FRow>
              <FRow label="CMP_OUT 極性">
                <select className="field" value={meter.cmp_polarity} onChange={(e) => setMeter({ ...meter, cmp_polarity: e.target.value })}>
                  <option value="high">高態有效</option><option value="low">低態有效</option>
                </select>
              </FRow>
            </FormGrid>
            <div className="kv">
              <span>計數</span><span>{meter.count.toLocaleString()}</span>
              <span>Compare 值</span><span>{meter.compare.toLocaleString()}</span>
              <span>Compare 狀態</span><span>{meter.cmp_width > 0 ? "啟用" : "停用"}</span>
            </div>
            {meter.cmp_width === 0 && (
              <div className="banner warn"><IcAlert size={14} style={{ flexShrink: 0, marginTop: 2 }} /><span>CMP_OUT 寬度為 0，軟體觸發將拒絕開始。</span></div>
            )}
            <div><Btn variant="secondary" icon={<IcRefresh size={14} />} onClick={readMeter}>讀取計數</Btn></div>
            {meterMsg && (meterMsg.ok ? <DevOk msg={meterMsg.msg} /> : <DevErr code={meterMsg.code} msg={meterMsg.msg} app={app} />)}
          </div>
        </Panel>

        <Panel title="Sensor 中繼（PCIe-1730）" actions={<Badge kind={sensor.enable ? "accent" : "neutral"}>{sensor.enable ? "已啟用" : "停用"}</Badge>}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <FormGrid>
              <FRow label="啟用"><Toggle value={sensor.enable} onChange={toggleSensor} /></FRow>
              <FRow label="DI Port"><NumField value={sensor.di_port} onChange={(v) => setSensor({ ...sensor, di_port: v })} min={0} /></FRow>
              <FRow label="DI Bit"><NumField value={sensor.di_bit} onChange={(v) => setSensor({ ...sensor, di_bit: v })} min={0} /></FRow>
              <FRow label="DO Port"><NumField value={sensor.do_port} onChange={(v) => setSensor({ ...sensor, do_port: v })} min={0} /></FRow>
              <FRow label="DO Bit"><NumField value={sensor.do_bit} onChange={(v) => setSensor({ ...sensor, do_bit: v })} min={0} /></FRow>
              <FRow label="低態有效"><Toggle value={sensor.active_low} onChange={(v) => setSensor({ ...sensor, active_low: v })} /></FRow>
            </FormGrid>
            <div className="banner warn"><IcAlert size={14} style={{ flexShrink: 0, marginTop: 2 }} /><span>不可與機台原 I/O 程式同時執行；板卡只在執行期間佔用。</span></div>
            {sensorMsg && <DevErr code={sensorMsg.code} msg={sensorMsg.msg} app={app} />}
          </div>
        </Panel>

        <Panel title="外部觸發診斷">
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {Array.isArray(extDiag) ? (
              <div className="panel" style={{ borderRadius: "var(--r-md)" }}>
                {extDiag.map((d) => (
                  <div key={d.label} className="row-item" style={{ cursor: "default" }}>
                    <span className={"dot " + (d.ok ? "pass" : "ng")}></span>
                    <span style={{ fontWeight: 500, width: 92, flexShrink: 0 }}>{d.label}</span>
                    <span style={{ color: "var(--text-2)", fontSize: "var(--fs-small)", flex: 1 }}>{d.msg}</span>
                  </div>
                ))}
                {extDiag.some((d) => d.code) && <div style={{ padding: "0 12px 10px" }}>{extDiag.filter((d) => d.code).map((d) => <DevErr key={d.label} code={d.code} msg={d.msg} app={app} />)}</div>}
              </div>
            ) : (
              <div style={{ fontSize: "var(--fs-small)", color: "var(--text-3)" }}>{extDiag === "running" ? "正在檢查觸發訊號源、極性與 compare 連動…" : "檢查觸發訊號源、極性與米輪 compare 連動，不會變更設備設定。"}</div>
            )}
            <div><Btn variant="secondary" disabled={extDiag === "running"} onClick={runExtDiag} icon={extDiag === "running" ? <span className="spinner"></span> : <IcCheck size={14} />}>{extDiag === "running" ? "診斷中…" : "開始診斷"}</Btn></div>
          </div>
        </Panel>

        <Panel title="引導式觸發檢查">
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {guided ? (
              <div className="panel" style={{ borderRadius: "var(--r-md)" }}>
                {guided.map((s, i) => (
                  <div key={i} className={"guide-step " + s.state}>
                    <span className="num">{s.state === "done" ? <IcCheck size={11} /> : s.state === "error" ? <IcX size={11} /> : i + 1}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 500 }}>{s.title}</div>
                      {s.code && <div style={{ marginTop: 4 }}><DevErr code={s.code} msg={s.msg} app={app} /></div>}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: "var(--fs-small)", color: "var(--text-3)" }}>逐步引導確認相機、觸發極性、米輪 compare 與 Sensor I/O，最後試擷取單張。</div>
            )}
            <div><Btn variant="secondary" onClick={runGuided} icon={<IcCheck size={14} />}>開始檢查</Btn></div>
          </div>
        </Panel>

        <Panel title="Sapera 診斷">
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <FormGrid>
              <FRow label="Sapera LT 路徑"><TextField mono value={sapera.lt_path} onChange={(e) => setSapera({ ...sapera, lt_path: e.target.value })} /></FRow>
              <FRow label="版本"><TextField mono value={sapera.version} readOnly /></FRow>
            </FormGrid>
            {Array.isArray(saperaDiag) ? (
              <div className="panel" style={{ borderRadius: "var(--r-md)" }}>
                {saperaDiag.map((d) => (
                  <div key={d.label} className="row-item" style={{ cursor: "default" }}>
                    <span className={"dot " + (d.ok ? "pass" : "ng")}></span>
                    <span style={{ fontWeight: 500, width: 92, flexShrink: 0 }}>{d.label}</span>
                    <span style={{ color: "var(--text-2)", fontSize: "var(--fs-small)", flex: 1 }}>{d.msg}</span>
                  </div>
                ))}
                {saperaDiag.some((d) => d.code) && <div style={{ padding: "0 12px 10px" }}>{saperaDiag.filter((d) => d.code).map((d) => <DevErr key={d.label} code={d.code} msg={d.msg} app={app} />)}</div>}
              </div>
            ) : (
              <div style={{ fontSize: "var(--fs-small)", color: "var(--text-3)" }}>{saperaDiag === "running" ? "正在檢查 Sapera LT 與相機列舉…" : "檢查 Sapera LT 路徑、SDK DLL 與相機列舉，缺 SDK 時仍可正常啟動本程式。"}</div>
            )}
            <div><Btn variant="secondary" disabled={saperaDiag === "running"} onClick={runSaperaDiag} icon={saperaDiag === "running" ? <span className="spinner"></span> : <IcCheck size={14} />}>{saperaDiag === "running" ? "診斷中…" : "開始診斷"}</Btn></div>
          </div>
        </Panel>

        {app.mode !== "admin" && (
          <div className="panel" style={{ padding: "var(--pad-panel)", justifyContent: "center", alignItems: "center", gap: 8, color: "var(--text-3)", fontSize: "var(--fs-small)", textAlign: "center" }}>
            <IcLock size={18} />
            <span>完整動作診斷、舊設定匯入與 Extension Compare 僅管理模式可見</span>
          </div>
        )}

        {app.mode === "admin" && (
        <Panel title="完整動作診斷">
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {Array.isArray(diag) ? (
              <div className="panel" style={{ borderRadius: "var(--r-md)" }}>
                {diag.map(([k, st, msg]) => (
                  <div key={k} className="row-item" style={{ cursor: "default" }}>
                    <span className={"dot " + (st === "ok" ? "pass" : "warn")}></span>
                    <span style={{ fontWeight: 500, width: 92, flexShrink: 0 }}>{k}</span>
                    <span style={{ color: "var(--text-2)", fontSize: "var(--fs-small)" }}>{msg}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: "var(--fs-small)", color: "var(--text-3)" }}>{diag === "running" ? "正在逐一檢查各設備，請稍候…" : "依序檢查相機、光源、觸發與 I/O，不會變更設備設定。"}</div>
            )}
            <div><Btn variant="secondary" disabled={diag === "running"} onClick={runDiag} icon={diag === "running" ? <span className="spinner"></span> : <IcCheck size={14} />}>{diag === "running" ? "診斷中…" : "開始診斷"}</Btn></div>
          </div>
        </Panel>
        )}

        {app.mode === "admin" && (
        <Panel title="舊設定匯入" actions={<Badge kind="neutral">管理</Badge>}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ fontSize: "var(--fs-small)", color: "var(--text-3)" }}>從舊版設定檔分析相機、光源、觸發參數，套用前逐項核對，不會自動寫入設備。</div>
            <FormGrid>
              <FRow label="來源檔案"><div style={{ display: "flex", gap: 6 }}><TextField mono value="—" readOnly /><Btn variant="secondary" size="sm" style={{ height: "var(--row-h)" }} icon={<IcFolder size={13} />}>選擇</Btn></div></FRow>
            </FormGrid>
            <div style={{ display: "flex", gap: 8 }}><Btn variant="secondary" disabled>分析</Btn><Btn variant="ghost" disabled>套用並核對</Btn></div>
          </div>
        </Panel>
        )}

        {app.mode === "admin" && (
        <Panel title="Extension Compare（CMP0–CMP7）" actions={<Badge kind="neutral">管理</Badge>}>
          <table className="data-table">
            <thead><tr><th>通道</th><th>啟用</th><th>Compare 值</th><th>寬度</th><th>極性</th><th>狀態</th></tr></thead>
            <tbody>
              {cmpRows.map((r) => (
                <tr key={r.id}>
                  <td className="mono">{r.id}</td>
                  <td><Toggle value={r.enable} onChange={(v) => setCmpRows((rows) => rows.map((x) => (x.id === r.id ? { ...x, enable: v } : x)))} /></td>
                  <td><NumField value={r.value} onChange={(v) => setCmpRows((rows) => rows.map((x) => (x.id === r.id ? { ...x, value: v } : x)))} min={0} /></td>
                  <td><NumField value={r.width} onChange={(v) => setCmpRows((rows) => rows.map((x) => (x.id === r.id ? { ...x, width: v } : x)))} min={0} /></td>
                  <td>
                    <select className="field" value={r.polarity} onChange={(e) => setCmpRows((rows) => rows.map((x) => (x.id === r.id ? { ...x, polarity: e.target.value } : x)))}>
                      <option value="high">高態</option><option value="low">低態</option>
                    </select>
                  </td>
                  <td>{r.enable ? <Badge kind="accent">啟用</Badge> : <Badge kind="neutral">停用</Badge>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
        )}
      </div>
    </div>
  );
}

Object.assign(window, { DevicesScreen });

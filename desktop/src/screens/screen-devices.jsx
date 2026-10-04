// AOI Console — 設備 screen（工程／管理模式）
// v0.1.0：顯示各設備可用性與原因；控制項保留但停用，不做任何設備指令。
import React from "react";
import { Btn, Panel, FormGrid, FRow, TextField, Toggle, Badge } from "../components/components.jsx";
import { IcLock, IcCamera, IcChip, IcRefresh, IcAlert, IcCheck } from "../components/icons.jsx";

function DevState({ ok, reason }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
      <span className={"dot " + (ok ? "pass" : "ng")} style={{ marginTop: 5 }}></span>
      <span style={{ fontSize: "var(--fs-small)", color: ok ? "var(--text-2)" : "var(--ng)", lineHeight: 1.5 }}>{ok ? "可用" : reason || "未偵測到"}</span>
    </div>
  );
}

function deviceInfo(rt, key) {
  const d = rt.devices && rt.devices[key];
  if (!d) return { ok: false, reason: "未知" };
  return { ok: !!d.available, reason: d.reason || (d.available ? "可用" : "未偵測到") };
}

export default function DevicesScreen({ app }) {
  const rt = app.rt;
  const cam = deviceInfo(rt, "camera");
  const light = deviceInfo(rt, "light");
  const meter = deviceInfo(rt, "meter_wheel");
  const sensor = deviceInfo(rt, "sensor_relay");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, height: "100%", minHeight: 0, overflowY: "auto" }}>
      <div className="banner info" style={{ flexShrink: 0 }}>
        <IcLock size={14} style={{ flexShrink: 0, marginTop: 2 }} />
        <span>設備控制將於設備整合階段提供；目前僅顯示可用性。</span>
      </div>

      <Panel title="設備可用性">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14 }}>
          <div>
            <div style={{ fontSize: "var(--fs-small)", color: "var(--text-3)", marginBottom: 4 }}>相機（CCD）</div>
            <DevState ok={cam.ok} reason={cam.reason} />
          </div>
          <div>
            <div style={{ fontSize: "var(--fs-small)", color: "var(--text-3)", marginBottom: 4 }}>光源（RS-232）</div>
            <DevState ok={light.ok} reason={light.reason} />
          </div>
          <div>
            <div style={{ fontSize: "var(--fs-small)", color: "var(--text-3)", marginBottom: 4 }}>米輪（LSI-8181）</div>
            <DevState ok={meter.ok} reason={meter.reason} />
          </div>
          <div>
            <div style={{ fontSize: "var(--fs-small)", color: "var(--text-3)", marginBottom: 4 }}>Sensor 中繼（PCIe-1730）</div>
            <DevState ok={sensor.ok} reason={sensor.reason} />
          </div>
        </div>
      </Panel>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(320px, 100%), 1fr))", gap: 12, alignItems: "start" }}>
        <Panel title="相機" actions={<Badge kind="neutral"><IcLock size={10} />停用</Badge>}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <FormGrid>
              <FRow label="觸發模式"><TextField mono value="Free Run" readOnly /></FRow>
              <FRow label="曝光 (µs)"><TextField mono value="500" readOnly /></FRow>
              <FRow label="增益"><TextField mono value="1.0" readOnly /></FRow>
              <FRow label="影像長度（線）"><TextField mono value="4096" readOnly /></FRow>
              <FRow label="線速率（Hz）"><TextField mono value="1000" readOnly /></FRow>
            </FormGrid>
            <div style={{ display: "flex", gap: 8 }}><Btn variant="primary" disabled icon={<IcCamera size={14} />}>連線</Btn><Btn variant="secondary" disabled icon={<IcRefresh size={14} />}>套用並重連</Btn></div>
            <div className="monitor-note">相機設定只在連線時寫入；本階段尚未提供設備指令。</div>
          </div>
        </Panel>

        <Panel title="光源（RS-232）" actions={<Badge kind="neutral"><IcLock size={10} />停用</Badge>}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <FormGrid>
              <FRow label="連接埠"><TextField mono value="COM3" readOnly /></FRow>
              <FRow label="開燈指令"><TextField mono value="LAMP_ON" readOnly /></FRow>
              <FRow label="關燈指令"><TextField mono value="LAMP_OFF" readOnly /></FRow>
            </FormGrid>
            <div style={{ display: "flex", gap: 8 }}><Btn variant="primary" disabled icon={<IcRefresh size={14} />}>套用到設備</Btn><Btn variant="secondary" disabled>開燈</Btn></div>
          </div>
        </Panel>

        <Panel title="米輪（LSI-8181）" actions={<Badge kind="neutral"><IcLock size={10} />停用</Badge>}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <FormGrid>
              <FRow label="卡片 ID"><TextField mono value="0" readOnly /></FRow>
              <FRow label="DLL 路徑"><TextField mono value="devices/LSI8181_64.dll" readOnly /></FRow>
              <FRow label="CMP_OUT 寬度"><TextField mono value="0" readOnly /></FRow>
            </FormGrid>
            <div className="banner warn"><IcAlert size={14} style={{ flexShrink: 0, marginTop: 2 }} /><span>CMP_OUT 寬度為 0，軟體觸發將拒絕開始。</span></div>
            <div><Btn variant="secondary" disabled icon={<IcRefresh size={14} />}>讀取計數</Btn></div>
          </div>
        </Panel>

        <Panel title="Sensor 中繼（PCIe-1730）" actions={<Badge kind="neutral"><IcLock size={10} />停用</Badge>}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <FormGrid>
              <FRow label="啟用"><Toggle value={false} disabled /></FRow>
              <FRow label="DI Port"><TextField mono value="0" readOnly /></FRow>
              <FRow label="DI Bit"><TextField mono value="0" readOnly /></FRow>
              <FRow label="DO Port"><TextField mono value="0" readOnly /></FRow>
              <FRow label="DO Bit"><TextField mono value="0" readOnly /></FRow>
            </FormGrid>
            <div className="banner warn"><IcAlert size={14} style={{ flexShrink: 0, marginTop: 2 }} /><span>不可與機台原 I/O 程式同時執行；板卡只在執行期間佔用。</span></div>
          </div>
        </Panel>

        <Panel title="設備自檢">
          <div style={{ fontSize: "var(--fs-small)", color: "var(--text-3)" }}>依序檢查相機、光源、觸發與 I/O，不會變更設備設定。</div>
          <div style={{ marginTop: 10 }}><Btn variant="secondary" disabled icon={<IcCheck size={14} />}>開始診斷</Btn></div>
        </Panel>
      </div>
    </div>
  );
}
